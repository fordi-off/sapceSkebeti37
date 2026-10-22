/* Flight screen: input, camera, HUD. */
(function (g) {
  const SS = g.SS;
  const P = SS.Planet;
  const { clamp } = SS;
  const $ = (s, r = document) => r.querySelector(s);

  const F = (SS.Flight = { world: null, cam: SS.Render.makeCamera(), keys: new Set(), speedMode: 'surface' });
  let canvas, ctx, W = 0, H = 0, raf = 0, last = 0, active = false, hudT = 0, doc = null;
  let paused = false, outcomeShown = false, flightStart = 0, lastOutcomeCheck = 0, msgSeen = 0;
  let mapDrag = null;
  const hud = {};

  F.init = function () {
    canvas = $('#f-canvas'); ctx = canvas.getContext('2d');
    for (const id of ['alt', 'spd', 'spdlbl', 'vs', 'mach', 'q', 'g', 'twr', 'mass', 'fuel', 'heat', 'ap', 'pe', 'tap', 'tpe', 'per', 'ecc', 'thrval', 'thrbar', 'warp', 'stages', 'msgs', 'banner', 'pause', 'heatbar', 'met', 'aoa', 'thrust', 'apstate'])
      hud[id] = $('#f-' + id);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', e => F.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => F.keys.clear());
    window.addEventListener('resize', () => active && resize());
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const f = Math.exp(-e.deltaY * 0.0015);
      if (F.cam.map) F.cam.mapZoom = clamp(F.cam.mapZoom * f, 2e-8, 2e-3);
      else { F.cam.zoom = clamp(F.cam.zoom * f, 1e-5, 120); F.autoZoom = false; }
    }, { passive: false });
    canvas.addEventListener('mousedown', e => { if (F.cam.map) mapDrag = { x: e.clientX, y: e.clientY, mx: F.cam.mapX, my: F.cam.mapY }; });
    window.addEventListener('mouseup', () => (mapDrag = null));
    window.addEventListener('mousemove', e => {
      if (!mapDrag) return;
      F.cam.mapX = mapDrag.mx - (e.clientX - mapDrag.x) / F.cam.mapZoom;
      F.cam.mapY = mapDrag.my + (e.clientY - mapDrag.y) / F.cam.mapZoom;
    });
    const click = (id, fn) => $(id).addEventListener('click', e => { fn(e); e.target.blur(); });
    click('#f-stagebtn', () => doStage());
    click('#f-sas', () => toggleSAS());
    click('#f-mapbtn', () => toggleMap());
    click('#f-sound', () => { SS.Audio.setOn(!SS.Audio.on); $('#f-sound').textContent = SS.Audio.on ? '🔊' : '🔇'; });
    click('#f-warpup', () => warp(1));
    click('#f-warpdn', () => warp(-1));
    click('#f-aptoggle', () => toggleAP());
    click('#f-spdlbl', () => { F.speedMode = F.speedMode === 'surface' ? 'orbit' : 'surface'; });
    click('#f-frame', () => { const v = F.world.active; if (v) v.sasRef = v.sasRef === 'surface' ? 'orbit' : 'surface'; });
    click('#f-menubtn', () => togglePause());
    $('#f-apalt').addEventListener('change', e => { if (F.world) F.world.autopilot.targetAlt = clamp(+e.target.value, 80, 2000) * 1000; });
    for (const m of ['hold', 'prograde', 'retrograde', 'radialOut', 'radialIn'])
      click('#f-sas-' + m, () => { const v = F.world.active; if (v) { v.sasMode = m; v.sasOn = true; if (m === 'hold') v.sasTarget = v.theta; F.world.autopilot.on && F.world.autopilot.stop(); } });
    const th = $('#f-thr');
    const setThr = e => { const r = th.getBoundingClientRect(); const v = F.world.active; if (v) v.throttle = clamp(1 - (e.clientY - r.top) / r.height, 0, 1); };
    let dragT = false;
    th.addEventListener('mousedown', e => { dragT = true; setThr(e); });
    window.addEventListener('mousemove', e => dragT && setThr(e));
    window.addEventListener('mouseup', () => (dragT = false));
    click('#f-resume', () => togglePause(false));
    click('#f-revert', () => { SS.App.revertToBuilder(); });
    click('#f-restart', () => { SS.App.launch(doc); });
    click('#f-quit', () => { SS.App.showMenu(); });
    click('#f-settings', () => SS.App.openSettings());
    click('#f-b-revert', () => SS.App.revertToBuilder());
    click('#f-b-restart', () => SS.App.launch(doc));
    click('#f-b-continue', () => { hud.banner.classList.add('hidden'); });
  };

  F.open = function (craftDoc) {
    SS.Audio.start();
    doc = SS.Craft.clone(craftDoc);
    F.world = new SS.World(SS.App.settings());
    const v = F.world.launch(doc);
    F.world.autopilot.targetAlt = (+$('#f-apalt').value || 150) * 1000;
    active = true; paused = false; outcomeShown = false; flightStart = performance.now(); msgSeen = 0;
    hud.banner.classList.add('hidden'); hud.pause.classList.add('hidden');
    F.cam.map = false; F.cam.target = null; F.autoZoom = true; F.lastBound = v.boundR;
    resize();
    F.cam.zoom = clamp((H * 0.55) / Math.max(10, v.boundR * 2), 1, 30);
    F.cam.x = v.x; F.cam.y = v.y;
    F.altRef = Math.max(0, Math.hypot(v.x, v.y) - P.R) - 0.01;
    F.world.msg('Welcome to the launch pad. Press SPACE to ignite, SHIFT to throttle up.', 'info');
    $('#f-hint').classList.remove('hidden');
    cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(loop);
  };
  F.close = function () { active = false; cancelAnimationFrame(raf); F.world = null; SS.Audio.stop(); };
  F.refreshSettings = function () { if (F.world) Object.assign(F.world.settings, SS.App.settings()); };

  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    F._dpr = dpr; SS.Render.dpr = dpr;
  }

  /* -------------------------------------------------------------- commands */
  function doStage() {
    const v = F.world.active;
    if (v && v.hasControl) {
      if (v.stageNum === 0 && v.throttle < 0.01 && !v.engines.some(e => e.def.engine.solid && e.stage === 0)) v.throttle = 1;
      v.stage(); $('#f-hint').classList.add('hidden');
    }
  }
  function toggleSAS() { const v = F.world.active; if (v) { v.sasOn = !v.sasOn; v.sasTarget = v.theta; } }
  function toggleMap() {
    F.cam.map = !F.cam.map;
    if (F.cam.map) {
      const v = F.world.active;
      const el = v ? SS.orbit.elements(v.x, v.y, v.vx, v.vy) : null;
      const maxR = Math.max(P.R * 1.25, el && isFinite(el.ap) && el.ap < P.R * 60 ? el.ap * 1.15 : P.R * 2);
      F.cam.mapZoom = (Math.min(W, H) * 0.45) / maxR; F.cam.mapX = 0; F.cam.mapY = 0;
    }
    $('#f-mapbtn').classList.toggle('on', F.cam.map);
  }
  function warp(d) {
    const w = F.world;
    if (d < 0) w.setWarp(w.warpIndex - 1);
    else w.setWarp(w.warpIndex + 1);
  }
  function toggleAP() {
    const ap = F.world.autopilot;
    if (ap.on) ap.stop('Autopilot disengaged'); else { ap.targetAlt = clamp(+$('#f-apalt').value, 80, 2000) * 1000; ap.start(); $('#f-hint').classList.add('hidden'); }
  }
  function togglePause(force) {
    paused = force === undefined ? !paused : force;
    F.world.paused = paused;
    hud.pause.classList.toggle('hidden', !paused);
  }

  function onKey(e) {
    if (!active || e.target.tagName === 'INPUT' || !$('#modal').classList.contains('hidden')) return;
    const k = e.key.toLowerCase();
    if (e.ctrlKey && k === 'a') return;
    F.keys.add(k);
    if (e.key === 'Shift' || e.key === 'Control') F.keys.add(e.key.toLowerCase());
    const w = F.world; if (!w) return;
    const v = w.active;
    if (k === 'escape') togglePause();
    if (paused) return;
    if (k === ' ') { e.preventDefault(); doStage(); }
    else if (k === 't') toggleSAS();
    else if (k === 'm') toggleMap();
    else if (k === 'z' && v) v.throttle = 1;
    else if (k === 'x' && v) v.throttle = 0;
    else if (k === '.') warp(1);
    else if (k === ',') warp(-1);
    else if (k === '/') w.setWarp(0);
    else if (k === 'tab') { e.preventDefault(); w.cycleVessel(1); }
    else if (k === ']') w.cycleVessel(1);
    else if (k === '[') w.cycleVessel(-1);
    else if (k === 'p') { if (v) { for (const c of v.chutes) if (!c.chuteState) c.chuteState = 1; w.msg('Parachutes armed', 'info'); } }
    else if (k === 'g') toggleAP();
    else if (v && ['1', '2', '3', '4', '5'].includes(k)) { v.sasMode = ['hold', 'prograde', 'retrograde', 'radialOut', 'radialIn'][+k - 1]; v.sasOn = true; if (k === '1') v.sasTarget = v.theta; w.autopilot.on && w.autopilot.stop(); }
    else if (k === 'c') { F.cam.target = null; F.autoZoom = true; F.cam.zoom = clamp((H * 0.55) / Math.max(10, (v ? v.boundR : 10) * 2), 1, 30); }
    if (['arrowup', 'arrowdown', 'tab'].includes(k)) e.preventDefault();
  }

  /* -------------------------------------------------------------- loop */
  function loop(now) {
    if (!active) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const w = F.world;
    const v = w.active;
    if (v && !paused) {
      // continuous inputs
      const ks = F.keys;
      let steer = 0;
      if (ks.has('a') || ks.has('q') || ks.has('arrowleft')) steer += 1;
      if (ks.has('d') || ks.has('e') || ks.has('arrowright')) steer -= 1;
      if (steer !== 0 && w.autopilot.on) w.autopilot.stop('Autopilot disengaged (manual control)');
      if (!w.autopilot.on) v.steer = steer;
      if (!w.autopilot.on) {
        if (ks.has('shift')) v.throttle = clamp(v.throttle + dt * 0.6, 0, 1);
        if (ks.has('control')) v.throttle = clamp(v.throttle - dt * 0.6, 0, 1);
      }
    }
    w.update(paused ? 0 : dt);
    SS.Audio.update(w, paused);
    // camera: re-frame automatically when the craft shrinks (stage separation) unless the player zoomed by hand
    if (F.autoZoom && w.active && !F.cam.map) {
      const goal = clamp((H * 0.5) / Math.max(6, w.active.boundR * 2), 1.5, 40);
      if (w.active.boundR < F.lastBound * 0.8) F.zoomGoal = goal;
      F.lastBound = w.active.boundR;
      if (F.zoomGoal) { F.cam.zoom += (F.zoomGoal - F.cam.zoom) * Math.min(1, dt * 2.5); if (Math.abs(F.zoomGoal - F.cam.zoom) < 0.02 * F.zoomGoal) F.zoomGoal = 0; }
    }
    // camera
    const tgt = F.cam.target && F.cam.target.alive ? F.cam.target : w.active;
    if (tgt) { F.cam.x = tgt.x; F.cam.y = tgt.y; }
    if (F.cam.map) SS.Render.drawMap(ctx, w, F.cam, W, H);
    else { ctx.save(); SS.Render.drawFlight(ctx, w, F.cam, W, H, now); ctx.restore(); ctx.setTransform(F._dpr, 0, 0, F._dpr, 0, 0); }
    hudT += dt;
    if (hudT > 0.08) { hudT = 0; updateHud(); }
    drawFlightOverlay();
    checkOutcome(now);
  }

  function drawFlightOverlay() {
    if (F.cam.map) return;
    const v = F.world.active;
    if (!v) return;
    // velocity vector pointer near the craft when far zoomed
  }

  /* -------------------------------------------------------------- HUD */
  const set = (el, txt) => { if (el.textContent !== txt) el.textContent = txt; };
  function updateHud() {
    const w = F.world, v = w.active;
    set(hud.met, 'T+ ' + SS.fmt.time(w.time));
    set(hud.warp, w.warp > 1 ? (w.railsWarp ? 'Warp ×' + w.warp : 'Physics ×' + w.warp) : 'Realtime');
    // messages
    while (msgSeen < w.messages.length) {
      const m = w.messages[msgSeen++];
      const d = document.createElement('div'); d.className = 'msg ' + m.level; d.textContent = m.text;
      hud.msgs.appendChild(d);
      setTimeout(() => d.classList.add('out'), 4500); setTimeout(() => d.remove(), 5200);
      while (hud.msgs.children.length > 6) hud.msgs.firstChild.remove();
    }
    if (w.messages.length > 36 && msgSeen >= w.messages.length) { msgSeen = 0; w.messages.length = 0; }
    $('#f-vname').textContent = v ? v.name : '—';
    if (!v) { return; }
    const t = v.tel;
    set(hud.alt, SS.fmt.dist(Math.max(0, t.alt - F.altRef * clamp(1 - t.alt / 20000, 0, 1))));
    set(hud.spdlbl, F.speedMode === 'surface' ? 'SURFACE' : 'ORBITAL');
    set(hud.spd, SS.fmt.speed(F.speedMode === 'surface' ? t.speed : t.orbSpeed));
    set(hud.vs, SS.fmt.speed(t.vs));
    set(hud.mach, t.mach < 0.01 ? '—' : t.mach.toFixed(2));
    set(hud.q, SS.fmt.pa(t.q));
    set(hud.g, t.g.toFixed(1) + ' g');
    set(hud.twr, t.twr.toFixed(2));
    set(hud.mass, SS.fmt.mass(t.mass));
    set(hud.fuel, SS.fmt.mass(t.fuel));
    set(hud.thrust, SS.fmt.force(t.thrust));
    set(hud.aoa, t.speed > 20 && t.rho > 1e-5 ? (t.aoa * 57.3).toFixed(1) + '°' : '—');
    hud.heatbar.style.width = clamp(t.heat * 100, 0, 100) + '%';
    hud.heatbar.parentElement.classList.toggle('hot', t.heat > 0.7);
    const el = SS.orbit.elements(v.x, v.y, v.vx, v.vy);
    set(hud.ap, el.e < 1 ? SS.fmt.dist(el.ap - P.R) : 'escape');
    set(hud.pe, SS.fmt.dist(el.pe - P.R));
    set(hud.tap, el.e < 1 ? SS.fmt.time(el.timeToAp) : '—');
    set(hud.tpe, SS.fmt.time(Math.max(0, el.timeToPe)));
    set(hud.per, el.e < 1 ? SS.fmt.time(el.period) : '—');
    set(hud.ecc, el.e.toFixed(3));
    hud.thrbar.style.height = v.throttle * 100 + '%';
    set(hud.thrval, Math.round(v.throttle * 100) + '%');
    const ap = w.autopilot;
    $('#f-aptoggle').classList.toggle('on', ap.on);
    set(hud.apstate, ap.on ? 'AUTOPILOT: ' + ap.phase.toUpperCase() : 'MANUAL');
    $('#f-sas').classList.toggle('on', v.sasOn);
    $('#f-frame').textContent = v.sasRef === 'surface' ? 'SURF' : 'ORB';
    for (const m of ['hold', 'prograde', 'retrograde', 'radialOut', 'radialIn']) $('#f-sas-' + m).classList.toggle('on', v.sasOn && v.sasMode === m);
    $('#f-warpup').disabled = w.warpIndex >= SS.WARPS.length - 1;
    $('#f-warpdn').disabled = w.warpIndex <= 0;
    // staging list
    const next = v.nextStage();
    const groups = new Map();
    for (const p of v.parts) if (p.def.stageable && p.stage >= v.stageNum && !p.spent && !(p.def.engine && p.ignited) && !(p.def.chute && p.chuteState)) {
      if (!groups.has(p.stage)) groups.set(p.stage, []);
      groups.get(p.stage).push(p);
    }
    const keys = [...groups.keys()].sort((a, b) => a - b);
    let html = '';
    keys.forEach((s, i) => {
      html += `<div class="sg ${i === 0 ? 'next' : ''}"><b>${s}</b>` + groups.get(s).map(p => `<span class="k-${p.def.engine ? 'eng' : p.def.decoupler ? 'dec' : 'chute'}">${p.def.name}</span>`).join('') + '</div>';
    });
    if (hud.stages.dataset.h !== html) { hud.stages.innerHTML = html || '<div class="sg"><i>no stages left</i></div>'; hud.stages.dataset.h = html; }
    SS.Render.drawNavball($('#f-nav'), w);
  }

  function checkOutcome(now) {
    if (outcomeShown || now - lastOutcomeCheck < 500) return;
    lastOutcomeCheck = now;
    const w = F.world;
    const b = hud.banner;
    const ctl = w.vessels.find(v => v.alive && v.hasControl);
    if (!ctl && w.time > 1) {
      outcomeShown = true;
      showBanner('bad', 'MISSION FAILED', 'The command module was destroyed.', w);
    } else if (ctl && ctl.landed && ctl.tel.speed < 1.5 && w.stats.maxAlt > 3000 && w.time > 30 && Math.abs(ctl.tel.vs) < 1) {
      outcomeShown = true;
      showBanner('good', w.stats.maxAlt > P.spaceAlt ? 'SPACE MISSION COMPLETE' : 'SAFE TOUCHDOWN', 'The capsule is back on the ground in one piece.', w);
    }
  }
  function showBanner(kind, title, text, w) {
    const b = hud.banner;
    b.className = 'banner ' + kind;
    $('#f-b-title').textContent = title;
    $('#f-b-text').textContent = text;
    $('#f-b-stats').innerHTML = `<div><span>Max altitude</span><b>${SS.fmt.dist(w.stats.maxAlt)}</b></div><div><span>Max speed</span><b>${SS.fmt.speed(w.stats.maxSpeed)}</b></div><div><span>Mission time</span><b>${SS.fmt.time(w.time)}</b></div><div><span>Parts lost</span><b>${w.stats.exploded}</b></div>`;
    $('#f-b-continue').style.display = kind === 'good' ? '' : 'none';
  }
})(typeof window !== 'undefined' ? window : globalThis);
