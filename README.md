# Basket Rando

A floppy, physics-driven, one-button 2v2 basketball game for the browser, inspired by the
mechanics of *Basket Random*. All art, sounds and code are original: the pixel art is drawn
procedurally on a canvas and the sounds are synthesized with WebAudio.

**Play:** open `index.html` in any modern browser. There's no build step and no server needed.
Matter.js is vendored in `js/`.

## Controls

| Team | Key | Touch |
|------|-----|-------|
| Red (left) | `W` | left half of the screen |
| Blue (right) | `↑` Up arrow | right half of the screen |

- **1P** puts you on Red against the CPU. `W`, `↑` and `Space` all work.
- **2P** is two humans sharing one keyboard.
- `P` pauses, `M` mutes, `Esc` goes back to the menu.

Pressing the button makes **both** players on your team jump and raise their arms. Releasing
it drops the arms. Players constantly rock back and forth, so *when* you press decides which
way they leap.

- **Catch:** touch the ball with a hand or arm and it sticks.
- **Throw:** while holding the ball, press again. The arm swings up and the ball flies off
  with the hand's real velocity, so aim comes from timing, lean and momentum.
- **Dunk:** carry the ball over the rim with your arm up, then release so the arm slams down.
- **Steal:** opponents can rip the ball away with a reaching hand or knock it loose with a body hit.

First team to **5** wins. After every basket the court changes (street, gym, snow, beach,
rooftop at night) and random modifiers kick in: long/short arms, tall/short players,
big/tiny/heavy/light/bouncy/beach balls, low gravity, super jump, bouncy players, wobbly legs
and slippery floors. Some rounds are worth double points.

## Code layout

- `js/sim.js`: Matter.js simulation (ragdoll players, arm servos, catching/throwing, hoops, scoring, round modifiers). It has no DOM dependency.
- `js/ai.js`: the CPU opponent. It only presses the same single button a human would.
- `js/render.js`: pixel-art renderer (backgrounds, players, ball, hoops, HUD).
- `js/font.js`: 5x7 bitmap font.
- `js/audio.js`: synthesized sound effects.
- `js/main.js`: game states, input and the fixed-timestep loop.
- `tools/simtest.js`: headless CPU-vs-CPU run for tuning (`npm i matter-js@0.19.0 && node tools/simtest.js 10`).
