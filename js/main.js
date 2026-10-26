/**** **** **** **** INIT **** **** **** ****/

async function sleep(ms) {
	await new Promise(resolve => setTimeout(resolve, ms))
}
async function waitUntilTrue(condition) {
	for(let i=1; i<10; i++) {
		if(condition()) return true
		await sleep(i*100)
	}
	return condition()
}
function escapeHtml(text) {
	return String(text).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
}

async function onPageLoad() {
	toggleAdvancedControls()

	await updateRankingDiv()
	if(MODL.isReady()) {
		await shiftVids()
		toast('Player is ready: Click on the video to start', 'toast-ok', PLAYERS.left.getIframe().parentElement, 7500)
	}
}


// Prepare Youtube Player
const PLAYERS = {
	left: null,
	right: null,
	future: null,
}

function onYouTubeEventStateChange(evt) {
	const thisPlayer = evt.target
	if(evt.data === YT.PlayerState.ENDED) {
		if(thisPlayer === PLAYERS.left) {
			PLAYERS.right.playVideo()
		} else if(thisPlayer === PLAYERS.right) {
			shiftVids()
		}
	}
}

/**
 * errCodes:
 * 2 – The request contains an invalid parameter value. For example, this error occurs if you specify a video ID that does not have 11 characters, or if the video ID contains invalid characters, such as exclamation points or asterisks.
 * 5 – The requested content cannot be played in an HTML5 player or another error related to the HTML5 player has occurred.
 * 100 – The video requested was not found. This error occurs when a video has been removed (for any reason) or has been marked as private.
 * 101 – The owner of the requested video does not allow it to be played in embedded players.
 * 150 – same as 101
 */
const YT_ERRORS = {
	INVALID_PARAM: 2,
	HTML5_ERROR: 5,
	NOT_FOUND: 100,
	NOT_EMBEDDABLE: 101,
	NOT_EMBEDDABLE_ALT: 150,
	LOADING_TIMEOUT: -1, // Not a Youtube error code: video loading timeout
}
function onYoutubeErrorEvent(evt) {
	const thisPlayer = evt.target
	const errCode = evt.data

	thisPlayer.errCode = errCode
	switch(errCode) {
		case YT_ERRORS.INVALID_PARAM:
			thisPlayer.errMessage = 'Invalid video id'
			break
		case YT_ERRORS.HTML5_ERROR:
			thisPlayer.errMessage = 'Device cannot play this video'
			break
		case YT_ERRORS.NOT_FOUND:
			thisPlayer.errMessage = 'Video not found or removed'
			break
		case YT_ERRORS.NOT_EMBEDDABLE:
		case YT_ERRORS.NOT_EMBEDDABLE_ALT:
			thisPlayer.errMessage = 'Video not allowed outside Youtube'
			break
		default:
			thisPlayer.errMessage = 'Unknown error (code:' + errCode + ')'
	}

	// Error out of loading (while playing): continue as if video ended
	if(!thisPlayer.isLoading) {
		onYouTubeEventStateChange({target: thisPlayer, data: YT.PlayerState.ENDED})
	}
}



function getCurrentChoice() {
	switch(document.querySelector(".selected")?.id) {
		case "btn_lft2": return -2
		case "btn_lft1": return -1
		case "btn_eql": return 0
		case "btn_rgt1": return 1
		case "btn_rgt2": return 2
		default: return null
	}
}

