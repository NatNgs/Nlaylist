// Utils
const ELO_BASE = 400
const ELO_K = 33
function scoreToProba(eloA, eloB) {
	return 1 / (1 + Math.pow(10, (eloB - eloA) / ELO_BASE))
}

// Model
const PlaylistModel = function() {
	const vdata = {} // vid : {score: score, info: {youtube video info}}

	this.playerLeft = null
	this.playerRight = null

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

		// Add last to history if not yet in it
		if(!history.includes(vid)) history.push(vid)
	}

	const history = []
	this.pickNext = function() {
		// Random pick one of vids
		let vids = Object.keys(vdata)
			.filter(vid => !unplayable.includes(vid))

		vids = vids.filter(vid => {
			const i = history.indexOf(vid)
			return i === -1 || i > vids.length/2
	 	})

		if(!vids.length) {
			alert('Not enough playable video left')
			return
		}

		// Weight them all (weight = scoreToProba(currScore, 0))
		const weights = vids.map(vid => scoreToProba(vdata[vid].score, 0)**2)

		// Give oldest video in history a significant weight boost
		weights[weights.length-1] += 1

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

		// History: move vid to the front of the list
		history.splice(history.indexOf(vid), 1)
		history.unshift(vid)

		return vid
	}

	const unplayable = []
	this.markAsUnplayable = function(vid) {
		unplayable.push(vid)
		// remove vid from history
		history.splice(history.indexOf(vid), 1)

		console.log(vid, 'was not able to be played -- Remaining videos:', Object.keys(vdata).filter(vid => !unplayable.includes(vid)).length)
	}
	this.getScores = function(keepUnplayable = false) {
		const scores = {}
		for(const vid in vdata) {
			if(!keepUnplayable && unplayable.includes(vid)) continue
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

		// Remove from history
		history.splice(history.indexOf(vidToRemove), 1)

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

	this.addFromTSV = function(tsv) {
		const wasReady = this.isReady()
		const numberWas = Object.keys(this.getScores()).length

		// Parse text such as every line is "<video url>" or "<video url> <score>". Ignore other lines
		const rows = tsv.split('\n')
		for(const r of rows) {
			const parts = r.split('\t')
			const vid = parts[0]
			const score = (parts.length >= 2) ? Number.parseInt(parts[1] || 0) : 0
			this.addVid(vid, score)
			if(parts.length >= 3) {
				this.setInfodata(vid, parts[2], (parts.length >= 4) ? Number.parseInt(parts[3]) : null)
			}
		}

		if(!wasReady && this.isReady()) {
			loadPlayers()
		}

		const numberIs = Object.keys(this.getScores()).length
		return numberIs - numberWas
	}
	this.exportToTSV = function() {
		// export MODL data as text as "<vid>\t<rounded score>"
		let text = []
		const scores = this.getScores(true)
		const sortedScores = Object.keys(scores)
		// Sort according to history, unplayed videos last
		sortedScores.sort((a, b) => {
			const ia = history.indexOf(a)
			const ib = history.indexOf(b)
			return ia < 0 ? (ib < 0 ? 0 : 1) : (ib < 0 ? -1 : ia - ib)
		})
		for(const vid of sortedScores) {
			const infodata = this.getInfodata(vid)
			text.push([vid, Math.round(scores[vid]) || '', infodata.title || '', infodata.duration || ''])
		}
		return text.map(row => row.join('\t').replace(/[ \t]+$/,'')).join('\n')
	}
}

// // // // // // // // //
const MODL = new PlaylistModel()
