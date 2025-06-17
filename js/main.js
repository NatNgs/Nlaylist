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

	const player = new YT.Player('video_' + playerId, {
		height: '100%',
		width: '100%',
		videoId: '',
		disablekb: 1,
		controls: 0,
		iv_load_policy: 3,
		events: {
			'onStateChange': onYouTubeEventStateChange
		},
	})

	await waitUntilTrue(() => player.cueVideoById)

	return player
}
async function loadNextVideo(player) {
	const _pickNextToPlayer = async () => {
		const vid = MODL.pickNext()
		if(!vid) return vid
		player.cueVideoById(vid)
		await waitUntilTrue(() => player?.playerInfo?.videoData?.video_id === vid)
		return vid
	}

	if(player !== PLAYERS.future) toast("Loading...", '', player.g.parentElement)
	let vid_id = await _pickNextToPlayer()

	const autoRm = document.getElementById('autoremove')
	let tries = 1
	while(vid_id && !player.getVideoData()?.isPlayable) {
		if(player !== PLAYERS.future) toast(`Loading another one (try ${++tries})...`, '', player.g.parentElement)
		if(autoRm.checked) {
			MODL.removeVideo(vid_id)
		} else {
			MODL.markAsUnplayable(vid_id)
		}

		vid_id = await _pickNextToPlayer()
	}

	// update MODL info
	MODL.setInfodata(vid_id, player.getVideoData().title, player.getDuration())

	return vid_id
}
function applyVote() {
	const currSelection = getCurrentChoice()
	const left = PLAYERS.left?.getVideoData()?.video_id
	const right = PLAYERS.right?.getVideoData()?.video_id
	if(left && right && currSelection !== null) {
		MODL.applyVote(left, currSelection, right)

		// Reset choice
		choice(null)

		// Update ranking div
		updateRankingDiv()
	}
}
async function shiftVids() {
	// Prevent all actions that may skip again
	Array.from(document.getElementsByClassName('skp')).forEach(e => e.disabled = true)

	const playersParentDiv = document.getElementById('players')

	if(PLAYERS.right) {
		applyVote()

		// Remove left video (will shift left & right automatically)
		playersParentDiv.removeChild(playersParentDiv.children[0])
		PLAYERS.left = PLAYERS.right
		PLAYERS.right = PLAYERS.future
		PLAYERS.future = null
	}

	let autoStarted = false
	if(!PLAYERS.left) {
		PLAYERS.left = await initNewPlayer(playersParentDiv)
		PLAYERS.left.g.parentElement.querySelector(".vidInfo").innerText = 'Loading...'
		await loadNextVideo(PLAYERS.left)
		PLAYERS.left.playVideo()
		autoStarted = true
	}

	// Update left video info
	const currScores = MODL.getScores()
	const linfo = PLAYERS.left.g.parentElement.querySelector(".vidInfo")
	const leftId = PLAYERS.left.getVideoData().video_id
	linfo.innerText = `Preference: (Loading...) (ELO: ${Math.round(currScores[leftId])+1000})`

	if(!PLAYERS.right) {
		PLAYERS.right = await initNewPlayer()
		PLAYERS.right.g.parentElement.querySelector(".vidInfo").innerText = 'Loading...'
		await loadNextVideo(PLAYERS.right)
	}

	// Update video info
	const rightId = PLAYERS.right.getVideoData().video_id
	const rinfo = PLAYERS.right.g.parentElement.querySelector(".vidInfo")
	const probaLeft = scoreToProba(currScores[leftId]||0, currScores[rightId]||0)
	linfo.innerText = `Preference: ${Math.round(100*probaLeft) + '%'} (ELO: ${Math.round(currScores[leftId])+1000})`
	rinfo.innerText = `Preference: ${Math.round(100*(1-probaLeft)) + '%'} (ELO: ${Math.round(currScores[rightId])+1000})`

	if(!autoStarted && PLAYERS.left.getPlayerState() !== YT.PlayerState.PLAYING) {
		PLAYERS.right.playVideo()
	}

	// Re-enable buttons that skip
	Array.from(document.getElementsByClassName('skp')).forEach(e => e.disabled = false)

	// Preload next video
	PLAYERS.future = await initNewPlayer()
	await loadNextVideo(PLAYERS.future, !autoStarted)
}


