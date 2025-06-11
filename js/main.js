//
// TODOLIST:
//
// - Combo mode:
//    - A vs B, B wins => register B > A
//    - B vs C, C wins => register C > B and also C > A
//    - C vs D, D wins => register D > C, D > B, D > A
//    - D vs E, D wins => reset combo and register D > E only
//   if skip without note or =, reset combo
//   if delete or merge, ignore and continue combo
//
// - Rebalance score sum
//    After loaded a bunch of items (after the whole group only), compute the sum of all scores.
//    Sum should be exactly 0. If not, split the remaining and add that to every item such as sum become 0
//     Split the remaining with weight depending on scoreToProba(current, 0), so that high scores pay a bit more
//

/**** **** **** **** INIT **** **** **** ****/

async function sleep(ms) {
	await new Promise(resolve => setTimeout(resolve, ms))
}


const ELO_BASE = 400
const ELO_K = 33
function scoreToProba(eloA, eloB) {
	return 1 / (1 + Math.pow(10, (eloB - eloA) / ELO_BASE))
}



// Prepare Youtube Player
let playerLeft, playerRight;
function onYouTubeIframeAPIReady() {
	playerLeft = new YT.Player('leftPlayer', {
		height: '100%',
		width: '100%',
		videoId: '',
		disablekb: 1,
		controls: 0,
		iv_load_policy: 3,
	});
	playerRight = new YT.Player('rightPlayer', {
		height: '100%',
		width: '100%',
		videoId: '',
		events: {
			'onStateChange': (evt) => {
				if (evt.data == YT.PlayerState.ENDED) {
					skip()
				}
			}
		},
		disablekb: 1,
		controls: 0,
		iv_load_policy: 3,
	});

	curtain = document.getElementById('curtain')
	counterElement = document.getElementById('counter')
	banner = document.getElementById('banner')
}


const MODL = new (function() {
	const vdata = {} // vid : {score: score, info: {youtube video info}}

	this.isReady = function() {
		return Object.keys(vdata).filter(vid => !unplayable.includes(vid)).length > 3
	}

	this.addVid = function(url, score) {
		/** extract id from url (always 11 char length)
		 * Possible forms are:
		 * - http(s)://website.xxx/...?v=<id>&...
		 * - http(s)://website.xxx/...?...&v=<id>&...
		 * - http(s)://website.xxx/<id>
		 */
		let vid = null;
		if(url.length === 11) {
			vid = url
		} else {
			let match = url.match(/(?:[^/]+\/)*([a-zA-Z0-9_-]{11})/)
			if(match && match.length > 1)
				vid = match[1]
			else {
				// Extract url params, and find parameter "v"
				match = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
				if(match && match.length > 1)
					vid = [1]
			}
		}
		if(!vid) return // failed to extract vid
		if(vdata[vid]) return // vid already in vids: ignore

		vdata[vid] = {score: score}
	}

	const history = []
	this.pickNext = function() {
		// Random pick one of vids
		let vids = Object.keys(vdata)
			.filter(vid => !unplayable.includes(vid))
		const maxLn = (vids.length/2) | 0
		vids = vids.filter(vid => !history.includes(vid))

		if(!vids.length) {
			alert('Not enough playable video left')
			return
		}

		// Weight them all (weight = scoreToProba(currScore, 0))
		const weights = vids.map(vid => scoreToProba(vdata[vid].score, 0)**2)

		// Pick one with weighted random
		const totalWeight = weights.reduce((a, b) => a + b)
		const rand = Math.random() * totalWeight
		let currWeight = 0
		let vid = vids[vids.length-1]
		for(let i = 0; i < weights.length; i++) {
			currWeight += weights[i]
			if(rand < currWeight) {
				vid = vids[i]
				break
			}
		}

		// History
		history.unshift(vid)
		if(history.length > maxLn) {
			history.length = maxLn
		}

		return vid
	}

	const unplayable = []
	this.markAsUnplayable = function(vid) {
		unplayable.push(vid)
		// remove vid from history
		history.splice(history.indexOf(vid), 1)

		console.log(vid, 'was not able to be played -- Remaining videos:', Object.keys(vdata).filter(vid => !unplayable.includes(vid)).length)
	}
	this.getScores = function() {
		const scores = {}
		for(const vid in vdata) {
			if(unplayable.includes(vid)) continue
			scores[vid] = vdata[vid].score
		}
		return scores
	}

	this.applyVote = function(id_a, score, id_b) {
		const currElo_a = vdata[id_a].score
		const currElo_b = vdata[id_b].score

		const upd = ELO_K * (score - (scoreToProba(currElo_b, currElo_a)-0.5)*2)
		vdata[id_a].score -= upd
		vdata[id_b].score += upd
	}

	this.removeVideo = function(vidToRemove, vidToMerge) {
		if(vidToMerge) {
			// Merge vdata
			vdata[vidToMerge].score += vdata[vidToRemove].score
			if(!vdata[vidToMerge].merged) vdata[vidToMerge].merged = []
			if(vidToRemove.info) vdata[vidToMerge].merged.push(vidToRemove.info)
			if(vidToRemove.merged) vdata[vidToMerge].merged.push(...vidToRemove.merged)
		}
		// Replace occurence in history with vidToMerge
		history.splice(history.indexOf(vidToRemove), 1, vidToMerge ? [vidToMerge] : undefined)

		// Remove from vdata
		delete vdata[vidToRemove]
	}

	this.setInfodata = function(vid, title, duration) {
		vdata[vid].info = {video_id: vid}
		if(title) vdata[vid].info.title = title
		if(duration) vdata[vid].info.duration = duration
	}
	this.getInfodata = function(vid) {
		return vdata[vid].info || {}
	}
})


