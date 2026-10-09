// CPU opponent. It only ever "presses" the same single button a human would.
(function (root) {
  'use strict';
  const BR = root.BR || (typeof require !== 'undefined' ? require('./sim.js') : null);

  function Cpu(team, opts) {
    opts = opts || {};
    this.team = team;
    this.press = false;
    this.nextThink = 0;
    this.mistake = opts.mistake != null ? opts.mistake : 0.1;
    this.reaction = opts.reaction != null ? opts.reaction : 5;
  }

  Cpu.prototype.update = function (sim) {
    if (sim !== this.sim) { this.sim = sim; this.nextThink = 0; this.press = false; } // new round
    if (sim.t < this.nextThink) return this.press;
    this.nextThink = sim.t + this.reaction + Math.floor(Math.random() * 6);
    let want = this.decide(sim);
    const carrying = sim.ball.holder && sim.ball.holder.team === this.team;
    if (Math.random() < (carrying ? this.mistake * 0.4 : this.mistake)) want = !want;
    this.press = want;
    return want;
  };

  Cpu.prototype.decide = function (sim) {
    const team = this.team;
    const me = sim.players.filter((p) => p.team === team);
    const B = sim.ball, b = B.body;
    const attack = sim.hoops[team === 0 ? 1 : 0];
    const defend = sim.hoops[team === 0 ? 0 : 1];
    const lean = (p) => Math.sin(BR.wrap(p.torso.angle));
    const airborne = (p) => !p.onFeet && !p.lying;

    // Holding the button carries the ball; letting go throws it.
    if (B.holder && B.holder.team === team) {
      const p = B.holder;
      const dx = attack.rimMid - p.torso.position.x, d = Math.abs(dx);
      const hand = sim.handPos(p);
      if (airborne(p)) {
        if (!this.press) return false;
        // Close and above the rim: hang on and carry it through for a dunk.
        if (d < 60 && hand.y < BR.RIM_Y) return true;
        // Shoot near the top of the jump when in range (with some sloppiness).
        const apex = p.torso.velocity.y > -1.5 - Math.random() * 2;
        if (apex && (d < 430 || B.holdT > 50)) return false;
        return true;
      }
      if (p.lying) return true;
      if (this.press) return true; // already holding: keep hopping toward the hoop
      const l = lean(p);
      if (Math.sign(l) === Math.sign(dx) && Math.abs(l) > 0.05) return true;
      return B.holdT > 90 && Math.random() < 0.3;
    }

    // Chase the ball (or the opponent holding it).
    const T = 16;
    let bx = b.position.x, by = b.position.y;
    if (!B.holder) {
      bx += b.velocity.x * T;
      by = Math.min(by + b.velocity.y * T + 0.5 * sim.gStep * T * T, BR.GROUND_Y - B.r);
    }
    let best = null, bd = 1e9;
    for (const p of me) {
      const dd = Math.abs(bx - p.torso.position.x) + (p.lying ? 200 : 0);
      if (dd < bd) { bd = dd; best = p; }
    }
    if (!best) return false;
    if (best.lying) return true;
    const p = best;
    const dx = bx - p.torso.position.x;
    if (airborne(p)) {
      const hand = sim.handPos(p);
      return Math.hypot(hand.x - b.position.x, hand.y - b.position.y) < 140;
    }
    // Ball overhead or close -> jump to grab / block.
    const opponentNearOurHoop = B.holder && Math.abs(B.holder.torso.position.x - defend.rimMid) < 260;
    if (Math.abs(dx) < 85 && by < BR.GROUND_Y - 50) return true;
    if (Math.abs(dx) < 35) return false; // ball at our feet: let the arms scoop it
    if (opponentNearOurHoop && Math.abs(dx) < 140) return true;
    const l = lean(p);
    return Math.sign(l) === Math.sign(dx) && Math.abs(l) > 0.1;
  };

  root.BR = Object.assign(root.BR || {}, { Cpu });
  if (typeof module !== 'undefined') module.exports = { Cpu };
})(typeof window !== 'undefined' ? window : globalThis);
