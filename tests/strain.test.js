const SS = require('./load')();
const P = SS.Planet;
for (const off of [5, 10, 20, 40, 90]) {
  const w = new SS.World(); const v = w.launch(SS.Presets[1].doc);
  const alt = 10000, sp = 450;
  v.x = 0; v.y = P.R + alt; v.vx = sp * 0.2 - P.omega * 0 + (-P.omega * v.y) * 1; v.vy = sp * 0.98; v.theta = off / 57.3;
  // velocity roughly up along +y; nose tilted by 'off'
  v.vx = -P.omega * v.y + 0; v.vy = sp;
  v.stage(); v.throttle = 0; v.sasOn = false; 
  let maxS = 0, brk = null, maxAoa = 0;
  for (let i = 0; i < 120; i++) { w.stepAll(1 / 120); for (const p of v.parts) maxS = Math.max(maxS, p.strain || 0); maxAoa = Math.max(maxAoa, Math.abs(v.tel.aoa)); if (w.vessels.length > 1 && !brk) brk = i / 120; }
  console.log('AoA0', off, 'maxStrain', maxS.toFixed(2), 'q', (v.tel.q / 1000).toFixed(0), 'kPa', 'break at', brk, 'parts', v.parts.length, 'vessels', w.vessels.length);
}