function updateRankingDiv() {
	const rankingDic = document.getElementById('ranking')
	const scores = MODL.getScores()
	const sortedScores = Object.keys(scores)
	sortedScores.sort((a, b) => scores[b] - scores[a])

	rankingDic.innerHTML = '' // Clear ranking
	let unscored = 0
	for(const vid of sortedScores) {
		const score = scores[vid]
		const id = 'ranking_' + vid

		// Get div by id, or create new one if none found
		let div = document.getElementById(id)
		let scoreCell, titleCell
		if(!div) {
 			div = document.createElement('div')
			div.id = id
			div.classList.add('rankingItem')

			scoreCell = document.createElement('div')
			scoreCell.classList.add('score')
			div.appendChild(scoreCell)

			titleCell = document.createElement('div')
			titleCell.classList.add('title')
			div.appendChild(titleCell)
		} else {
			scoreCell = div.querySelector('.score')
			titleCell = div.querySelector('.title')
		}
		scoreCell.innerText = (Math.round(100*scoreToProba(score, 0)) + '%').padStart(3, ' ')

		const infodata = MODL.getInfodata(vid)
		if(infodata.title) {
			titleCell.innerHTML = `<a href="https://www.youtube.com/watch?v=${vid}" target="_blank" rel="noopener noreferrer">${infodata.title}</a>`
			titleCell.classList.remove('vid')
		} else {
			if(score == 0) {
				unscored += 1
				continue // Skip if no title & score == 0
			}
			titleCell.innerHTML = `Unknown video: <a href="https://www.youtube.com/watch?v=${vid}" target="_blank" rel="noopener noreferrer">yt:${vid}</a>` // Show vid
			titleCell.classList.add('vid')
		}

		rankingDic.appendChild(div)
	}

	// Find and remove rankingItem divs that are not in sortedScore (neither ranking_unranked)
	for(const div of rankingDic.querySelectorAll('.rankingItem')) {
		const did = div.id.replace('ranking_','')
		if(did !== 'unranked' && !sortedScores.includes(did)) {
			rankingDic.removeChild(div)
		}
	}

	// Add a single row for all videos never played
	if(unscored > 0) {
		let div = document.getElementById('ranking_unranked')
		let titleCell
		if(!div) {
			div = document.createElement('div')
			div.id = 'ranking_unranked'
			div.classList.add('rankingItem')
			titleCell = document.createElement('div')
			titleCell.classList.add('title')
			div.appendChild(document.createElement('div'))
			div.appendChild(titleCell)
		} else {
			titleCell = div.querySelector('.title')
		}
		titleCell.innerText = `(${unscored} videos never played yet)`

		rankingDic.appendChild(div)
	} else {
		// Remove ranking_unranked div
		const div = document.getElementById('ranking_unranked')
		if(div) {
			rankingDic.removeChild(div)
		}
	}
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
			const added = MODL.addFromTSV(reader.result)
			const total = Object.keys(MODL.getScores()).length
			if(added) {
				toast(`${added} new videos listed (total: ${total})`, 'toast-ok')
			} else {
				toast(`No new video listed (total: ${total})`, 'toast-err')
			}
			if(!wasReady && MODL.isReady) {
				shiftVids()
			}
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
		if(!wasReady && MODL.isReady) {
			shiftVids()
		}
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
	URL.revokeObjectURL(url)
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
	if(PLAYERS.left.getPlayerState() == YT.PlayerState.PLAYING) {
		Array.from(document.getElementsByClassName('skp')).forEach(e => e.disabled = true)
		// Left video is playing: launch right video
		PLAYERS.left.stopVideo()
		PLAYERS.right.playVideo()
		setTimeout(()=>Array.from(document.getElementsByClassName('skp')).forEach(e => e.disabled = false), 1000)
	} else {
		// Left video isn'nt playing: do shift
		shiftVids()
	}
}
async function mergeRight() {
	choice(null)
	MODL.removeVideo(PLAYERS.left.getVideoData().video_id, PLAYERS.right.getVideoData().video_id)
	await shiftVids()
}

// TODO: fix functions below
async function mergeLeft() {
	choice(null)
	MODL.removeVideo(PLAYERS.right.getVideoData().video_id, PLAYERS.left.getVideoData().video_id)
	PLAYERS.right.cueVideoById(PLAYERS.left.getVideoData().video_id)
	await shiftVids()
	PLAYERS.right.playVideo()
}
async function removeRight() {
	choice(null)
	MODL.removeVideo(PLAYERS.right.getVideoData().video_id)
	PLAYERS.right.cueVideoById(PLAYERS.left.getVideoData().video_id)
	await shiftVids()
	PLAYERS.right.playVideo()
}
