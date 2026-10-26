// Utils
const STORAGE_PREFIX = 'nlaylist.' // localStorage is shared by all pages of the same origin
const TSV_VERSION = 'v2' // Format of saved files
const TSV_HEADER = ['#Nlaylist ' + TSV_VERSION, 'title', 'length', 'score', 'uncertainty', 'surprise'] // First line of saved files: file format, then name of the other columns

// Model
class PlaylistModel {
	#vdata // vid : {<score data (see SCORING)>, info: {youtube video info}, merged: [info of merged videos]}
	#unplayable // Set of vid
	#combo // [vid, vid, ...]
	#comboDir // -1, 0, 1
	history // [vid, vid, ...]

	#isCallingUpdate // timeout ref
	#storageError // true if last localStorage update failed

	constructor() {
		this.#migrateLocalStorage()

		try {
			this.#vdata = JSON.parse(localStorage[STORAGE_PREFIX + 'vdata'])
		} catch(e) {
			this.#vdata = {}
		}

		// Repair invalid scores, and keep average score at 0
		for(const vid in this.#vdata) SCORING.repair(this.#vdata[vid])
		SCORING.recenter(Object.values(this.#vdata))

		try {
			this.history = JSON.parse(localStorage[STORAGE_PREFIX + 'history'])
		} catch(e) {
			this.history = []
		}

		this.#unplayable = new Set() // Not stored in localStorage

		// Combo mode - Not stored in localStorage
		this.#combo = [] // List of previously compared videos by order or comparisons
		this.#comboDir = 0 // Any score between two consecutive members of combo array

		this.#isCallingUpdate = false
		this.#storageError = false
		this.#callUpdate()
	}

	#migrateLocalStorage() {
		// Move data stored by previous versions under unprefixed keys, only if it looks like Nlaylist data
		try {
			if(localStorage[STORAGE_PREFIX + 'vdata'] !== undefined || localStorage['vdata'] === undefined) return
			const vdata = JSON.parse(localStorage['vdata'])
			const history = JSON.parse(localStorage['history'] || '[]')
			if(Object.values(vdata).every(d => d && 'score' in d) && Array.isArray(history)) {
				localStorage[STORAGE_PREFIX + 'vdata'] = localStorage['vdata']
				localStorage[STORAGE_PREFIX + 'history'] = JSON.stringify(history)
				localStorage.removeItem('vdata')
				localStorage.removeItem('history')
			}
		} catch(e) {
			console.error('Unable to migrate browser storage', e)
		}
	}

	async updateLocalStorage() {
		try {
			localStorage[STORAGE_PREFIX + 'vdata'] = JSON.stringify(this.#vdata)
			localStorage[STORAGE_PREFIX + 'history'] = JSON.stringify(this.history)
			this.#storageError = false
		} catch(e) {
			console.error('Unable to save data in browser storage', e)
			// Notify once (toasts.js is loaded asynchronously, it may not be available yet)
			if(!this.#storageError && typeof toast === 'function') {
				this.#storageError = true
				toast('Unable to save data in browser storage: use "Save to file" to keep your changes', 'toast-err')
			}
		}
	}

	isReady() {
		return Object.keys(this.#vdata).filter(vid => !this.#unplayable.has(vid)).length > 3
	}

	addVid(url, scoreData=null) {
		/** extract id (always 11 char length) from id or url, and return it (null if none found)
		 * scoreData: score of the new video (see SCORING), never compared if not given
		 * Possible forms are:
		 * - <id>
		 * - http(s)://website.xxx/...?v=<id>&...
		 * - http(s)://website.xxx/...?...&v=<id>&...
		 * - http(s)://youtu.be/<id>
		 * - http(s)://website.xxx/embed/<id> (also /shorts/<id>, /live/<id> and /v/<id>)
		 */
		url = url.trim()
		const match = url.match(/^([a-zA-Z0-9_-]{11})$/)
			|| url.match(/[?&]v=([a-zA-Z0-9_-]{11})(?![a-zA-Z0-9_-])/)
			|| url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})(?![a-zA-Z0-9_-])/)
			|| url.match(/\/(?:embed|shorts|live|v)\/([a-zA-Z0-9_-]{11})(?![a-zA-Z0-9_-])/)
		if(!match) return null // failed to extract vid
		const vid = match[1]
		if(this.#vdata[vid]) return vid // vid already in vids: ignore

		this.#vdata[vid] = scoreData || SCORING.newScore()

		// Add last to history if not yet in it
		if(!this.history.includes(vid)) this.history.push(vid)

		this.#callUpdate()
		return vid
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
			.filter(vid => !this.#unplayable.has(vid))

		// Remove last half played
		const historyIndex = new Map(this.history.map((vid, i) => [vid, i]))
		vids = vids.filter(vid => {
			const i = historyIndex.get(vid) ?? -1
			return i === -1 || i > vids.length/2
		})


		if(!vids.length) {
			alert('Not enough playable video left')
			return null
		}

		const vid = NEXT_PICKERS[mode || 'weighted_random'](vids, this.#vdata, this.history)

		// History: move vid to the front of the list
		this.#removeFromHistory(vid)
		this.history.unshift(vid)

		// Update lastScore
		this.#vdata[vid].lastScore = this.#vdata[vid].score
		this.#callUpdate()
		return vid
	}

	markAsUnplayable(vid) {
		this.#unplayable.add(vid)
		// remove vid from history
		this.#removeFromHistory(vid)

		console.log(vid, 'was not able to be played -- Remaining videos:', Object.keys(this.#vdata).filter(vid => !this.#unplayable.has(vid)).length)
	}
	#removeFromHistory(vid) {
		const index = this.history.indexOf(vid)
		if(index >= 0) this.history.splice(index, 1)
	}
	getScores(keepUnplayable = false) {
		const scores = {}
		for(const vid in this.#vdata) {
			if(!keepUnplayable && this.#unplayable.has(vid)) continue
			scores[vid] = this.#vdata[vid].score
		}
		return scores
	}
	get vdata() {
		const out = {}
		for(const v in this.#vdata)
			if(!this.#unplayable.has(v))
				out[v] = {...this.#vdata[v]}
		return out
	}

	applyVote(id_a, score, id_b) {
		if(this.#combo.length) {
			if(this.#combo[0] === id_a && score/this.#comboDir < 0) {
				this.#combo.reverse().push(id_b)
			} else if(this.#combo[0] === id_b && score/this.#comboDir > 0) {
				this.#combo.reverse().push(id_a)
				// reverse references such as combo array ends with [... id_a, id_b]
				const tmp = id_b
				id_b = id_a
				id_a = tmp
				score *= -1
			} else if(this.#combo[this.#combo.length-1] === id_a && score/this.#comboDir > 0) {
				this.#combo.push(id_b)
			} else if(this.#combo[this.#combo.length-1] === id_b && score/this.#comboDir < 0) {
				this.#combo.push(id_a)
				// reverse references such as combo array ends with [... id_a, id_b]
				const tmp = id_b
				id_b = id_a
				id_a = tmp
				score *= -1
			} else {
				this.#combo.length = 0
			}
		}
		if(!this.#combo.length) {
			this.#combo.push(id_a, id_b)
		}
		// Prevent comparing a video with itself (cycle in preferences): remove previous occurrence of the last added video
		const lastIndex = this.#combo.length-1
		const prevIndex = this.#combo.indexOf(this.#combo[lastIndex])
		if(prevIndex < lastIndex) this.#combo.splice(prevIndex, 1)
		// --- here, combo array is like [..., id_a, id_b], such as any pair of 2 consecutive elements have been scored in the same direction [a > b > c > ... > id_a > id_b] or [a < b < c < ... < id_a < id_b]
		this.#comboDir = score // keep track of combo array direction

		// Apply a vote from id_b to every previous combo members, from the end of combo array to the beginning (id_a first)
		const opponents = this.#combo.slice(0, -1).reverse()
		SCORING.applyVote(this.#vdata[id_b], opponents.map(vid => this.#vdata[vid]), score)
		console.debug('Vote', score, id_b, 'against', opponents)

		// Vote "=": reset combo, so that next vote does not continue it
		if(score === 0) this.resetCombo()

		this.#callUpdate()
	}

	resetCombo() {
		this.#combo.length = 0
		this.#comboDir = 0
	}

	removeVideo(vidToRemove, vidToMerge) {
		if(vidToMerge) {
			// Merge vdata
			SCORING.merge(this.#vdata[vidToMerge], this.#vdata[vidToRemove])
			if(!this.#vdata[vidToMerge].merged) this.#vdata[vidToMerge].merged = []
			this.#vdata[vidToMerge].merged.push(this.#vdata[vidToRemove].info || {video_id: vidToRemove})
			if(this.#vdata[vidToRemove].merged) this.#vdata[vidToMerge].merged.push(...this.#vdata[vidToRemove].merged)
		}

		// Remove from history
		this.#removeFromHistory(vidToRemove)

		// Remove from unplayable
		this.#unplayable.delete(vidToRemove)

		// Remove from combo (remaining members are still ordered, by transitivity)
		this.#combo = this.#combo.filter(vid => vid !== vidToRemove)
		if(this.#combo.length < 2) this.resetCombo()

		// Remove from vdata
		delete this.#vdata[vidToRemove]

		this.#callUpdate()
	}

	setInfodata(vid, title, duration) {
		if(!this.#vdata[vid]) return // Video removed meanwhile (info received asynchronously)
		this.#vdata[vid].info = {...this.#vdata[vid].info, video_id: vid} // Keep known info if not given
		if(title) this.#vdata[vid].info.title = title
		if(duration) this.#vdata[vid].info.duration = duration
		this.#callUpdate()
	}
	getInfodata(vid) {
		return this.#vdata[vid].info || {}
	}

	addFromTSV(tsv) {
		const numberWas = Object.keys(this.getScores()).length

		// First line is the file format header (see TSV_HEADER, "#nlaylist \t v2 \t elo" in previous versions). Files without header use the legacy format
		const rows = tsv.replace(/^\uFEFF/, '').split(/\r?\n/)
		const header = rows[0].match(/^#nlaylist[ \t]+([^ \t]+)/i)
		if(header) {
			rows.shift()
			if(header[1] !== TSV_VERSION) throw new Error(`Unsupported file format: ${header[1]}`)
		}

		// Parse text such as every line is "<video url> <title> <duration> <score columns>" (legacy format: "<video url> <score> <title> <duration>"). Ignore other lines
		for(const r of rows) {
			const parts = r.split('\t')
			if(header) {
				const vid = this.addVid(parts[0], SCORING.fromTSV(parts.slice(3)))
				if(vid && (parts[1] || parts[2])) {
					this.setInfodata(vid, parts[1], Number.parseInt(parts[2]) || null)
				}
			} else {
				const vid = this.addVid(parts[0], SCORING.fromLegacyTSV(parts[1]))
				if(vid && parts.length >= 3) {
					this.setInfodata(vid, parts[2], (parts.length >= 4) ? Number.parseInt(parts[3]) : null)
				}
			}
		}

		const numberIs = Object.keys(this.getScores()).length
		return numberIs - numberWas
	}
	exportToTSV() {
		// export MODL data as text: header, then "<vid> \t <title> \t <duration> \t <score columns>"
		const sortedScores = Object.keys(this.#vdata).filter(vid => !this.#unplayable.has(vid))

		// Sort according to history
		const historyIndex = new Map(this.history.map((vid, i) => [vid, i]))
		sortedScores.sort((a, b) => {
			const ia = historyIndex.get(a) ?? -1
			const ib = historyIndex.get(b) ?? -1
			return ia < 0 ? (ib < 0 ? 0 : 1) : (ib < 0 ? -1 : ia - ib)
		})

		// Insert unplayable videos in the middle of sortedScores
		sortedScores.splice((sortedScores.length/2) |0, 0, ...this.#unplayable)

		// Normalize scores (to make average score go toward 0)
		const offset = SCORING.averageScore(Object.values(this.#vdata))
		console.debug('Score average deviation from 0:', offset)

		// Extract scores
		const text = sortedScores.map(vid => {
			const infodata = this.getInfodata(vid)
			const title = (infodata.title || '').replace(/[\t\r\n]+/g, ' ') // Keep file format
			return [
				vid,
				title,
				infodata.duration || '',
				...SCORING.toTSV(this.#vdata[vid], offset)
			].join('\t').replace(/[ \t]+$/,'')
		}).join('\n')
		return TSV_HEADER.join('\t') + '\n' + text
	}

	reset() {
		this.#vdata = {}
		this.#unplayable.clear()
		this.history.length = 0
		this.#combo.length = 0
		this.#comboDir = 0
		this.#callUpdate()
	}
}

// // // // // // // // //
const MODL = new PlaylistModel()
