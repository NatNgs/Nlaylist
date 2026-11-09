# Nlaylist: Youtube video player and ranking

Displays videos in a chain, asking every time which one of the last 2 was preferred, and makes a ranking from the given inputs.

## Features

### Scoring: ELO with uncertainty

Inspired by ELO and Glicko-1, every video has three values, updated after each vote:

- **Score**: ELO score (0 for new videos). Scores are recentered when the page is loaded (average score of compared videos set back to 0)
- **Uncertainty**: Tracks how far the real score may be from the computed one (standard deviation of the score)
- **Surprise**: how much recent votes contradicted the predictions

On every comparison, these 3 scores are updated, depending on the values of the two videos being compared.

After every vote, uncertainty goes down, stabilizing the scores (the higher the certainty, the less the score will change).

Before every vote, a prediction is made ("Chance"), according to scores, of which video the user will select.
If the prediction was wrong, 'surprise' will increase, and may make uncertainty go up again

### Next video selection

The next video is picked from the playable videos, except the last half from the history (recently played videos are never an option), using one of these modes, chosen by the user:

- **Any** (default): For every next video to pick, follows one of the following modes, drawn at random (same probability)
- **Random**: Pure random, all videos have the same chance to be selected
- **Top**: Picks one of the best videos (takes the very best candidate, and finds all other candidates having similar scores (according to uncertainty). Selects one of these at random, as the next video)
- **Similar**: Picks a video with a score similar to the last one played (Every candidate is given a weight according to the overlaps of their scores with the right video, considering the score and margin of error. If none overlaps, will retry with margins doubled, and if still no match, will pick one with the closest score ignoring the margins). Useful to refine the ranking
- **Weighted**: Picks a video at random, with more chance to pick high-scored ones rather than others. The oldest video in history (the one that was played the longest time ago) is given a chance boost

### Autoskip unplayable videos

When a video fails to load, whatever the reason is (video deleted, not available in your region, not available to be watched outside YouTube, or loading timeout), the video is automatically skipped, and marked as "Unplayable" (for the current session only, to avoid retrying the same one over and over). A notification is sent to the user, and another video is loaded instead.

### Merge & Delete

The user can choose to remove any video from the leaderboard, or one of the two being played. Removed videos are entirely deleted from the list and from the save, along with their score.

A button also allows the user to "Merge" videos if they are the same (for example, a song may have several different YouTube videos, and the user may have imported several versions of it by mistake). Merging removes one of the two, and merges the score of the removed one into the one that was kept.

### Save & Load to file

Nlaylist stores the session using the browser local storage.

Buttons allow exporting the state to a TSV file, and loading a previous session from a TSV file.
Loading a TSV file does not clear the current session: it appends the data to the current session (helpful to merge multiple sessions into a single one, for example).

### Keep track of played history

Every time a video is played, it is added back to a 'history' stack.

The first half of the history stack is not picked when switching to the next video, to avoid repeating the same videos over and over.

The save file is ordered by the last time each video was played, so that the history can be recovered the next time the file is loaded

Note: no dates are stored, only the order in which videos were played

### Combo mode

When several votes in a row are on the same side, the votes between the current right video and the previous left videos are inferred

When vote on the same side as previous pair, continue combo\
When vote on the opposite side as previous pair, reset combo\
When skip without vote or =, reset combo\
When delete or merge, keep current combo

Example:
- A vs B, B wins => register B > A
- B vs C, C wins => register C > B and also C > A
- C vs D, D wins => register D > C, D > B, D > A
- D vs E, D wins => reset combo and register D > E only

### Ranking table: pages, sort modes and search

All listed videos, using pagination, in one of two modes:

- **Top**: videos ordered by ranking (best with high confidence first, low confidence near the middle, worst with high confidence last)
- **History**: last picked videos first (the preloaded next video, then the right and left videos, then the following in order of last time played)

Search field:
- Filters the list, keeping only the videos matching the search input
- Every word separated by spaces must be found in the title, in any order, anywhere (as if it started and ended with `*`)
- Wildcards: `?` = any character, `*` = any character**s**, `_`: a space or an underscore (separating words by spaces will look for them in any order; using `_` will force that as a unique 'word' that contains a space)
- Pasting a video ID or URL will also look for it in the list

### Ranking table: display green & red arrows on rank change

Displays a green or red arrow next to the video score, showing how its score changed since the last time the video was picked to be displayed
