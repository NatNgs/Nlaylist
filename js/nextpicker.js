
NEXT_PICKERS = {
	'pure_random': pure_random,
	'weighted_random': weighted_random,
	'ordered': ordered,
	'similar_scores': similar_scores
}


function pure_random(vids) {
	// Pick a random vid from vids
	const rand = (Math.random() * vids)|0
	return vids[rand]
}

function weighted_random(vids, vdata) {
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
		+ (vdata[vid].score === 0 && vdata[vid].info === undefined
			? 0 // Score is 0 and no info: increase chances to be picked
			: history.indexOf(vid) // The later in history: the more it will be picked
		)
		+ Math.random()*.4 // Randomize if same score
	, byScores.indexOf(vid), history.indexOf(vid)]) // DEBUG
	console.log(weights) // DEBUG

	// Pick the vid with the lowest weight
	weights.sort((a,b) => a[1] - b[1])
	return weights[0][0]
}

function similar_scores(vids, vdata, history) {
	if(history.length < 2) return pure_random(vids)

	// Check the score of the last vid in history. Sort others by how similair their score is (absolute difference)
	const lastScore = vdata[history[history.length-1]].score
	const scores = vids.map(vid => [vid, Math.abs(vdata[vid].score - lastScore)])

	// The last vid in history get its score divided by 2, to help it being selected
	scores.sort((a,b) => history.indexOf(b[0]) - history.indexOf(a[0]))
	scores[0][1] /= 2

	// Pick the vid with the lowest score, if same score, the last from history
	scores.sort((a,b) => (a[1] - b[1]) || (history.indexOf(b[0]) - history.indexOf(a[0])))
	return scores[0][0]
}
