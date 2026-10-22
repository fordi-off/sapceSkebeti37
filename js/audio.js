/* Procedural sound: engine rumble scaled by thrust and air density, explosions and staging clunks (Web Audio, no assets). */
(function (g) {
  const SS = g.SS;
  const A = (SS.Audio = { on: true, ctx: null });
  let noiseBuf, engGain, engFilter, wind, windGain, windFilter, master, seen = 0, started = false;

  function makeNoise(ctx) {
    const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5 + w * 0.25; }
    return b;
  }

  A.start = function () {
    if (started || !A.on) return;
    const AC = g.AudioContext || g.webkitAudioContext;
    if (!AC) return;
    try {
      A.ctx = new AC();
      const c = A.ctx;
      master = c.createGain(); master.gain.value = 0.5; master.connect(c.destination);
      noiseBuf = makeNoise(c);
      const mk = () => { const s = c.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s; };
      const e = mk(); engFilter = c.createBiquadFilter(); engFilter.type = 'lowpass'; engFilter.frequency.value = 200;
      engGain = c.createGain(); engGain.gain.value = 0; e.connect(engFilter); engFilter.connect(engGain); engGain.connect(master); e.start();
      wind = mk(); windFilter = c.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.frequency.value = 800; windFilter.Q.value = 0.6;
      windGain = c.createGain(); windGain.gain.value = 0; wind.connect(windFilter); windFilter.connect(windGain); windGain.connect(master); wind.start();
      started = true;
    } catch (err) { A.ctx = null; }
  };

  A.stop = function () { if (engGain) { engGain.gain.value = 0; windGain.gain.value = 0; } };
  A.setOn = function (v) { A.on = v; if (!v) A.stop(); else A.start(); if (master) master.gain.value = v ? 0.5 : 0; };

  function burst(size, freq) {
    const c = A.ctx; if (!c || !A.on) return;
    const s = c.createBufferSource(); s.buffer = noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(freq, c.currentTime); f.frequency.exponentialRampToValueAtTime(60, c.currentTime + 1.6);
    const gn = c.createGain(); gn.gain.setValueAtTime(Math.min(1.2, size), c.currentTime); gn.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 1.8);
    s.connect(f); f.connect(gn); gn.connect(master); s.start(); s.stop(c.currentTime + 2);
  }
  A.boom = size => burst(size, 900);
  A.clunk = () => burst(0.25, 2500);

  A.update = function (world, paused) {
    if (!A.ctx || !A.on) return;
    const c = A.ctx, v = world.active;
    if (c.state === 'suspended') c.resume();
    let eng = 0, wd = 0, windF = 600;
    if (v && !paused && !world.railsWarp) {
      eng = Math.min(1, Math.sqrt(v.tel.thrust / 1.5e6)) * 0.6;
      const atm = SS.atmosphere(v.tel.alt);
      const air = Math.min(1, atm.P / 40000);
      eng *= 0.25 + 0.75 * air; // thin air = muffled
      wd = Math.min(0.5, Math.sqrt(v.tel.q) / 250) * air;
      windF = 400 + v.tel.speed * 1.2;
      engFilter.frequency.setTargetAtTime(120 + 500 * (v.throttle || 0) + (v.tel.thrust > 0 ? 100 : 0), c.currentTime, 0.1);
    }
    engGain.gain.setTargetAtTime(eng, c.currentTime, 0.12);
    windGain.gain.setTargetAtTime(wd, c.currentTime, 0.2);
    windFilter.frequency.setTargetAtTime(Math.min(6000, windF), c.currentTime, 0.2);
    // events since last call
    const ev = world.events;
    if (seen > ev.length) seen = 0;
    for (; seen < ev.length; seen++) {
      const e = ev[seen];
      if (e.boom) A.boom(0.6);
      else if (e.text && /Stage \d+ activated/.test(e.text)) A.clunk();
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
