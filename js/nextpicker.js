NEXT_PICKERS = {
	'meta': meta_random,
	'pure_random': pure_random,
	'weighted_random': weighted_random,
	'top_scores': top_scores,
	'similar_scores': similar_scores,
	'stop': () => null, // Debug only (option hidden in the page): no video picked, the playlist stops
}
// Modes drawn at random by 'meta' (neither 'meta' itself nor the debug mode 'stop')
const META_PICKERS = [pure_random, weighted_random, top_scores, similar_scores]


function meta_random(vids, vdata, history) {
	// Pick a random algorithm to pick the video to watch
	const picker = META_PICKERS[(Math.random() * META_PICKERS.length)|0]
	return picker(vids, vdata, history)
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
	const historyIndex = new Map(history.map((vid, i) => [vid, i]))
	const historyIndexes = vids.map(vid => historyIndex.get(vid) ?? -1)
	weights[historyIndexes.indexOf(historyIndexes.reduce((a, b) => Math.max(a, b)))] += 1

	return weightedPick(vids, weights)
}

function weightedPick(vids, weights) {
	// Pick a random vid, with a chance proportional to its weight
	const totalWeight = weights.reduce((a, b) => a + b)
	const rand = Math.random() * totalWeight
	let currWeight = 0
	for(let i = 0; i < weights.length; i++) {
		currWeight += weights[i]
		if(rand < currWeight) return vids[i]
	}
	return vids[vids.length-1]
}

// Computes the overlap of two scores+/-margin ranges with the given ref
function overlapWeights(displayed, ref, margin_mult=1) {
	return displayed.map(({points, margin}) => margin_mult * (ref.margin + margin) - Math.abs(points - ref.points))
}

// Takes the best scored vid, and the vids whose score range overlaps it
// Picks one of them at random
function top_scores(vids, vdata) {
	const displayed = vids.map(vid => SCORING.displayed(vdata[vid]))
	const best = displayed.reduce((a, b) => b.points > a.points ? b : a)
	const weights = overlapWeights(displayed, best)
	return pure_random(vids.filter((vid, i) => displayed[i] === best || weights[i] > 0))
}

function similar_scores(vids, vdata, history) {
	if(history.length < 2) return pure_random(vids)

	// Keep the vids whose displayed points range (points +/- margin) overlaps the one of the last picked vid (the one the next vid will be compared to)
	// Pick one of them at random, weighted by their overlap
	// If none overlaps, same with margins doubled
	const last = SCORING.displayed(vdata[history[0]])
	const displayed = vids.map(vid => SCORING.displayed(vdata[vid]))
	for(let factor = 1; factor <= 2; factor++) {
		const weights = overlapWeights(displayed, last, factor)
		const similar = vids.filter((vid, i) => weights[i] > 0)
		if(similar.length) return weightedPick(similar, weights.filter(weight => weight > 0))
	}

	// No overlapping range: sort vids by how similar their score is (absolute difference)
	const lastScore = vdata[history[0]].score
	const scores = vids.map(vid => [vid, Math.abs(vdata[vid].score - lastScore)])

	// The last vid in history gets its score divided by 2, to help it be selected
	const historyIndex = new Map(history.map((vid, i) => [vid, i]))
	const indexOf = vid => historyIndex.get(vid) ?? -1
	scores.sort((a,b) => indexOf(b[0]) - indexOf(a[0]))
	scores[0][1] /= 2

	// Pick the vid with the lowest score, if same score, the last from history
	scores.sort((a,b) => (a[1] - b[1]) || (indexOf(b[0]) - indexOf(a[0])))
	return scores[0][0]
}
