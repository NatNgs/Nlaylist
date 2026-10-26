/**
 * Score System: ELO with uncertainty (Glicko-1 applied vote by vote) and 'surprise' indicator
 * - score : ELO score, centered around 0 (instead of 1500 for Chess for example)
 * - uncertainty: value describing the standard deviation of the score (where the "real" score is to the current calculated score). Value set to UNCERTAINTY_MAX for a new element
 * - surprise: describes by how much future comparisons follows the predictions. Value is 1 when predictions are right
 */
const ELO_BASE = 400
const GLICKO_Q = Math.LN10 / ELO_BASE
const UNCERTAINTY_MAX = 350 // Never compared video
const UNCERTAINTY_MIN = 50
const UNCERTAINTY_LEGACY = 150 // Compared video loaded without uncertainty (previous versions)
const UNCERTAINTY_SURPRISED_MAX = 250 // Uncertainty raised by surprises stays below UNCERTAINTY_MAX (never compared)
const VOTE_WEIGHT_SURE = 1 // "<<<" and ">>>" votes (user is certain about these)
const VOTE_WEIGHT_UNSURE = 0.5 // "<", ">" and "=" votes (entries are similar or difficult to compare)
const COMBO_WEIGHT_DECAY = 0.9 // By how much reduce the certainty of each vote inferred by combo
const SURPRISE_MEMORY = 0.8 // Weight of the previous surprise in the moving average (~5 last votes)
const SURPRISE_VOTE_MAX = 9
const SURPRISE_THRESHOLD = 1.5 // If surprise goes above this, uncertainty will rise
const SURPRISE_UNCERTAINTY = 50 // Uncertainty added (quadratically) per surprise unit above 1
const SPREAD_MIN = 100 // Minimal typical spread of scores, used to sort the ranking while few votes are known

function scoreToProba(eloA, eloB) {
	return 1 / (1 + Math.pow(10, (eloB - eloA) / ELO_BASE))
}

// Glicko attenuation of a score difference
function glickoG(uncertainty) {
	return 1 / Math.sqrt(1 + 3 * (GLICKO_Q * uncertainty)**2 / Math.PI**2)
}

// Glicko update after a game of given weight. Returns the expected result
function glickoUpdate(data, opponent, result, weight) {
	const g = glickoG(opponent.uncertainty)
	const expected = scoreToProba(g * data.score, g * opponent.score)
	const variance = 1 / (1/data.uncertainty**2 + GLICKO_Q**2 * weight * g**2 * expected * (1 - expected))
	data.score += GLICKO_Q * variance * weight * g * (result - expected)
	data.uncertainty = Math.max(UNCERTAINTY_MIN, Math.sqrt(variance))
	return expected
}

// Update the surprise value after a direct vote, and raises uncertainty when surprise repeats
function surpriseUpdate(data, result, expected, weight) {
	const surprise = Math.min(SURPRISE_VOTE_MAX, (result - expected)**2 / Math.max(expected * (1 - expected), 1e-6))
	const alpha = (1 - SURPRISE_MEMORY) * weight
	data.surprise = (1 - alpha) * data.surprise + alpha * surprise
	if(data.surprise > SURPRISE_THRESHOLD) {
		const raised = Math.sqrt(data.uncertainty**2 + SURPRISE_UNCERTAINTY**2 * (data.surprise - 1))
		data.uncertainty = Math.max(data.uncertainty, Math.min(UNCERTAINTY_SURPRISED_MAX, raised))
	}
}

