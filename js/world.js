/* The simulated universe: vessels, time warp, explosions, particles, ascent autopilot and craft analysis. */
(function (g) {
  const SS = g.SS;
  const P = SS.Planet;
  const { clamp } = SS;
  const H = 1 / 120; // physics tick

  const WARPS = [
    { f: 1, rails: false }, { f: 2, rails: false }, { f: 4, rails: false },
    { f: 10, rails: true }, { f: 50, rails: true }, { f: 100, rails: true }, { f: 1000, rails: true }, { f: 10000, rails: true }, { f: 100000, rails: true },
  ];

  class World {
    constructor(settings) {
      this.settings = Object.assign({}, SS.defaultSettings, settings || {});
      this.vessels = [];
      this.active = null;
      this.time = 0;
      this.warpIndex = 0;
      this.particles = [];
      this.messages = [];
      this.paused = false;
      this.acc = 0;
      this.autopilot = new Autopilot(this);
      this.shake = 0;
      this.stats = { maxAlt: 0, maxSpeed: 0, exploded: 0, crew: 0 };
      this.events = [];
    }

    get warp() { return WARPS[this.warpIndex].f; }
    get railsWarp() { return WARPS[this.warpIndex].rails; }
    siteAngle() { return P.siteAngle + P.omega * this.time; }

    launch(doc) {
      const v = SS.Vessel.fromCraft(this, doc);
      v.name = doc.name || 'Rocket';
      v.placeOnPad(this.siteAngle());
      this.vessels.push(v);
      this.active = v;
      return v;
    }

    msg(text, level = 'info') {
      this.messages.push({ text, level, t: performance_now() });
      if (this.messages.length > 40) this.messages.shift();
      this.events.push({ t: this.time, text, level });
      if (this.events.length > 400) this.events.shift();
    }

    setWarp(i) {
      i = clamp(i, 0, WARPS.length - 1);
      if (WARPS[i].rails && !this.railsAllowed(true)) return false;
      this.warpIndex = i;
      return true;
    }

    railsAllowed(announce) {
      const v = this.active;
      if (!v) return false;
      const why = m => { if (announce) this.msg(m, 'warn'); return false; };
      if (v.landed) return why('Cannot time-warp while touching the ground');
      if (v.tel.alt < P.spaceAlt + 10000) return why('Cannot time-warp inside the atmosphere');
      if (v.tel.thrust > 1) return why('Cannot time-warp while engines are firing');
      if (!this.railsSafe(v, 30)) return why('Orbit dips into the atmosphere - physics warp only');
      return true;
    }

    railsSafe(v, dt) {
      let s = [v.x, v.y, v.vx, v.vy];
      // sample the next stretch of trajectory (use a window big enough to include the lowest point)
      const el = SS.orbit.elements(v.x, v.y, v.vx, v.vy);
      if (el.pe < P.R + P.spaceAlt - 5000 && el.e < 1.0001) {
        // periapsis inside the sensible-space ceiling: only OK if we are nowhere near it
        const tPe = el.timeToPe;
        const tAp = el.timeToAp;
        const span = Math.max(dt, 1);
        if (Math.min(tPe, el.period - tPe) < span * 3 + 600) return false;
      }
      return true;
    }

    onSplit(old, spawned) {
      for (const v of spawned) this.vessels.push(v);
      if (this.active === old || spawned.some(v => v === this.active)) {
        const all = [old, ...spawned].filter(v => v.alive);
        const ctl = all.find(v => v.hasControl);
        if (this.active === old && ctl && ctl !== old) {
          this.active = ctl;
          ctl.throttle = old.throttle; ctl.sasOn = old.sasOn; ctl.sasMode = old.sasMode; ctl.sasRef = old.sasRef; ctl.sasTarget = old.sasTarget; ctl.stageNum = old.stageNum;
          ctl.name = old.name;
          old.throttle = 0;
        }
        if (!all.some(v => v.hasControl) && this.active === old) {
          this.msg('Command module lost', 'bad');
        }
      }
    }

    partDestroyed(v, p, reason, silent) {
      const [x, y] = v.worldPoint(p.x, p.y);
      this.stats.exploded++;
      if (!silent) {
        this.msg(`${p.def.name} destroyed (${reason})`, 'bad');
        const fuel = p.fuel + p.ablator * 0;
        const E = fuel * 1.2e6 + p.def.mass * 5e4;
        this.explode(x, y, v.vx, v.vy, E, v);
        if (p.def.pod && !v.pods.some(q => q !== p)) this.msg('Crew lost', 'bad');
      } else {
        this.msg(`${p.def.name} lost (${reason})`, 'warn');
        this.sparks(x, y, v.vx, v.vy, 12, 0.5);
      }
    }

    sparks(x, y, vx, vy, n, spread) {
      for (let i = 0; i < n && this.particles.length < 2500; i++) {
        const a = Math.random() * 6.283, sp = (0.3 + Math.random()) * 25 * spread;
        this.particles.push({ x, y, vx: vx + Math.cos(a) * sp, vy: vy + Math.sin(a) * sp, life: 0, max: 1 + Math.random() * 1.5, size: 0.15 + Math.random() * 0.25, type: 'debris', gravity: true });
      }
    }

    explode(x, y, vx, vy, E, src) {
      const n = clamp(Math.round(Math.sqrt(E / 1e5)), 8, 90);
      for (let i = 0; i < n && this.particles.length < 2500; i++) {
        const a = Math.random() * 6.283, sp = Math.random() * (10 + Math.sqrt(E) * 0.004);
        this.particles.push({ x, y, vx: vx + Math.cos(a) * sp, vy: vy + Math.sin(a) * sp, life: 0, max: 0.6 + Math.random() * 1.6, size: 1 + Math.random() * (1 + Math.sqrt(E) * 0.0006), type: 'fire' });
      }
      this.sparks(x, y, vx, vy, clamp(n / 2, 6, 40), 1 + Math.sqrt(E) * 0.0002);
      this.events.push({ t: this.time, boom: true });
      if (this.active) {
        const d = Math.hypot(this.active.x - x, this.active.y - y);
        this.shake = Math.max(this.shake, Math.min(1, (Math.sqrt(E) / (50 + d)) * 0.05));
      }
      if (E < 2e6) return;
      // blast wave damages nearby parts (they die on the next step, so a chain reaction ripples)
      for (const v of this.vessels) {
        if (!v.alive) continue;
        const [bx, by] = [v.x - x, v.y - y];
        if (Math.hypot(bx, by) > v.boundR + 400) continue;
        for (const q of v.parts) {
          const [qx, qy] = v.worldPoint(q.x, q.y);
          const d = Math.hypot(qx - x, qy - y);
          if (d < 0.01) continue;
          const fluence = E / (4 * Math.PI * (d + 1.5) * (d + 1.5));
          const thr = 4e5 * Math.pow((q.m + 50) / 500, 0.3);
          if (fluence > thr && !(q === src)) v.destroyQueue.push([q, 'blast damage', false]);
        }
        const d = Math.hypot(bx, by) + 2;
        const dv = Math.min(60, (E / (4 * Math.PI * d * d)) * 6 / Math.max(500, v.M) * 0.01 * 200);
        v.vx += (bx / d) * dv; v.vy += (by / d) * dv;
        v.omega += (Math.random() - 0.5) * dv * 0.05;
      }
    }

    /* -------------------------------------------------------- update */
    update(dtReal) {
      if (this.paused) return;
      dtReal = Math.min(dtReal, 0.1);
      this.autopilot.update(dtReal);
      if (this.railsWarp && !this.railsAllowed(true)) { this.warpIndex = 2; }
      if (this.railsWarp) {
        this.rails(dtReal * this.warp);
      } else {
        this.acc += dtReal * this.warp;
        let n = 0;
        while (this.acc >= H && n < 20) {
          this.stepAll(H);
          this.acc -= H; n++;
        }
        if (this.acc > H * 20) this.acc = 0;
      }
      this.cleanup();
      this.updateParticles(dtReal);
      this.shake *= Math.pow(0.02, dtReal);
      const a = this.active;
      if (a) { this.stats.maxAlt = Math.max(this.stats.maxAlt, a.tel.alt); this.stats.maxSpeed = Math.max(this.stats.maxSpeed, a.tel.orbSpeed); }
    }

    stepAll(h) {
      const list = this.vessels.slice();
      for (const v of list) if (v.alive) v.step(h);
      this.time += h;
    }

    rails(dt) {
      const list = this.vessels.slice();
      for (const v of list) {
        if (!v.alive) continue;
        const alt = Math.hypot(v.x, v.y) - P.R;
        if (alt < P.spaceAlt) { if (v !== this.active) v.alive = false; continue; }
        const s = SS.orbit.propagate(v.x, v.y, v.vx, v.vy, dt);
        v.x = s[0]; v.y = s[1]; v.vx = s[2]; v.vy = s[3];
        v.omega = 0;
        v.massProps();
        if (v.sasOn && v.sasMode !== 'hold') {
          const d = v.sasDirection([-P.omega * v.y, P.omega * v.x]);
          if (d) { v.theta = Math.atan2(-d[0], d[1]); v.sasTarget = v.theta; }
        }
        // refresh telemetry
        const r = Math.hypot(v.x, v.y);
        v.tel.alt = r - P.R; v.tel.orbSpeed = Math.hypot(v.vx, v.vy); v.tel.speed = v.tel.orbSpeed;
        v.tel.vs = (v.x * v.vx + v.y * v.vy) / r; v.tel.q = 0; v.tel.mach = 0; v.tel.g = 0; v.tel.thrust = 0; v.tel.rho = 0;
      }
      this.time += dt;
    }

    cleanup() {
      let debris = 0;
      const act = this.active;
      this.vessels = this.vessels.filter(v => {
        if (!v.alive) return false;
        if (v !== act && !v.hasControl) {
          debris++;
          if (v.tel.alt < -50) return false;
          v.age = (v.age || 0) + 1;
          if (v.landed && v.age > 60 * 40 && Math.hypot(v.vx + P.omega * v.y, v.vy - P.omega * v.x) < 1) return false;
          if (v.parts.length < 2 && v.landed && v.age > 60 * 8) return false;
        }
        return true;
      });
      if (act && !act.alive) {
        this.active = this.vessels.find(v => v.hasControl) || null;
        if (!this.active) this.active = this.vessels.reduce((a, b) => (!a || b.M > a.M ? b : a), null);
      }
    }

    cycleVessel(dir) {
      const list = this.vessels.filter(v => v.alive);
      if (!list.length) return;
      const i = list.indexOf(this.active);
      const nv = list[(i + dir + list.length) % list.length];
      if (this.active) this.active.throttle = 0;
      this.active = nv;
    }

    /* -------------------------------------------------------- particles */
    updateParticles(dt) {
      const act = this.active;
      const list = this.particles;
      // exhaust
      if (act) {
        for (const v of this.vessels) {
          if (!v.alive || Math.hypot(v.x - act.x, v.y - act.y) > 20000) continue;
          const alt = v.tel.alt;
          const atm = SS.atmosphere(alt);
          const exp = clamp(1 + 3 * (1 - atm.P / P.P0), 1, 4);
          const c = Math.cos(v.theta), s = Math.sin(v.theta);
          for (const e of v.engines) {
            if (e.thrustNow <= 0 || list.length > 2200) continue;
            const d = e.def;
            const [ex, ey] = v.worldPoint(e.x, e.y - d.h / 2);
            const power = Math.sqrt(e.thrustNow / 1e5);
            const n = Math.min(14, Math.ceil(power * 0.7 + 1) * (this.warp > 1 ? 1 : 1));
            const ve = (e.def.engine.ispVac * 9.8) * 0.5;
            for (let i = 0; i < n; i++) {
              const sp = (Math.random() - 0.5) * 0.25 * exp;
              const a = v.theta + e.gim + sp;
              const dx = Math.sin(a), dy = -Math.cos(a);
              const k = Math.random() * dt;
              list.push({ x: ex + (v.vx + dx * ve) * k, y: ey + (v.vy + dy * ve) * k, vx: v.vx + dx * ve * (0.4 + Math.random() * 0.2), vy: v.vy + dy * ve * (0.4 + Math.random() * 0.2), life: 0, max: 0.25 + Math.random() * 0.3 * exp, size: (d.wBot * 0.45 + 0.2) * (0.7 + 0.3 * exp), type: 'exhaust', drag: 0.6 });
            }
            if (alt < 800 && Math.random() < 0.9) {
              for (let i = 0; i < 2; i++) list.push({ x: ex, y: ey, vx: v.vx + (Math.random() - 0.5) * 40, vy: v.vy + (Math.random() - 0.5) * 40, life: 0, max: 3 + Math.random() * 3, size: d.wBot * (0.25 + Math.random() * 0.35), type: 'smoke', drag: 1.2 });
            }
          }
        }
      }
      const R = P.R;
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.life += dt;
        if (p.life >= p.max) { list[i] = list[list.length - 1]; list.pop(); continue; }
        const r = Math.hypot(p.x, p.y);
        if (p.gravity) { const gg = (P.mu / (r * r)); p.vx -= (p.x / r) * gg * dt; p.vy -= (p.y / r) * gg * dt; }
        if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx = p.vx * k + (-P.omega * p.y) * (1 - k); p.vy = p.vy * k + (P.omega * p.x) * (1 - k); }
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (r < R) {
          if (p.type === 'debris') { p.x *= R / r; p.y *= R / r; p.vx = -P.omega * p.y; p.vy = P.omega * p.x; p.max = Math.min(p.max, p.life + 4); }
          else { p.max = 0; }
        }
      }
    }
  }

  const performance_now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  /* ================================================================ Autopilot */
  class Autopilot {
    constructor(world) {
      this.world = world;
      this.on = false;
      this.targetAlt = 150000;
      this.phase = 'idle';
      this.stageCool = 0;
      this.t = 0;
      this.log = '';
    }
    start() {
      this.on = true; this.phase = 'launch'; this.t = 0;
      this.world.msg('Ascent autopilot engaged', 'info');
    }
    stop(msg) {
      if (this.on && msg) this.world.msg(msg, 'info');
      this.on = false; this.phase = 'idle';
      if (this.world.active) this.world.active.throttle = 0;
    }
    availThrust(v) {
      const next = v.nextStage();
      let t = 0;
      for (const e of v.engines) if (!e.flameout && (e.ignited || e.stage === next)) t += e.def.engine.vacThrust;
      return t;
    }
    update(dt) {
      if (!this.on) return;
      const w = this.world, v = w.active;
      if (!v || !v.alive || !v.hasControl) { this.stop(); return; }
      this.t += dt;
      this.stageCool -= dt;
      const tel = v.tel;
      const el = SS.orbit.elements(v.x, v.y, v.vx, v.vy);
      const alt = tel.alt;
      const up = Math.atan2(v.y, v.x) - Math.PI / 2; // body angle for "straight up"
      const target = this.targetAlt;
      v.sasOn = true;
      v.steer = 0;
      // automatic staging when the active engines have run dry
      const burning = v.engines.some(e => e.ignited && !e.flameout);
      if (v.throttle > 0.05 && !burning && this.stageCool <= 0 && v.nextStage() >= 0) { v.stage(); this.stageCool = 1.0; }
      if (v.throttle > 0.05 && !burning && v.nextStage() < 0 && this.phase !== 'launch') { this.stop('Autopilot: out of propellant'); return; }
      switch (this.phase) {
        case 'launch':
          v.throttle = 1;
          v.sasMode = 'hold'; v.sasTarget = up;
          if (v.stageNum === 0 && !v.engines.some(e => e.ignited)) v.stage();
          if (tel.speed > 55 && alt > 100) { this.phase = 'turn'; this.turnT = 0; w.msg('Autopilot: gravity turn', 'info'); }
          break;
        case 'turn': {
          this.turnT += dt;
          // pitch programme with a bounded angle of attack: follow the velocity vector tracking the profile within an angle-of-attack limit
          const dir = P.omega < 0 ? -1 : 1; // sign of travel for "east"
          const r = Math.hypot(v.x, v.y), nx = v.x / r, ny = v.y / r;
          let vx = v.vx, vy = v.vy;
          if (alt < 45000) { vx -= -P.omega * v.y; vy -= P.omega * v.x; }
          const ex = dir < 0 ? ny : -ny, ey = dir < 0 ? -nx : nx; // east unit vector
          const gam = Math.atan2(vx * nx + vy * ny, vx * ex + vy * ey);
          const prof = (Math.PI / 2) * (1 - Math.pow(clamp(alt / (this.profAlt || 70000), 0, 1), this.profExp || 0.85));
          const maxAoA = (alt < 45000 ? 6 : 25) * Math.PI / 180;
          const nose = clamp(prof, gam - maxAoA, gam + maxAoA);
          v.sasMode = 'hold';
          v.sasTarget = up + dir * (Math.PI / 2 - nose);
          v.throttle = 1;
          // limit dynamic pressure
          if (tel.q > 38000) v.throttle = clamp(1 - (tel.q - 38000) / 15000, 0.35, 1);
          if (el.ap - P.R >= target) { v.throttle = 0; this.phase = 'coast'; w.msg('Autopilot: apoapsis reached, coasting', 'info'); }
          if (tel.vs < -5 && alt < 2000) this.stop('Autopilot: lost');
          break;
        }
        case 'coast': {
          v.throttle = 0;
          v.sasMode = 'prograde'; v.sasRef = 'orbit';
          // compensate drag while still in the atmosphere
          if (el.ap - P.R < target - 3000 && alt < P.spaceAlt) { v.throttle = 0.6; }
          // circularise at apoapsis
          const vc = Math.sqrt(P.mu / el.r);
          const vAp = Math.sqrt(P.mu * (2 / el.r - 1 / el.a));
          const dv = Math.max(0, vc - Math.hypot(v.vx, v.vy));
          const a = this.availThrust(v) / v.M;
          const burn = a > 0 ? dv / a : 99999;
          const tAp = el.timeToAp;
          this.burnEst = burn;
          if (alt > P.spaceAlt && tAp - burn / 2 < 1.5) { this.phase = 'circ'; w.msg('Autopilot: circularisation burn', 'info'); }
          else if (alt > P.spaceAlt && tAp - burn / 2 > 40 && !w.railsWarp && w.warpIndex < 4 && this.autoWarp !== false && w.railsAllowed(false)) w.setWarp(tAp - burn / 2 > 600 ? 5 : 3);
          if (w.railsWarp && tAp - burn / 2 < (w.warp >= 100 ? 400 : 60)) w.setWarp(0);
          break;
        }
        case 'circ': {
          if (w.warpIndex > 0) w.setWarp(0);
          if (v.nextStage() >= 0 && !v.engines.some(e => e.ignited && !e.flameout)) { if (this.stageCool <= 0) { v.stage(); this.stageCool = 1; } }
          // aim along local horizontal, tilted to hold altitude
          const err = target - alt;
          const dirSign = (v.x * v.vy - v.y * v.vx) >= 0 ? 1 : -1;
          const tilt = clamp(err * 0.00002 - tel.vs * 0.01, -0.4, 0.4);
          v.sasMode = 'hold';
          v.sasTarget = up + dirSign * (Math.PI / 2 - tilt);
          v.throttle = el.pe - P.R > target * 0.9 ? 0.25 : 1;
          if (el.pe - P.R >= target * 0.97 || (el.e < 0.004 && alt > P.spaceAlt)) {
            v.throttle = 0; this.stop('Autopilot: orbit achieved!');
            v.sasMode = 'prograde'; v.sasRef = 'orbit';
          }
          break;
        }
      }
    }
  }
  World.Autopilot = Autopilot;
  SS.World = World;
  SS.WARPS = WARPS;

  /* ================================================================ Craft analysis (vacuum delta-v, TWR...) */
  SS.analyze = function (doc) {
    const res = { stages: [], dv: 0, wet: 0, dry: 0, fuel: 0, twrSL: 0, burn: 0, warnings: [], height: 0, hasPod: false, engines: 0 };
    if (!doc.parts.length) { res.warnings.push('Craft is empty'); return res; }
    const joints = SS.Craft.joints(doc.parts);
    const conn = SS.Craft.connected(doc.parts, joints);
    if (conn.size < doc.parts.length) res.warnings.push(`${doc.parts.length - conn.size} part(s) not connected to the craft`);
    const m = SS.Craft.mass(doc);
    res.wet = m.wet; res.dry = m.dry;
    for (const p of doc.parts) {
      const d = SS.Parts.byId[p.type];
      res.fuel += d.fuel;
      if (d.pod) res.hasPod = true;
      if (d.engine) res.engines++;
    }
    let top = -Infinity, bot = Infinity;
    for (const p of doc.parts) { const d = SS.Parts.byId[p.type]; top = Math.max(top, p.y + d.h / 2); bot = Math.min(bot, p.y - d.h / 2); }
    res.height = top - bot;
    if (!res.hasPod) res.warnings.push('No command pod: the craft cannot be steered');
    if (!res.engines) res.warnings.push('No engines');
    const v = SS.Vessel.fromCraft(null, doc);
    v.throttle = 1;
    let guard = 0;
    while (guard++ < 25) {
      const n = v.nextStage();
      if (n < 0) break;
      const hadEngines = v.engines.length;
      v.stage();
      v.massProps();
      const lit = v.engines.filter(e => e.ignited && !e.flameout);
      if (!lit.length) continue;
      for (const e of lit) e.thr = 1;
      const m0 = v.M;
      let thrSL = 0, thrVac = 0;
      for (const e of lit) { thrSL += e.def.engine.slThrust; thrVac += e.def.engine.vacThrust; }
      let dv = 0, t = 0, dt = 0.25;
      while (t < 5000) {
        const thrust = v.propulsion(dt, 0);
        if (thrust < 1) break;
        v.massProps();
        dv += (thrust / v.M) * dt; t += dt;
      }
      const st = { stage: n, dv, burn: t, m0, m1: v.M, twrVac: thrVac / (m0 * P.g0), twrSL: thrSL / (m0 * P.g0), thrustSL: thrSL, thrustVac: thrVac };
      res.stages.push(st);
      res.dv += dv; res.burn += t;
    }
    if (res.stages.length) res.twrSL = res.stages[0].twrSL;
    if (res.engines && res.stages.length) {
      if (res.stages[0].twrSL < 1.0) res.warnings.push(`First stage TWR ${res.stages[0].twrSL.toFixed(2)} < 1: it cannot lift off`);
    } else if (res.engines) res.warnings.push('Engines are not assigned to any stage');
    return res;
  };
})(typeof window !== 'undefined' ? window : globalThis);
