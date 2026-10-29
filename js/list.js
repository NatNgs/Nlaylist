
// Ranking table state
const RANKING_VIEW = {
	mode: 'top', // 'top' or 'history'
	search: '', // User filter (search field)
	pageSize: 25, // see RANKING_PAGE_SIZES
	page: 1, // current page
	rows: [], // Rows of the last displayed table
}

function loadRankingSettings() {
	try {
		const mode = localStorage[STORAGE_PREFIX + 'rankingMode']
		const pageSize = Number(localStorage[STORAGE_PREFIX + 'rankingPageSize'])
		if(mode === 'top' || mode === 'history') RANKING_VIEW.mode = mode
		if(RANKING_PAGE_SIZES.includes(pageSize)) RANKING_VIEW.pageSize = pageSize
	} catch(e) {
		console.error('Unable to read ranking settings from browser storage', e)
	}
}
function saveRankingSettings() {
	try {
		localStorage[STORAGE_PREFIX + 'rankingMode'] = RANKING_VIEW.mode
		localStorage[STORAGE_PREFIX + 'rankingPageSize'] = RANKING_VIEW.pageSize
	} catch(e) {
		console.error('Unable to save ranking settings in browser storage', e)
	}
}

// User actions
function setRankingMode(mode) {
	RANKING_VIEW.mode = mode
	RANKING_VIEW.page = 1
	saveRankingSettings()
	updateRankingDiv()
}
function setRankingPageSize(pageSize) {
	RANKING_VIEW.pageSize = pageSize
	RANKING_VIEW.page = 1
	saveRankingSettings()
	updateRankingDiv()
}
function applyRankingSearch() {
	RANKING_VIEW.search = document.getElementById('rankingSearch').value
	RANKING_VIEW.page = 1
	updateRankingDiv()
}
function clearRankingSearch() {
	document.getElementById('rankingSearch').value = ''
	applyRankingSearch()
}
function goToRankingPage(page) {
	RANKING_VIEW.page = page
	updateRankingDiv()
}
function shiftRankingPage(shift) {
	goToRankingPage(RANKING_VIEW.page + shift)
}
function goToPlayerVideo(side) {
	// Find the page where the selected video is displayed
	const vid = PLAYERS[side]?.videoId
	if(!vid) return
	if(RANKING_VIEW.mode === 'history') {
		RANKING_VIEW.page = 1
	} else {
		RANKING_VIEW.page = RANKING.pageOf(RANKING_VIEW.rows, vid, RANKING_VIEW.pageSize) ?? 1
	}
	updateRankingDiv()
}

async function updateList(rankingDiv, allVdata, history, unplayable) {
	// Left and Right Videos are always included, bypassing filters
	const shown = [PLAYERS.left?.videoId, PLAYERS.right?.videoId].filter(vid => vid && allVdata[vid])
	const table = RANKING.table(allVdata, history, unplayable, {mode: RANKING_VIEW.mode, search: RANKING_VIEW.search, shown})
	const page = RANKING.page(table.rows, RANKING_VIEW.pageSize, RANKING_VIEW.page)
	RANKING_VIEW.rows = table.rows
	RANKING_VIEW.page = page.page

	await updateWholeList(rankingDiv, allVdata, page.rows, RANKING.ranks(allVdata, unplayable), unplayable)
	updateRankingCount(table)
	updateRankingControls(page)
}

