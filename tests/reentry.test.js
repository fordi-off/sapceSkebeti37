const SS = require('./load')();
const P = SS.Planet;
const w = new SS.World(); const v = w.launch(SS.Presets[1].doc);
w.autopilot.autoWarp=false; w.autopilot.start();
while (w.time < 1000 && w.autopilot.on) w.update(1/30);
console.log('orbit?', w.autopilot.phase, w.time.toFixed(0));
let a = w.active;
// keep only the capsule stack: stage till the decoupler under the capsule fires
while (a.nextStage() >= 0 && a.parts.length > 5) a.stage();
a = w.active; console.log('parts', a.parts.map(p => p.type).join(','), 'vessels', w.vessels.length);
// deorbit burn: slow down
const f = +(process.argv[2] || 0.985);
a.vx *= f; a.vy *= f;
// coast on rails down to 120 km
let s = [a.x, a.y, a.vx, a.vy], t = 0;
while (Math.hypot(s[0], s[1]) - P.R > 120000 && t < 6000) { s = SS.orbit.propagate(a.x, a.y, a.vx, a.vy, t += 5); }
a.x = s[0]; a.y = s[1]; a.vx = s[2]; a.vy = s[3]; w.time += t;
w.vessels = [a];
a.sasOn = true; a.sasMode = 'retrograde'; a.sasRef = 'surface';
a.theta = Math.atan2(a.vx, -a.vy) ; // nose opposite velocity
console.log('start alt', (Math.hypot(a.x, a.y) - P.R) / 1000, 'speed', Math.hypot(a.vx, a.vy));
let next = 0, maxHeat = 0, maxG = 0;
const t0 = w.time;
let chuteDone = false;
while (w.time - t0 < 3000) {
  w.update(1 / 30);
  const a2 = w.active; if (!a2) break;
  const tel = a2.tel;
  maxHeat = Math.max(maxHeat, tel.heat); maxG = Math.max(maxG, tel.g);
  if (!chuteDone && tel.alt < 8000 && tel.speed < 400) { a2.stage(); chuteDone = true; }
  if (w.time - t0 >= next) { next += 20; console.log((w.time - t0).toFixed(0), 'alt', (tel.alt / 1000).toFixed(1), 'spd', tel.speed.toFixed(0), 'M', tel.mach.toFixed(1), 'q', (tel.q / 1000).toFixed(1), 'g', tel.g.toFixed(1), 'heat', tel.heat.toFixed(2), 'th', (a2.theta * 57.3).toFixed(0), 'aoa', (tel.aoa * 57.3).toFixed(0), 'parts', a2.parts.length, 'shT', (a2.parts.find(p=>p.type==='shield_s')||{}).temp?.toFixed(0), 'abl', (a2.parts.find(p=>p.type==='shield_s')||{}).ablator?.toFixed(1), a2.landed ? 'LANDED' : ''); }
  if (a2.landed && tel.speed < 1) break;
}
console.log('maxHeat', maxHeat.toFixed(2), 'maxG', maxG.toFixed(1)); w.events.filter(e => e.text).forEach(e => console.log('  ', e.t.toFixed(0), e.text));
