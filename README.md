# diffony

diffony turns a code repository's history into music. Every commit plays on a
beat grid where one day is one beat, in a fixed key over a looping chord
progression, with an instrument for each area of the code. Bass and drums come
in when the project gets busy, and quiet stretches thin out.

It follows the method of NASA Chandra's
[A Universe of Sound](https://chandra.si.edu/sound/): a line sweeps across a
chart of the data, and whatever it crosses becomes a note. A "Raw data" toggle
plays the plain mapping without the arrangement.

> [!IMPORTANT]
> **Experimental.** Its first showcase is the history, test runs and command
> timings of [Zinn](https://github.com/yethranayeh/zinn).

## Try it

With [Bun](https://bun.sh):

```sh
bun run build
open dist/zinn.html
```