async function updateWholeList(rankingDiv, allVdata, vids, ranks, unplayable) {
	// Rows of the page are kept and moved for CSS transitions to apply

	// First row: count of results
	let countDiv = document.getElementById('ranking_count')
	if(!countDiv) {
		countDiv = document.createElement('div')
		countDiv.id = 'ranking_count'
		countDiv.classList.add('rankingItem')
		const countCell = document.createElement('div')
		countCell.classList.add('title')
		countDiv.appendChild(countCell)
		rankingDiv.prepend(countDiv)
	}

	let previousDiv = countDiv // Rows are placed after the count row, in vids order
	const listed = new Set()
	for(const vid of vids) {
		const vdata = allVdata[vid]
		const id = 'ranking_' + vid

		// Get div by id, or create new one if none found
		let div = document.getElementById(id)
		let rankCell, updCell, scoreCell, titleCell
		if(!div) {
 			div = document.createElement('div')
			div.id = id
			div.classList.add('rankingItem')

			rankCell = document.createElement('div')
			rankCell.classList.add('rank')
			div.appendChild(rankCell)

			// Progression cell: arrow, percentage, and trash button (shown on hover, see CSS)
			updCell = document.createElement('div')
			updCell.classList.add('upd')
			const removeButton = document.createElement('button')
			removeButton.classList.add('remove')
			removeButton.title = 'Remove from the list'
			removeButton.onclick = () => removeFromRanking(vid)
			updCell.append(document.createElement('span'), document.createElement('span'), removeButton)
			div.appendChild(updCell)

			scoreCell = document.createElement('div')
			scoreCell.classList.add('score')
			div.appendChild(scoreCell)

			titleCell = document.createElement('div')
			titleCell.classList.add('title')
			div.appendChild(titleCell)
		} else {
			rankCell = div.querySelector('.rank')
			updCell = div.querySelector('.upd')
			scoreCell = div.querySelector('.score')
			titleCell = div.querySelector('.title')
		}

		// Rank ('-' if unplayable, none if never compared)
		const rank = ranks.get(vid)
		rankCell.textContent = (rank === Infinity) ? '-' : (rank ?? '')

		// Display current score as % chance of win against average video
		scoreCell.innerHTML = SCORING.describe(vdata)

		// Higlight left and right vids, and grey unplayables
		div.classList.toggle('displayed', vid === PLAYERS.left?.videoId || vid === PLAYERS.right?.videoId)
		div.classList.toggle('unplayable', unplayable.has(vid))
		div.title = unplayable.has(vid) ? 'Failed to play' : ''

		// Compare last with current score
		let scoreDiff = Math.round(SCORING.evolution(vdata))
		const arrowSpan = updCell.children[0]
		const percentSpan = updCell.children[1]
		if(scoreDiff < 0) {
			arrowSpan.textContent = '▼'
			percentSpan.textContent = `${scoreDiff}%`
		} else if(scoreDiff > 0) {
			arrowSpan.textContent = '▲'
			percentSpan.textContent = `+${scoreDiff}%`
		} else {
			arrowSpan.textContent = ''
			percentSpan.textContent = ''
		}
		updCell.classList.toggle('red', scoreDiff < 0)
		updCell.classList.toggle('green', scoreDiff > 0)

		if(vdata.info?.title) {
			titleCell.innerHTML = `<a href="https://www.youtube.com/watch?v=${escapeHtml(vid)}" target="_blank" rel="noopener noreferrer">${escapeHtml(vdata.info.title)}</a>`
			titleCell.classList.remove('vid')
		} else {
			titleCell.innerHTML = `Unknown video: <a href="https://www.youtube.com/watch?v=${escapeHtml(vid)}" target="_blank" rel="noopener noreferrer">yt:${escapeHtml(vid)}</a>` // Show vid
			titleCell.classList.add('vid')
		}

		// Place the row just after the previous one (moved only if needed)
		if(previousDiv.nextSibling !== div) {
			rankingDiv.insertBefore(div, previousDiv.nextSibling)
		}
		previousDiv = div
		listed.add(vid)
	}

	// Find and remove rankingItem divs of videos not listed anymore (except ranking_count)
	for(const div of rankingDiv.querySelectorAll('.rankingItem')) {
		const did = div.id.replace('ranking_','')
		if(did !== 'count' && !listed.has(did)) {
			div.remove()
		}
	}
}

function updateRankingCount({results, total, neverCompared}) {
	const countCell = document.querySelector('#ranking_count .title')
	countCell.innerText = `${results} result${results === 1 ? '' : 's'} / ${total} listed video${total === 1 ? '' : 's'}`
	if(neverCompared > 0) {
		countCell.innerText += ` (+${neverCompared} never compared yet)`
	}
}

function updateRankingControls({page, pageCount}) {
	document.getElementById('rankingTop').classList.toggle('selected', RANKING_VIEW.mode === 'top')
	document.getElementById('rankingHistory').classList.toggle('selected', RANKING_VIEW.mode === 'history')
	document.getElementById('rankingPageSize').value = RANKING_VIEW.pageSize
	document.getElementById('goToLeft').disabled = !PLAYERS.left?.videoId
	document.getElementById('goToRight').disabled = !PLAYERS.right?.videoId

	// Pagination
	for(const pagination of document.getElementsByClassName('pagination')) {
		pagination.querySelector('.pageNumber').textContent = `Page ${page}/${pageCount}`
		pagination.querySelector('.firstPage').disabled = page === 1
		pagination.querySelector('.previousPage').disabled = page === 1
		pagination.querySelector('.nextPage').disabled = page === pageCount
		pagination.querySelector('.lastPage').disabled = page === pageCount
	}
}
