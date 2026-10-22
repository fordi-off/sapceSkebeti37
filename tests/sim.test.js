const SS = require('./load')();
const idx = +(process.argv[2] || 1);
const tmax = +(process.argv[3] || 1500);
const pre = SS.Presets[idx];
const an = SS.analyze(pre.doc);
console.log(pre.name, 'wet', an.wet.toFixed(0), 'dv', an.dv.toFixed(0), 'twrSL', an.twrSL.toFixed(2), 'height', an.height.toFixed(1));
an.stages.forEach(s => console.log('  stage', s.stage, 'dv', s.dv.toFixed(0), 'burn', s.burn.toFixed(0), 'twrVac', s.twrVac.toFixed(2), 'twrSL', s.twrSL.toFixed(2)));
console.log(an.warnings);
const w = new SS.World();
const v = w.launch(pre.doc);
w.autopilot.targetAlt = 150000;
w.autopilot.autoWarp = false;
if (process.argv[4] !== 'noap') w.autopilot.start();
let next = 0;
const t0 = Date.now();
while (w.time < tmax) {
  w.update(1 / 30);
  const a = w.active;
  if (!a) break;
  if (w.time >= next) {
    next += +(process.env.DT || 20);
    const el = SS.orbit.elements(a.x, a.y, a.vx, a.vy);
    console.log(w.time.toFixed(0).padStart(5), w.autopilot.phase.padEnd(7), 'alt', (a.tel.alt / 1000).toFixed(1).padStart(6), 'vs', a.tel.vs.toFixed(0).padStart(5), 'spd', a.tel.speed.toFixed(0).padStart(5), 'orb', a.tel.orbSpeed.toFixed(0), 'M', a.tel.mach.toFixed(1), 'q', (a.tel.q / 1000).toFixed(1), 'thr', a.throttle.toFixed(2), 'm', (a.M / 1000).toFixed(1), 'th', (a.theta * 57.3).toFixed(0), 'aoa', (a.tel.aoa * 57.3).toFixed(1), 'ap', ((el.ap - SS.Planet.R) / 1000).toFixed(0), 'pe', ((el.pe - SS.Planet.R) / 1000).toFixed(0), 'heat', a.tel.heat.toFixed(2), 'parts', a.parts.length, 'n', w.vessels.length);
  }
  if (!w.autopilot.on && w.autopilot.phase === 'idle' && process.argv[4] !== 'noap' && w.time > 30) break;
}
console.log('events:'); w.events.filter(e => e.text).forEach(e => console.log('  ', e.t.toFixed(1), e.text));
console.log('real ms', Date.now() - t0);
