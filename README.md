# sb3.js

**sb3.js** is a lightweight Scratch runtime implemented using generator functions.

It should currently be able to run many projects. All core blocks, as well as the pen extension, are implemented. Projects using the music extension or other extensions will not run.

sb3.js is much lighter than scratch-vm (~65kB vs ~320kB for the JS, and 470kB vs 1.2MB if you include fonts), and designed to be easy to embed--the project player is exposed as an HTML custom element. It runs at about the same speed as scratch-vm in V8, but slower in SpiderMonkey as the latter doesn't optimize generator functions.

For an example of embedding sb3.js, see [the demo page's source code](https://github.com/valadaptive/sb3-js/blob/main/demo.html).

[Try out the demo!](https://valadaptive.github.io/sb3-js/demo.html)
