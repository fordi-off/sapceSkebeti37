const SS = require('./load')();
for (let idx = 0; idx < SS.Presets.length; idx++) {
  const w = new SS.World(); w.launch(SS.Presets[idx].doc); const ap = w.autopilot; ap.targetAlt = 150000; ap.autoWarp = false; ap.start();
  while (w.time < 1500) { w.update(1 / 30); if (!ap.on && ap.phase === 'idle' && w.time > 30) break; }
  const a = w.active; const el = SS.orbit.elements(a.x, a.y, a.vx, a.vy);
  const ok = w.events.some(e => /orbit achieved/.test(e.text || ''));
  console.log(SS.Presets[idx].name, 'profExp', ap.profExp.toFixed(2), ok ? 'ORBIT' : 'no orbit', 't', w.time.toFixed(0), 'ap', ((el.ap - SS.Planet.R) / 1000).toFixed(0), 'pe', ((el.pe - SS.Planet.R) / 1000).toFixed(0), 'fuelLeft', a.tel.fuel.toFixed(0));
}