let __playerids = 0
async function initNewPlayer() {
	const playerId = __playerids++

	const div = document.createElement('div')
	div.id = 'player_' + playerId
	const vid = document.createElement('div')
	vid.id = 'video_' + playerId
	div.appendChild(vid)
	const inf = document.createElement('div')
	inf.classList.add('vidInfo')
	div.appendChild(inf)

	const parent = document.getElementById('players')
	parent.appendChild(div)

	await sleep(100)

	let isReady = false
	const player = new YT.Player('video_' + playerId, {
		height: '100%',
		width: '100%',
		videoId: '',
		playerVars: {
			iv_load_policy: 3, // Disable video annotations
			rel: 0, // After video ended, suggest only videos from the same channel (suggestions cannot be disabled)
		},
		events: {
			'onReady': ()=>isReady=true,
			'onStateChange': onYouTubeEventStateChange,
			'onError': onYoutubeErrorEvent,
		},
	})
	player.container = div // Keep a reference to the container, to remove it when destroying the player

	if(!await waitUntilTrue(() => isReady)) {
		// Player not ready: remove it (a new one will be created on next shift)
		player.container.remove()
		toast('Youtube player loading timeout', 'toast-err')
		throw new Error('Youtube player loading timeout')
	}

	return player
}
function destroyPlayer(player) {
	player.destroy()
	player.container.remove()
}
async function loadNextVideo(player) {
	player.isLoading = true // Loading errors are handled here, not by onYoutubeErrorEvent
	const _pickNextToPlayer = async () => {
		player.errCode = undefined
		player.errMessage = undefined
		const vid = MODL.pickNext(document.getElementById('pickMode').value)
		if(!vid) return vid
		player.cueVideoById(vid)
		if(!await waitUntilTrue(() => (player.errCode > 0) || (player?.playerInfo?.videoData?.video_id === vid))) {
			player.errCode = YT_ERRORS.LOADING_TIMEOUT
			player.errMessage = 'Loading timeout'
		}
		return vid
	}

	let tries = 1
	let vid_id = null
	while((vid_id = await _pickNextToPlayer()) && player.errCode) {
		tries++
		// Remove only invalid ids: other errors may be temporary (video set back to public, embedding allowed again...)
		const isToBeRemoved = player.errCode === YT_ERRORS.INVALID_PARAM
		if(player !== PLAYERS.future) {
			toast(`<span style="font-family:monospace;">yt:${escapeHtml(vid_id)}</span> ${isToBeRemoved ? 'removed' : 'skipped'}: ${player.errMessage}.<br/>Loading another video...`, '', player.getIframe().parentElement, 2000)
		}
		if(isToBeRemoved) {
			if(player === PLAYERS.future) {
				toast(`<span style="font-family:monospace;">yt:${escapeHtml(vid_id)}</span> removed: ${player.errMessage}`, '', null, 2000)
			}
			MODL.removeVideo(vid_id)
		} else {
			MODL.markAsUnplayable(vid_id)
		}
	}

	if(!vid_id) {
		player.isLoading = false
		toast('No more available video to be loaded', 'toast-err', player !== PLAYERS.future ? player.getIframe().parentElement : null)
		return null
	}

	if(tries > 1 && player !== PLAYERS.future) {
		// Defer toast by 1/2s for UX reasons, after previous "failed to load" displayed toasts
		setTimeout(()=>toast(`<span style="font-family:monospace;">yt:${escapeHtml(vid_id)}</span> successfuly loaded`, 'toast-ok', player.getIframe().parentElement, 2000), 500)
	}

	// update MODL info
	MODL.setInfodata(vid_id, player.getVideoData().title, player.getDuration())
	player.isLoading = false
	return vid_id
}
function applyVote(keepCombo=false) {
	const currSelection = getCurrentChoice()
	const left = PLAYERS.left?.getVideoData()?.video_id
	const right = PLAYERS.right?.getVideoData()?.video_id
	if(left && right && currSelection !== null) {
		MODL.applyVote(left, currSelection, right)

		// Reset choice
		choice(null)

		// Update ranking div
		updateRankingDiv()
	} else if(!keepCombo) {
		// Skip without vote: reset combo
		MODL.resetCombo()
	}
}
let __isShifting = false
async function shiftVids(shiftRightVid=false, keepCombo=false) {
	// Already shifting: cancel
	if(__isShifting) {
		return
	}
	// If not enough candidates: cancel
	if(!MODL.isReady()) {
		toast('Not enough playable videos (at least 4 are needed)', 'toast-err')
		return
	}
	__isShifting = true

	// Prevent all actions that may skip again
	const disabledButtons = Array.from(document.getElementsByClassName('skp'))
	disabledButtons.forEach(e => e.disabled = true)

	try {
		if (PLAYERS.right) {
			applyVote(keepCombo)
			await handlePlayerShift(shiftRightVid)
			await updateRankingDiv()
		}

		const autoStarted = await ensureLeftPlayer()

		if (!PLAYERS.right) {
			await ensureRightPlayer()
			await updateRankingDiv()
		}

		updatePlayerUI(autoStarted)

		if (!autoStarted && PLAYERS.left.getPlayerState() !== YT.PlayerState.PLAYING) {
			PLAYERS.right.playVideo()
		}

		await preloadFutureVideo()
	} finally {
		// Re-enable buttons, once future video is preloaded
		disabledButtons.forEach(e => e.disabled = false)
		__isShifting = false
	}
}

