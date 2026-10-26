
NEXT_PICKERS = {
	'meta': meta_random, // Keep first in NEXT_PICKERS to avoid infinite loop^
	'pure_random': pure_random,
	'weighted_random': weighted_random,
	'ordered': ordered,
	'similar_scores': similar_scores
}


function meta_random(vids, vdata, history) {
	// Pick a random algorithm to pick the video to watch
	const rand = (Math.random() * (Object.keys(NEXT_PICKERS).length-1))|0
	return NEXT_PICKERS[Object.keys(NEXT_PICKERS)[1+rand]](vids, vdata, history)
}

function pure_random(vids) {
	// Pick a random vid from vids
	const rand = (Math.random() * vids.length)|0
	return vids[rand]
}

function weighted_random(vids, vdata, history) {
	// Weight them all (weight = chance to be preferred to an average video, squared)
	const weights = vids.map(vid => (SCORING.points(vdata[vid])/100)**2)

	// Give oldest video in history a significant weight boost
	const historyIndexes = vids.map(vid => history.indexOf(vid))
	weights[historyIndexes.indexOf(historyIndexes.reduce((a, b) => Math.max(a, b)))] += 1

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
	return vid
}

function ordered(vids, vdata, history) {
	// Rank vids by their score (best score first)
	let byScores = vids.map(vid => [vid, vdata[vid].score])
	byScores.sort((a,b) => b[1] - a[1])
	byScores = byScores.map(v => v[0])

	// Rank vids by their position in history (last played first)
	// ~~ nothing to do, history is already sorted ~~

	// Sum ranks to weights
	const weights = vids.map(vid => [vid,
		byScores.indexOf(vid) // The highest score: the more chance to be picked
		+ (!SCORING.isCompared(vdata[vid]) && vdata[vid].info === undefined
			? 0 // Never compared and no info: increase chances to be picked
			: history.length - 1 - history.indexOf(vid) // The older in history (the later in history array): the more it will be picked
		)
		+ Math.random() // Randomize if same score
	])

	// Pick the vid with the lowest weight
	weights.sort((a,b) => a[1] - b[1])
	return weights[0][0]
}

function similar_scores(vids, vdata, history) {
	if(history.length < 2) return pure_random(vids)

	// Check the score of the last picked vid (the one the next vid will be compared to). Sort others by how similair their score is (absolute difference)
	const lastScore = vdata[history[0]].score
	const scores = vids.map(vid => [vid, Math.abs(vdata[vid].score - lastScore)])

	// The last vid in history get its score divided by 2, to help it being selected
	scores.sort((a,b) => history.indexOf(b[0]) - history.indexOf(a[0]))
	scores[0][1] /= 2

	// Pick the vid with the lowest score, if same score, the last from history
	scores.sort((a,b) => (a[1] - b[1]) || (history.indexOf(b[0]) - history.indexOf(a[0])))
	return scores[0][0]
}
