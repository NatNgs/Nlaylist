# Nlaylist: Youtube video player and ranking

Display videos in a chain, asking everytime witch one of the last 2 was preferred, and make a ranking with given inputs.


## TODO list

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

### Longer history

Keep not only the last video played to prevent replaying them too early, but keep last time every video was played.

Then, give a boost to the video that hasn't been played for the longest
