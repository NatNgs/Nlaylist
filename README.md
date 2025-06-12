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

## TODO list

### Tab icon & title

- Use proper HTML meta data
- add link to https://NatNgs.github.io menu
- improve CSS (that gray is aweful, and not even talking about the ranking list)

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
  
### Rebalance score sum
After loaded a bunch of items (after the whole group only), compute the sum of all scores.

Sum should be exactly 0. If not, split the remaining and add that to every item such as sum become 0

Split the remaining with weight depending on `scoreToProba(current, 0)`, so that high scores pay a bit more

### Get channel names

Currently, app is able to get video titles and to show them, but no solution is found yet to get video channels names.

### Improve begining experience

Current works depends a lot on having already a somewhat long list of videos loaded

Few warnings or IDK may be good to be implemented for before the list is long enough to play

### Import youtube playlists

To be worked