const SCORING = {
	// Score data of a new video. Uncertainty not given: not compared if score is 0
	newScore(score=0, uncertainty=null, surprise=1) {
		const data = {score: score, lastScore: score, uncertainty: uncertainty, surprise: surprise}
		this.repair(data)
		return data
	},

	// Fix invalid or missing score data, and backward compatibility
	repair(data) {
		if(!Number.isFinite(data.score)) data.score = 0
		if(!Number.isFinite(data.lastScore)) data.lastScore = data.score
		if(!Number.isFinite(data.uncertainty)) data.uncertainty = data.score === 0 ? UNCERTAINTY_MAX : UNCERTAINTY_LEGACY
		data.uncertainty = Math.min(UNCERTAINTY_MAX, Math.max(UNCERTAINTY_MIN, data.uncertainty))
		if(!Number.isFinite(data.surprise) || data.surprise < 0) data.surprise = 1
	},

	isCompared(data) {
		return data.uncertainty < UNCERTAINTY_MAX
	},

	// Probability for video a to be preferred to video b (0.5 when scores are uncertain)
	proba(a, b) {
		const g = glickoG(Math.sqrt(a.uncertainty**2 + b.uncertainty**2))
		return scoreToProba(g * a.score, g * b.score)
	},

	// Displayed points: chance to be preferred to a video of average score
	points(data) {
		return 100*scoreToProba(data.score, 0)
	},

	// Uncertainty of the displayed points: half of the points range covered by score +/- uncertainty
	pointsMargin(data) {
		return 50*(scoreToProba(data.score + data.uncertainty, 0) - scoreToProba(data.score - data.uncertainty, 0))
	},

	// Score evolution since the video was last picked, in %
	evolution(data) {
		return 200*scoreToProba(data.score, data.lastScore) - 100
	},

	// Score description (HTML): points rounded, followed by their margin rounded up
	describe(data, unit='') {
		return `${Math.round(this.points(data))}${unit} <span class="margin">± ${Math.ceil(this.pointsMargin(data))}</span>`
	},

	// Typical spread of scores: dispersion of compared videos scores, weighted by their certainty (1/uncertainty²)
	scoreSpread(datas) {
		const compared = datas.filter(data => this.isCompared(data))
		const weight = compared.reduce((sum, data) => sum + 1/data.uncertainty**2, 0)
		if(!weight) return SPREAD_MIN
		const mean = compared.reduce((sum, data) => sum + data.score/data.uncertainty**2, 0) / weight
		const variance = compared.reduce((sum, data) => sum + (data.score - mean)**2/data.uncertainty**2, 0) / weight
		return Math.max(SPREAD_MIN, Math.sqrt(variance))
	},

	// Value to sort the ranking: score brought back toward the average (0) depending on its uncertainty, so that an uncertain video stays near the middle
	rankValue(data, spread) {
		return data.score * spread**2 / (spread**2 + data.uncertainty**2)
	},

	/**
	 * Update scores after vote
	 * - opponents: direct opponent first, then videos inferred by combo (from the most recent to the oldest)
	 * - vote: -2 to 2, positive if b is preferred
	 */
	applyVote(b, opponents, vote) {
		const result = vote > 0 ? 1 : vote < 0 ? 0 : 0.5 // Result of b
		const weight = Math.abs(vote) === 2 ? VOTE_WEIGHT_SURE : VOTE_WEIGHT_UNSURE
		const before = {score: b.score, uncertainty: b.uncertainty}

		// Glicko: b plays a game against each opponent (all at once), each opponent plays a single game against b
		let information = 0
		let improvement = 0
		let expectedB = 0
		let expectedA = 0
		opponents.forEach((a, i) => {
			const w = weight * COMBO_WEIGHT_DECAY**i
			const g = glickoG(a.uncertainty)
			const expected = scoreToProba(g * before.score, g * a.score)
			information += w * g**2 * expected * (1 - expected)
			improvement += w * g * (result - expected)
			const expectedOpponent = glickoUpdate(a, before, 1 - result, w)
			if(i === 0) {
				expectedB = expected
				expectedA = expectedOpponent
			}
		})
		const variance = 1 / (1/b.uncertainty**2 + GLICKO_Q**2 * information)
		b.score += GLICKO_Q * variance * improvement
		b.uncertainty = Math.max(UNCERTAINTY_MIN, Math.sqrt(variance))

		// Surprise
		surpriseUpdate(b, result, expectedB, weight)
		surpriseUpdate(opponents[0], 1 - result, expectedA, weight)
	},

	// Merge score of removed video into target video
	merge(target, removed) {
		target.score += removed.score
		if(this.isCompared(removed)) {
			target.uncertainty = this.isCompared(target)
				? Math.max(UNCERTAINTY_MIN, 1 / Math.sqrt(1/target.uncertainty**2 + 1/removed.uncertainty**2))
				: removed.uncertainty
		}
	},

	// Average score of compared videos
	averageScore(datas) {
		const compared = datas.filter(data => this.isCompared(data))
		return compared.length ? compared.reduce((sum, data) => sum + data.score, 0) / compared.length : 0
	},

	// Shift scores so that the average of compared videos is 0 (Glicko updates are not zero-sum)
	recenter(datas) {
		const offset = this.averageScore(datas)
		for(const data of datas) {
			if(this.isCompared(data)) {
				data.score -= offset
				data.lastScore -= offset
			}
		}
	},

	// Score data from the score column of a file without header (legacy format)
	fromLegacyTSV(text) {
		return this.newScore(Number.parseInt(text || 0)) // Invalid score: repaired as never compared
	},

	// Score data from the score columns of a file (format v2): score, uncertainty, surprise
	fromTSV(columns) {
		const [score, uncertainty, surprise] = [0, 1, 2].map(i => Number.parseFloat(columns[i]))
		// No uncertainty (file saved by a previous version): never compared if no score
		return this.newScore(score, Number.isFinite(uncertainty) || Number.isFinite(score) ? uncertainty : UNCERTAINTY_MAX, surprise)
	},

	// Score columns of a file (format v2), scores shifted by offset. Never compared video has no score columns
	toTSV(data, offset) {
		if(!this.isCompared(data)) return []
		return [Math.round(data.score - offset), Math.round(data.uncertainty), Math.round(data.surprise*100)/100]
	},
}