async function handlePlayerShift(shiftRight) {
	const playerToRemove = shiftRight ? PLAYERS.right : PLAYERS.left
	if (playerToRemove) {
		destroyPlayer(playerToRemove)
	}

	if (!shiftRight) {
		PLAYERS.left = PLAYERS.right
	}
	PLAYERS.right = PLAYERS.future
	PLAYERS.future = null
}

async function ensureLeftPlayer() {
	if(PLAYERS.left) {
		return false
	}

	PLAYERS.left = await initNewPlayer()
	const infoDiv = PLAYERS.left.getIframe()?.parentElement?.querySelector('.vidInfo')
	if (infoDiv) infoDiv.innerText = 'Loading...'

	await loadNextVideo(PLAYERS.left)
	PLAYERS.left.playVideo()

	return true
}

async function ensureRightPlayer() {
	if (!PLAYERS.right) {
		PLAYERS.right = await initNewPlayer()
		const infoDiv = PLAYERS.right.getIframe()?.parentElement?.querySelector('.vidInfo')
		if (infoDiv) infoDiv.innerText = 'Loading...'

		await loadNextVideo(PLAYERS.right)
	}
}

function updatePlayerUI() {
	const vdata = MODL.vdata

	const leftIframe = PLAYERS.left?.getIframe()
	const rightIframe = PLAYERS.right?.getIframe()

	if (!leftIframe || !rightIframe) return

	const linfo = leftIframe.parentElement.querySelector('.vidInfo')
	const rinfo = rightIframe.parentElement.querySelector('.vidInfo')

	const left = vdata[PLAYERS.left.getVideoData().video_id] || SCORING.newScore()
	const right = vdata[PLAYERS.right.getVideoData().video_id] || SCORING.newScore()

	const probaLeft = SCORING.proba(left, right)

	if (linfo) linfo.innerText = `Preference: ${Math.round(100 * probaLeft)}% (${SCORING.describe(left)})`
	if (rinfo) rinfo.innerText = `Preference: ${Math.round(100 * (1 - probaLeft))}% (${SCORING.describe(right)})`
}

async function preloadFutureVideo() {
	if (PLAYERS.future) {
		destroyPlayer(PLAYERS.future)
	}

	PLAYERS.future = await initNewPlayer()
	await loadNextVideo(PLAYERS.future)
}


async function updateRankingDiv() {
	await updateList(document.getElementById('ranking'), MODL.vdata, MODL.history)
}


/* ** *** **** ***** ******* ***** **** *** ** */
/**** **** **** **** ACTIONS **** **** **** ****/

