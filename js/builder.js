/* Vehicle Assembly Building: drag parts from the palette, snap them onto each other, stage and analyse the craft. */
(function (g) {
  const SS = g.SS;
  const Craft = SS.Craft;
  const { clamp } = SS;
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

  const B = (SS.Builder = {
    doc: Craft.create('My Rocket'),
    held: null, cam: { x: 0, y: 0, s: 14 }, mouse: { sx: 0, sy: 0, wx: 0, wy: 0, in: false },
    hover: null, sym: true, undo: [], redo: [], analysis: null, autoStage: true, cat: 'Command',
    snap: null, dragPan: null,
  });
  let canvas, ctx, W = 0, Hh = 0, dirty = true, analysisTimer = 0, raf = 0, active = false;

  /* -------------------------------------------------------------- lifecycle */
  B.init = function () {
    canvas = $('#b-canvas'); ctx = canvas.getContext('2d');
    buildPalette();
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('mouseleave', () => { B.mouse.in = false; dirty = true; });
    canvas.addEventListener('mouseenter', () => { B.mouse.in = true; });
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', () => active && resize());
    $('#b-name').addEventListener('input', e => { B.doc.name = e.target.value; });
    $('#b-sym').addEventListener('click', () => { B.sym = !B.sym; refreshToolbar(); });
    $('#b-undo').addEventListener('click', B.doUndo);
    $('#b-redo').addEventListener('click', B.doRedo);
    $('#b-new').addEventListener('click', () => { if (!B.doc.parts.length || confirm('Discard the current craft?')) { B.pushUndo(); B.doc = Craft.create('My Rocket'); B.held = null; fit(); changed(); } });
    $('#b-fit').addEventListener('click', fit);
    $('#b-auto').addEventListener('click', () => { B.autoStage = true; Craft.autoStage(B.doc.parts); changed(true); });
    $('#b-autotoggle').addEventListener('change', e => { B.autoStage = e.target.checked; });
  };

  B.open = function (doc) {
    if (doc) { B.doc = Craft.clone(doc); }
    active = true; B.held = null; B.undo = []; B.redo = [];
    resize(); fit(); refreshToolbar(); changed(true);
    cancelAnimationFrame(raf); loop();
  };
  B.close = function () { active = false; cancelAnimationFrame(raf); };

  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; Hh = r.height;
    canvas.width = W * dpr; canvas.height = Hh * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dirty = true;
  }

  function fit() {
    const ps = B.doc.parts;
    if (!ps.length) { B.cam.x = 0; B.cam.y = 0; B.cam.s = 16; dirty = true; return; }
    let l = 1e9, r = -1e9, b = 1e9, t = -1e9;
    for (const p of ps) { const q = Craft.rect(p); l = Math.min(l, q.l); r = Math.max(r, q.r); b = Math.min(b, q.b); t = Math.max(t, q.t); }
    B.cam.x = (l + r) / 2; B.cam.y = (b + t) / 2;
    B.cam.s = clamp(Math.min((W * 0.7) / Math.max(r - l, 4), (Hh * 0.8) / Math.max(t - b, 4)), 3, 60);
    dirty = true;
  }

  /* -------------------------------------------------------------- palette */
  function buildPalette() {
    const tabs = $('#b-tabs'), list = $('#b-parts');
    tabs.innerHTML = '';
    for (const c of SS.Parts.cats) {
      const b = el('button', 'tab' + (c === B.cat ? ' on' : ''), c);
      b.onclick = () => { B.cat = c; buildPalette(); };
      tabs.appendChild(b);
    }
    list.innerHTML = '';
    for (const d of SS.Parts.list.filter(d => d.cat === B.cat)) {
      const item = el('div', 'part');
      const cv = el('canvas'); cv.width = 54; cv.height = 54; SS.Render.icon(cv, d);
      let stat = `${SS.fmt.mass(d.mass + d.fuel)}`;
      if (d.engine) stat += ` · ${SS.fmt.force(d.engine.vacThrust)} vac · Isp ${d.engine.ispVac}s`;
      else if (d.fuel) stat += ` · ${d.fuel} kg prop`;
      else if (d.pod) stat += d.pod.crew ? ` · crew ${d.pod.crew}` : ' · uncrewed';
      item.appendChild(cv);
      const info = el('div', 'pinfo', `<b>${d.name}</b><span>${stat}</span><em>${d.desc}</em>`);
      item.appendChild(info);
      item.onclick = () => pickNew(d.id);
      list.appendChild(item);
    }
  }

  function pickNew(type) {
    B.held = { parts: [{ type, ox: 0, oy: 0, side: 1, parentOld: null, stage: -1 }], fromBoard: false, snapshot: null };
    B.snap = null;
    dirty = true;
  }

  /* -------------------------------------------------------------- undo */
  B.pushUndo = function () { B.undo.push(JSON.stringify(B.doc)); if (B.undo.length > 100) B.undo.shift(); B.redo = []; };
  B.doUndo = function () { if (!B.undo.length) return; B.redo.push(JSON.stringify(B.doc)); B.doc = JSON.parse(B.undo.pop()); B.held = null; changed(true); };
  B.doRedo = function () { if (!B.redo.length) return; B.undo.push(JSON.stringify(B.doc)); B.doc = JSON.parse(B.redo.pop()); B.held = null; changed(true); };

  function changed(skipAuto) {
    if (B.autoStage && !skipAuto) Craft.autoStage(B.doc.parts);
    $('#b-name').value = B.doc.name;
    dirty = true;
    clearTimeout(analysisTimer);
    analysisTimer = setTimeout(() => { B.analysis = SS.analyze(B.doc); refreshStats(); }, 30);
    refreshStaging();
    refreshToolbar();
  }
  B.changed = changed;

  /* -------------------------------------------------------------- geometry helpers */
  const toWorld = (sx, sy) => [B.cam.x + (sx - W / 2) / B.cam.s, B.cam.y - (sy - Hh / 2) / B.cam.s];
  const toScreen = (x, y) => [W / 2 + (x - B.cam.x) * B.cam.s, Hh / 2 - (y - B.cam.y) * B.cam.s];
  const snap = (v, q) => Math.round(v / q) * q;
  const def = p => SS.Parts.byId[p.type];

  function rectOf(x, y, d) { return { l: x - d.wMax / 2, r: x + d.wMax / 2, b: y - d.h / 2, t: y + d.h / 2 }; }
  function overlaps(a, b, m = 0.05) { return a.l < b.r - m && a.r > b.l + m && a.b < b.t - m && a.t > b.b + m; }

  function partAt(wx, wy) {
    let best = null, bd = 1e9;
    for (const p of B.doc.parts) {
      const d = def(p);
      const q = rectOf(p.x, p.y, d);
      if (wx >= q.l && wx <= q.r && wy >= q.b && wy <= q.t) {
        const dist = Math.hypot(wx - p.x, wy - p.y);
        if (dist < bd) { bd = dist; best = p; }
      }
    }
    return best;
  }

  /** Compute the best snap for the held root at mouse position m = [wx, wy]. */
  function computeSnap() {
    const h = B.held;
    if (!h) return null;
    const root = h.parts[0], d = def(root);
    const parts = B.doc.parts;
    const mx = B.mouse.wx, my = B.mouse.wy;
    if (!parts.length) return { x: 0, y: 0, side: 1, parent: null, valid: true };
    const thr = 60 / B.cam.s + 0.6;
    const excl = new Set();
    const cands = [];
    const heldRects = (x, y, side) => h.parts.map(hp => rectOf(x + hp.ox * 1, y + hp.oy, def(hp)));
    const test = (x, y, side, parent, target) => {
      // validity: no overlap with existing parts, and must be joined to the target
      const rs = heldRects(x, y, side);
      for (const r of rs) for (const p of parts) if (overlaps(r, rectOf(p.x, p.y, def(p)))) return;
      if (parent == null) {
        const tmp = { id: -1, type: root.type, x, y, side, parent: null };
        const js = Craft.joints([...parts, tmp]);
        if (!js.some(j => (j.a === -1 && j.b === target.id) || (j.b === -1 && j.a === target.id))) return;
      }
      cands.push({ x, y, side, parent, valid: true, dist: Math.hypot(mx - x, my - y) });
    };
    for (const T of parts) {
      const dt = def(T);
      // stack: held above T
      test(T.x, T.y + dt.h / 2 + d.h / 2, 1, null, T);
      // held below T
      test(T.x, T.y - dt.h / 2 - d.h / 2, 1, null, T);
      if (d.radial) {
        for (const s of [-1, 1]) {
          const lo = T.y - dt.h / 2 + d.h / 2, hi = T.y + dt.h / 2 - d.h / 2;
          let y = lo <= hi ? clamp(snap(my, 0.25), lo, hi) : T.y;
          const x = T.x + s * (Craft.widthAt(T, y) / 2 + d.w / 2);
          test(x, y, s, T.id, T);
        }
      }
    }
    cands.sort((a, b) => a.dist - b.dist);
    const best = cands.find(c => c.dist < thr);
    return best || { x: mx, y: my, side: 1, parent: null, valid: false };
  }

  function mirrorOf(P) {
    if (Math.abs(P.x) < 0.01) return P;
    return B.doc.parts.find(q => q !== P && q.type === P.type && Math.abs(q.x + P.x) < 0.02 && Math.abs(q.y - P.y) < 0.02) || null;
  }

  function place() {
    const h = B.held, s = B.snap;
    if (!h || !s || !s.valid) return false;
    B.pushUndo();
    const addSet = mirror => {
      const created = h.parts.map((hp, i) => {
        const px = mirror ? -(s.x + hp.ox) : s.x + hp.ox;
        const side = (mirror ? -1 : 1) * (i === 0 ? s.side : hp.side);
        return Craft.add(B.doc, hp.type, px, s.y + hp.oy, { side, stage: hp.stage });
      });
      h.parts.forEach((hp, i) => {
        if (i === 0) {
          if (s.parent != null) {
            const par = B.doc.parts.find(q => q.id === s.parent);
            const tp = mirror ? mirrorOf(par) : par;
            created[0].parent = tp ? tp.id : null;
          }
        } else if (hp.parentIdx != null) created[i].parent = created[hp.parentIdx].id;
      });
    };
    addSet(false);
    if (B.sym && s.parent != null && Math.abs(s.x) > 0.01) {
      const par = B.doc.parts.find(q => q.id === s.parent);
      const free = h.parts.every(hp => {
        const r = rectOf(-(s.x + hp.ox), s.y + hp.oy, def(hp));
        return B.doc.parts.every(q => !overlaps(r, rectOf(q.x, q.y, def(q))));
      });
      if (par && mirrorOf(par) && free) addSet(true);
    }
    if (h.fromBoard) B.held = null; // palette items stay in hand so several can be placed in a row
    B.snap = null;
    changed();
    return true;
  }

  function pickUp(p) {
    // lift the part and everything beyond it (away from the root)
    const ids = Craft.subtree(B.doc.parts, p.id);
    const root = p;
    B.pushUndo();
    const parts = ids.map(id => B.doc.parts.find(q => q.id === id));
    const idxOf = new Map(parts.map((q, i) => [q.id, i]));
    B.held = {
      parts: parts.map(q => ({ type: q.type, ox: q.x - root.x, oy: q.y - root.y, side: q.side, stage: q.stage, parentIdx: q === root ? null : idxOf.get(q.parent) ?? null })),
      fromBoard: true,
    };
    // the picked root keeps its radial side
    B.held.parts[0].side = root.side;
    B.doc.parts = B.doc.parts.filter(q => !ids.includes(q.id));
    B.snap = null;
    changed();
  }

  function removePart(p) {
    const ids = Craft.subtree(B.doc.parts, p.id);
    if (!ids.length) return;
    B.pushUndo();
    B.doc.parts = B.doc.parts.filter(q => !ids.includes(q.id));
    B.hover = null;
    changed();
  }

  /* -------------------------------------------------------------- input */
  function setMouse(e) {
    const r = canvas.getBoundingClientRect();
    B.mouse.sx = e.clientX - r.left; B.mouse.sy = e.clientY - r.top;
    [B.mouse.wx, B.mouse.wy] = toWorld(B.mouse.sx, B.mouse.sy);
    B.mouse.in = true;
  }
  function onMove(e) {
    setMouse(e);
    if (B.dragPan) {
      B.cam.x = B.dragPan.cx - (B.mouse.sx - B.dragPan.sx) / B.cam.s;
      B.cam.y = B.dragPan.cy + (B.mouse.sy - B.dragPan.sy) / B.cam.s;
    }
    if (B.held) B.snap = computeSnap();
    else B.hover = partAt(B.mouse.wx, B.mouse.wy);
    dirty = true;
  }
  function onDown(e) {
    setMouse(e);
    if (e.button === 1 || (e.button === 0 && e.shiftKey && !B.held)) { B.dragPan = { sx: B.mouse.sx, sy: B.mouse.sy, cx: B.cam.x, cy: B.cam.y }; e.preventDefault(); return; }
    if (e.button === 2) {
      if (B.held) { cancelHeld(); return; }
      const p = partAt(B.mouse.wx, B.mouse.wy);
      if (p) removePart(p);
      return;
    }
    if (e.button !== 0) return;
    if (B.held) { B.snap = computeSnap(); place(); }
    else {
      const p = partAt(B.mouse.wx, B.mouse.wy);
      if (p) { pickUp(p); B.snap = computeSnap(); }
    }
    dirty = true;
  }
  function onUp() { B.dragPan = null; }
  function onWheel(e) {
    e.preventDefault();
    setMouse(e);
    const f = Math.exp(-e.deltaY * 0.0012);
    const [wx, wy] = toWorld(B.mouse.sx, B.mouse.sy);
    B.cam.s = clamp(B.cam.s * f, 2, 80);
    B.cam.x = wx - (B.mouse.sx - W / 2) / B.cam.s;
    B.cam.y = wy + (B.mouse.sy - Hh / 2) / B.cam.s;
    dirty = true;
  }
  function cancelHeld() {
    if (B.held && B.held.fromBoard) B.doUndo(); // put the lifted parts back
    B.held = null; B.snap = null; dirty = true;
  }
  function onKey(e) {
    if (!active || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || !$('#modal').classList.contains('hidden')) return;
    if (e.key === 'Escape') { if (B.held) cancelHeld(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && !B.held) { const p = partAt(B.mouse.wx, B.mouse.wy); if (p) removePart(p); }
    else if (e.key === 's' && !e.ctrlKey) { B.sym = !B.sym; refreshToolbar(); }
    else if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); e.shiftKey ? B.doRedo() : B.doUndo(); }
    else if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); B.doRedo(); }
    else if (e.key === 'f') fit();
  }

  /* -------------------------------------------------------------- panels */
  function refreshToolbar() {
    $('#b-sym').classList.toggle('on', B.sym);
    $('#b-sym').textContent = B.sym ? 'Symmetry: Mirror' : 'Symmetry: Off';
    $('#b-undo').disabled = !B.undo.length; $('#b-redo').disabled = !B.redo.length;
    $('#b-autotoggle').checked = B.autoStage;
    $('#b-launch').disabled = !B.doc.parts.length;
  }

  function refreshStats() {
    const a = B.analysis;
    if (!a) return;
    const box = $('#b-stats');
    const rows = [
      ['Parts', B.doc.parts.length],
      ['Height', a.height.toFixed(1) + ' m'],
      ['Wet mass', SS.fmt.mass(a.wet)],
      ['Dry mass', SS.fmt.mass(a.dry)],
      ['Propellant', SS.fmt.mass(a.fuel)],
      ['Total Δv (vac)', a.dv.toFixed(0) + ' m/s'],
      ['Liftoff TWR', a.stages.length ? a.stages[0].twrSL.toFixed(2) : '–'],
      ['Burn time', SS.fmt.time(a.burn)],
    ];
    const cm = comcop();
    let html = rows.map(r => `<div class="row"><span>${r[0]}</span><b>${r[1]}</b></div>`).join('');
    if (cm) {
      const margin = cm.cop === null ? null : (cm.com - cm.cop);
      html += `<div class="row"><span>Stability</span><b class="${margin === null ? '' : margin > 0 ? 'good' : 'bad'}">${margin === null ? '–' : margin > 0 ? 'stable (' + margin.toFixed(1) + ' m)' : 'unstable (' + margin.toFixed(1) + ' m)'}</b></div>`;
    }
    html += '<h4>Stages (vacuum)</h4><table class="stg"><tr><th>#</th><th>Δv</th><th>Burn</th><th>TWR</th></tr>';
    for (const s of a.stages) html += `<tr><td>${s.stage}</td><td>${s.dv.toFixed(0)}</td><td>${SS.fmt.time(s.burn)}</td><td>${s.twrVac.toFixed(2)}</td></tr>`;
    html += '</table>';
    if (a.warnings.length) html += '<div class="warns">' + a.warnings.map(w => `<div>⚠ ${w}</div>`).join('') + '</div>';
    box.innerHTML = html;
    dirty = true;
  }

  /** Centre of mass and (approximate) aerodynamic centre of pressure along the vertical axis. */
  function comcop() {
    const ps = B.doc.parts;
    if (!ps.length) return null;
    let M = 0, my = 0, A = 0, ay = 0, mx = 0;
    for (const p of ps) {
      const d = def(p), m = d.mass + d.fuel + (d.shield ? d.shield.ablator : 0);
      M += m; my += m * p.y; mx += m * p.x;
      const w = (d.fin ? d.fin.area * 6.28 * 2 : d.latArea * 0.5) * (d.kind === 'chute' ? 0.2 : 1);
      A += w; ay += w * p.y;
    }
    return { com: my / M, comX: mx / M, cop: A > 0 ? ay / A : null };
  }

  function refreshStaging() {
    const box = $('#b-staging');
    const ps = B.doc.parts.filter(p => def(p).stageable);
    const max = ps.reduce((m, p) => Math.max(m, p.stage), -1);
    box.innerHTML = '';
    if (!ps.length) { box.appendChild(el('div', 'hint', 'No stageable parts yet (engines, decouplers, parachutes).')); return; }
    for (let s = Math.max(max, 0); s >= 0; s--) {
      const row = el('div', 'srow');
      row.appendChild(el('div', 'snum', 'S' + s));
      const chips = el('div', 'chips');
      for (const p of ps.filter(p => p.stage === s)) {
        const d = def(p);
        const chip = el('div', 'chip k-' + (d.engine ? 'eng' : d.decoupler ? 'dec' : 'chute'));
        chip.innerHTML = `<span>${d.name}</span>`;
        const up = el('button', '', '▲'), dn = el('button', '', '▼');
        up.title = 'Fire later'; dn.title = 'Fire earlier';
        up.onclick = () => { B.pushUndo(); B.autoStage = false; p.stage = Math.min(p.stage + 1, 12); compactStages(); changed(true); };
        dn.onclick = () => { B.pushUndo(); B.autoStage = false; p.stage = Math.max(p.stage - 1, 0); compactStages(); changed(true); };
        chip.append(dn, up);
        chip.onmouseenter = () => { B.hover = p; dirty = true; };
        chip.onmouseleave = () => { B.hover = null; dirty = true; };
        chips.appendChild(chip);
      }
      row.appendChild(chips);
      box.appendChild(row);
    }
  }
  function compactStages() {
    const used = [...new Set(B.doc.parts.filter(p => p.stage >= 0).map(p => p.stage))].sort((a, b) => a - b);
    B.doc.parts.forEach(p => { if (p.stage >= 0) p.stage = used.indexOf(p.stage); });
  }

  /* -------------------------------------------------------------- drawing */
  function loop() {
    if (!active) return;
    raf = requestAnimationFrame(loop);
    if (dirty || B.held) { draw(); dirty = false; }
  }

  function draw() {
    const c = ctx;
    c.save();
    c.clearRect(0, 0, W, Hh);
    const bg = c.createLinearGradient(0, 0, 0, Hh);
    bg.addColorStop(0, '#16202e'); bg.addColorStop(1, '#0d131c');
    c.fillStyle = bg; c.fillRect(0, 0, W, Hh);
    // grid
    const s = B.cam.s;
    const [x0, y1] = toWorld(0, 0), [x1, y0] = toWorld(W, Hh);
    for (const [step, col] of [[1, 'rgba(120,150,190,0.07)'], [5, 'rgba(120,150,190,0.14)']]) {
      if (step * s < 6) continue;
      c.strokeStyle = col; c.lineWidth = 1; c.beginPath();
      for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) { const [sx] = toScreen(x, 0); c.moveTo(sx, 0); c.lineTo(sx, Hh); }
      for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) { const [, sy] = toScreen(0, y); c.moveTo(0, sy); c.lineTo(W, sy); }
      c.stroke();
    }
    // centre axis
    const [ax] = toScreen(0, 0);
    c.strokeStyle = 'rgba(90,200,255,0.25)'; c.setLineDash([6, 6]); c.beginPath(); c.moveTo(ax, 0); c.lineTo(ax, Hh); c.stroke(); c.setLineDash([]);

    const drawPart = (p, alpha, extra) => {
      const d = def(p);
      const [sx, sy] = toScreen(p.x, p.y);
      c.save(); c.translate(sx, sy); c.scale(s, -s); c.globalAlpha = alpha;
      SS.Render.drawPart(c, d, p.side, { lw: 1.3 / s });
      if (extra) { SS.Render.partOutline(c, d); c.lineWidth = 2.5 / s; c.strokeStyle = extra; c.stroke(); }
      c.restore();
    };
    for (const p of B.doc.parts) drawPart(p, 1, B.hover === p && !B.held ? '#5ad1ff' : null);

    // stage badges
    c.font = '600 11px system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const p of B.doc.parts) {
      const d = def(p);
      if (!d.stageable || p.stage < 0) continue;
      const [sx, sy] = toScreen(p.x, p.y);
      c.fillStyle = d.engine ? '#ff7a3d' : d.decoupler ? '#e5b83a' : '#6fd36f';
      c.beginPath(); c.arc(sx, sy, 9, 0, 7); c.fill();
      c.fillStyle = '#111'; c.fillText(p.stage, sx, sy + 0.5);
    }

    // CoM / CoP
    const cc = comcop();
    if (cc && B.doc.parts.length) {
      const [mx, my] = toScreen(cc.comX, cc.com);
      c.strokeStyle = '#5ad1ff'; c.fillStyle = '#5ad1ff'; c.lineWidth = 2;
      c.beginPath(); c.arc(mx, my, 7, 0, 7); c.stroke(); c.beginPath(); c.moveTo(mx - 10, my); c.lineTo(mx + 10, my); c.moveTo(mx, my - 10); c.lineTo(mx, my + 10); c.stroke();
      c.textAlign = 'left'; c.fillText('CoM', mx + 12, my - 8);
      if (cc.cop !== null) {
        const [, py] = toScreen(0, cc.cop);
        c.strokeStyle = '#ffa63d'; c.fillStyle = '#ffa63d';
        c.beginPath(); c.moveTo(mx - 14, py); c.lineTo(mx + 14, py); c.stroke();
        c.beginPath(); c.moveTo(mx, py - 6); c.lineTo(mx + 6, py); c.lineTo(mx, py + 6); c.lineTo(mx - 6, py); c.closePath(); c.fill();
        c.fillText('CoP', mx + 18, py + 4);
      }
    }

    // held ghost
    if (B.held && B.mouse.in) {
      const sn = B.snap || { x: B.mouse.wx, y: B.mouse.wy, side: 1, valid: false };
      const h = B.held;
      for (let i = 0; i < h.parts.length; i++) {
        const hp = h.parts[i];
        const fake = { type: hp.type, x: sn.x + hp.ox, y: sn.y + hp.oy, side: i === 0 ? sn.side : hp.side };
        drawPart(fake, sn.valid ? 0.85 : 0.45, sn.valid ? '#6dff9a' : '#ff6a6a');
        if (sn.valid && B.sym && sn.parent != null && Math.abs(sn.x) > 0.01) {
          const mfake = { type: hp.type, x: -(sn.x + hp.ox), y: sn.y + hp.oy, side: -fake.side };
          drawPart(mfake, 0.35, null);
        }
      }
    } else if (!B.doc.parts.length) {
      c.fillStyle = 'rgba(200,220,255,0.55)'; c.font = '16px system-ui,sans-serif'; c.textAlign = 'center';
      c.fillText('Pick a part from the left panel to begin — start with a command pod.', W / 2, Hh / 2);
    }
    // hover tooltip
    if (B.hover && !B.held) {
      const d = def(B.hover);
      const [sx, sy] = toScreen(B.hover.x, B.hover.y);
      const txt = d.name + (B.hover.stage >= 0 ? `  ·  stage ${B.hover.stage}` : '');
      c.font = '12px system-ui,sans-serif'; c.textAlign = 'left';
      const tw = c.measureText(txt).width + 14;
      const tx = clamp(B.mouse.sx + 14, 4, W - tw - 4), ty = clamp(B.mouse.sy + 14, 4, Hh - 28);
      c.fillStyle = 'rgba(10,16,26,0.92)'; c.fillRect(tx, ty, tw, 22);
      c.strokeStyle = 'rgba(90,209,255,0.5)'; c.strokeRect(tx, ty, tw, 22);
      c.fillStyle = '#dbe8ff'; c.fillText(txt, tx + 7, ty + 15);
    }
    c.restore();
  }
})(typeof window !== 'undefined' ? window : globalThis);
