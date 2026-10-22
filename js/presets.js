/* Example vehicles shipped with the game. */
(function (g) {
  const SS = g.SS;
  const B = SS.Craft.build;
  SS.Presets = [
    {
      name: 'Hopper Mk1',
      desc: 'Single-stage suborbital hopper. Fly up, fall back, pop the chute.',
      doc: B('Hopper Mk1', ['chute_s', 'capsule_s', 'shield_s', 'tank_s4', 'eng_s', [3, 'fin_s', -1.4]]),
    },
    {
      name: 'Orbiter-1',
      desc: 'Two-stage kerolox rocket with a heat-shielded capsule. Enough delta-v for low Earth orbit and a ballistic return.',
      doc: B('Orbiter-1', ['chute_s', 'capsule_s', 'shield_s', 'tank_s4', 'eng_vac_s', 'dec_s', 'adapter_sm', 'tank_m8', 'tank_m8', 'eng_m', [8, 'fin_l', -2.5]]),
    },
  ];
})(typeof window !== 'undefined' ? window : globalThis);
