# Nlaylist: Youtube video player and ranking

Display videos in a chain, asking everytime witch one of the last 2 was preferred, and make a ranking with given inputs.

## Features

### Save & Load to file

TODO: describe this part

### Scoring: ELO with uncertainty

Inspired by ELO and Glicko-1, every video has three values, updated after each vote:

- **Score**: ELO score (0 for new videos). Scores are recentered when the page is loaded (average score of compared videos set back to 0)
- **Uncertainty**: Tracks how far the real score may be from the computed one (standard deviation of the score)
- **Surprise**: how much recent votes contradicted the predictions

On every comparison, these 3 scores are updated, depending on the values of the two videos being compared.

After every vote, uncertainty goes down, stabilizing the scores (the higher the certainty, the lower the score will change).

Before every vote, a prediction is made ("Chance"), according to scores, of what will be the video selected by the user.
If the prediction was wrong, 'surprise' will increase, and may make uncertainty go up again

### Next video selection

The next video is picked from the playable videos, except the last half from the history (recently played videos are never an option), using one of these modes, chosen by the user:

- **Any** (default): For every next video to pick, will follow one of the following modes, drawn at random (same probability)
- **Random**: Pure random, all videos have the same chance to be selected
- **Top**: Picks one of the best videos (takes the very best candidate, and find all other candidates having similar scores (according to uncertainty). Will select one of these at random, as the next video)
- **Similar**: Picks video with a similar score than the last one played (Every candidate is given a weight according to the overlaps of their scores with the right video, considering the score and margin of error. If none overlaps, will retry with margins doubled, and if still no match, will pick one with the closest score ignoring the margins). Useful to refine the ranking
- **Weighted**: Picks video at random, with more chance to pick high scored ones rather than others. The oldest video in history (the one that was played the longest time ago) is given a chance boost

### Autoskip unplayable videos

TODO: describe this part

### Merge & Delete

TODO: describe this part

### Keep track of played history

Everytime a video is played, is added back to an 'history' stack.

First half of history stack will not be picked when switching to next video, to prevent repeat the same videos over and over.

Save file is ordered by the last time a video was played, so that next time file is loaded, history can be recovered

Note: No date are stored, only the order of video played

### Combo mode

When multiple votes on the same side, infer the vote between current right video, and previous left videos

When vote on the same side as previous pair, continue combo\
When vote on the opposite side as previous pair, reset combo\
When skip without note or =, reset combo\
When delete or merge, keep current combo

Example:
- A vs B, B wins => register B > A
- B vs C, C wins => register C > B and also C > A
- C vs D, D wins => register D > C, D > B, D > A
- D vs E, D wins => reset combo and register D > E only

### Save loaded data in browser cache

Data is stored in local storage to be persistent from session to session.

Save & Load to file are still available and recommended

### Ranking table: pages, sort modes and search

All listed videos, using pagination, in one of two modes:

- **Top**: videos ordered by ranking (best with high confidence first, low confidence near the middle, worst with high confidence last)
- **History**: last picked videos first (the preloaded next video, then the right and left videos, then the following in order of last time played)

Search field :
- Filters the list finding only videos matching the search input
- Every word separated by spaces must be found in the title, in any order, anywhere (as if it started and ended with `*`)
- Wildcards : `?` = any character, `*` = any character**s**, `_`: a space or an underscore (separating words by spaces will look for them in any order; using `_` will force that as a unique 'word' that contains a space)
- Pasting a video ID or url will also look for it in the list

### Ranking table: display green & red arrows on rank change

Display green or red arrow next to video score, showing how its score changed since last time the video was picked to be displayed

### Ranking table: remove a video

Hovering the arrow cell of a video shows a trash button, removing the video from the list.
A confirmation is asked, except for videos with low score and low score margin of error.

## TODO list

### Tab icon & title

- Use proper HTML meta data
- add link to https://NatNgs.github.io menu
- improve background color (that gray is aweful) and menu buttons style

### Import youtube playlists

Work to be done
