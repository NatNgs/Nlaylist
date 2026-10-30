/**
 * Ranking table content: rank of the videos, search, sort modes and pages
 * - 'top': best videos first, never compared videos excluded
 * - 'history': last picked videos first (in history order), videos missing from history last
 */
const RANKING_PAGE_SIZES = [10, 25, 50, 100, 250]
const SEARCH_LETTERS = { // Letters not split by Unicode normalization (letter + accent)
	'æ': 'ae',
	'œ': 'oe',
	'ß': 'ss',
	'ø': 'o',
	'ł': 'l',
	'đ': 'd', 'ð': 'd',
	'þ': 'th',
	'ı': 'i',
}

const RANKING = {
	// Text in lower case and without accents, to search case and accent insensitive
	normalize(text) {
		return text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[æœßøłđðþı]/g, letter => SEARCH_LETTERS[letter])
	},

	// Regular expressions of the search terms (separated by spaces): '?' any character, '*' any characters, '_' a space or '_', other characters as is
	searchTerms(search) {
		return this.normalize(search).split(/\s+/).filter(Boolean).map(term => new RegExp([...term].map(c =>
			c === '?' ? '.' // '?' => any character
			: c === '*' ? '.*?' // '*' => any string
			: c === '_' ? '[ _]' // '_' => any space (or underscore itself)
			: c.replace(/[\^$\\.+()[\]{}|/]/, '\\$&') // Escape regexp characters
		).join(''), 'u'))
	},

	// User search:search video by id/url, if not found, by text pattern
	matches(vdata, search) {
		const searchedVid = extractVideoId(search)
		if(searchedVid && vdata[searchedVid]) return new Set([searchedVid])

		const terms = this.searchTerms(search)
		return new Set(Object.keys(vdata).filter(vid => {
			const title = this.normalize(vdata[vid].info?.title || '')
			return terms.every(term => term.test(title))
		}))
	},

	// Top order: Sorted by score and margin of error (higher score and lower margin first)
	topOrder(vdata) {
		const vids = Object.keys(vdata)
		const spread = SCORING.scoreSpread(vids.map(vid => vdata[vid]))
		const rankValues = new Map(vids.map(vid => [vid, SCORING.rankValue(vdata[vid], spread)]))
		return vids.sort((a, b) => rankValues.get(b) - rankValues.get(a) || (a < b ? -1 : 1))
	},

	// Rank (best is '1'), none for never compared videos
	ranks(vdata) {
		const ranks = new Map()
		let rank = 0
		for(const vid of this.topOrder(vdata))
			if(SCORING.isCompared(vdata[vid]))
				ranks.set(vid, ++rank)
		return ranks
	},

	/**
	 * Rows of the ranking table, filtered and sorted
	 * - shown: videos to force to be filtered-in
	 */
	table(vdata, history, {mode, search, shown}) {
		let sorted
		if(mode === 'history') {
			const historyIndex = new Map(history.map((vid, i) => [vid, i]))
			sorted = Object.keys(vdata).sort((a, b) => (historyIndex.get(a) ?? history.length) - (historyIndex.get(b) ?? history.length))
		} else {
			sorted = this.topOrder(vdata)
		}

		const matches = this.matches(vdata, search)
		const isInMode = vid => mode === 'history' || SCORING.isCompared(vdata[vid])
		const isResult = vid => matches.has(vid) && isInMode(vid)
		return {
			rows: sorted.filter(vid => isResult(vid) || shown.includes(vid)),
			results: sorted.filter(isResult).length,
			total: sorted.length,
			neverCompared: [...matches].filter(vid => !isInMode(vid) && !shown.includes(vid)).length,
		}
	},

	// Rows of the given page (first page = 1)
	page(rows, pageSize, page) {
		const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
		page = Math.min(Math.max(1, page), pageCount)
		return {page, pageCount, rows: rows.slice((page - 1) * pageSize, page * pageSize)}
	},

	// Find the page containing the requested video, null if not found
	pageOf(rows, vid, pageSize) {
		const index = rows.indexOf(vid)
		return index < 0 ? null : Math.floor(index / pageSize) + 1
	},
}
