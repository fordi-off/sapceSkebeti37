const SS = require('./load')();
const doc = SS.Craft.build('lander', ['chute_s', 'capsule_s', 'tank_s2', 'eng_s', [3, 'leg_s', 0.3]]);
console.log(doc.parts.map(p => p.type + '@' + p.x.toFixed(2) + ',' + p.y.toFixed(2)).join(' '));
const w = new SS.World(); const v = w.launch(doc);
for (let i = 0; i < 30 * 40; i++) w.update(1 / 30);
console.log('landed', v.landed, 'theta deg', (v.theta * 57.3 - (Math.atan2(v.y, v.x) - Math.PI / 2) * 57.3).toFixed(3), 'alt', v.tel.alt.toFixed(3), 'parts', v.parts.length, 'speed', v.tel.speed.toFixed(3), w.events.filter(e => e.text).map(e => e.text).join('|'));
// drop it from 6 m
const w2 = new SS.World(); const v2 = w2.launch(doc);
const r = Math.hypot(v2.x, v2.y); v2.x *= (r + 6) / r; v2.y *= (r + 6) / r;
for (let i = 0; i < 30 * 30; i++) w2.update(1 / 30);
console.log('dropped 6m:', 'landed', v2.landed, 'parts', v2.parts.length, w2.events.filter(e => e.text).map(e => e.text).join('|'));
// drop from 40m at ~ 28 m/s -> should break stuff
const w3 = new SS.World(); const v3 = w3.launch(doc);
const r3 = Math.hypot(v3.x, v3.y); v3.x *= (r3 + 40) / r3; v3.y *= (r3 + 40) / r3;
for (let i = 0; i < 30 * 30; i++) w3.update(1 / 30);
console.log('dropped 40m:', 'parts', w3.vessels.map(v => v.parts.length).join(','), w3.events.filter(e => e.text).map(e => e.text).join('|'));