function loadFile() {
	// Prompt for a .tsv file, then load it
	const input = document.createElement('input')
	input.type = 'file'
	input.accept = '.tsv'
	input.onchange = () => {
		const file = input.files[0]
		const reader = new FileReader()
		reader.onload = () => {
			const wasReady = MODL.isReady()
			let added
			try {
				added = MODL.addFromTSV(reader.result)
			} catch(e) {
				toast(escapeHtml(e.message), 'toast-err') // Unsupported file format
				return
			}
			const total = Object.keys(MODL.getScores()).length
			if(added) {
				toast(`${added} new videos listed (total: ${total})`, 'toast-ok')
			} else {
				toast(`No new video listed (total: ${total})`, 'toast-err')
			}
			if(!wasReady && MODL.isReady()) {
				shiftVids()
			}
			updateRankingDiv()
		}
		reader.readAsText(file)
	}
	input.click()
}
function addFromTextInput() {
	// Prompt for input text
	const userInput = prompt('Youtube video ids (11 char length) and/or video url to add (separated by spaces or ",")')

	if(userInput) {
		const wasReady = MODL.isReady()
		const added = MODL.addFromTSV(userInput.split(/[ \n\t,;]+/).join('\n'))
		const total = Object.keys(MODL.getScores()).length
		if(added) {
			toast(`${added} new videos listed (now ${total} listed)`, 'toast-ok')
		} else {
			toast(`No new video listed (${total} listed)`, 'toast-err')
		}
		if(!wasReady && MODL.isReady()) {
			shiftVids()
		}
		updateRankingDiv()
	}
}

function saveFile() {
	// Ask to save text file .tsv with content is "<vid>\t<rounded score>"
	const blob = new Blob([MODL.exportToTSV()], {type: "text/plain;charset=utf-8"})
	const url = URL.createObjectURL(blob)
	const a = document.createElement("a")
	a.href = url
	a.download = "Nlaylist.tsv"
	a.click()
	setTimeout(() => URL.revokeObjectURL(url), 1000) // Revoking immediately may cancel the download on some browsers
}
function resetList() {
	// Shift in progress: wait for it to end, so that no video is loaded after the reset
	if(__isShifting) {
		toast('Please wait for the next video to be loaded', 'toast-err')
		return
	}
	if(!confirm('Remove all videos from the list? This cannot be undone (except by loading a saved file)')) return

	MODL.reset()
	for(const player of [PLAYERS.left, PLAYERS.right, PLAYERS.future]) {
		if(player) destroyPlayer(player)
	}
	PLAYERS.left = null
	PLAYERS.right = null
	PLAYERS.future = null
	updateRankingDiv()
}

function choice(selection) {
	const lst = [
		"btn_lft2",
		"btn_lft1",
		"btn_eql",
		"btn_rgt1",
		"btn_rgt2",
		"btn_skp",
	].filter(b => b !== selection)
	lst.forEach(btn => document.getElementById(btn).classList.remove("selected"))
	document.getElementById(selection || "btn_skp").classList.add("selected")
}

async function skip() {
	// Shift in progress: players are not in a stable state
	if(__isShifting) return

	if(!PLAYERS.left || !PLAYERS.right) {
		// Players not initialized (not enough videos, or player loading failed): try to initialize them
		shiftVids()
		return
	}

	if(PLAYERS.left.getPlayerState() == YT.PlayerState.PLAYING) {
		Array.from(document.getElementsByClassName('skp')).forEach(e => e.disabled = true)
		// Left video is playing: launch right video
		setTimeout(()=>Array.from(document.getElementsByClassName('skp')).forEach(e => e.disabled = false), 1000)
		PLAYERS.left.stopVideo()
		PLAYERS.right.playVideo()
	} else {
		// Left video isn'nt playing: stop right video (it becomes the left one), then do shift (it plays the new right video)
		PLAYERS.right.stopVideo()
		shiftVids()
	}
}

function toggleAdvancedControls() {
	const enabled = document.getElementById('chkb_advctrls').checked
	const elmts = document.getElementsByClassName('advanced')

	for(const div of Array.from(elmts)) {
		div.style.display = (enabled ? '' : 'none')
	}
}

function mergeRight() {
	choice(null)
	MODL.removeVideo(PLAYERS.left.getVideoData().video_id, PLAYERS.right.getVideoData().video_id)
	shiftVids(false, true)
}
function mergeLeft() {
	choice(null)
	MODL.removeVideo(PLAYERS.right.getVideoData().video_id, PLAYERS.left.getVideoData().video_id)
	shiftVids(true, true)
}
function removeRight() {
	choice(null)
	MODL.removeVideo(PLAYERS.right.getVideoData().video_id)
	shiftVids(true, true)
}
