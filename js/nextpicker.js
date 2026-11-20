NEXT_PICKERS = {
	'meta': meta_random,
	'pure_random': pure_random,
	'weighted_random': weighted_random,
	'top_scores': top_scores,
	'similar_scores': similar_scores,
	'stop': () => null, // Debug only (option hidden in the page): no video picked, the playlist stops
}

// // // META // // //

// Modes drawn at random by 'meta' (neither 'meta' itself nor the debug mode 'stop')
const META_PICKERS = [pure_random, weighted_random, top_scores, similar_scores]

function meta_random(vids, vdata, history) {
	// Pick a random algorithm to pick the video to watch
	const picker = META_PICKERS[(Math.random() * META_PICKERS.length)|0]
	return picker(vids, vdata, history)
}

// // // RANDOM // // //

function pure_random(vids) {
	// Pick a random vid from vids
	const rand = (Math.random() * vids.length)|0
	return vids[rand]
}

// // // WEIGHTED // // //

function weighted_random(vids, vdata, history) {
	// Weight 1 : Video score (as displayed); normalized such as maximum is size(candidates) and minimum is 1
	const w1 = normalize_list(vids.map(vid => SCORING.points(vdata[vid])), 1, vids.length)

	// Weight 2 : Video margin (as displayed); normalized such as max is size(candidates) and minimum is 1
	const w2 = normalize_list(vids.map(vid => SCORING.pointsMargin(vdata[vid])), 1, vids.length)

	// Weight 3 : Rank in history; most recently played is 1; least recently played is size(candidates); others are between, by order of history
	const w3 = normalize_list(vids.map(v => history.length - history.indexOf(v)), 1, vids.length) // last played is history.indexOf(v) := 0 ; histo.len - index => reverse the order

	// Combining the weights, applying square to increase the differences of chances
	const weights = vids.map((_,i) => (w1[i]+w2[i]+w3[i])**2)

	return weightedPick(vids, weights)
}
function normalize_list(list, min, max) {
	let l_min = list[0]
	let l_max = list[0]
	for(const v of list) {
		if(v < l_min) l_min = v
		else if(v > l_max) l_max = v
	}
	if(l_min === l_max) { // all elements in list have the same score
		const avg = (min+max)/2
		return list.map(_=>avg)
	}
	const mm = (l_max-l_min)/(max-min)
	return list.map(s => (s-l_min)/mm + min)
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

// // // TOP // // //

// Takes the best scored vid, and all vids whose score range overlaps it, then picks one of them at random
function top_scores(vids, vdata) {
	const displayed = vids.map(vid => SCORING.displayed(vdata[vid]))
	const best = displayed.reduce((a, b) => b.points > a.points ? b : a)
	const weights = overlapWeights(displayed, best)
	return pure_random(vids.filter((vid, i) => displayed[i] === best || weights[i] > 0))
}
// Computes the overlap of two scores+/-margin ranges with the given ref
function overlapWeights(displayed, ref, margin_mult=1) {
	return displayed.map(({points, margin}) => margin_mult * (ref.margin + margin) - Math.abs(points - ref.points))
}

// // // SIMILAR // // //

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
