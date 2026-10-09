// All drawing. Everything is drawn into a 480x270 canvas (half of the 960x540
// physics world) and scaled up with nearest-neighbour filtering for chunky pixels.
(function (root) {
  'use strict';
  const BR = root.BR, F = root.PixelFont;
  const S = 0.5, BW = 480, BH = 270;
  const GY = BR.GROUND_Y * S;
  const RIMY = BR.RIM_Y * S;

  function seeded(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function rect(ctx, c, x, y, w, h) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function pline(ctx, x0, y0, x1, y1, c, w) {
    w = w || 1;
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) | 0 || 1;
    ctx.fillStyle = c;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      ctx.fillRect(Math.round(x0 + (x1 - x0) * t - w / 2), Math.round(y0 + (y1 - y0) * t - w / 2), w, w);
    }
  }
  function bands(ctx, colors, y0, y1) {
    const h = (y1 - y0) / colors.length;
    colors.forEach((c, i) => rect(ctx, c, 0, y0 + i * h, BW, h + 1));
  }
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
    return '#' + ((1 << 24) | (f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).slice(1);
  }

  // ---------- Backgrounds ----------
  const FLOOR_TOP = 152;

  function courtLines(ctx, c) {
    const far = 168, near = 252;
    pline(ctx, 72, far, 408, far, c, 1);
    pline(ctx, 6, near, 474, near, c, 1);
    pline(ctx, 72, far, 6, near, c, 1);
    pline(ctx, 408, far, 474, near, c, 1);
    // keys
    pline(ctx, 66, 177, 118, 177, c, 1); pline(ctx, 118, 177, 104, 226, c, 1); pline(ctx, 104, 226, 38, 226, c, 1);
    pline(ctx, 414, 177, 362, 177, c, 1); pline(ctx, 362, 177, 376, 226, c, 1); pline(ctx, 376, 226, 442, 226, c, 1);
  }

  function skyline(ctx, rnd, color, y0, minH, maxH, windows) {
    let x = -4;
    while (x < BW) {
      const w = 14 + Math.floor(rnd() * 26), h = minH + Math.floor(rnd() * (maxH - minH));
      rect(ctx, color, x, y0 - h, w, h + 40);
      if (rnd() < 0.3) rect(ctx, color, x + w / 2 - 1, y0 - h - 8, 2, 8);
      if (windows) {
        for (let wy = y0 - h + 4; wy < y0 - 2; wy += 6)
          for (let wx = x + 3; wx < x + w - 3; wx += 5)
            if (rnd() < 0.35) rect(ctx, rnd() < 0.8 ? windows : '#f4f1c9', wx, wy, 2, 3);
      }
      x += w + Math.floor(rnd() * 3);
    }
  }

  function cloud(ctx, x, y, s, c) {
    rect(ctx, c, x, y, 26 * s, 6 * s);
    rect(ctx, c, x + 4 * s, y - 4 * s, 12 * s, 5 * s);
    rect(ctx, c, x + 12 * s, y - 7 * s, 10 * s, 8 * s);
  }

  function fence(ctx, rnd, y0, y1, c1, c2) {
    for (let x = 0; x < BW; x += 6) {
      const top = y0 + ((x / 6) % 2 ? 2 : 0);
      rect(ctx, c1, x, top, 6, y1 - top);
      rect(ctx, c2, x + 5, top, 1, y1 - top);
      rect(ctx, c2, x + 1, top, 4, 1);
    }
    rect(ctx, c2, 0, y0 + 10, BW, 2);
    rect(ctx, c2, 0, y1 - 14, BW, 2);
  }

  function bushes(ctx, rnd, y, c1, c2) {
    for (let x = 0; x < BW; x += 4) {
      const h = 10 + Math.floor(Math.abs(Math.sin(x * 0.07)) * 7 + rnd() * 4);
      rect(ctx, c1, x, y - h, 4, h);
      if (rnd() < 0.5) rect(ctx, c2, x + 1, y - h + 2, 2, 2);
    }
  }

  function speckle(ctx, rnd, y0, y1, colors, n) {
    for (let i = 0; i < n; i++) rect(ctx, colors[i % colors.length], rnd() * BW, y0 + rnd() * (y1 - y0), 1, 1);
  }

  function pine(ctx, x, y, h, c, snow) {
    for (let i = 0; i < h; i += 2) {
      const w = Math.round((i / h) * h * 0.45) + 1;
      rect(ctx, c, x - w, y - h + i, w * 2, 2);
      if (snow && i % 8 === 0) rect(ctx, snow, x - w, y - h + i, w * 2, 1);
    }
    rect(ctx, '#5a3a22', x - 1, y, 3, 4);
  }

  function palm(ctx, x, y, h) {
    for (let i = 0; i < h; i += 2) rect(ctx, i % 4 ? '#8a5a2c' : '#a0703a', x + Math.round(Math.sin(i / h * 1.4) * 6), y - i, 4, 2);
    const tx = x + Math.round(Math.sin(1.4) * 6) + 2, ty = y - h;
    for (const [dx, dy] of [[-1, 0.3], [1, 0.3], [-0.7, -0.4], [0.7, -0.4], [0, -0.8]]) {
      for (let i = 0; i < 16; i++) rect(ctx, '#3f9a3a', tx + dx * i, ty + dy * i + (i * i) / 40, 3, 2);
    }
  }

  const COURT_STYLE = {
    street: { lines: '#a3a6aa' },
    night: { lines: '#8fb5a6' },
    gym: { lines: '#f6efe0' },
    snow: { lines: '#8fb1d1' },
    beach: { lines: '#fff7e0' },
  };

  function makeBackground(court) {
    const c = document.createElement('canvas');
    c.width = BW; c.height = BH;
    const ctx = c.getContext('2d');
    const rnd = seeded(court.length * 977 + 13);
    if (court === 'street') {
      bands(ctx, ['#9fe3ef', '#aae8f2', '#b6edf5', '#c2f1f7', '#cdf4f9'], 0, FLOOR_TOP);
      cloud(ctx, 40, 40, 1.4, '#e9fbfd'); cloud(ctx, 300, 26, 1.1, '#e9fbfd'); cloud(ctx, 400, 58, 0.9, '#e9fbfd');
      skyline(ctx, rnd, '#8fd0e0', 120, 20, 70, null);
      skyline(ctx, rnd, '#7fc2d4', 124, 10, 40, null);
      fence(ctx, rnd, 106, FLOOR_TOP, '#94705a', '#6f5241');
      bushes(ctx, rnd, FLOOR_TOP, '#86bf55', '#a6d86c');
      rect(ctx, '#4b4e53', 0, FLOOR_TOP, BW, BH - FLOOR_TOP);
      rect(ctx, '#3d4045', 0, FLOOR_TOP, BW, 2);
      speckle(ctx, rnd, FLOOR_TOP, BH, ['#55585d', '#43464b', '#5d6065'], 900);
    } else if (court === 'night') {
      bands(ctx, ['#0d1730', '#122042', '#182a52', '#1e3462', '#253f70'], 0, FLOOR_TOP);
      for (let i = 0; i < 70; i++) rect(ctx, rnd() < 0.8 ? '#cfd8ff' : '#fff6b0', rnd() * BW, rnd() * 90, 1, 1);
      for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) {
        if (dx * dx + dy * dy <= 49) rect(ctx, (dx + 3) * (dx + 3) + (dy + 2) * (dy + 2) <= 30 ? '#0d1730' : '#f3efd2', 402 + dx, 28 + dy, 1, 1);
      }
      skyline(ctx, rnd, '#16223d', 130, 30, 95, '#f2c94c');
      skyline(ctx, rnd, '#0f1a30', 136, 15, 50, '#e8a93a');
      // chain-link fence
      rect(ctx, '#1c2a2a', 0, 110, BW, FLOOR_TOP - 110);
      for (let x = -40; x < BW; x += 6) { pline(ctx, x, 110, x + 42, FLOOR_TOP, '#4a5c5c'); pline(ctx, x + 42, 110, x, FLOOR_TOP, '#4a5c5c'); }
      rect(ctx, '#7c8a8a', 0, 108, BW, 2);
      rect(ctx, '#2c3b3a', 0, FLOOR_TOP, BW, BH - FLOOR_TOP);
      speckle(ctx, rnd, FLOOR_TOP, BH, ['#34443f', '#263432'], 700);
    } else if (court === 'gym') {
      rect(ctx, '#c9a77a', 0, 0, BW, FLOOR_TOP);
      for (let y = 0; y < 60; y += 6) rect(ctx, y % 12 ? '#bf9c6f' : '#d1b088', 0, y, BW, 6);
      // windows
      for (let x = 20; x < BW; x += 70) { rect(ctx, '#6f5a3e', x, 10, 40, 24); rect(ctx, '#a8dcef', x + 2, 12, 36, 20); rect(ctx, '#6f5a3e', x + 19, 12, 2, 20); }
      // bleachers + crowd
      for (let r = 0; r < 6; r++) {
        const y = 62 + r * 13;
        rect(ctx, r % 2 ? '#7d5b3c' : '#8a6644', 0, y, BW, 13);
        rect(ctx, '#5f4329', 0, y + 11, BW, 2);
        for (let x = 2 + (r % 2) * 3; x < BW; x += 6) {
          if (rnd() < 0.18) continue;
          const shirt = ['#d23a2e', '#2e5fb8', '#f6d34a', '#2f8a3e', '#f2f2f2', '#e2702a', '#6d3fb5'][Math.floor(rnd() * 7)];
          rect(ctx, shirt, x, y + 5, 4, 6);
          rect(ctx, ['#f1c7a0', '#c68654', '#8d5a3b', '#e0a67a'][Math.floor(rnd() * 4)], x + 1, y + 1, 3, 4);
        }
      }
      rect(ctx, '#2e5fb8', 0, 138, BW, 14);
      F.draw(ctx, 'HOME', 120, 141, 1, '#f6d34a');
      F.draw(ctx, 'AWAY', 336, 141, 1, '#f6d34a');
      for (let x = 0; x < BW; x += 30) rect(ctx, '#244c94', x, 138, 2, 14);
      rect(ctx, '#c98b4f', 0, FLOOR_TOP, BW, BH - FLOOR_TOP);
      for (let y = FLOOR_TOP; y < BH; y += 5) {
        rect(ctx, '#b97b42', 0, y + 4, BW, 1);
        for (let x = (y * 7) % 40; x < BW; x += 40) rect(ctx, '#b97b42', x, y, 1, 4);
      }
      rect(ctx, 'rgba(255,255,255,0.08)', 0, FLOOR_TOP + 4, BW, 10);
      ctx.fillStyle = 'rgba(210,58,46,0.35)';
      ctx.beginPath(); ctx.moveTo(66, 177); ctx.lineTo(118, 177); ctx.lineTo(104, 226); ctx.lineTo(38, 226); ctx.fill();
      ctx.fillStyle = 'rgba(46,95,184,0.35)';
      ctx.beginPath(); ctx.moveTo(414, 177); ctx.lineTo(362, 177); ctx.lineTo(376, 226); ctx.lineTo(442, 226); ctx.fill();
    } else if (court === 'snow') {
      bands(ctx, ['#b7cfe6', '#c3d8ec', '#cfe0f1', '#dbe8f5', '#e6f0f8'], 0, FLOOR_TOP);
      cloud(ctx, 60, 30, 1.2, '#f2f7fb'); cloud(ctx, 330, 44, 1.4, '#f2f7fb');
      ctx.fillStyle = '#eef4fa';
      for (let x = 0; x < BW; x += 2) { const h = 30 + Math.sin(x / 50) * 14 + Math.sin(x / 17) * 4; rect(ctx, '#e9f1f8', x, 130 - h, 2, h + 30); }
      for (let x = 10; x < BW; x += 22 + Math.floor(rnd() * 20)) pine(ctx, x, 140 + Math.floor(rnd() * 8), 26 + Math.floor(rnd() * 22), '#2f5d4a', '#f4f8fb');
      rect(ctx, '#ffffff', 0, 142, BW, FLOOR_TOP - 142);
      rect(ctx, '#dce9f4', 0, FLOOR_TOP, BW, BH - FLOOR_TOP);
      for (let i = 0; i < 40; i++) rect(ctx, '#eef6fd', rnd() * BW, FLOOR_TOP + rnd() * (BH - FLOOR_TOP), 10 + rnd() * 30, 1);
      speckle(ctx, rnd, FLOOR_TOP, BH, ['#c8dbec', '#ffffff'], 400);
    } else if (court === 'beach') {
      bands(ctx, ['#4fb3ea', '#62bdee', '#76c7f1', '#8bd1f4', '#a0dbf6'], 0, 118);
      rect(ctx, '#ffe066', 380, 20, 22, 22); rect(ctx, '#fff2a0', 384, 24, 14, 14);
      cloud(ctx, 60, 36, 1.2, '#f4fbff'); cloud(ctx, 220, 22, 0.9, '#f4fbff');
      bands(ctx, ['#2a7fc2', '#2f8ccf', '#3a98d8'], 118, FLOOR_TOP - 6);
      for (let i = 0; i < 60; i++) rect(ctx, '#d9f1ff', rnd() * BW, 120 + rnd() * 24, 3 + rnd() * 5, 1);
      rect(ctx, '#f3e2b0', 0, FLOOR_TOP - 6, BW, 6);
      palm(ctx, 24, FLOOR_TOP - 2, 70); palm(ctx, 440, FLOOR_TOP - 2, 60);
      rect(ctx, '#e8cd8c', 0, FLOOR_TOP, BW, BH - FLOOR_TOP);
      speckle(ctx, rnd, FLOOR_TOP, BH, ['#d9bb76', '#f2dca2', '#cfae66'], 1200);
    }
    courtLines(ctx, COURT_STYLE[court].lines);
    return c;
  }

  // ---------- Hoops ----------
  function hoopBack(ctx, side) {
    const mx = (x, w) => (side === 0 ? x : BW - x - w);
    const r = (c, x, y, w, h) => rect(ctx, c, mx(x, w), y, w, h);
    // post
    r('#222', 16, 88, 10, GY - 86);
    r('#e3e6ea', 17, 89, 8, GY - 88);
    r('#b4b9c0', 22, 89, 3, GY - 88);
    rect(ctx, 'rgba(0,0,0,0.25)', mx(10, 22), GY - 1, 22, 3);
    // arms to the backboard
    r('#222', 24, 106, 33, 6); r('#e3e6ea', 24, 107, 33, 4);
    const x0 = side === 0 ? 21 : BW - 21, x1 = side === 0 ? 55 : BW - 55;
    pline(ctx, x0, 90, x1, 86, '#222', 5); pline(ctx, x0, 90, x1, 86, '#e3e6ea', 3);
    // backboard
    r('#222', 54, 82, 7, 54);
    r('#f4f5f7', 55, 83, 5, 52);
    r('#c9ccd2', 59, 83, 1, 52);
  }

  function hoopFront(ctx, side, swish, t) {
    const mx = (x, w) => (side === 0 ? x : BW - x - w);
    const r = (c, x, y, w, h) => rect(ctx, c, mx(x, w), y, w, h);
    const y = Math.round(RIMY);
    // net
    for (let row = 0; row < 16; row++) {
      const inset = row * 0.35;
      const wob = swish > 0 ? Math.sin(t * 0.6 + row) * swish * 2 : 0;
      for (let x = 62 + inset; x < 96 - inset; x += 3) {
        if ((row + Math.round(x)) % 2 === 0 || row % 4 === 3) r(row % 4 === 3 ? '#d8d8d8' : '#f7f7f7', x + wob, y + 4 + row, 2, 1);
      }
    }
    // rim
    r('#1b1b1b', 58, y - 4, 42, 9);
    r('#d8432f', 59, y - 3, 40, 7);
    r('#f06a4f', 59, y - 3, 40, 1);
    r('#f4f4f4', 63, y - 1, 32, 3);
    for (let x = 65; x < 94; x += 4) r('#1b1b1b', x, y - 1, 1, 3);
  }

  // ---------- Players ----------
  function drawArm(ctx, p, back) {
    const A = p.arm, L = p.armLen, w = p.armW;
    const look = p.look;
    ctx.save();
    const off = back ? -4 * p.f : 0;
    ctx.translate((A.position.x + Math.cos(p.torso.angle) * off) * S, (A.position.y + Math.sin(p.torso.angle) * off) * S);
    ctx.rotate(A.angle);
    const sx = (v) => v * S;
    const skin = back ? shade(look.skin, 0.8) : look.skin;
    ctx.fillStyle = '#1b1b1b';
    ctx.fillRect(sx(-w / 2 - 1.5), sx(-L / 2 - 1.5), sx(w + 3), sx(L + 3));
    ctx.fillStyle = skin;
    ctx.fillRect(sx(-w / 2), sx(-L / 2), sx(w), sx(L));
    ctx.fillStyle = back ? shade(look.kit.main, 0.8) : look.kit.main;
    ctx.fillRect(sx(-w / 2), sx(-L / 2), sx(w), sx(10));
    ctx.fillStyle = shade(look.skin, back ? 0.65 : 0.85);
    ctx.fillRect(sx(-w / 2), sx(L / 2 - 8), sx(w), sx(8));
    ctx.restore();
  }

  function drawBody(ctx, p) {
    const T = p.torso, h = p.h, look = p.look, kit = look.kit;
    const top = -h / 2, R = h - 26;
    const jT = top + 26, sT = jT + R * 0.36, lT = sT + R * 0.17, kT = lT + R * 0.29, shT = kT + R * 0.08, bot = h / 2;
    ctx.save();
    ctx.translate(T.position.x * S, T.position.y * S);
    ctx.rotate(T.angle);
    ctx.scale(p.f, 1);
    const r = (c, x, y, w, hh) => { ctx.fillStyle = c; ctx.fillRect(x * S, y * S, w * S, hh * S); };
    // outline silhouette
    r('#1b1b1b', -13.5, jT - 1.5, 27, shT - jT + 3);
    r('#1b1b1b', -11.5, kT, 23, bot - kT + 1.5);
    r('#1b1b1b', -13.5, top - 1.5, 29, 29);
    // back leg (darker), front leg
    r(shade(look.skin, 0.8), -10, lT, 8, kT - lT); r('#d9d9d9', -10, kT, 8, shT - kT); r('#2a2a2a', -11, shT, 13, bot - shT);
    r(look.skin, 1, lT, 8, kT - lT); r('#ffffff', 1, kT, 8, shT - kT); r('#111', 0, shT, 14, bot - shT);
    r('#3a3a3a', 0, shT, 14, 2);
    // shorts
    r(kit.shorts, -12, sT, 24, lT - sT);
    r(kit.trim, -12, sT, 24, 2);
    r(shade(kit.shorts, 0.8), -1, sT + 4, 2, lT - sT - 4);
    // jersey
    r(kit.main, -12, jT, 24, sT - jT);
    r(shade(kit.main, 0.85), -12, jT, 4, sT - jT);
    r(kit.trim, -4, jT, 10, 3);
    r(look.skin, -1, jT, 4, 3);
    r(kit.trim, 8, jT + 3, 4, 14);
    // number
    if (sT - jT > 24) {
      r(kit.trim, -3, jT + 10, 2, 9); r(kit.trim, 1, jT + 10, 5, 2); r(kit.trim, 4, jT + 10, 2, 9); r(kit.trim, 1, jT + 17, 5, 2);
    }
    // head
    r(look.skin, -12, top, 26, 26);
    r(shade(look.skin, 0.88), -12, top + 20, 26, 6);
    r(shade(look.skin, 0.8), -3, top + 11, 4, 6); // ear
    r('#111', 7, top + 9, 3, 5);                  // eye
    r(shade(look.skin, 0.65), 8, top + 19, 5, 2); // mouth
    r(shade(look.skin, 0.75), 13, top + 13, 2, 4); // nose
    const hc = look.hair;
    switch (look.hairStyle) {
      case 'flat': r(hc, -13, top - 2, 28, 8); r(hc, -13, top, 9, 16); break;
      case 'spiky': r(hc, -13, top - 1, 28, 7); r(hc, -13, top, 8, 14); for (let x = -12; x < 14; x += 6) r(hc, x, top - 5, 3, 4); break;
      case 'bald': r(shade(look.skin, 1.12), -6, top + 1, 8, 2); break;
      case 'afro': r(hc, -16, top - 9, 31, 16); r(hc, -16, top, 12, 20); break;
      case 'long': r(hc, -13, top - 2, 28, 8); r(hc, -14, top, 11, 30); break;
      case 'mohawk': r(hc, -3, top - 8, 9, 10); break;
      case 'cap': r(kit.main, -13, top - 3, 28, 9); r(kit.trim, -13, top + 4, 28, 2); r(kit.main, 13, top + 4, 8, 3); break;
    }
    ctx.restore();
  }

  function drawShadow(ctx, x, y, w) {
    const hgt = Math.max(0, BR.GROUND_Y - y);
    const k = Math.max(0.25, 1 - hgt / 400);
    ctx.fillStyle = 'rgba(0,0,0,' + (0.22 * k).toFixed(3) + ')';
    const ww = w * k * S;
    ctx.fillRect(Math.round(x * S - ww / 2), Math.round(GY - 1), Math.round(ww), 3);
    ctx.fillRect(Math.round(x * S - ww / 2 + 2), Math.round(GY - 2), Math.round(ww - 4), 5);
  }

  // ---------- Ball ----------
  const BALL_STYLE = {
    orange: { base: '#f08a24', dark: '#c4621a', light: '#ffb25a', seam: '#5a2a0c' },
    heavy:  { base: '#6b6f78', dark: '#4a4e56', light: '#9aa0aa', seam: '#22252a' },
    volley: { base: '#f7f3e8', dark: '#d7d1c0', light: '#ffffff', seam: '#2e5fb8', alt: '#f6d34a' },
    bouncy: { base: '#e84fa0', dark: '#b8357b', light: '#ff8cc6', seam: '#5a1238' },
    beach:  { base: '#ffffff', dark: '#dddddd', light: '#ffffff', seam: '#cc3333', stripes: ['#e8453c', '#ffffff', '#2e7fd6', '#ffffff', '#f6d34a', '#ffffff'] },
  };

  function drawBall(ctx, ball, style) {
    const b = ball.body, st = BALL_STYLE[style] || BALL_STYLE.orange;
    const R = ball.r * S, cx = b.position.x * S, cy = b.position.y * S;
    const ca = Math.cos(-b.angle), sa = Math.sin(-b.angle);
    const ir = Math.ceil(R);
    for (let dy = -ir; dy <= ir; dy++) {
      for (let dx = -ir; dx <= ir; dx++) {
        const d = Math.hypot(dx + 0.5, dy + 0.5);
        if (d > R) continue;
        const u = (dx + 0.5) * ca - (dy + 0.5) * sa, v = (dx + 0.5) * sa + (dy + 0.5) * ca;
        let c;
        if (d > R - 1) c = '#1b1b1b';
        else if (st.stripes) {
          const ang = Math.atan2(v, u) + Math.PI;
          c = st.stripes[Math.floor(ang / (Math.PI * 2) * st.stripes.length) % st.stripes.length];
          if (d < R * 0.25) c = '#ffffff';
        } else {
          const seam = Math.abs(u) < 0.7 || Math.abs(v) < 0.7 || Math.abs(Math.hypot(u - R * 1.05, v) - R * 0.75) < 0.6 || Math.abs(Math.hypot(u + R * 1.05, v) - R * 0.75) < 0.6;
          if (seam && R > 5) c = st.seam;
          else if (st.alt && u > 0 && v < 0) c = st.alt;
          else c = st.base;
        }
        if (d <= R - 1 && !st.stripes) {
          if (dx + dy > R * 0.6) c = c === st.seam ? c : st.dark;
          if (dx < -R * 0.3 && dy < -R * 0.3) c = c === st.seam ? c : st.light;
        }
        ctx.fillStyle = c;
        ctx.fillRect(Math.floor(cx + dx), Math.floor(cy + dy), 1, 1);
      }
    }
  }

  // ---------- HUD / text ----------
  const SILVER = ['#ffffff', '#eef2f8', '#d9e0ea', '#c3cddb', '#aebacb', '#97a5ba', '#8090a8'];
  const GOLD = ['#fff3a3', '#ffe46b', '#ffd544', '#ffc531', '#f7ad25', '#ea951e', '#d67c15'];
  const FIRE = ['#ffd23f', '#ffb52e', '#f89428', '#ee7426', '#e05427', '#cc3a2a', '#b3282a'];

  function title(ctx, y, cell) {
    const a = 'BASKET', b = 'RANDO';
    const wa = F.measure(a, cell), wb = F.measure(b, cell), gap = cell * 4;
    const total = wa + gap + wb, x0 = Math.round((BW - total) / 2);
    rect(ctx, '#000', 0, y - cell * 3, BW, cell * 13);
    rect(ctx, '#2b2b2b', 0, y - cell * 3 - 3, BW, 2);
    rect(ctx, '#2b2b2b', 0, y + cell * 10 + 1, BW, 2);
    F.draw(ctx, a, x0, y, cell, (row) => SILVER[row], { shadow: 2, shadowColor: '#3a4150' });
    F.draw(ctx, b, x0 + wa + gap, y, cell, (row) => GOLD[row], { shadow: 2, shadowColor: '#6a3a0a' });
  }

  function scoreBoxes(ctx, score, names) {
    // left / red
    rect(ctx, '#1b1b1b', -2, 233, 66, 40);
    rect(ctx, '#b3282a', 0, 235, 62, 37);
    rect(ctx, '#d23a2e', 0, 235, 62, 4);
    F.draw(ctx, String(score[0]), 31, 241, 4, (row) => (row < 3 ? '#ffe46b' : '#f6c63a'), { align: 'center', shadow: 2 });
    rect(ctx, '#1b1b1b', BW - 64, 233, 66, 40);
    rect(ctx, '#3a7cc8', BW - 62, 235, 62, 37);
    rect(ctx, '#5b9be0', BW - 62, 235, 62, 4);
    F.draw(ctx, String(score[1]), BW - 31, 241, 4, '#ffffff', { align: 'center', shadow: 2 });
    if (names) {
      F.draw(ctx, names[0], 4, 226, 1, '#ffffff', { outline: 1 });
      F.draw(ctx, names[1], BW - 4, 226, 1, '#ffffff', { outline: 1, align: 'right' });
    }
  }

  function playTriangle(ctx, cx, cy, s, hover) {
    const pts = [[-0.45, -0.6], [0.6, 0], [-0.45, 0.6]];
    const path = (k, dx, dy) => {
      ctx.beginPath();
      pts.forEach(([x, y], i) => { const px = Math.round(cx + x * s * k + dx), py = Math.round(cy + y * s * k + dy); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      ctx.closePath(); ctx.fill();
    };
    ctx.fillStyle = '#000'; path(1.18, 0, 0);
    ctx.fillStyle = hover ? '#fff7c2' : '#ffffff'; path(1, 1, 0);
  }

  root.Render = {
    S, BW, BH, GY, makeBackground, hoopBack, hoopFront, drawArm, drawBody, drawShadow, drawBall, title, scoreBoxes,
    playTriangle, rect, pline, FIRE, SILVER, GOLD, shade,
  };
})(window);
