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

### Weighted random next video selection

TODO: describe this part

### Autoskip unplayable videos

TODO: describe this part

### Merge & Delete

TODO: describe this part

### Keep track of played history

Everytime a video is played, is added back to an 'history' stack.

First half of history stack will not be picked when switching to next video, to prevent repeat the same videos over and over.

Also, selection will give more chance to the last video of the history to be picked (weight + 1)

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

### Ranking table: display green & red arrows on rank change

Display green or red arrow next to video score, showing how its score changed since last time the video was picked to be displayed

### Ranking table: remove a video

Hovering the arrow cell of a video shows a trash button, removing the video from the list.
A confirmation is asked, except for videos noted ♭ (low score, even at the top of their margin).
A video loaded in a player is replaced by another one

## TODO list

### Tab icon & title

- Use proper HTML meta data
- add link to https://NatNgs.github.io menu
- improve background color (that gray is aweful) and menu buttons style

### Import youtube playlists

Work to be done

### Scroll down improvement

Add a slow moving animation, maybe red slanted bar below the video currently playing

Then fix current playing marker and buttons to the page:
  - scrolling should hide only video players, Merge & Delete buttons
  - header, play indicator, left, =, next and right buttons should always be visible, even when scrolled a lot down to see the ranking
