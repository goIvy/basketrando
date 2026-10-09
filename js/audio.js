// Tiny synthesized sound effects (WebAudio, no assets).
(function (root) {
  'use strict';
  let ac = null, master = null, muted = false;
  const last = {};

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = 0.35;
    master.connect(ac.destination);
  }

  function limit(name, ms) {
    const now = performance.now();
    if (last[name] && now - last[name] < ms) return false;
    last[name] = now;
    return true;
  }

  function tone(type, f0, f1, dur, vol, delay) {
    if (!ac || muted) return;
    const t = ac.currentTime + (delay || 0);
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, freq) {
    if (!ac || muted) return;
    const t = ac.currentTime;
    const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq || 1200;
    g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t);
  }

  const Sfx = {
    init,
    toggleMute() { muted = !muted; return muted; },
    get muted() { return muted; },
    jump(team) { if (limit('jump' + team, 60)) tone('square', team ? 210 : 180, team ? 460 : 420, 0.12, 0.08); },
    bounce(v) { if (limit('bounce', 50)) tone('sine', 140, 60, 0.12, Math.min(0.5, v / 20)); },
    rim(v) { if (limit('rim', 60)) { tone('triangle', 900, 860, 0.18, Math.min(0.25, v / 30)); tone('triangle', 1370, 1300, 0.12, Math.min(0.12, v / 50)); } },
    hit() { if (limit('hit', 70)) noise(0.05, 0.25, 600); },
    land() { if (limit('land', 80)) noise(0.06, 0.18, 300); },
    catch() { if (limit('catch', 80)) tone('square', 520, 700, 0.05, 0.06); },
    throw() { if (limit('throw', 80)) noise(0.12, 0.2, 2200); },
    steal() { tone('square', 700, 400, 0.08, 0.07); },
    score() {
      noise(0.35, 0.25, 3000);
      [523, 659, 784, 1047].forEach((f, i) => tone('square', f, f, 0.14, 0.08, 0.08 + i * 0.09));
    },
    win() { [392, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone('square', f, f, 0.18, 0.09, i * 0.13)); },
    click() { tone('square', 660, 880, 0.06, 0.07); },
  };
  root.Sfx = Sfx;
})(window);
