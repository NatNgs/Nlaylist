
async function updateList(rankingDiv, allVdata, history) {
	const sortedScores = Object.keys(allVdata)
	sortedScores.sort((a, b) => allVdata[b].score - allVdata[a].score || (b > a ? -1 : 1))

	await updateWholeList(rankingDiv, allVdata, sortedScores)

	showHideElements(rankingDiv, history)
}

async function updateWholeList(rankingDiv, allVdata, sortedScores) {
	rankingDiv.innerHTML = '' // Clear ranking

	// Add a single row for all videos never played
	let div = document.getElementById('ranking_unranked')
	let titleCell = div?.querySelector('.title')
	if(!div) {
		div = document.createElement('div')
		div.id = 'ranking_unranked'
		div.classList.add('rankingItem')
		titleCell = document.createElement('div')
		titleCell.classList.add('title')
		div.appendChild(titleCell)
		rankingDiv.appendChild(div)
	}

	let unscored = 0
	for(const vid of sortedScores) {
		const vdata = allVdata[vid]
		const id = 'ranking_' + vid

		// Get div by id, or create new one if none found
		let div = document.getElementById(id)
		let updCell, scoreCell, titleCell
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

			titleCell = document.createElement('div')
			titleCell.classList.add('title')
			div.appendChild(titleCell)
		} else {
			updCell = div.querySelector('.upd')
			scoreCell = div.querySelector('.score')
			titleCell = div.querySelector('.title')
		}

		// Display current score as % chance of win against score 0
		const currPct = 100*scoreToProba(vdata.score, 0)
		scoreCell.innerHTML = (Math.round(currPct) + ' pts')

		// If vid is left or right: highlight the title
		if(vid === PLAYERS.left?.getVideoData()?.video_id) {
			div.classList.add('displayed')
		} else if(vid === PLAYERS.right?.getVideoData()?.video_id) {
			div.classList.add('displayed')
		} else {
			div.classList.remove('displayed')
		}

		// Compare last score with current score
		let scoreDiff = Math.round(200*scoreToProba(vdata.score, vdata.lastScore) - 100)

		if(scoreDiff < 0) {
			updCell.innerHTML = '▼ ' + ('-' + (-scoreDiff)).padStart(3, ' ').replaceAll(/ /g, '&nbsp;') + '%'
			updCell.classList.add('red')
		} else if(scoreDiff > 0) {
			updCell.innerHTML = '▲ ' + ('+' + scoreDiff).padStart(3, ' ').replaceAll(/ /g, '&nbsp;') + '%'
			updCell.classList.add('green')
		} else {
			updCell.innerHTML = ''
		}

		if(vdata.info && vdata.info.title) {
			titleCell.innerHTML = `<a href="https://www.youtube.com/watch?v=${vid}" target="_blank" rel="noopener noreferrer">${vdata.info.title}</a>`
			titleCell.classList.remove('vid')
		} else {
			if(vdata.score == 0) {
				unscored += 1
				continue // Skip if no title & score == 0
			}
			titleCell.innerHTML = `Unknown video: <a href="https://www.youtube.com/watch?v=${vid}" target="_blank" rel="noopener noreferrer">yt:${vid}</a>` // Show vid
			titleCell.classList.add('vid')
		}

		rankingDiv.appendChild(div)
	}

	// Find and remove rankingItem divs that are not in sortedScore (neither ranking_unranked)
	for(const div of rankingDiv.querySelectorAll('.rankingItem')) {
		const did = div.id.replace('ranking_','')
		if(did !== 'unranked' && !sortedScores.includes(did)) {
			rankingDiv.removeChild(div)
		}
	}

	// Update counts
	titleCell.innerText = `${sortedScores.length - unscored} listed videos`
	if(unscored > 0) {
		titleCell.innerText += ` (+${unscored} never played yet)`
	}
}

function showHideElements(rankingDiv, history) {
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
			list[i].style.display = ''
		}
	}

	// Always display 'ranking_unranked'
	const div = document.getElementById('ranking_unranked')
	if(div) {
		div.style.display = ''
	}
}
