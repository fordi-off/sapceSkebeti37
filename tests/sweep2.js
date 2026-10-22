const SS = require('./load')();
const idx = +(process.argv[2] || 2);
for (const pa of [30000, 40000, 55000]) for (const pe of [0.6, 0.8, 1.0, 1.3]) {
  const w = new SS.World(); w.launch(SS.Presets[idx].doc); const ap = w.autopilot; ap.targetAlt = 150000; ap.autoWarp = false; ap.mode = 'alt'; ap.profAlt = pa; ap.profExp = pe; ap.start();
  while (w.time < 1500) { w.update(1 / 30); if (!ap.on && ap.phase === 'idle' && w.time > 30) break; }
  const a = w.active; const el = SS.orbit.elements(a.x, a.y, a.vx, a.vy);
  const ok = w.events.some(e => /orbit achieved/.test(e.text || ''));
  console.log('pa', pa, 'pe', pe, ok ? 'ORBIT' : 'fail ', 't', w.time.toFixed(0), 'ap', ((el.ap - SS.Planet.R) / 1000).toFixed(0), 'pe', ((el.pe - SS.Planet.R) / 1000).toFixed(0), 'fuelLeft', a.tel.fuel.toFixed(0));
}
