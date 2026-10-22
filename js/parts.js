/* Part catalog. Dimensions in metres, masses in kg, forces in N.
 *  wTop / wBot : width of the top / bottom face (parts are bodies of revolution seen from the side)
 *  nodeTop / nodeBot : can other parts be stacked on that face?
 *  radial : can be attached to the side of another part
 */
(function (g) {
  const SS = g.SS;
  const G0 = SS.Planet.g0;
  const defs = [];
  const byId = {};

  function add(d) {
    d.wTop = d.wTop ?? d.w;
    d.wBot = d.wBot ?? d.w;
    d.w = d.w ?? (d.wTop + d.wBot) / 2;
    d.wMax = Math.max(d.wTop, d.wBot);
    d.wAvg = (d.wTop + d.wBot) / 2;
    d.nodeTop = d.nodeTop ?? true;
    d.nodeBot = d.nodeBot ?? true;
    d.fuel = d.fuel || 0;
    d.mass = d.mass || 0; // dry mass
    d.maxTemp = d.maxTemp ?? 1300;
    d.crash = d.crash ?? 7; // m/s impact tolerance
    d.cdF = d.cdF ?? 0.9; // drag coefficient when airflow hits the top face
    d.cdR = d.cdR ?? 0.9; // ... or the bottom face
    d.cdCross = d.cdCross ?? 1.15;
    d.latArea = d.latArea ?? d.h * d.wAvg;
    d.jd = d.jd ?? Math.max(0.3, Math.min(d.wMax, 3));
    d.cp = d.cp ?? 900;
    d.color = d.color || '#c9ced6';
    d.stageable = !!(d.engine || d.decoupler || d.chute);
    if (d.engine) {
      const e = d.engine;
      e.gimbal = (e.gimbal ?? 3) * (Math.PI / 180);
      if (e.slThrust && !e.vacThrust) e.vacThrust = (e.slThrust * e.ispVac) / e.ispSL;
      if (e.vacThrust && !e.slThrust) e.slThrust = (e.vacThrust * e.ispSL) / e.ispVac;
      e.mdot = e.vacThrust / (e.ispVac * G0); // kg/s at full throttle
    }
    defs.push(d);
    byId[d.id] = d;
    return d;
  }

  /* ---- Command ---- */
  add({ id: 'probe', cat: 'Command', name: 'Probe Core', desc: 'Unmanned guidance unit. Small reaction wheel.',
    kind: 'pod', w: 0.8, h: 0.6, mass: 150, pod: { rw: 700, crew: 0 }, color: '#aab4c4', maxTemp: 1200, cdF: 0.7, noseR: 0.4 });
  add({ id: 'capsule_s', cat: 'Command', name: 'Gumdrop Capsule', desc: '1 crew. Reentry-capable with a heat shield on its base.',
    kind: 'pod', wTop: 0.7, wBot: 1.25, h: 1.4, mass: 900, pod: { rw: 2500, crew: 1 }, color: '#d7d2c4', maxTemp: 1100, cdF: 0.45, cdR: 1.25, noseR: 1.2, crash: 9 });
  add({ id: 'capsule_m', cat: 'Command', name: 'Voyager Capsule', desc: '3 crew. Large reaction wheels.',
    kind: 'pod', wTop: 1.2, wBot: 2.5, h: 2.4, mass: 3600, pod: { rw: 12000, crew: 3 }, color: '#d7d2c4', maxTemp: 1100, cdF: 0.45, cdR: 1.25, noseR: 2.4, crash: 9 });

  /* ---- Structural / aero ---- */
  add({ id: 'cone_s', cat: 'Aero', name: 'Nose Cone 1.25 m', desc: 'Low-drag ogive.', kind: 'cone', wTop: 0.1, wBot: 1.25, h: 1.6, mass: 60, nodeTop: false, cdF: 0.14, cdR: 0.9, noseR: 0.12, color: '#e8e8ea', maxTemp: 1500 });
  add({ id: 'cone_m', cat: 'Aero', name: 'Nose Cone 2.5 m', desc: 'Low-drag ogive.', kind: 'cone', wTop: 0.15, wBot: 2.5, h: 3.0, mass: 320, nodeTop: false, cdF: 0.14, cdR: 0.9, noseR: 0.2, color: '#e8e8ea', maxTemp: 1500 });
  add({ id: 'cone_l', cat: 'Aero', name: 'Nose Cone 3.75 m', desc: 'Low-drag ogive.', kind: 'cone', wTop: 0.2, wBot: 3.75, h: 4.6, mass: 900, nodeTop: false, cdF: 0.14, cdR: 0.9, noseR: 0.3, color: '#e8e8ea', maxTemp: 1500 });
  add({ id: 'adapter_sm', cat: 'Aero', name: 'Adapter 1.25→2.5', desc: 'Widens the stack.', kind: 'adapter', wTop: 1.25, wBot: 2.5, h: 1.2, mass: 140, cdF: 0.4, color: '#c9ced6' });
  add({ id: 'adapter_ms', cat: 'Aero', name: 'Adapter 2.5→1.25', desc: 'Narrows the stack.', kind: 'adapter', wTop: 2.5, wBot: 1.25, h: 1.2, mass: 140, cdR: 0.4, color: '#c9ced6' });
  add({ id: 'adapter_ml', cat: 'Aero', name: 'Adapter 2.5→3.75', desc: 'Widens the stack.', kind: 'adapter', wTop: 2.5, wBot: 3.75, h: 1.6, mass: 450, cdF: 0.4, color: '#c9ced6' });
  add({ id: 'adapter_lm', cat: 'Aero', name: 'Adapter 3.75→2.5', desc: 'Narrows the stack.', kind: 'adapter', wTop: 3.75, wBot: 2.5, h: 1.6, mass: 450, cdR: 0.4, color: '#c9ced6' });
  add({ id: 'fin_s', cat: 'Aero', name: 'Fin', desc: 'Aerodynamic stabiliser. Place low on the stack (mirror it!).', kind: 'fin', w: 0.9, h: 2.0, mass: 55, radial: true, nodeTop: false, nodeBot: false, latArea: 2.2, fin: { area: 2.2 }, jd: 0.9, color: '#b33a3a', maxTemp: 1400, cdF: 0.05, cdR: 0.05 });
  add({ id: 'fin_l', cat: 'Aero', name: 'Large Fin', desc: 'Big stabiliser for heavy lifters.', kind: 'fin', w: 1.6, h: 3.6, mass: 220, radial: true, nodeTop: false, nodeBot: false, latArea: 7, fin: { area: 7 }, jd: 1.5, color: '#b33a3a', maxTemp: 1400, cdF: 0.05, cdR: 0.05 });

  /* ---- Fuel tanks (propellant = LOX/RP-1 mix, ~1030 kg/m³, 5.5 % dry fraction) ---- */
  const tank = (d, h, tag) => {
    const vol = Math.PI * (d / 2) ** 2 * h * 0.9;
    const fuel = Math.round((vol * 1030) / 10) * 10;
    const mass = Math.round(fuel * 0.055 + d * 12 * h * 0.3);
    add({ id: `tank_${tag}`, cat: 'Fuel', name: `Tank ${d} m × ${h} m`, desc: `${fuel} kg propellant.`, kind: 'tank', w: d, h, mass, fuel, color: '#e9eaee', maxTemp: 1200, cdF: 0.9, cdR: 0.9 });
  };
  [['s1', 1.25, 1], ['s2', 1.25, 2], ['s4', 1.25, 4], ['m2', 2.5, 2], ['m4', 2.5, 4], ['m8', 2.5, 8], ['l4', 3.75, 4], ['l8', 3.75, 8], ['l12', 3.75, 12]].forEach(([t, d, h]) => tank(d, h, t));

  /* ---- Engines ---- */
  add({ id: 'eng_vac_s', cat: 'Engines', name: 'Vac-80 (upper stage)', desc: 'High-expansion vacuum engine. Poor at sea level.',
    kind: 'engine', wTop: 1.25, wBot: 1.5, h: 1.9, mass: 310, nodeBotOnly: 'decoupler', engine: { vacThrust: 80e3, ispVac: 355, ispSL: 150, gimbal: 4 }, color: '#8a8f99', maxTemp: 1900, cdF: 0.9, cdR: 0.9, noseR: 0.6 });
  add({ id: 'eng_s', cat: 'Engines', name: 'Merlin-S 240 kN', desc: 'Compact sea-level kerolox engine.',
    kind: 'engine', wTop: 1.25, wBot: 1.0, h: 1.6, mass: 520, nodeBotOnly: 'decoupler', engine: { slThrust: 240e3, ispVac: 305, ispSL: 275, gimbal: 5 }, color: '#8a8f99', maxTemp: 1900, cdR: 0.9, noseR: 0.5 });
  add({ id: 'eng_m', cat: 'Engines', name: 'Merlin-M 1.1 MN', desc: 'Workhorse first-stage engine.',
    kind: 'engine', wTop: 2.5, wBot: 1.9, h: 2.8, mass: 1800, nodeBotOnly: 'decoupler', engine: { slThrust: 1100e3, ispVac: 311, ispSL: 282, gimbal: 5 }, color: '#8a8f99', maxTemp: 1900, noseR: 0.9 });
  add({ id: 'eng_vac_m', cat: 'Engines', name: 'Vac-450 (upper stage)', desc: 'Large vacuum engine for orbital insertion.',
    kind: 'engine', wTop: 2.5, wBot: 2.4, h: 3.4, mass: 1700, nodeBotOnly: 'decoupler', engine: { vacThrust: 450e3, ispVac: 348, ispSL: 190, gimbal: 4 }, color: '#8a8f99', maxTemp: 1900, noseR: 1.2 });
  add({ id: 'eng_l', cat: 'Engines', name: 'Titan-L 4.5 MN', desc: 'Enormous first-stage engine for super-heavy lifters.',
    kind: 'engine', wTop: 3.75, wBot: 3.2, h: 4.5, mass: 7500, nodeBotOnly: 'decoupler', engine: { slThrust: 4500e3, ispVac: 300, ispSL: 263, gimbal: 5 }, color: '#8a8f99', maxTemp: 1900, noseR: 1.6 });
  add({ id: 'srb_s', cat: 'Engines', name: 'Solid Booster 1.25 m', desc: 'Cannot be throttled or shut down. Radial or inline.',
    kind: 'srb', wTop: 1.0, wBot: 1.25, h: 8, mass: 700, fuel: 6500, radial: true, nodeBot: false, jd: 1.25,
    engine: { slThrust: 520e3, ispVac: 262, ispSL: 236, gimbal: 0, solid: true }, color: '#d9d9d6', maxTemp: 1500, cdF: 0.2, noseR: 0.3 });
  add({ id: 'srb_m', cat: 'Engines', name: 'Solid Booster 2.5 m', desc: 'Big strap-on booster. Cannot be throttled.',
    kind: 'srb', wTop: 1.6, wBot: 2.5, h: 14, mass: 4200, fuel: 40000, radial: true, nodeBot: false, jd: 2.0,
    engine: { slThrust: 3200e3, ispVac: 270, ispSL: 245, gimbal: 0, solid: true }, color: '#d9d9d6', maxTemp: 1500, cdF: 0.2, noseR: 0.5 });

  /* ---- Separation ---- */
  add({ id: 'dec_s', cat: 'Staging', name: 'Decoupler 1.25 m', desc: 'Separates everything below it when staged.', kind: 'decoupler', w: 1.25, h: 0.25, mass: 60, decoupler: { impulse: 2500 }, color: '#d98b2b' });
  add({ id: 'dec_m', cat: 'Staging', name: 'Decoupler 2.5 m', desc: 'Separates everything below it when staged.', kind: 'decoupler', w: 2.5, h: 0.3, mass: 220, decoupler: { impulse: 9000 }, color: '#d98b2b' });
  add({ id: 'dec_l', cat: 'Staging', name: 'Decoupler 3.75 m', desc: 'Separates everything below it when staged.', kind: 'decoupler', w: 3.75, h: 0.4, mass: 620, decoupler: { impulse: 20000 }, color: '#d98b2b' });
  add({ id: 'dec_rad', cat: 'Staging', name: 'Radial Decoupler', desc: 'Mount on the side of a stack, then attach a booster to its outer face.', kind: 'decoupler', w: 0.35, h: 0.6, mass: 45, radial: true, nodeTop: false, nodeBot: false, jd: 1.8, decoupler: { impulse: 4000, radial: true }, color: '#d98b2b' });

  /* ---- Recovery / landing ---- */
  add({ id: 'shield_s', cat: 'Recovery', name: 'Heat Shield 1.25 m', desc: 'Ablative shield that doubles as a decoupler. Mount under a capsule and fly it blunt-end first.', kind: 'shield', w: 1.25, h: 0.14, mass: 180, nodeTop: true, nodeBot: true, shield: { ablator: 60 }, decoupler: { impulse: 1800 }, crash: 16, maxTemp: 3200, cp: 1500, cdF: 0.9, cdR: 1.35, noseR: 1.8, color: '#5a4a3f' });
  add({ id: 'shield_m', cat: 'Recovery', name: 'Heat Shield 2.5 m', desc: 'Ablative shield that doubles as a decoupler. Fly it blunt-end first.', kind: 'shield', w: 2.5, h: 0.2, mass: 700, nodeTop: true, nodeBot: true, shield: { ablator: 260 }, decoupler: { impulse: 6000 }, crash: 16, maxTemp: 3200, cp: 1500, cdF: 0.9, cdR: 1.35, noseR: 3.5, color: '#5a4a3f' });
  add({ id: 'chute_s', cat: 'Recovery', name: 'Parachute', desc: 'Mount on top. Reefs automatically at high speed; tears if opened too fast.', kind: 'chute', w: 0.6, h: 0.4, mass: 45, nodeTop: false, chute: { area: 150, cd: 1.5, fMax: 220e3 }, maxTemp: 500, cdF: 0.5, color: '#e2602a', crash: 10 });
  add({ id: 'chute_m', cat: 'Recovery', name: 'Large Parachute', desc: 'For heavy capsules.', kind: 'chute', w: 1.0, h: 0.5, mass: 160, nodeTop: false, chute: { area: 380, cd: 1.5, fMax: 600e3 }, maxTemp: 500, cdF: 0.5, color: '#e2602a', crash: 10 });
  add({ id: 'leg_s', cat: 'Recovery', name: 'Landing Leg', desc: 'Absorbs landings. Mirror it for a pair.', kind: 'leg', w: 1.2, h: 2.4, mass: 90, radial: true, nodeTop: false, nodeBot: false, jd: 1.0, latArea: 0.5, crash: 14, contactK: 35, color: '#9aa1ad' });
  add({ id: 'leg_l', cat: 'Recovery', name: 'Heavy Landing Leg', desc: 'For booster landings.', kind: 'leg', w: 2.4, h: 4.8, mass: 520, radial: true, nodeTop: false, nodeBot: false, jd: 1.8, latArea: 1.2, crash: 16, contactK: 25, color: '#9aa1ad' });

  SS.Parts = {
    list: defs,
    byId,
    cats: ['Command', 'Fuel', 'Engines', 'Staging', 'Aero', 'Recovery'],
    get: id => byId[id],
  };
})(typeof window !== 'undefined' ? window : globalThis);
