
async function updateList(rankingDiv, allVdata, history) {
	const sortedScores = Object.keys(allVdata)
	sortedScores.sort((a, b) => allVdata[b].score - allVdata[a].score || (b > a ? -1 : 1))

	await updateWholeList(rankingDiv, allVdata, sortedScores)

	showHideElements(history)
}

async function updateWholeList(rankingDiv, allVdata, sortedScores) {
	// Rows are kept from an update to another, and moved only when their rank changes (so that CSS transitions apply)

	// Add a single row for all videos never compared
	let div = document.getElementById('ranking_unranked')
	let titleCell = div?.querySelector('.title')
	if(!div) {
		div = document.createElement('div')
		div.id = 'ranking_unranked'
		div.classList.add('rankingItem')
		titleCell = document.createElement('div')
		titleCell.classList.add('title')
		div.appendChild(titleCell)
		rankingDiv.prepend(div)
	}

	let unscored = 0
	let previousDiv = div // Rows are placed after the 'never compared' row, in sortedScores order
	const listed = new Set()
	for(const vid of sortedScores) {
		const vdata = allVdata[vid]
		const id = 'ranking_' + vid

		// Get div by id, or create new one if none found
		let div = document.getElementById(id)
		let updCell, scoreCell, uncertaintyCell, titleCell
		if(!div) {
 			div = document.createElement('div')
			div.id = id
			div.classList.add('rankingItem')

			updCell = document.createElement('div')
			updCell.classList.add('upd')
			div.appendChild(updCell)

			scoreCell = document.createElement('div')
			scoreCell.classList.add('score')
			div.appendChild(scoreCell)

			uncertaintyCell = document.createElement('div')
			uncertaintyCell.classList.add('uncertainty')
			uncertaintyCell.title = 'Uncertainty of the points'
			div.appendChild(uncertaintyCell)

			titleCell = document.createElement('div')
			titleCell.classList.add('title')
			div.appendChild(titleCell)
		} else {
			updCell = div.querySelector('.upd')
			scoreCell = div.querySelector('.score')
			uncertaintyCell = div.querySelector('.uncertainty')
			titleCell = div.querySelector('.title')
		}

		// Display current score as % chance of win against average score
		scoreCell.innerHTML = (Math.round(SCORING.points(vdata)) + ' pts')
		uncertaintyCell.innerHTML = ('+/- ' + Math.ceil(SCORING.pointsMargin(vdata)))

		// If vid is left or right: highlight the title
		if(vid === PLAYERS.left?.videoId) {
			div.classList.add('displayed')
		} else if(vid === PLAYERS.right?.videoId) {
			div.classList.add('displayed')
		} else {
			div.classList.remove('displayed')
		}

		// Compare last score with current score
		let scoreDiff = Math.round(SCORING.evolution(vdata))

		if(scoreDiff < 0) {
			updCell.innerHTML = '▼ ' + ('-' + (-scoreDiff)).padStart(3, ' ').replaceAll(/ /g, '&nbsp;') + '%'
		} else if(scoreDiff > 0) {
			updCell.innerHTML = '▲ ' + ('+' + scoreDiff).padStart(3, ' ').replaceAll(/ /g, '&nbsp;') + '%'
		} else {
			updCell.innerHTML = ''
		}
		updCell.classList.toggle('red', scoreDiff < 0)
		updCell.classList.toggle('green', scoreDiff > 0)

		if(!SCORING.isCompared(vdata)) {
			unscored += 1
			continue
		}
		if(vdata.info && vdata.info.title) {
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

	// Find and remove rankingItem divs of videos not listed anymore (except ranking_unranked)
	for(const div of rankingDiv.querySelectorAll('.rankingItem')) {
		const did = div.id.replace('ranking_','')
		if(did !== 'unranked' && !listed.has(did)) {
			rankingDiv.removeChild(div)
		}
	}

	// Update counts
	titleCell.innerText = `${sortedScores.length - unscored} listed videos`
	if(unscored > 0) {
		titleCell.innerText += ` (+${unscored} never compared yet)`
	}
}

function showHideElements(history) {
	const list = Array.from(document.getElementsByClassName('rankingItem'))

	// Mark them all as hidden
	for(const d of list) {
		d.style.display = 'none'
	}

	// Show 25 last played
	for(const vid of history.slice(0, 25)) {
		const div = document.getElementById('ranking_' + vid)
		if(div) {
			div.style.display = ''
		}
	}

	// Show the one above and the one below both currently displayed (class='displayed')
	const index = list.map((d, i) => i).filter(i => list[i].classList.contains('displayed'))
	for(const displayedIndex of index) {
		for(let i=displayedIndex-1; i<=displayedIndex+1; i++) {
			if(i >= 0 && i < list.length)
				list[i].style.display = ''
		}
	}

	// Always display 'ranking_unranked'
	const div = document.getElementById('ranking_unranked')
	if(div) {
		div.style.display = ''
	}
}
