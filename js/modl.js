// Utils
const ELO_BASE = 400
const ELO_K = 33
function scoreToProba(eloA, eloB) {
	return 1 / (1 + Math.pow(10, (eloB - eloA) / ELO_BASE))
}

// Model
class PlaylistModel {
	#vdata // vid : {score: <score>, lastScore: <lastScore>, info: {youtube video info}}
	#unplayable // [vid, vid, ...]
	#combo // [vid, vid, ...]
	#comboDir // -1, 0, 1
	history // [vid, vid, ...]

	#isCallingUpdate // timeout ref

	constructor() {
		try {
			this.#vdata = JSON.parse(localStorage['vdata'])
		} catch(e) {
			this.#vdata = {}
		}

		try {
			this.history = JSON.parse(localStorage['history'])
		} catch(e) {
			this.history = []
		}

		this.#unplayable = [] // Not stored in localStorage

		// Combo mode - Not stored in localStorage
		this.#combo = [] // List of previously compared videos by order or comparisons
		this.#comboDir = 0 // Any score between two consecutive members of combo array

		this.#isCallingUpdate = false
		this.#callUpdate()
	}

	async updateLocalStorage() {
		localStorage['vdata'] = JSON.stringify(this.#vdata)
		localStorage['history'] = JSON.stringify(this.history)
	}

	isReady() {
		return Object.keys(this.#vdata).filter(vid => !this.#unplayable.includes(vid)).length > 3
	}

	addVid(url, score=0) {
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
		if(this.#vdata[vid]) return // vid already in vids: ignore

		this.#vdata[vid] = {score: score, lastScore: score}

		// Add last to history if not yet in it
		if(!this.history.includes(vid)) this.history.push(vid)

		this.#callUpdate()
	}

	#callUpdate() {
		if(this.#isCallingUpdate) {
			clearTimeout(this.#isCallingUpdate)
		}
		this.#isCallingUpdate = setTimeout(() => {
			this.updateLocalStorage()
			this.#isCallingUpdate = false
		}, 100)
	}

	pickNext(mode=null) {
		// Filter for playable ones
		let vids = Object.keys(this.#vdata)
			.filter(vid => !this.#unplayable.includes(vid))

		// Remove last half played
		vids = vids.filter(vid => {
			const i = this.history.indexOf(vid)
			return i === -1 || i > vids.length/2
		})


		if(!vids.length) {
			alert('Not enough playable video left')
			return null
		}

		const vid = NEXT_PICKERS[mode || 'weighted_random'](vids, this.#vdata, this.history)

		// History: move vid to the front of the list
		this.history.splice(this.history.indexOf(vid), 1)
		this.history.unshift(vid)

		// Update lastScore
		this.#vdata[vid].lastScore = this.#vdata[vid].score
		this.updateLocalStorage()
		return vid
	}

	markAsUnplayable(vid) {
		this.#unplayable.push(vid)
		// remove vid from history
		this.history.splice(this.history.indexOf(vid), 1)

		console.log(vid, 'was not able to be played -- Remaining videos:', Object.keys(this.#vdata).filter(vid => !this.#unplayable.includes(vid)).length)
	}
	getScores(keepUnplayable = false) {
		const scores = {}
		for(const vid in this.#vdata) {
			if(!keepUnplayable && this.#unplayable.includes(vid)) continue
			scores[vid] = this.#vdata[vid].score
		}
		return scores
	}
	get vdata() {
		const out = {}
		for(const v in this.#vdata)
			if(!this.#unplayable.includes(v))
				out[v] = {score: this.#vdata[v].score, lastScore: this.#vdata[v].lastScore, info: this.#vdata[v].info}
		return out
	}

	applyVote(id_a, score, id_b) {
		if(this.#combo.length) {
			if(this.#combo[0] === id_a && score/this.#comboDir < 0) {
				this.#combo.reverse().push(id_b)
			} else if(this.#combo[0] === id_b && score/this.#comboDir < 0) {
				this.#combo.reverse().push(id_a)
				id_a,id_b,score = id_b,id_a // reverse references such as combo array ends with [... id_a, id_b]
				score *= -1
			} else if(this.#combo[this.#combo.length-1] === id_a && score/this.#comboDir > 0) {
				this.#combo.push(id_b)
			} else if(this.#combo[this.#combo.length-1] === id_b && score/this.#comboDir > 0) {
				this.#combo.push(id_a)
				id_a,id_b,score = id_b,id_a // reverse references such as combo array ends with [... id_a, id_b]
				score *= -1
			} else {
				this.#combo.length = 0
			}
		}
		if(!this.#combo.length) {
			this.#combo.push(id_a, id_b)
		}
		// --- here, combo array is like [..., id_a, id_b], such as any pair of 2 consecutive elements have been scored in the same direction [a > b > c > ... > id_a > id_b] or [a < b < c < ... < id_a < id_b]
		this.#comboDir = score // keep track of combo array direction

		const currElo_b = this.#vdata[id_b].score
		let k = ELO_K
		let upd_b = 0
		for(let i=this.#combo.length-2; i>=0; i--) {
			// Iterate from the end of combo array to the beginning, and apply a vote from id_b to every previous combo members (with diminishing effect on older ones)
			id_a = this.#combo[i]
			const currElo_a = this.#vdata[id_a].score

			const upd = k * (score - (scoreToProba(currElo_b, currElo_a)-0.5)*2)
			this.#vdata[id_a].score -= upd
			upd_b += upd
			console.debug(id_a, (-upd).toFixed(2))
			k *= .9 // Reduce K by 10% for next combo vote to apply
		}
		this.#vdata[id_b].score += upd_b
		console.debug(id_b, upd_b.toFixed(2))

		this.#callUpdate()
	}

	removeVideo(vidToRemove, vidToMerge) {
		if(vidToMerge) {
			// Merge vdata
			this.#vdata[vidToMerge].score += this.#vdata[vidToRemove].score
			if(!this.#vdata[vidToMerge].merged) this.#vdata[vidToMerge].merged = []
			if(vidToRemove.info) this.#vdata[vidToMerge].merged.push(vidToRemove.info)
			if(vidToRemove.merged) this.#vdata[vidToMerge].merged.push(...vidToRemove.merged)
		}

		// Remove from history
		this.history.splice(this.history.indexOf(vidToRemove), 1)

		// Remove from vdata
		delete this.#vdata[vidToRemove]

		this.#callUpdate()
	}

	setInfodata(vid, title, duration) {
		this.#vdata[vid].info = {video_id: vid}
		if(title) this.#vdata[vid].info.title = title
		if(duration) this.#vdata[vid].info.duration = duration
		this.updateLocalStorage()
	}
	getInfodata(vid) {
		return this.#vdata[vid].info || {}
	}

	addFromTSV(tsv) {
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

		const numberIs = Object.keys(this.getScores()).length
		return numberIs - numberWas
	}
	exportToTSV() {
		// export MODL data as text as "<vid>\t<rounded score>"
		let text = []
		const scores = this.getScores(true)
		const sortedScores = Object.keys(scores).filter(vid => !this.#unplayable.includes(vid))

		// Sort according to history
		sortedScores.sort((a, b) => {
			const ia = this.history.indexOf(a)
			const ib = this.history.indexOf(b)
			return ia < 0 ? (ib < 0 ? 0 : 1) : (ib < 0 ? -1 : ia - ib)
		})

		// Insert unplayable videos in the middle of sortedScores
		sortedScores.splice((sortedScores.length/2) |0, 0, ...this.#unplayable)

		// Extract scores
		for(const vid of sortedScores) {
			const infodata = this.getInfodata(vid)
			text.push([vid, Math.round(scores[vid]) || '', infodata.title || '', infodata.duration || ''])
		}
		return text.map(row => row.join('\t').replace(/[ \t]+$/,'')).join('\n')
	}

	reset() {
		this.#vdata = {}
		this.#unplayable.length = 0
		this.history.length = 0
		this.#combo.length = 0
		this.#comboDir = 0
	}
}

// // // // // // // // //
const MODL = new PlaylistModel()
