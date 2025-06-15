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
function onYouTubeIframeAPIReady() {
	MODL.playerLeft = new YT.Player('leftPlayer', {
		height: '100%',
		width: '100%',
		videoId: '',
		disablekb: 1,
		controls: 0,
		iv_load_policy: 3,
		events: {
			'onStateChange': (evt) => {
				if (evt.data == YT.PlayerState.ENDED) {
					// Launch righ video automatically after a second
					setTimeout(()=>MODL.playerRight.playVideo(), 1000)
				}
			}
		}
	});
	MODL.playerRight = new YT.Player('rightPlayer', {
		height: '100%',
		width: '100%',
		videoId: '',
		disablekb: 1,
		controls: 0,
		iv_load_policy: 3,
		events: {
			'onStateChange': (evt) => {
				if (evt.data == YT.PlayerState.ENDED) {
					skip()
				}
			}
		},
	});

	curtain = document.getElementById('curtain')
	counterElement = document.getElementById('counter')
	banner = document.getElementById('banner')
}


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
			const added = MODL.addFromTSV(reader.result)
			const total = Object.keys(MODL.getScores()).length
			if(added) {
				toast(`${added} new videos listed (now ${total} listed)`, 'toast-ok')
			} else {
				toast(`No new video listed (${total} listed)`, 'toast-err')
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
		const added = MODL.addFromTSV(userInput.split(/[ \n\t,;]+/).join('\n'))
		const total = Object.keys(MODL.getScores()).length
		if(added) {
			toast(`${added} new videos listed (now ${total} listed)`, 'toast-ok')
		} else {
			toast(`No new video listed (${total} listed)`, 'toast-err')
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
function getCurrentChoice() {
	switch(document.querySelector(".selected").id) {
		case "btn_lft2": return -2
		case "btn_lft1": return -1
		case "btn_eql": return 0
		case "btn_rgt1": return 1
		case "btn_rgt2": return 2
		default: return null
	}
}

async function shiftVids() {

	// Move right vid to the left
	const old_right = MODL.playerRight.getVideoData()
	if(old_right && old_right.video_id) {
		const wasPlayingRight = (MODL.playerRight.getPlayerState() == YT.PlayerState.PLAYING)

		const old_left = MODL.playerLeft.getVideoData()
		const currSelection = getCurrentChoice()
		if(old_left && old_left.video_id && currSelection != null) {
			MODL.applyVote(old_left.video_id, currSelection, old_right.video_id)
		}
		MODL.playerLeft.cueVideoById(old_right.video_id)

		if(wasPlayingRight) {
			MODL.playerRight.stopVideo()
			MODL.playerLeft.playVideo()
		}
	} else {
		MODL.playerRight.stopVideo()
		MODL.playerLeft.playVideo()
	}

	// Find next vid, and put it to the right
	let new_right = MODL.pickNext()
	MODL.playerRight.cueVideoById(new_right)
	await waitUntilTrue(() => MODL.playerRight?.playerInfo?.videoData?.video_id === new_right)

	const autoRm = document.getElementById('autoremove')
	while(!MODL.playerRight.getVideoData()?.isPlayable) {
		if(autoRm.checked) {
			toast("Failed to play previous video: removed", 'toast-err', 'rightvid')
			MODL.removeVideo(new_right)
		} else {
			toast("Failed to play previous video: skipped", 'toast-err', 'rightvid')
			MODL.markAsUnplayable(new_right)
		}

		new_right = MODL.pickNext()
		MODL.playerRight.cueVideoById(new_right)
		await waitUntilTrue(() => MODL.playerRight?.playerInfo?.videoData?.video_id === new_right)
	}

	// Set left info content
	const linfo = document.getElementById('leftInfo')
	const rinfo = document.getElementById('rightInfo')
	if(old_right && old_right.video_id) {
		const currScores = MODL.getScores()
		const probaLeft = scoreToProba(currScores[old_right.video_id], currScores[new_right])
		linfo.innerText = `Preference: ${Math.round(100*probaLeft) + '%'} (ELO: ${Math.round(currScores[old_right.video_id])+1000})`
		rinfo.innerText = `Preference: ${Math.round(100*(1-probaLeft)) + '%'} (ELO: ${Math.round(currScores[new_right])+1000})`
	} else {
		linfo.innerText = '-'
		rinfo.innerText = '-'
	}

	// update MODL info
	MODL.setInfodata(new_right, MODL.playerRight.getVideoData().title, MODL.playerRight.getDuration())

	// Reset choice
	choice(null)

	// Update ranking div
	setTimeout(updateRankingDiv)
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

async function loadPlayers() {
	await shiftVids()
	await shiftVids()
	MODL.playerLeft.playVideo()
}
async function skip() {
	if(MODL.playerLeft.getPlayerState() == YT.PlayerState.PLAYING) {
		// Left video is playing: launch right video
		MODL.playerLeft.stopVideo()
		MODL.playerRight.playVideo()
	} else {
		await shiftVids()
		if(MODL.playerLeft.getPlayerState() !== YT.PlayerState.PLAYING) {
			MODL.playerRight.playVideo()
		}
	}
}

async function mergeRight() {
	choice(null)
	MODL.removeVideo(MODL.playerLeft.getVideoData().video_id, MODL.playerRight.getVideoData().video_id)
	await shiftVids()
	MODL.playerRight.playVideo()
}
async function mergeLeft() {
	choice(null)
	MODL.removeVideo(MODL.playerRight.getVideoData().video_id, MODL.playerLeft.getVideoData().video_id)
	MODL.playerRight.cueVideoById(MODL.playerLeft.getVideoData().video_id)
	await shiftVids()
	MODL.playerRight.playVideo()
}
async function removeRight() {
	choice(null)
	MODL.removeVideo(MODL.playerRight.getVideoData().video_id)
	MODL.playerRight.cueVideoById(MODL.playerLeft.getVideoData().video_id)
	await shiftVids()
	MODL.playerRight.playVideo()
}
