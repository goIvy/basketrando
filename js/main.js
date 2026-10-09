// Game states, input, main loop.
(function () {
  'use strict';
  const BR = window.BR, R = window.Render, F = window.PixelFont, Sfx = window.Sfx;
  const BW = R.BW, BH = R.BH, S = R.S;
  const WIN_SCORE = 5;

  const canvas = document.getElementById('game');
  canvas.width = BW; canvas.height = BH;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const STEP = 1000 / 60;
  let acc = 0, lastT = performance.now();
  const bgCache = {};
  const bg = (court) => bgCache[court] || (bgCache[court] = R.makeBackground(court));

  const keys = { w: false, up: false, space: false };
  const touchTeams = [false, false];
  const mouse = { x: -1, y: -1 };
  let state = 'splash';
  let mode = 1;
  let match = null, demo = null, paused = false;
  let frame = 0;
  let particles = [];
  const flakes = Array.from({ length: 70 }, () => ({ x: Math.random() * BW, y: Math.random() * BH, v: 0.2 + Math.random() * 0.5, d: Math.random() * 6 }));

  // ---------- Match flow ----------
  function newMatch(m) {
    mode = m;
    match = { score: [0, 0], round: 0, mods: null, sim: null, phase: 'live', timer: 0, intro: 0, cpu: null, winner: -1, overT: 0, last: null };
    paused = false;
    particles = [];
    startRound();
    state = 'play';
  }

  function startRound() {
    const prev = match.mods ? match.mods.court : null;
    match.mods = BR.makeMods(match.round, prev);
    match.sim = new BR.Sim(match.mods, { round: match.round });
    match.cpu = mode === 1 ? new BR.Cpu(1) : null;
    match.phase = 'live';
    match.timer = 0;
    match.intro = 130;
  }

  function newDemo() {
    const round = demo ? demo.round + 1 : 0;
    const mods = BR.makeMods(round, demo && demo.mods.court);
    demo = { round, mods, sim: new BR.Sim(mods, { round }), cpus: [new BR.Cpu(0, { mistake: 0.15 }), new BR.Cpu(1, { mistake: 0.15 })], t: 0, scoredT: -1 };
  }

  function teamInput(team) {
    if (mode === 1) {
      if (team === 1) return match.cpu.update(match.sim);
      return keys.w || keys.up || keys.space || touchTeams[0] || touchTeams[1];
    }
    return team === 0 ? keys.w || touchTeams[0] : keys.up || touchTeams[1];
  }

  function handleEvents(sim, audible) {
    for (const e of sim.events) {
      if (!audible) continue;
      switch (e.type) {
        case 'jump': Sfx.jump(e.team); break;
        case 'bounce': Sfx.bounce(e.v); break;
        case 'rim': Sfx.rim(e.v); break;
        case 'hit': Sfx.hit(); break;
        case 'land': Sfx.land(); break;
        case 'catch': Sfx.catch(); break;
        case 'throw': Sfx.throw(); break;
        case 'steal': Sfx.steal(); break;
        case 'score': Sfx.score(); break;
      }
      if (e.type === 'score') burst(sim);
    }
    sim.events.length = 0;
  }

  function burst(sim) {
    const side = sim.scored ? sim.scored.side : 0;
    const x = sim.hoops[side].rimMid * S, y = BR.RIM_Y * S;
    const cols = ['#ffd23f', '#ffffff', '#ee7426', '#5be6f7', '#d8f54a'];
    for (let i = 0; i < 40; i++) {
      particles.push({ x, y, vx: (Math.random() - 0.5) * 4, vy: -Math.random() * 4 - 1, c: cols[i % cols.length], life: 60 + Math.random() * 40 });
    }
  }

  // ---------- Render interpolation ----------
  // Physics runs at a fixed 60 Hz; drawing blends between the last two physics states
  // so motion stays smooth on any refresh rate.
  const bodiesOf = (sim) => sim.players.flatMap((p) => [p.torso, p.arm]).concat(sim.ball.body);
  function snapshot(sim) {
    sim._prev = bodiesOf(sim).map((b) => ({ b, x: b.position.x, y: b.position.y, a: b.angle }));
  }
  function withInterpolation(sim, alpha, fn) {
    if (!sim._prev) return fn();
    const saved = sim._prev.map((s) => {
      const b = s.b, cur = { x: b.position.x, y: b.position.y, a: b.angle };
      if (Math.hypot(cur.x - s.x, cur.y - s.y) < 60) {
        b.position.x = s.x + (cur.x - s.x) * alpha;
        b.position.y = s.y + (cur.y - s.y) * alpha;
        b.angle = s.a + (cur.a - s.a) * alpha;
      }
      return cur;
    });
    try { fn(); } finally {
      sim._prev.forEach((s, i) => { s.b.position.x = saved[i].x; s.b.position.y = saved[i].y; s.b.angle = saved[i].a; });
    }
  }

  function step() {
    frame++;
    for (const f of flakes) { f.y += f.v; f.x += Math.sin((frame + f.d * 40) / 40) * 0.2; if (f.y > BH) { f.y = -2; f.x = Math.random() * BW; } }
    particles = particles.filter((p) => { p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.vx *= 0.99; return --p.life > 0; });

    if (state === 'splash' || state === 'menu') {
      if (!demo) newDemo();
      const sim = demo.sim;
      snapshot(sim);
      sim.step([demo.cpus[0].update(sim), demo.cpus[1].update(sim)]);
      handleEvents(sim, false);
      demo.t++;
      if (sim.scored && demo.scoredT < 0) demo.scoredT = demo.t;
      if ((demo.scoredT >= 0 && demo.t - demo.scoredT > 90) || demo.t > 60 * 35) newDemo();
      return;
    }
    if (paused) return;
    const sim = match.sim;
    const inp = state === 'play' ? [teamInput(0), teamInput(1)] : [false, false];
    snapshot(sim);
    sim.step(inp);
    handleEvents(sim, true);
    if (match.intro > 0) match.intro--;
    if (match.phase === 'live' && sim.scored) {
      const pts = match.mods.double ? 2 : 1;
      match.score[sim.scored.team] = Math.min(WIN_SCORE, match.score[sim.scored.team] + pts);
      match.last = Object.assign({ pts }, sim.scored);
      match.phase = 'scored';
      match.timer = 0;
    }
    if (match.phase === 'scored' && state === 'play') {
      match.timer++;
      if (match.timer > 125) {
        if (match.score[0] >= WIN_SCORE || match.score[1] >= WIN_SCORE) {
          state = 'over';
          match.winner = match.score[0] >= WIN_SCORE ? 0 : 1;
          match.overT = 0;
          Sfx.win();
        } else {
          match.round++;
          startRound();
        }
      }
    }
    if (state === 'over') match.overT++;
  }

  // ---------- Drawing ----------
  const bannerCache = {};
  function bannerCanvas(text, cell, colors) {
    const key = text + cell;
    if (bannerCache[key]) return bannerCache[key];
    const c = document.createElement('canvas');
    c.width = F.measure(text, cell) + cell * 4 + 8;
    c.height = cell * 7 + cell * 4 + 8;
    const g = c.getContext('2d');
    F.draw(g, text, cell * 2 + 2, cell * 2 + 2, cell, (row) => colors[row], { outline: Math.max(2, cell / 2), shadow: cell / 2 + 2, shadowColor: 'rgba(0,0,0,0.5)' });
    return (bannerCache[key] = c);
  }

  function drawWorld(sim, mods, t) {
    ctx.drawImage(bg(mods.court), 0, 0);
    R.hoopBack(ctx, 0);
    R.hoopBack(ctx, 1);
    for (const p of sim.players) R.drawShadow(ctx, p.torso.position.x, p.torso.position.y + p.h / 2, 44);
    const b = sim.ball.body;
    R.drawShadow(ctx, b.position.x, b.position.y + sim.ball.r, sim.ball.r * 2.4);
    for (const p of sim.players) R.drawArm(ctx, p, true);
    for (const p of sim.players) R.drawBody(ctx, p);
    R.drawBall(ctx, sim.ball, mods.ball.style);
    for (const p of sim.players) R.drawArm(ctx, p, false);
    R.hoopFront(ctx, 0, sim.hoops[0].swish, t);
    R.hoopFront(ctx, 1, sim.hoops[1].swish, t);
    if (b.position.y + sim.ball.r < 0) {
      const x = Math.round(Math.max(6, Math.min(BW - 6, b.position.x * S)));
      ctx.fillStyle = '#000'; ctx.fillRect(x - 4, 2, 9, 7);
      ctx.fillStyle = '#ffd23f';
      for (let i = 0; i < 4; i++) ctx.fillRect(x - i, 3 + i, i * 2 + 1, 1);
    }
    if (mods.court === 'snow') { ctx.fillStyle = '#ffffff'; for (const f of flakes) ctx.fillRect(Math.round(f.x), Math.round(f.y), f.d > 4 ? 2 : 1, f.d > 4 ? 2 : 1); }
    for (const p of particles) { ctx.fillStyle = p.c; ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2); }
  }

  function blink(period) { return Math.floor(frame / period) % 2 === 0; }

  function drawSplash() {
    R.rect(ctx, '#111f2e', 0, 0, BW, BH);
    const letters = ['P', 'L', 'A', 'Y'], cols = ['#f5d44a', '#5be6f7', '#d8f54a', '#ef6a2e'];
    const cell = 4, w = F.measure('PLAY', cell);
    const x0 = Math.round((BW - w) / 2), y0 = 118;
    const hover = mouse.x > x0 - 6 && mouse.x < x0 + w + 6 && mouse.y > y0 - 6 && mouse.y < y0 + 34;
    R.rect(ctx, hover ? '#1d1d1d' : '#000', x0 - 6, y0 - 6, w + 12, cell * 7 + 12);
    letters.forEach((l, i) => F.draw(ctx, l, x0 + i * 6 * cell, y0, cell, cols[i]));
    if (blink(40)) F.draw(ctx, 'CLICK OR PRESS ANY KEY', BW / 2, 172, 1, '#6d7f95', { align: 'center' });
  }

  const BTN = [{ x: 170, y: 140, label: '1P', color: '#8ccf3c', mode: 1 }, { x: 310, y: 140, label: '2P', color: '#3a8fe0', mode: 2 }];
  function hoveredButton() {
    return BTN.find((b) => Math.abs(mouse.x - b.x) < 34 && Math.abs(mouse.y - b.y) < 34);
  }

  function drawMenu() {
    ctx.fillStyle = 'rgba(8,14,24,0.45)';
    ctx.fillRect(0, 0, BW, BH);
    R.title(ctx, 30, 5);
    const hov = hoveredButton();
    for (const b of BTN) {
      const h = hov === b;
      const bob = h ? Math.round(Math.sin(frame / 6) * 2) : 0;
      R.playTriangle(ctx, b.x, b.y + bob, 50, h);
      F.draw(ctx, b.label, b.x - 30, b.y + 14 + bob, 4, b.color, { outline: 2, shadow: 2 });
    }
    F.draw(ctx, 'VS CPU', 170, 188, 1, '#ffffff', { align: 'center', outline: 1 });
    F.draw(ctx, '2 PLAYERS', 310, 188, 1, '#ffffff', { align: 'center', outline: 1 });
    R.rect(ctx, 'rgba(0,0,0,0.7)', 90, 204, 300, 44);
    F.draw(ctx, 'RED TEAM: W     BLUE TEAM: ^ UP', BW / 2, 210, 1, '#ffffff', { align: 'center' });
    F.draw(ctx, 'HOLD: JUMP + GRAB   RELEASE: THROW', BW / 2, 222, 1, '#ffd23f', { align: 'center' });
    F.draw(ctx, 'FIRST TO 5 WINS', BW / 2, 234, 1, '#5be6f7', { align: 'center' });
    F.draw(ctx, 'M: SOUND ' + (Sfx.muted ? 'OFF' : 'ON') + '   P: PAUSE   ESC: MENU', BW / 2, 258, 1, '#9fb0c4', { align: 'center', outline: 1 });
  }

  function drawHUD() {
    const names = mode === 1 ? ['YOU - W', 'CPU'] : ['P1 - W', 'P2 - ^'];
    R.scoreBoxes(ctx, match.score, names);
    if (match.mods.double) {
      const c = bannerCanvas('X2', 2, R.GOLD);
      ctx.drawImage(c, Math.round(BW / 2 - c.width / 2), 246);
    }
    if (match.intro > 0 && match.phase === 'live') {
      const labels = match.mods.labels.slice();
      if (match.mods.double) labels.unshift('DOUBLE POINTS!');
      if (match.round === 0) labels.unshift('FIRST TO 5!');
      const show = match.intro > 110 ? (130 - match.intro) / 20 : match.intro < 20 ? match.intro / 20 : 1;
      ctx.globalAlpha = Math.max(0, Math.min(1, show));
      labels.forEach((l, i) => F.draw(ctx, l, BW / 2, 14 + i * 14, 2, i === 0 && match.mods.double ? '#ffd23f' : '#ffffff', { align: 'center', outline: 1, shadow: 1 }));
      ctx.globalAlpha = 1;
    }
    if (match.phase === 'scored') {
      const t = match.timer;
      const text = match.last && match.last.dunk ? 'DUNK!' : 'BASKET!';
      const c = bannerCanvas(text, 6, R.FIRE);
      const k = t < 14 ? easeOutBack(t / 14) : t > 112 ? Math.max(0, 1 - (t - 112) / 13) : 1;
      ctx.save();
      ctx.translate(BW / 2, 62);
      ctx.rotate(-0.07 + Math.sin(t / 10) * 0.015);
      ctx.scale(k, k);
      ctx.drawImage(c, Math.round(-c.width / 2), Math.round(-c.height / 2));
      ctx.restore();
      if (match.last && match.last.pts > 1 && t > 10) {
        const c2 = bannerCanvas('+2', 3, R.GOLD);
        ctx.drawImage(c2, Math.round(BW / 2 - c2.width / 2), 98);
      }
    }
    if (paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, BW, BH);
      F.draw(ctx, 'PAUSED', BW / 2, 110, 4, '#ffffff', { align: 'center', outline: 2 });
      F.draw(ctx, 'P TO RESUME   ESC FOR MENU', BW / 2, 150, 1, '#ffffff', { align: 'center' });
    }
  }

  function drawOver() {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, BW, BH);
    const w = match.winner;
    const text = mode === 1 ? (w === 0 ? 'YOU WIN!' : 'CPU WINS!') : w === 0 ? 'RED WINS!' : 'BLUE WINS!';
    const c = bannerCanvas(text, 5, w === 0 ? R.FIRE : ['#e6f3ff', '#c4e2ff', '#9fcfff', '#7dbbf7', '#5da5ee', '#418fe0', '#2e78c8']);
    const k = match.overT < 16 ? easeOutBack(match.overT / 16) : 1;
    ctx.save(); ctx.translate(BW / 2, 82); ctx.scale(k, k); ctx.drawImage(c, Math.round(-c.width / 2), Math.round(-c.height / 2)); ctx.restore();
    F.draw(ctx, match.score[0] + ' - ' + match.score[1], BW / 2, 122, 3, '#ffffff', { align: 'center', outline: 1 });
    if (match.overT > 50 && blink(30)) F.draw(ctx, 'PRESS W / ^ OR CLICK TO REMATCH', BW / 2, 162, 1, '#ffd23f', { align: 'center', outline: 1 });
    F.draw(ctx, 'ESC FOR MENU', BW / 2, 178, 1, '#ffffff', { align: 'center', outline: 1 });
  }

  function easeOutBack(x) { const c1 = 1.9, c3 = c1 + 1; x = Math.min(1, x); return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (state === 'splash') return drawSplash();
    const alpha = paused ? 1 : acc / STEP;
    if (state === 'menu') { withInterpolation(demo.sim, alpha, () => drawWorld(demo.sim, demo.mods, frame)); drawMenu(); return; }
    withInterpolation(match.sim, alpha, () => drawWorld(match.sim, match.mods, frame));
    drawHUD();
    if (state === 'over') drawOver();
  }

  // ---------- Input ----------
  function goMenu() { state = 'menu'; paused = false; particles = []; }

  function activate() {
    Sfx.init();
    if (state === 'splash') { Sfx.click(); goMenu(); return true; }
    if (state === 'over' && match.overT > 50) { Sfx.click(); newMatch(mode); return true; }
    return false;
  }

  window.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'ArrowUp' || k === ' ' || k === 'ArrowDown') e.preventDefault();
    if (e.repeat) return;
    if (k === 'w' || k === 'W') keys.w = true;
    if (k === 'ArrowUp') keys.up = true;
    if (k === ' ') keys.space = true;
    if (k === 'm' || k === 'M') { Sfx.init(); Sfx.toggleMute(); return; }
    if (state === 'splash') { activate(); return; }
    if (state === 'menu') {
      Sfx.init();
      if (k === '1' || k === 'Enter' || k === 'w' || k === 'W' || k === ' ') { Sfx.click(); newMatch(1); }
      else if (k === '2' || k === 'ArrowUp') { Sfx.click(); newMatch(2); }
      return;
    }
    if (k === 'Escape') { goMenu(); return; }
    if (state === 'play' && (k === 'p' || k === 'P')) { paused = !paused; return; }
    if (state === 'over' && (k === 'w' || k === 'W' || k === 'ArrowUp' || k === ' ' || k === 'Enter')) activate();
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'w' || e.key === 'W') keys.w = false;
    if (e.key === 'ArrowUp') keys.up = false;
    if (e.key === ' ') keys.space = false;
  });
  window.addEventListener('blur', () => { keys.w = keys.up = keys.space = false; touchTeams[0] = touchTeams[1] = false; });

  function toBuffer(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * BW, y: ((clientY - r.top) / r.height) * BH };
  }
  function pointerPress(x, y) {
    mouse.x = x; mouse.y = y;
    if (activate()) return;
    if (state === 'menu') {
      Sfx.init();
      const b = hoveredButton();
      if (b) { Sfx.click(); newMatch(b.mode); }
    }
  }
  canvas.addEventListener('mousemove', (e) => { const p = toBuffer(e.clientX, e.clientY); mouse.x = p.x; mouse.y = p.y; });
  canvas.addEventListener('mousedown', (e) => {
    const p = toBuffer(e.clientX, e.clientY);
    if (state === 'play') { Sfx.init(); touchTeams[mode === 1 || p.x < BW / 2 ? 0 : 1] = true; return; }
    pointerPress(p.x, p.y);
  });
  window.addEventListener('mouseup', () => { touchTeams[0] = touchTeams[1] = false; });

  function syncTouches(e) {
    touchTeams[0] = touchTeams[1] = false;
    if (state !== 'play') return;
    for (const t of e.touches) {
      const p = toBuffer(t.clientX, t.clientY);
      touchTeams[mode === 1 || p.x < BW / 2 ? 0 : 1] = true;
    }
  }
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    Sfx.init();
    if (state !== 'play') { const t = e.changedTouches[0], p = toBuffer(t.clientX, t.clientY); pointerPress(p.x, p.y); return; }
    syncTouches(e);
  }, { passive: false });
  canvas.addEventListener('touchend', (e) => { e.preventDefault(); syncTouches(e); }, { passive: false });
  canvas.addEventListener('touchcancel', (e) => { syncTouches(e); });

  // ---------- Loop ----------
  function loop(now) {
    acc += Math.min(100, now - lastT);
    lastT = now;
    while (acc >= STEP) { step(); acc -= STEP; }
    draw();
    requestAnimationFrame(loop);
  }
  newDemo();
  requestAnimationFrame(loop);

  // Small hook for automated tests.
  window.__game = { get state() { return state; }, get match() { return match; }, newMatch, keys };
})();
