// Headless CPU-vs-CPU run to sanity check and tune the physics.
// Usage: node tools/simtest.js [minutes]   (needs `npm i matter-js@0.19.0`)
globalThis.Matter = require('matter-js');
require('../js/sim.js');
require('../js/ai.js');
const BR = globalThis.BR;

const minutes = Number(process.argv[2] || 10);
const steps = minutes * 60 * 60;
let mods = BR.makeMods(0), round = 0;
let sim = new BR.Sim(mods, { round });
const cpus = [new BR.Cpu(0), new BR.Cpu(1)];
const score = [0, 0];
const stats = { jumps: 0, catches: 0, throws: 0, steals: 0, dunks: 0, lyingSteps: 0, playerSteps: 0, roundLens: [], maxBallSpeed: 0 };
let roundStart = 0, scoredAt = -1;
for (let i = 0; i < steps; i++) {
  sim.step([cpus[0].update(sim), cpus[1].update(sim)]);
  for (const e of sim.events) {
    if (e.type === 'jump') stats.jumps++;
    if (e.type === 'catch') stats.catches++;
    if (e.type === 'throw') stats.throws++;
    if (e.type === 'steal') stats.steals++;
    if (e.type === 'score' && e.dunk) stats.dunks++;
  }
  sim.events.length = 0;
  for (const p of sim.players) { stats.playerSteps++; if (p.lying) stats.lyingSteps++; }
  const b = sim.ball.body;
  stats.maxBallSpeed = Math.max(stats.maxBallSpeed, Math.hypot(b.velocity.x, b.velocity.y));
  if (sim.scored && scoredAt < 0) { scoredAt = i; }
  const timeout = i - roundStart > 60 * 90;
  if ((scoredAt >= 0 && i - scoredAt > 60) || timeout) {
    if (sim.scored) score[sim.scored.team] += mods.double ? 2 : 1;
    stats.roundLens.push(((i - roundStart) / 60).toFixed(1) + (timeout ? 'T' : '') + ':' + mods.labels.join('/'));
    round++;
    mods = BR.makeMods(round, mods.court);
    sim = new BR.Sim(mods, { round });
    roundStart = i; scoredAt = -1;
  }
}
console.log('score', score, 'rounds', stats.roundLens.length);
console.log(stats.roundLens.join('  '));
console.log({ jumps: stats.jumps, catches: stats.catches, throws: stats.throws, steals: stats.steals, dunks: stats.dunks,
  lyingPct: (100 * stats.lyingSteps / stats.playerSteps).toFixed(1), maxBallSpeed: stats.maxBallSpeed.toFixed(1) });
