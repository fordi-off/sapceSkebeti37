const SS = require('./load')();
const P = SS.Planet;
let fails = 0;
const check = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fails++; };
const run = (w, secs, fn) => { const n = secs * 30; for (let i = 0; i < n; i++) { w.update(1 / 30); fn && fn(i); } };

// 1. SRB + radial decoupler: lift off, separate boosters, core keeps flying
{
  const doc = SS.Craft.build('SRB test', ['chute_s', 'capsule_s', 'shield_s', 'tank_s4', 'eng_s', [3, 'dec_rad', 0.5], [5, 'srb_s', 0, true], [3, 'fin_s', -1.4]]);
  // radial SRBs attach to decouplers (indices 5,6 are the decouplers; 7,8 their children not yet built) -> build manually
  const d2 = SS.Craft.build('SRB test', ['chute_s', 'capsule_s', 'shield_s', 'tank_s4', 'eng_s']);
  const tank = d2.parts[3];
  for (const s of [1, -1]) {
    const dec = SS.Craft.add(d2, 'dec_rad', tank.x + s * (tank.x + 0.625 + 0.175), tank.y - 1, { side: s, parent: tank.id });
    const srbDef = SS.Parts.byId.srb_s;
    SS.Craft.add(d2, 'srb_s', dec.x + s * (0.175 + srbDef.w / 2), dec.y - 2.5, { side: s, parent: dec.id });
  }
  SS.Craft.autoStage(d2.parts);
  console.log('stages', d2.parts.filter(p => SS.Parts.byId[p.type].stageable).map(p => p.type + ':' + p.stage).join(' '));
  const an = SS.analyze(d2); console.log('analysis twr', an.twrSL.toFixed(2), 'dv', an.dv.toFixed(0), an.warnings);
  const w = new SS.World(); const v = w.launch(d2);
  v.stage(); v.throttle = 1;
  let split = false;
  run(w, 80, () => { if (w.vessels.length > 1) split = true; if (w.active.stageNum <= 1 && w.active.engines.filter(e => e.def.engine.solid && e.flameout).length === 2 && !w._sep) { w._sep = 1; w.active.stage(); } });
  check(split, 'boosters separated into new vessels');
  check(w.active && w.active.hasControl, 'capsule still active');
  console.log('alt', (w.active.tel.alt / 1000).toFixed(1), 'vessels', w.vessels.length, 'events', w.events.filter(e => e.text).map(e => e.text).join(' | '));
}

// 2. Crash: hopper falls without chute
{
  const w = new SS.World(); const v = w.launch(SS.Presets[0].doc);
  const hov = [v.x, v.y];
  const up = Math.atan2(v.y, v.x); v.x = (P.R + 1500) * Math.cos(up); v.y = (P.R + 1500) * Math.sin(up);
  run(w, 40);
  check(w.vessels.every(x => x.parts.length < 7), 'crash destroyed parts');
  console.log(w.events.filter(e => e.text).map(e => e.text).slice(0, 8).join(' | '));
}

// 3. Structural failure: fragile joints break in a normal ascent
{
  const w = new SS.World({ jointStrength: 0.05 }); const v = w.launch(SS.Presets[1].doc);
  w.autopilot.autoWarp = false; w.autopilot.start();
  run(w, 90);
  console.log('vessels', w.vessels.length, w.events.filter(e => e.text).map(e => e.text).slice(0, 6).join(' | '));
  check(w.events.some(e => /Structural/.test(e.text || '')), 'weak joints snap during ascent');
}

// 4. no structural failure in nominal autopilot flight
{
  const w = new SS.World(); w.launch(SS.Presets[1].doc); w.autopilot.autoWarp = false; w.autopilot.start();
  run(w, 480);
  check(!w.events.some(e => /Structural|destroyed/.test(e.text || '')), 'autopilot ascent without structural damage');
  const a = w.active; const el = SS.orbit.elements(a.x, a.y, a.vx, a.vy);
  check(el.pe - P.R > 90000, 'reached orbit pe=' + ((el.pe - P.R) / 1000).toFixed(0) + 'km');
  // rails warp for an orbit
  const t0 = a.x;
  w.setWarp(0); w.warpIndex = 0; const ok = w.setWarp(5);
  check(ok, 'rails warp allowed in orbit');
  const e0 = el.energy;
  for (let i = 0; i < 300; i++) w.update(1 / 30);
  const el2 = SS.orbit.elements(a.x, a.y, a.vx, a.vy);
  check(Math.abs(el2.energy - e0) / Math.abs(e0) < 1e-6, 'energy conserved on rails: ' + (el2.energy / e0).toFixed(9) + ' warp x' + w.warp + ' t=' + w.time.toFixed(0));
}
// 5. Heating: tumbling unshielded reentry kills parts
{
  const w = new SS.World(); const doc = SS.Craft.build('x', ['probe', 'tank_s2', 'eng_s']);
  const v = w.launch(doc);
  const r = P.R + 90000; v.x = r; v.y = 0; v.vx = -3000; v.vy = -7000; v.theta = Math.PI / 2; v.parts.forEach(p => 0);
  v.sasOn = false;
  run(w, 100);
  check(w.events.some(e => /overheated/.test(e.text || '')), 'unshielded craft overheats: ' + w.events.filter(e => e.text).map(e => e.text).slice(0, 4).join(' | '));
}
console.log(fails ? fails + ' FAILED' : 'ALL OK');