/**** **** **** **** ACTIONS **** **** **** ****/

function onLoad(content) {
	const wasReady = MODL.isReady()
	const numberWas = Object.keys(MODL.getScores()).length

	// Parse text such as every line is "<video url>" or "<video url> <score>". Ignore other lines
	const rows = content.split('\n')
	for(const r of rows) {
		const parts = r.trim().replace(/[ \t]+/, ' ').split(' ')
		if(parts.length == 1) {
			MODL.addVid(parts[0], null)
		} else if(parts.length == 2) {
			MODL.addVid(parts[0], Number.parseInt(parts[1]))
		}
	}

	if(!wasReady && MODL.isReady()) {
		loadPlayers()
	}

	const numberIs = Object.keys(MODL.getScores()).length
	if(numberIs > numberWas) {
		console.log('Added', numberIs-numberWas, 'new videos to the list')
	}
}
function loadFile() {
	// Prompt for a .tsv file, then load it
	const input = document.createElement('input')
	input.type = 'file'
	input.accept = '.tsv'
	input.onchange = () => {
		const file = input.files[0]
		const reader = new FileReader()
		reader.onload = () => onLoad(reader.result)
		reader.readAsText(file)
	}
	input.click()
}
function loadText() {
	// Prompt multiline text in JQueryUI modal form
	const dialog = $("#dialog-inputText").dialog({
		autoOpen: true,
		modal: true,
		width: "50em",
		buttons: {
			"Cancel": () => dialog.dialog("close"),
			"Ok": () => {
				const text = $("#inputText").val()
				onLoad(text)
				dialog.dialog("close")
			}
		},
		close: () => dialog.dialog("close")
	})
	dialog.dialog("open")
}
function saveToText() {
	// export MODL data as text as "<vid>\t<rounded score>"
	let text = ''
	const scores = MODL.getScores()
	const sortedScores = Object.keys(scores)
	sortedScores.sort((a, b) => scores[b] - scores[a])
	for(const vid of sortedScores) {
		text += vid + '\t' + Math.round(scores[vid]) + '\n'
	}
	return text
}
function saveFile() {
	// Ask to save text file .tsv with content is "<vid>\t<rounded score>"
	const blob = new Blob([saveToText()], {type: "text/plain;charset=utf-8"})
	const url = URL.createObjectURL(blob)
	const a = document.createElement("a")
	a.href = url
	a.download = "Nlaylist.tsv"
	a.click()
	URL.revokeObjectURL(url)
}
function saveText() {
	alert(saveToText())
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
	playerLeft.stopVideo()
	playerRight.stopVideo()

	// Move right vid to the left
	const old_right = playerRight.getVideoData()
	if(old_right && old_right.video_id) {
		const old_left = playerLeft.getVideoData()
		const currSelection = getCurrentChoice()
		if(old_left && old_left.video_id && currSelection != null) {
			MODL.applyVote(old_left.video_id, currSelection, old_right.video_id)
		}
		playerLeft.cueVideoById(old_right.video_id)
	}
	// Set left info content
	if(old_right && old_right.video_id) {
		const linfo = document.getElementById('leftInfo')
		linfo.innerText = `Score: ${MODL.getScores()[old_right.video_id] | 0}`
	}

	// Find next vid, and put it to the right
	let new_right = MODL.pickNext()
	playerRight.cueVideoById(new_right)
	await sleep(500)

	while(!playerRight.getVideoData().isPlayable) {
		MODL.markAsUnplayable(new_right)
		new_right = MODL.pickNext()
		playerRight.cueVideoById(new_right)
		await sleep(500)
	}

	// Set right info content
	const rinfo = document.getElementById('rightInfo')
	rinfo.innerText = `Score: ${MODL.getScores()[new_right] | 0}`

	// update MODL info
	MODL.setInfodata(new_right, playerRight.getVideoData().title, playerRight.getDuration())

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
	for(const vid of sortedScores) {
		const score = scores[vid]

		const div = document.createElement('div')
		div.classList.add('rankingItem')

		const scoreCell = document.createElement('div')
		scoreCell.innerText = (score > 0 ? '+' : '') + ('' + (score | 0)).padStart(3, ' ')
		scoreCell.classList.add('score')
		div.appendChild(scoreCell)

		const titleCell = document.createElement('div')
		const infodata = MODL.getInfodata(vid)
		if(infodata.title) {
			titleCell.innerText = infodata.title
		} else {
			continue // Skip if no title
			titleCell.innerText = vid
			titleCell.classList.add('vid')
		}
		div.appendChild(titleCell)

		rankingDic.appendChild(div)
	}
}

async function loadPlayers() {
	await shiftVids()
	skip()
}
async function skip() {
	await shiftVids()
	// Launch righ video automatically
	playerRight.playVideo()
}

function mergeRight() {
	choice(null)
	MODL.removeVideo(playerLeft.getVideoData().video_id, playerRight.getVideoData().video_id)
	skip()
}
function mergeLeft() {
	choice(null)
	MODL.removeVideo(playerRight.getVideoData().video_id, playerLeft.getVideoData().video_id)
	playerRight.cueVideoById(playerLeft.getVideoData().video_id)
	skip()
}
async function removeRight() {
	choice(null)
	MODL.removeVideo(playerRight.getVideoData().video_id)
	playerRight.cueVideoById(playerLeft.getVideoData().video_id)
	await sleep(500)
	skip()
}
