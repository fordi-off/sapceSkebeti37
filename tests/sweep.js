const SS = require('./load')();
const idx=+(process.argv[2]||1);
for (const exp of [0.7,0.85,1.0,1.2]) for (const pa of [55000,70000,90000]) {
  const w=new SS.World(); w.launch(SS.Presets[idx].doc); const ap=w.autopilot; ap.targetAlt=150000; ap.autoWarp=false; ap.profExp=exp; ap.profAlt=pa; ap.start();
  let last='';
  while(w.time<1200){ w.update(1/30); if(!ap.on&&ap.phase==='idle'&&w.time>30)break;}
  const a=w.active; const el=SS.orbit.elements(a.x,a.y,a.vx,a.vy);
  console.log('exp',exp,'profAlt',pa,'t',w.time.toFixed(0),'ap',((el.ap-SS.Planet.R)/1000).toFixed(0),'pe',((el.pe-SS.Planet.R)/1000).toFixed(0),'fuel',a.tel.fuel.toFixed(0), w.events.filter(e=>/lost|Struct|destroyed|orbit achieved|propellant/.test(e.text||'')).map(e=>e.text).slice(0,2).join(';'));
}
