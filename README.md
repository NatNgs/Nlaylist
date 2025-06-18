# Nlaylist: Youtube video player and ranking

Display videos in a chain, asking everytime witch one of the last 2 was preferred, and make a ranking with given inputs.

## Features

### Save & Load to file

TODO: describe this part

### ELO scoring

TODO: describe this part

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

## TODO list

### Tab icon & title

- Use proper HTML meta data
- add link to https://NatNgs.github.io menu
- improve background color (that gray is aweful) and menu buttons style
  
### Rebalance score sum
After loaded a bunch of items (after the whole group only), compute the sum of all scores.

Sum should be exactly 0. If not, split the remaining and add that to every item such as sum become 0

Split the remaining with weight depending on `scoreToProba(current, 0)`, so that high scores pay a bit more

### Get channel names

Currently, app is able to get video titles and to show them, but no solution is found yet to get video channels names.

### Import youtube playlists

To be worked

### Save loaded data in browser cache

Make file load & save optional

### Ranking table: display green & red arrows on rank change

And make rows move with slow animation when score updates (instead or redraw all board), for a dynamic ranking effect

\+ highlight current left & right video; and maybe also previous 1 or 2 played ones to easily find them\
Reduce size of elements far away in the history (?)

### Scroll down improvement

Add a slow moving animation, maybe red slanted bar below the video currently playing

Then fix current playing marker and buttons to the page:
  - scrolling should hide only video players, Merge & Delete buttons
  - header, play indicator, left, =, next and right buttons should always be visible, even when scrolled a lot down to see the ranking
