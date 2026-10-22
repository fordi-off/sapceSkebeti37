/* App shell: screens, menu, storage, dialogs. */
(function (g) {
  const SS = g.SS;
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };

  const App = (SS.App = {});
  let current = 'menu';

  App.settings = () => Object.assign({}, SS.defaultSettings, LS.get('ss.settings', {}));
  App.crafts = () => LS.get('ss.crafts', {});
  App.saveCraft = doc => { const c = App.crafts(); c[doc.name] = doc; LS.set('ss.crafts', c); };
  App.lastCraft = () => LS.get('ss.last', null);

  function show(name) {
    current = name;
    for (const id of ['menu', 'builder', 'flight']) $('#' + id).classList.toggle('hidden', id !== name);
    if (name !== 'builder') SS.Builder.close();
    if (name !== 'flight') SS.Flight.close();
    if (name === 'menu') { menuLoop(); refreshMenu(); }
  }

  App.showMenu = () => show('menu');
  App.openBuilder = doc => { show('builder'); SS.Builder.open(doc || App.lastCraft() || SS.Presets[1].doc); };
  App.launch = doc => {
    LS.set('ss.last', doc);
    show('flight');
    SS.Flight.open(doc);
  };
  App.revertToBuilder = () => App.openBuilder(LS.get('ss.last', null));

  /* ------------------------------------------------------------ modal */
  function modal(title, body, buttons) {
    $('#modal-title').textContent = title;
    const b = $('#modal-body'); b.innerHTML = '';
    typeof body === 'string' ? (b.innerHTML = body) : b.appendChild(body);
    const bt = $('#modal-btns'); bt.innerHTML = '';
    for (const [label, fn, cls] of buttons || [['Close', null]]) {
      const x = el('button', cls || '', label);
      x.onclick = () => { if (!fn || fn() !== false) closeModal(); };
      bt.appendChild(x);
    }
    $('#modal').classList.remove('hidden');
  }
  function closeModal() { $('#modal').classList.add('hidden'); }
  App.modal = modal;

  /* ------------------------------------------------------------ dialogs */
  function craftList(onPick, withDelete) {
    const box = el('div', 'list');
    const crafts = App.crafts();
    const names = Object.keys(crafts);
    if (!names.length) box.appendChild(el('div', 'hint', 'No saved crafts yet. Build one in the Vehicle Assembly and press Save.'));
    for (const n of names) {
      const doc = crafts[n];
      const a = SS.analyze(doc);
      const row = el('div', 'li');
      row.appendChild(el('div', 'liinfo', `<b>${n}</b><span>${doc.parts.length} parts · ${SS.fmt.mass(a.wet)} · Δv ${a.dv.toFixed(0)} m/s</span>`));
      const open = el('button', '', 'Open'); open.onclick = () => { closeModal(); onPick(doc); };
      row.appendChild(open);
      if (withDelete) { const d = el('button', 'danger', '✕'); d.onclick = () => { if (confirm(`Delete "${n}"?`)) { const c = App.crafts(); delete c[n]; LS.set('ss.crafts', c); row.remove(); } }; row.appendChild(d); }
      box.appendChild(row);
    }
    return box;
  }

  function examples(launchDirect) {
    const box = el('div', 'list');
    for (const p of SS.Presets) {
      const a = SS.analyze(p.doc);
      const row = el('div', 'li');
      row.appendChild(el('div', 'liinfo', `<b>${p.name}</b><span>${p.desc}</span><span>${p.doc.parts.length} parts · ${SS.fmt.mass(a.wet)} · Δv ${a.dv.toFixed(0)} m/s · TWR ${a.twrSL.toFixed(2)}</span>`));
      const ed = el('button', '', 'Edit'); ed.onclick = () => { closeModal(); App.openBuilder(p.doc); };
      const la = el('button', 'go', 'Launch'); la.onclick = () => { closeModal(); App.launch(p.doc); };
      row.append(ed, la);
      box.appendChild(row);
    }
    return box;
  }

  App.openSettings = function () {
    const s = App.settings();
    const box = el('div', 'form');
    const mk = (key, label, desc) => {
      const row = el('label', 'frow', `<input type="checkbox" ${s[key] ? 'checked' : ''}><span><b>${label}</b><em>${desc}</em></span>`);
      row.querySelector('input').onchange = e => { s[key] = e.target.checked; LS.set('ss.settings', s); SS.Flight.refreshSettings(); };
      box.appendChild(row);
    };
    mk('heating', 'Aerodynamic heating', 'Parts heat up at hypersonic speed and burn up past their temperature limit.');
    mk('structural', 'Structural failure', 'Joints snap when aerodynamic, thrust or impact loads exceed their strength.');
    mk('crashDamage', 'Impact damage', 'Parts that hit the ground too fast are destroyed.');
    const row = el('label', 'frow', `<span><b>Joint strength ×<span id="js-val">${s.jointStrength}</span></b><em>Scale the strength of every joint. Lower = more fragile rockets.</em></span><input type="range" min="0.3" max="4" step="0.1" value="${s.jointStrength}">`);
    row.querySelector('input').oninput = e => { s.jointStrength = +e.target.value; $('#js-val').textContent = s.jointStrength; LS.set('ss.settings', s); SS.Flight.refreshSettings(); };
    box.appendChild(row);
    modal('Simulation Settings', box, [['Done', null, 'go']]);
  };

  function help() {
    modal('How to Play', `
      <div class="help">
      <h4>1 · Build</h4>
      <p>In the <b>Vehicle Assembly</b> pick a command pod, stack fuel tanks and engines beneath it, put a <b>decoupler</b> between stages and fins at the bottom. Side-mounted parts snap to the sides and appear in mirrored pairs. The panel on the right shows mass, Δv per stage, liftoff thrust-to-weight and whether the craft is aerodynamically stable (centre of pressure behind centre of mass).</p>
      <h4>2 · Launch</h4>
      <p><kbd>Space</kbd> ignites stage 0 and fires later stages. <kbd>Shift</kbd>/<kbd>Ctrl</kbd> set the throttle, <kbd>A</kbd>/<kbd>D</kbd> rotate, <kbd>T</kbd> toggles SAS. <kbd>G</kbd> engages the <b>auto-ascent</b> autopilot (gravity turn, staging, circularisation). To fly by hand: climb straight up to ~1 km, tilt toward the horizon with <kbd>D</kbd>, then use SAS <b>prograde</b>; throttle back near max-Q; coast to apoapsis and burn horizontally to circularise.</p>
      <h4>3 · Physics you will feel</h4>
      <ul>
      <li>Gravity follows the inverse-square law around an Earth-sized planet that rotates (equator launch gives +465 m/s eastwards).</li>
      <li>ISA atmosphere: drag scales with density × speed², with a transonic wave-drag spike. Fins and wide bodies move the centre of pressure.</li>
      <li>Engines lose efficiency at sea level (Isp depends on ambient pressure). Vacuum engines are poor in thick air.</li>
      <li>Hypersonic parts glow and burn up unless protected — return a capsule heat-shield-first. Parachutes are reefed automatically but tear if opened too fast.</li>
      <li>Joints have limited strength: excessive angle of attack at max-Q, hard gimbaling or a hard landing will snap them. Broken stages become separate objects.</li>
      <li>Time warp: physics warp ×2/×4 anywhere; on-rails warp up to ×100000 in space (Kepler orbit propagation).</li>
      </ul>
      <h4>Keys</h4>
      <p><kbd>M</kbd> map · <kbd>.</kbd> <kbd>,</kbd> warp · <kbd>/</kbd> realtime · <kbd>1</kbd>-<kbd>5</kbd> SAS hold/pro/retro/radial · <kbd>P</kbd> arm parachutes · <kbd>[</kbd> <kbd>]</kbd> switch vessel · <kbd>C</kbd> reset camera · mouse wheel zoom · <kbd>Esc</kbd> pause</p>
      </div>`, [['Got it', null, 'go']]);
  }

  function exportDlg() {
    const ta = el('textarea'); ta.value = JSON.stringify(SS.Builder.doc); ta.readOnly = true; ta.rows = 8;
    modal('Export craft (copy this text)', ta, [['Copy', () => { ta.select(); try { document.execCommand('copy'); } catch (e) { /* ignore */ } return false; }], ['Close', null]]);
  }
  function importDlg() {
    const ta = el('textarea'); ta.rows = 8; ta.placeholder = 'Paste craft JSON here';
    modal('Import craft', ta, [['Import', () => {
      try {
        const d = JSON.parse(ta.value);
        if (!d.parts || !Array.isArray(d.parts)) throw new Error('bad');
        d.parts = d.parts.filter(p => SS.Parts.byId[p.type]);
        d.next = d.next || Math.max(0, ...d.parts.map(p => p.id)) + 1;
        App.openBuilder(d);
      } catch (e) { alert('That does not look like a valid craft.'); return false; }
    }, 'go'], ['Cancel', null]]);
  }
  function saveDlg() {
    const doc = SS.Builder.doc;
    if (!doc.parts.length) return;
    App.saveCraft(doc);
    LS.set('ss.last', doc);
    toast(`Saved "${doc.name}"`);
  }
  function toast(t) {
    const d = el('div', 'toast', t); document.body.appendChild(d);
    setTimeout(() => d.classList.add('out'), 1600); setTimeout(() => d.remove(), 2200);
  }

  /* ------------------------------------------------------------ menu */
  function refreshMenu() {
    const last = App.lastCraft();
    $('#m-quick-name').textContent = last ? '— ' + last.name : '— Orbiter-1';
  }

  let bgRaf = 0, bgT = 0;
  function menuLoop() {
    cancelAnimationFrame(bgRaf);
    const cv = $('#bg'), c = cv.getContext('2d');
    const fit = () => { cv.width = innerWidth; cv.height = innerHeight; };
    fit();
    const rocket = SS.Presets[1].doc;
    const step = t => {
      if (current !== 'menu') return;
      bgRaf = requestAnimationFrame(step);
      if (cv.width !== innerWidth || cv.height !== innerHeight) fit();
      const W = cv.width, H = cv.height;
      bgT = t / 1000;
      const g1 = c.createLinearGradient(0, 0, 0, H); g1.addColorStop(0, '#02030a'); g1.addColorStop(1, '#0a1630');
      c.fillStyle = g1; c.fillRect(0, 0, W, H);
      for (const s of SS.Render.stars) { c.fillStyle = `rgba(255,255,255,${(s[2] * (0.6 + 0.4 * Math.sin(bgT * s[3] + s[0] * 50))).toFixed(2)})`; c.fillRect(s[0] * W, s[1] * H * 0.9, s[3], s[3]); }
      // planet limb
      const R = Math.max(W, H) * 1.6, cx = W * 0.62, cy = H + R * 0.78;
      const atm = c.createRadialGradient(cx, cy, R * 0.98, cx, cy, R * 1.05);
      atm.addColorStop(0, 'rgba(100,170,255,0.55)'); atm.addColorStop(1, 'rgba(100,170,255,0)');
      c.fillStyle = atm; c.beginPath(); c.arc(cx, cy, R * 1.05, 0, 7); c.fill();
      const pg = c.createRadialGradient(cx - R * 0.2, cy - R * 0.4, R * 0.1, cx, cy, R);
      pg.addColorStop(0, '#3f78b8'); pg.addColorStop(0.7, '#1c4478'); pg.addColorStop(1, '#0b1f3d');
      c.fillStyle = pg; c.beginPath(); c.arc(cx, cy, R, 0, 7); c.fill();
      c.save(); c.beginPath(); c.arc(cx, cy, R, 0, 7); c.clip(); c.translate(cx, cy); c.rotate(bgT * 0.004);
      c.fillStyle = 'rgba(80,150,90,0.7)';
      for (let i = 0; i < 14; i++) { const a = SS.Render.hash(i * 3.3) * 6.28, r = R * (0.92 + 0.07 * SS.Render.hash(i + 1)); c.beginPath(); c.ellipse(Math.cos(a) * r, Math.sin(a) * r, R * 0.07, R * 0.04, a, 0, 7); c.fill(); }
      c.fillStyle = 'rgba(255,255,255,0.25)';
      for (let i = 0; i < 30; i++) { const a = SS.Render.hash(i * 5.1) * 6.28, r = R * (0.9 + 0.09 * SS.Render.hash(i + 9)); c.beginPath(); c.ellipse(Math.cos(a) * r, Math.sin(a) * r, R * 0.05, R * 0.006, a + 1.57, 0, 7); c.fill(); }
      c.restore();
      // orbiting rocket
      const ang = -1.5 + Math.sin(bgT * 0.05) * 0.05;
      const orb = R * 1.045;
      c.save(); c.translate(cx + Math.cos(ang) * orb, cy + Math.sin(ang) * orb); c.rotate(ang + Math.PI);
      c.scale(2.6, 2.6);
      let y = 0;
      for (const p of rocket.parts) {
        const d = SS.Parts.byId[p.type];
        c.save(); c.translate(p.x, -p.y); c.scale(1, -1);
        SS.Render.drawPart(c, d, p.side, { lw: 0.3 });
        c.restore();
      }
      c.restore();
    };
    bgRaf = requestAnimationFrame(step);
  }

  /* ------------------------------------------------------------ wiring */
  function init() {
    SS.Builder.init();
    SS.Flight.init();
    $('#m-build').onclick = () => App.openBuilder();
    $('#m-quick').onclick = () => App.launch(App.lastCraft() || SS.Presets[1].doc);
    $('#m-examples').onclick = () => modal('Example Vehicles', examples(), [['Close', null]]);
    $('#m-load').onclick = () => modal('Load Craft', craftList(d => App.openBuilder(d), true), [['Close', null]]);
    $('#m-settings').onclick = App.openSettings;
    $('#m-help').onclick = help;
    $('#b-menu').onclick = () => { LS.set('ss.last', SS.Builder.doc); show('menu'); };
    $('#b-save').onclick = saveDlg;
    $('#b-load').onclick = () => modal('Load Craft', (() => { const b = el('div'); b.appendChild(examples()); b.appendChild(el('h4', '', 'Your saved crafts')); b.appendChild(craftList(d => { SS.Builder.pushUndo(); SS.Builder.open(d); }, true)); return b; })(), [['Close', null]]);
    $('#b-export').onclick = exportDlg;
    $('#b-import').onclick = importDlg;
    $('#b-launch').onclick = () => { const d = SS.Builder.doc; if (d.parts.length) App.launch(d); };
    $('#modal').addEventListener('mousedown', e => { if (e.target.id === 'modal') closeModal(); });
    window.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').classList.contains('hidden')) closeModal(); });
    show('menu');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window);
