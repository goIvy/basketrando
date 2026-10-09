// Physics simulation for one round: four floppy players, a ball, two hoops.
// Pure logic (no DOM) so it can also run headless under Node for tuning.
(function (root) {
  'use strict';
  const Matter = root.Matter || (typeof require !== 'undefined' ? require('matter-js') : null);
  const { Engine, Bodies, Body, Composite, Constraint, Events } = Matter;

  const W = 960, H = 540;
  const GROUND_Y = 415;
  const RIM_Y = 232;
  // Left hoop geometry (right hoop is mirrored).
  const HOOP = { boardX: 110, boardW: 8, boardTop: 166, boardBottom: 268, rimBack: 121, rimFront: 194 };
  const CAT = { STATIC: 0x1, BODY: 0x2, ARM: 0x4, BALL: 0x8 };
  const ARM_DOWN = 0.32, ARM_UP = 2.55;
  const ARM_SPEED = 0.24;           // max arm swing, rad per step
  const SWAY_W = (2 * Math.PI) / 105;
  const STEP_MS = 1000 / 60;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const wrap = (a) => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // ---------- Round modifiers ----------
  const BALLS = {
    normal: { name: 'normal', r: 13, density: 0.0012, restitution: 0.8, frictionAir: 0.004, style: 'orange' },
    big:    { name: 'big', r: 21, density: 0.0007, restitution: 0.7, frictionAir: 0.005, style: 'orange' },
    tiny:   { name: 'tiny', r: 9, density: 0.0018, restitution: 0.76, frictionAir: 0.004, style: 'orange' },
    heavy:  { name: 'heavy', r: 14, density: 0.0045, restitution: 0.4, frictionAir: 0.002, style: 'heavy' },
    light:  { name: 'light', r: 15, density: 0.00035, restitution: 0.85, frictionAir: 0.016, style: 'volley' },
    bouncy: { name: 'bouncy', r: 12, density: 0.001, restitution: 0.96, frictionAir: 0.003, style: 'bouncy' },
    beach:  { name: 'beach', r: 21, density: 0.0003, restitution: 0.8, frictionAir: 0.022, style: 'beach' },
  };

  const MODIFIERS = [
    { key: 'arms', label: 'LONG ARMS', apply: (m) => { m.armScale = 1.4; } },
    { key: 'arms', label: 'SHORT ARMS', apply: (m) => { m.armScale = 0.72; } },
    { key: 'height', label: 'TALL PLAYERS', apply: (m) => { m.heightScale = 1.22; } },
    { key: 'height', label: 'SHORT PLAYERS', apply: (m) => { m.heightScale = 0.8; } },
    { key: 'ball', label: 'BIG BALL', apply: (m) => { m.ball = BALLS.big; } },
    { key: 'ball', label: 'TINY BALL', apply: (m) => { m.ball = BALLS.tiny; } },
    { key: 'ball', label: 'HEAVY BALL', apply: (m) => { m.ball = BALLS.heavy; } },
    { key: 'ball', label: 'LIGHT BALL', apply: (m) => { m.ball = BALLS.light; } },
    { key: 'ball', label: 'BOUNCY BALL', apply: (m) => { m.ball = BALLS.bouncy; } },
    { key: 'ball', label: 'BEACH BALL', apply: (m) => { m.ball = BALLS.beach; } },
    { key: 'grav', label: 'LOW GRAVITY', apply: (m) => { m.gravity = 0.6; m.jumpScale = 0.82; } },
    { key: 'grav', label: 'SUPER JUMP', apply: (m) => { m.jumpScale = 1.18; } },
    { key: 'bounce', label: 'BOUNCY PLAYERS', apply: (m) => { m.playerRestitution = 0.65; } },
    { key: 'wobble', label: 'WOBBLY LEGS', apply: (m) => { m.swayAmp = 0.45; m.uprightK = 0.0045; } },
    { key: 'ground', label: 'SLIPPERY FLOOR', apply: (m) => { m.groundFriction = 0.02; } },
  ];

  const COURTS = ['street', 'gym', 'snow', 'beach', 'night'];

  function baseMods() {
    return {
      court: 'street', armScale: 1, heightScale: 1, ball: BALLS.normal, gravity: 1, jumpScale: 1,
      groundFriction: 0.9, playerRestitution: 0.05, swayAmp: 0.3, uprightK: 0.0065, double: false, labels: [],
    };
  }

  function makeMods(round, prevCourt, rng) {
    rng = rng || Math.random;
    const m = baseMods();
    if (round === 0) return m;
    const courts = COURTS.filter((c) => c !== prevCourt);
    m.court = courts[Math.floor(rng() * courts.length)];
    const used = new Set();
    if (m.court === 'snow') { m.groundFriction = 0.03; used.add('ground'); m.labels.push('ICY COURT'); }
    if (m.court === 'beach') { m.ball = BALLS.beach; used.add('ball'); }
    const n = rng() < 0.45 ? 2 : 1;
    let guard = 0;
    while (m.labels.length < n + (m.court === 'snow' ? 1 : 0) && guard++ < 50) {
      const mod = MODIFIERS[Math.floor(rng() * MODIFIERS.length)];
      if (used.has(mod.key)) continue;
      used.add(mod.key);
      mod.apply(m);
      m.labels.push(mod.label);
    }
    m.double = rng() < 0.2;
    return m;
  }

  // ---------- Player looks ----------
  const SKINS = ['#f1c7a0', '#e0a67a', '#c68654', '#8d5a3b', '#5e3a26', '#f6d6b8'];
  const HAIRS = ['#1c1410', '#3b2414', '#7a4a1e', '#e8c04a', '#c2421d', '#111111', '#d9d4c7'];
  const HAIR_STYLES = ['flat', 'spiky', 'bald', 'afro', 'long', 'mohawk', 'cap'];
  const TEAM_KITS = [
    [{ main: '#d23a2e', trim: '#f6d34a', shorts: '#d23a2e' }, { main: '#2f8a3e', trim: '#f2f2f2', shorts: '#2f8a3e' }, { main: '#e2702a', trim: '#2a2a2a', shorts: '#e2702a' }],
    [{ main: '#2e5fb8', trim: '#f6d34a', shorts: '#1f3f7d' }, { main: '#1f2f5a', trim: '#e9b93a', shorts: '#1f2f5a' }, { main: '#6d3fb5', trim: '#f2f2f2', shorts: '#6d3fb5' }],
  ];

  function makeLook(team, round, rng) {
    const kits = TEAM_KITS[team];
    const kit = kits[round === 0 ? 0 : Math.floor(rng() * kits.length)];
    return {
      skin: SKINS[Math.floor(rng() * SKINS.length)],
      hair: HAIRS[Math.floor(rng() * HAIRS.length)],
      hairStyle: HAIR_STYLES[Math.floor(rng() * HAIR_STYLES.length)],
      kit, number: 1 + Math.floor(rng() * 99),
    };
  }

  // ---------- Simulation ----------
  function Sim(mods, opts) {
    opts = opts || {};
    const rng = this.rng = opts.rng || Math.random;
    this.mods = mods;
    this.t = 0;
    this.events = [];
    this.scored = null;
    this.prevIn = [false, false];
    const engine = this.engine = Engine.create();
    engine.gravity.y = mods.gravity;
    engine.positionIterations = 8;
    engine.velocityIterations = 6;
    engine.constraintIterations = 3;
    this.gStep = mods.gravity * 0.001 * STEP_MS * STEP_MS; // px/step^2
    const world = engine.world;

    const st = (label, extra) => Object.assign({ isStatic: true, label, collisionFilter: { category: CAT.STATIC, mask: 0xffff } }, extra || {});
    this.ground = Bodies.rectangle(W / 2, GROUND_Y + 100, W * 3, 200, st('ground', { friction: mods.groundFriction, frictionStatic: mods.groundFriction < 0.1 ? 0.05 : 1 }));
    const statics = [
      this.ground,
      Bodies.rectangle(-50, 0, 100, 3000, st('wall', { friction: 0.1 })),
      Bodies.rectangle(W + 50, 0, 100, 3000, st('wall', { friction: 0.1 })),
      Bodies.rectangle(W / 2, -760, W * 3, 100, st('wall')),
      Bodies.rectangle(30, GROUND_Y, 110, 110, st('ramp', { angle: Math.PI / 4, friction: 0.05 })),
      Bodies.rectangle(W - 30, GROUND_Y, 110, 110, st('ramp', { angle: Math.PI / 4, friction: 0.05 })),
    ];
    this.hoops = [0, 1].map((side) => {
      const m = (x) => (side === 0 ? x : W - x);
      const boardCx = m(HOOP.boardX + HOOP.boardW / 2);
      const board = Bodies.rectangle(boardCx, (HOOP.boardTop + HOOP.boardBottom) / 2, HOOP.boardW, HOOP.boardBottom - HOOP.boardTop, st('board', { restitution: 0.4 }));
      const back = Bodies.circle(m(HOOP.rimBack), RIM_Y, 4, st('rim', { restitution: 0.5 }));
      const front = Bodies.circle(m(HOOP.rimFront), RIM_Y, 4, st('rim', { restitution: 0.5 }));
      statics.push(board, back, front);
      const a = m(HOOP.rimBack), b = m(HOOP.rimFront);
      return {
        side, scoringTeam: side === 0 ? 1 : 0,
        rimBack: a, rimFront: b, rimMid: (a + b) / 2,
        innerMin: Math.min(a, b) + 4, innerMax: Math.max(a, b) - 4,
        swish: 0,
      };
    });
    Composite.add(world, statics);

    const looks = opts.looks || [0, 1, 2, 3].map((i) => makeLook(i < 2 ? 0 : 1, opts.round || 0, rng));
    const xs = [200, 410, W - 410, W - 200];
    this.players = xs.map((x, i) => this._makePlayer(i < 2 ? 0 : 1, i, x, looks[i]));

    const bt = mods.ball;
    const ball = Bodies.circle(W / 2 + (rng() - 0.5) * 6, 120, bt.r, {
      restitution: bt.restitution, density: bt.density, friction: 0.4, frictionAir: bt.frictionAir,
      label: 'ball', collisionFilter: { category: CAT.BALL, mask: CAT.STATIC | CAT.BODY | CAT.ARM },
    });
    Composite.add(world, ball);
    this.ball = { body: ball, r: bt.r, holder: null, holdT: 0, still: 0, ignoreT: 0, stealCd: 0, prevY: ball.position.y };

    const onCol = (e, start) => {
      for (const pair of e.pairs) {
        const A = pair.bodyA.parent, B = pair.bodyB.parent;
        this._contact(A, B, pair, start);
        this._contact(B, A, pair, start);
      }
    };
    Events.on(engine, 'collisionStart', (e) => onCol(e, true));
    Events.on(engine, 'collisionActive', (e) => onCol(e, false));
  }

  Sim.prototype._makePlayer = function (team, idx, x, look) {
    const m = this.mods;
    const f = team === 0 ? 1 : -1;
    const h = 135 * m.heightScale;
    const w = 26;
    const armLen = 66 * m.armScale;
    const armW = 9;
    const group = Body.nextGroup(true);
    const shoulderY = -h / 2 + 40;
    const torso = Bodies.rectangle(x, GROUND_Y - h / 2 - 1, w, h, {
      chamfer: { radius: 6 }, density: 0.0022, friction: 0.9, frictionStatic: 1.2, frictionAir: 0.006,
      restitution: m.playerRestitution, label: 'torso',
      collisionFilter: { group, category: CAT.BODY, mask: CAT.STATIC | CAT.BODY | CAT.ARM | CAT.BALL },
    });
    const sx = x, sy = torso.position.y + shoulderY;
    const arm = Bodies.rectangle(sx, sy + armLen / 2, armW, armLen, {
      chamfer: { radius: 3 }, density: 0.001, friction: 0.5, restitution: 0.2, frictionAir: 0.01, label: 'arm',
      collisionFilter: { group, category: CAT.ARM, mask: CAT.STATIC | CAT.BODY | CAT.ARM | CAT.BALL },
    });
    const joint = Constraint.create({
      bodyA: torso, pointA: { x: 0, y: shoulderY }, bodyB: arm, pointB: { x: 0, y: -armLen / 2 },
      length: 0, stiffness: 1, damping: 0.05,
    });
    Composite.add(this.engine.world, [torso, arm, joint]);
    const p = {
      team, idx, f, torso, arm, joint, h, w, armLen, armW, shoulderY, look,
      support: 0, touching: 0, stuckT: 0, jumpCd: 0, catchCd: 0, lyingT: 0, group, armUp: false, onFeet: true, lying: false,
      phase: (idx % 2 === 0 ? 0 : 2.1) + (team === 1 ? 1.0 : 0) + (this.rng() - 0.5) * 0.6,
      swayAmp: m.swayAmp * (0.85 + this.rng() * 0.3),
      squash: 0,
    };
    torso.plugin.player = p;
    arm.plugin.player = p;
    return p;
  };

  Sim.prototype._feet = function (p) {
    const T = p.torso, a = T.angle, hh = p.h / 2;
    return { x: T.position.x - Math.sin(a) * hh, y: T.position.y + Math.cos(a) * hh };
  };

  Sim.prototype.handPos = function (p) {
    const A = p.arm, L = p.armLen / 2;
    return { x: A.position.x - Math.sin(A.angle) * L, y: A.position.y + Math.cos(A.angle) * L };
  };

  Sim.prototype.handVel = function (p) {
    const A = p.arm, hp = this.handPos(p);
    const rx = hp.x - A.position.x, ry = hp.y - A.position.y, w = A.angularVelocity;
    return { x: A.velocity.x - w * ry, y: A.velocity.y + w * rx };
  };

  Sim.prototype._emit = function (type, data) { this.events.push(Object.assign({ type }, data || {})); };

  Sim.prototype._contact = function (A, B, pair, start) {
    const p = A.plugin && A.plugin.player;
    if (p && A === p.torso && B.label !== 'ball') {
      p.touching = 3;
      const feet = this._feet(p);
      const sup = pair.collision.supports;
      const n = pair.collision.supportCount !== undefined ? pair.collision.supportCount : sup.length;
      for (let i = 0; i < n; i++) {
        if (sup[i] && Math.hypot(sup[i].x - feet.x, sup[i].y - feet.y) < 20) { p.support = 3; break; }
      }
      // Lying on the floor also counts as "supported" (for recovery).
      if (B.label === 'ground' && p.support === 0 && Math.abs(wrap(A.angle)) > 0.9) p.support = 2;
      if (start && B.label === 'ground' && A.velocity.y > 4) this._emit('land', { x: A.position.x, v: A.velocity.y });
    }
    if (start && A.label === 'ball' && !this.ball.holder) {
      const v = Math.hypot(A.velocity.x, A.velocity.y);
      if (B.label === 'ground' && v > 1.5) this._emit('bounce', { v });
      else if ((B.label === 'rim' || B.label === 'board') && v > 1) this._emit('rim', { v });
      else if ((B.label === 'torso' || B.label === 'arm') && v > 2) this._emit('hit', { v });
    }
  };

  Sim.prototype.step = function (inputs) {
    this.t++;
    // Letting go of the button throws the ball.
    const released = [!inputs[0] && this.prevIn[0], !inputs[1] && this.prevIn[1]];
    for (const p of this.players) this._control(p, inputs[p.team], released[p.team]);
    const b = this.ball.body;
    this.ball.prevY = b.position.y;
    Engine.update(this.engine, STEP_MS);
    this._postBall();
    this._checkScore();
    this._failsafes();
    this.prevIn = [inputs[0], inputs[1]];
  };

  Sim.prototype._control = function (p, press, released) {
    const T = p.torso, m = this.mods, f = p.f;
    const a = wrap(T.angle);
    if (p.jumpCd > 0) p.jumpCd--;
    if (p.catchCd > 0) p.catchCd--;
    if (p.squash > 0) p.squash -= 0.08;
    p.armUp = press;
    let supported = p.support > 0;
    if (p.support > 0) p.support--;
    if (p.touching > 0) p.touching--;
    const slow = Math.hypot(T.velocity.x, T.velocity.y) < 1.2;
    p.stuckT = !supported && p.touching > 0 && slow ? p.stuckT + 1 : 0;
    if (p.stuckT > 40) supported = true;
    p.onFeet = supported && Math.abs(a) < 0.95;
    p.lying = supported && !p.onFeet;

    if (released && this.ball.holder === p) this._throw(p);

    if (p.onFeet) {
      p.lyingT = 0;
      // Players never stand still: they rock back and forth around a slight forward lean,
      // so *when* you press decides which way the jump goes.
      const target = f * 0.05 + p.swayAmp * Math.sin(this.t * SWAY_W + p.phase);
      let av = T.angularVelocity;
      av += (target - a) * m.uprightK - av * 0.07;
      Body.setAngularVelocity(T, av);
      if (press && p.jumpCd <= 0) this._jump(p, a);
    } else if (p.lying) {
      p.lyingT++;
      if ((press && p.jumpCd <= 0) || p.lyingT > 110) {
        const s = -Math.sign(a) || 1;
        Body.setVelocity(T, { x: T.velocity.x * 0.5, y: -7.5 * Math.sqrt(m.gravity) });
        Body.setAngularVelocity(T, s * Math.min(0.11, Math.abs(a) / 22));
        Body.setVelocity(p.arm, T.velocity);
        p.jumpCd = 24;
        p.lyingT = 0;
        this._emit('jump', { team: p.team, recover: true });
      }
    } else {
      // Airborne: only a weak tendency to come back upright.
      let av = T.angularVelocity;
      av += -a * 0.0007 - av * 0.004;
      Body.setAngularVelocity(T, av);
    }

    // Arm servo: swing up while the button is held, drop when released.
    const A = p.arm;
    const rel = wrap(A.angle - T.angle);
    const tgt = -f * (p.armUp ? ARM_UP : ARM_DOWN);
    const err = wrap(tgt - rel);
    const want = T.angularVelocity + clamp(err * 0.3, -ARM_SPEED, ARM_SPEED);
    Body.setAngularVelocity(A, A.angularVelocity + (want - A.angularVelocity) * 0.7);
  };

  Sim.prototype._jump = function (p, a) {
    const T = p.torso, m = this.mods;
    const J = 10.4 * m.jumpScale * Math.sqrt(m.gravity);
    const ux = Math.sin(a), uy = -Math.cos(a);
    Body.setVelocity(T, { x: T.velocity.x * 0.25 + ux * J + p.f * 0.6, y: uy * J });
    Body.setAngularVelocity(T, T.angularVelocity * 0.6 + a * 0.06 + p.f * 0.006);
    Body.setVelocity(p.arm, { x: T.velocity.x, y: T.velocity.y });
    p.jumpCd = 16;
    p.squash = 1;
    this._emit('jump', { team: p.team });
  };

  Sim.prototype._attach = function (p) {
    const B = this.ball;
    B.holder = p; B.holdT = 0;
    B.body.isSensor = true;
    B.body.collisionFilter.group = 0;
    B.ignoreT = 0;
    this._emit('catch', { team: p.team });
  };

  // Throw: the ball leaves along the body's up axis tipped forward, so the arc depends
  // on how the player is leaning and moving at the moment the button is let go.
  Sim.prototype._throw = function (p) {
    const T = p.torso, m = this.mods;
    const aim = wrap(T.angle) + p.f * 0.75;
    const P = 11.5 * Math.sqrt(m.gravity) * clamp(Math.sqrt(0.0012 / m.ball.density), 0.8, 1.2);
    this._placeHeld();
    this._release(p, true, {
      x: Math.sin(aim) * P + T.velocity.x * 0.6,
      y: -Math.cos(aim) * P + Math.min(0, T.velocity.y) * 0.5,
    });
  };

  Sim.prototype._release = function (p, thrown, vel) {
    const B = this.ball, b = B.body;
    const v = vel || this.handVel(p);
    let vx = v.x, vy = v.y;
    const sp = Math.hypot(vx, vy), cap = 19;
    if (sp > cap) { vx *= cap / sp; vy *= cap / sp; }
    B.holder = null; B.holdT = 0;
    b.isSensor = false;
    // Briefly share the thrower's collision group so the ball can't clip their own arm/body.
    b.collisionFilter.group = p.group;
    B.ignoreT = 12;
    Body.setVelocity(b, { x: vx, y: vy });
    Body.setAngularVelocity(b, -p.f * 0.2);
    p.catchCd = 24;
    if (thrown) {
      // Give the ball a moment to clear the thrower's teammate too.
      for (const q of this.players) if (q.team === p.team && q !== p) q.catchCd = Math.max(q.catchCd, 12);
      this._emit('throw', { team: p.team });
    }
  };

  // Distance from the ball centre to a player's torso or arm, minus their half-widths.
  Sim.prototype._touchGap = function (p, pos) {
    const T = p.torso, hh = p.h / 2 - 4;
    const s = Math.sin(T.angle), c = Math.cos(T.angle);
    const dt = segDist(pos.x, pos.y, T.position.x + s * hh, T.position.y - c * hh, T.position.x - s * hh, T.position.y + c * hh) - p.w / 2;
    const hp = this.handPos(p), A = p.arm, L = p.armLen / 2;
    const sx = A.position.x + Math.sin(A.angle) * L, sy = A.position.y - Math.cos(A.angle) * L;
    const da = segDist(pos.x, pos.y, sx, sy, hp.x, hp.y) - p.armW / 2;
    return Math.min(dt, da);
  };

  Sim.prototype._postBall = function () {
    const B = this.ball, b = B.body, r = B.r;
    if (B.stealCd > 0) B.stealCd--;
    if (B.ignoreT > 0 && --B.ignoreT === 0) b.collisionFilter.group = 0;
    if (B.holder) {
      const p = B.holder;
      B.holdT++;
      // Opponents grab the ball by touching it with a hand, arm or body.
      if (B.stealCd <= 0) {
        for (const q of this.players) {
          if (q.team === p.team || q.catchCd > 0) continue;
          if (this._touchGap(q, b.position) < r + 2) {
            p.catchCd = 30;
            B.stealCd = 30;
            this._emit('steal', { team: q.team });
            this._attach(q);
            break;
          }
        }
      }
      if (B.holdT > 600) { this._release(B.holder, false); return; }
      this._placeHeld();
    } else {
      // A loose ball sticks to whoever it touches first.
      let best = null, bd = 1e9;
      for (const p of this.players) {
        if (p.catchCd > 0) continue;
        const d = this._touchGap(p, b.position);
        if (d < r + 3 && d < bd) { bd = d; best = p; }
      }
      if (best) { this._attach(best); this._placeHeld(); }
    }
  };

  Sim.prototype._placeHeld = function () {
    const B = this.ball, p = B.holder, A = p.arm;
    const hp = this.handPos(p);
    const dx = -Math.sin(A.angle), dy = Math.cos(A.angle);
    Body.setPosition(B.body, {
      x: clamp(hp.x + dx * (B.r + 1), B.r, W - B.r),
      y: Math.min(hp.y + dy * (B.r + 1), GROUND_Y - B.r),
    });
    Body.setVelocity(B.body, this.handVel(p));
  };

  Sim.prototype._checkScore = function () {
    const B = this.ball, b = B.body;
    for (const h of this.hoops) {
      if (B.prevY < RIM_Y && b.position.y >= RIM_Y && b.position.x > h.innerMin && b.position.x < h.innerMax) {
        h.swish = 1;
        if (!this.scored) {
          this.scored = { team: h.scoringTeam, side: h.side, t: this.t, dunk: !!B.holder };
          this._emit('score', { team: h.scoringTeam, dunk: !!B.holder });
        }
      }
      if (h.swish > 0) h.swish -= 0.02;
    }
  };

  Sim.prototype._failsafes = function () {
    const B = this.ball, b = B.body, r = B.r;
    if (!B.holder) {
      const sp = Math.hypot(b.velocity.x, b.velocity.y);
      B.still = sp < 0.35 ? B.still + 1 : 0;
      if (B.still > 120 && b.position.y < GROUND_Y - r - 4) {
        Body.setVelocity(b, { x: (W / 2 - b.position.x) * 0.012 + (this.rng() - 0.5) * 2, y: -7 });
        B.still = 0;
      }
    }
    if (!isFinite(b.position.x) || b.position.x < -40 || b.position.x > W + 40 || b.position.y > GROUND_Y + 40) {
      if (B.holder) { B.holder = null; b.isSensor = false; }
      b.collisionFilter.group = 0;
      Body.setPosition(b, { x: W / 2, y: 100 });
      Body.setVelocity(b, { x: 0, y: 0 });
    }
    for (const p of this.players) {
      const T = p.torso;
      if (!isFinite(T.position.x) || T.position.y > GROUND_Y + 60 || T.position.x < -30 || T.position.x > W + 30) {
        const x = clamp(isFinite(T.position.x) ? T.position.x : W / 2, 60, W - 60);
        Body.setPosition(T, { x, y: GROUND_Y - p.h / 2 - 20 });
        Body.setAngle(T, 0);
        Body.setVelocity(T, { x: 0, y: 0 });
        Body.setAngularVelocity(T, 0);
        Body.setPosition(p.arm, { x, y: T.position.y + p.shoulderY + p.armLen / 2 });
        Body.setAngle(p.arm, 0);
        Body.setVelocity(p.arm, { x: 0, y: 0 });
      }
    }
  };

  function segDist(px, py, ax, ay, bx, by) {
    const vx = bx - ax, vy = by - ay;
    const l2 = vx * vx + vy * vy || 1;
    const t = clamp(((px - ax) * vx + (py - ay) * vy) / l2, 0, 1);
    return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
  }

  const api = { Sim, makeMods, baseMods, BALLS, W, H, GROUND_Y, RIM_Y, HOOP, wrap, clamp, COURTS };
  root.BR = Object.assign(root.BR || {}, api);
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
