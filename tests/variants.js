const SS = require('./load')();
const B = SS.Craft.build;
const variants = {
  A: () => B('A', ['chute_m','capsule_m','shield_m','tank_m4','eng_vac_m','dec_m','adapter_ml','tank_l12','eng_l']),
  B: () => B('B', ['chute_m','capsule_m','shield_m','tank_m4','eng_vac_m','dec_m','adapter_ml','tank_l8','tank_l8','eng_l']),
  C: () => B('C', ['chute_m','capsule_m','shield_m','tank_m4','eng_vac_m','dec_m','adapter_ml','tank_l8','eng_l']),
  D: () => B('D', ['chute_m','capsule_m','shield_m','tank_m4','eng_vac_m','dec_m','adapter_ml','tank_l8','eng_l',[7,'dec_rad',2],[9,'srb_m',-1.3,false,1],[10,'srb_m',-1.3,false,-1]]),
  F: () => B('F', ['chute_m','capsule_m','shield_m','tank_m8','eng_vac_m','dec_m','adapter_ml','tank_l8','tank_l8','eng_l',[8,'dec_rad',2],[10,'srb_m',-1.3,false,1],[11,'srb_m',-1.3,false,-1]]),
  G: () => B('G', ['chute_m','capsule_m','shield_m','tank_m8','eng_vac_m','dec_m','adapter_ml','tank_l12','eng_l',[7,'dec_rad',2],[9,'srb_m',-1.3,false,1],[10,'srb_m',-1.3,false,-1]]),
  E: () => B('E', ['chute_m','capsule_m','shield_m','tank_m4','eng_vac_m','dec_m','adapter_ml','tank_l8','tank_l8','eng_l',[8,'dec_rad',2],[10,'srb_m',-1.3,false,1],[11,'srb_m',-1.3,false,-1]]),
};
for (const [k, f] of Object.entries(variants)) {
  const doc = f(); const a = SS.analyze(doc);
  console.log(k, 'wet', (a.wet/1000).toFixed(0), 't dv', a.dv.toFixed(0), 'twrSL', a.twrSL.toFixed(2), a.stages.map(s=>s.stage+':'+s.dv.toFixed(0)+'/'+s.twrVac.toFixed(2)).join(' '), a.warnings);
}
