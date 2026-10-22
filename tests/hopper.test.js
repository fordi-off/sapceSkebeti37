const SS = require('./load')();
const w = new SS.World(); const v = w.launch(SS.Presets[0].doc);
v.stage(); v.throttle = 1; v.sasOn = true;
let step = 0, staged = 0, maxAlt = 0, landed = false;
for (let i = 0; i < 30 * 1400; i++) {
  w.update(1 / 30);
  const a = w.active; if (!a) break;
  maxAlt = Math.max(maxAlt, a.tel.alt);
  // at apogee fire shield separation, chute when below 6 km
  if (staged === 0 && a.tel.fuel === 0 && a.tel.vs < 0 && a.stageNum === 1) { a.stage(); staged = 1; }
  if (staged === 1 && a.tel.alt < 5000 && w.active.nextStage() >= 0) { a.stage(); staged = 2; a.sasMode = 'retrograde'; }
  if (a.landed && a.tel.speed < 0.5 && i > 300) { landed = true; break; }
}
const a = w.active;
console.log('maxAlt km', (maxAlt / 1000).toFixed(1), 'landed', landed, 't', w.time.toFixed(0), 'parts', a && a.parts.map(p => p.type).join(','));
console.log(w.events.filter(e => e.text).map(e => e.t.toFixed(0) + ' ' + e.text).join('\n'));
