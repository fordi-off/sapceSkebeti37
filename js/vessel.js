/* A Vessel is one rigid body (2D) made of connected parts: thrust, aero drag/lift, heating,
 * ground contact, joint loads and break-up all live here. World state is inertial, planet-centred. */
(function (g) {
  const SS = g.SS;
  const P = SS.Planet;
  const Craft = SS.Craft;
  const { clamp, wrapPi } = SS;
  const G0 = P.g0;
  let counter = 0;

  const SAS_MODES = ['hold', 'prograde', 'retrograde', 'radialOut', 'radialIn'];

  class Vessel {
    constructor(world, parts) {
      this.world = world;
      this.id = ++counter;
      this.parts = parts;
      this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; this.theta = 0; this.omega = 0;
      this.throttle = 0; // commanded
      this.steer = 0; // manual input -1..1 (+ = counter-clockwise)
      this.sasOn = true; this.sasMode = 'hold'; this.sasRef = 'surface'; this.sasTarget = 0;
      this.stageNum = 0;
      this.name = 'Vessel ' + this.id;
      this.alive = true;
      this.landed = false;
      this.cx = undefined; this.cy = undefined;
      this.tel = { alt: 0, vs: 0, hs: 0, speed: 0, orbSpeed: 0, mach: 0, q: 0, g: 0, thrust: 0, mass: 0, fuel: 0, heat: 0, rho: 0, twr: 0, aoa: 0 };
      this.destroyQueue = [];
      this.rebuild();
    }

    static fromCraft(world, doc) {
      const parts = doc.parts.map(p => {
        const def = SS.Parts.byId[p.type];
        return {
          id: p.id, type: p.type, def, x: p.x, y: p.y, side: p.side || 1, parent: p.parent ?? null, stage: p.stage,
          fuel: def.fuel, ablator: def.shield ? def.shield.ablator : 0, temp: 288,
          thr: 0, ignited: false, flameout: false, thrustNow: 0, gim: 0, touch: false, spent: false,
          chuteState: 0, chuteFrac: 0, fx: 0, fy: 0, tq: 0, wx: 0, wy: 0, rx: 0, ry: 0, m: 0, aF: 0, aB: 0, tanks: null, dmgT: 0,
        };
      });
      return new Vessel(world, parts);
    }

    /* -------------------------------------------------------- structure */
    rebuild() {
      const parts = this.parts;
      this.partById = new Map(parts.map(p => [p.id, p]));
      this.joints = Craft.joints(parts);
      this.tree = Craft.tree(parts, this.joints);
      for (const p of parts) { p.aboveW = 0; p.belowW = 0; p.strain = 0; p.corners = null; }
      for (const j of this.joints) {
        if (j.radial) continue;
        const A = this.partById.get(j.a), B = this.partById.get(j.b);
        B.aboveW = A.def.wMax; // B has A above it
        A.belowW = B.def.wMax;
      }
      for (const p of parts) {
        const w = p.def.wMax;
        p.aF = (Math.PI / 4) * Math.max(0, w * w - p.aboveW * p.aboveW);
        p.aB = (Math.PI / 4) * Math.max(0, w * w - p.belowW * p.belowW);
        const d = p.def;
        p.corners = [[p.x - d.wTop / 2, p.y + d.h / 2], [p.x + d.wTop / 2, p.y + d.h / 2], [p.x - d.wBot / 2, p.y - d.h / 2], [p.x + d.wBot / 2, p.y - d.h / 2]];
        p.radArea = Math.PI * d.wAvg * d.h + (Math.PI / 2) * d.wMax * d.wMax;
      }
      // fuel domains: connected without crossing decouplers
      const dom = new Map();
      let nd = 0;
      const adj = new Map(parts.map(p => [p.id, []]));
      for (const j of this.joints) {
        const A = this.partById.get(j.a), B = this.partById.get(j.b);
        if (A.def.decoupler || B.def.decoupler) continue;
        adj.get(j.a).push(j.b); adj.get(j.b).push(j.a);
      }
      for (const p of parts) {
        if (dom.has(p.id)) continue;
        const st = [p.id]; dom.set(p.id, nd);
        while (st.length) for (const o of adj.get(st.pop())) if (!dom.has(o)) { dom.set(o, nd); st.push(o); }
        nd++;
      }
      for (const p of parts) p.domain = dom.get(p.id);
      this.engines = parts.filter(p => p.def.engine);
      this.pods = parts.filter(p => p.def.pod);
      this.chutes = parts.filter(p => p.def.chute);
      const tanks = parts.filter(p => p.def.fuel > 0 && !p.def.engine);
      for (const e of this.engines) e.tanks = e.def.engine.solid ? [e] : tanks.filter(t => t.domain === e.domain);
      this.hasControl = this.pods.length > 0;
      this.dirtyMass = true;
      this.massProps();
    }

    massProps() {
      let M = 0, sx = 0, sy = 0;
      for (const p of this.parts) {
        p.m = p.def.mass + p.fuel + p.ablator;
        M += p.m; sx += p.m * p.x; sy += p.m * p.y;
      }
      if (M <= 0) { this.M = 1; this.I = 1; return; }
      const cx = sx / M, cy = sy / M;
      if (this.cx !== undefined && (cx !== this.cx || cy !== this.cy)) {
        // centre of mass moved inside the craft frame: shift the state so parts do not visibly jump
        const dx = cx - this.cx, dy = cy - this.cy;
        const c = Math.cos(this.theta), s = Math.sin(this.theta);
        const wx = c * dx - s * dy, wy = s * dx + c * dy;
        this.x += wx; this.y += wy;
        this.vx += -this.omega * wy; this.vy += this.omega * wx;
      }
      this.cx = cx; this.cy = cy; this.M = M;
      let I = 0, br = 0;
      for (const p of this.parts) {
        p.rx = p.x - cx; p.ry = p.y - cy;
        const d = p.def;
        I += p.m * (p.rx * p.rx + p.ry * p.ry + (d.wAvg * d.wAvg) / 16 + (d.h * d.h) / 12);
        for (const q of p.corners) br = Math.max(br, Math.hypot(q[0] - cx, q[1] - cy));
      }
      this.I = Math.max(I, 1);
      this.boundR = br;
    }

    get totalMass() { return this.M; }

    /* -------------------------------------------------------- staging */
    nextStage() {
      let best = Infinity;
      for (const p of this.parts) if (p.stage >= this.stageNum && p.stage < best && p.def.stageable && !p.spent && !(p.def.engine && p.ignited) && !(p.def.chute && p.chuteState)) best = p.stage;
      return best === Infinity ? -1 : best;
    }

    /** Parts that the next stage activation would fire. */
    nextGroup() {
      const n = this.nextStage();
      return n < 0 ? [] : this.parts.filter(p => p.stage === n && p.def.stageable && !p.spent);
    }

    /** True when the next stage only drops spent hardware (decouplers) while some motors have burnt out. */
    dropSpentReady() {
      const grp = this.nextGroup();
      if (!grp.length || !grp.every(p => p.def.decoupler)) return false;
      const lit = this.engines.filter(e => e.ignited);
      return lit.length > 0 && lit.some(e => e.flameout) && lit.filter(e => e.flameout).every(e => e.def.engine.solid) && lit.some(e => e.def.engine.solid && e.flameout);
    }

    stage() {
      const n = this.nextStage();
      if (n < 0) { this.world && this.world.msg('No more stages', 'warn'); return false; }
      this.stageNum = n + 1;
      const group = this.parts.filter(p => p.stage === n && p.def.stageable);
      for (const p of group) {
        if (p.def.engine) { p.ignited = true; if (p.def.engine.solid) this.throttleLock = true; }
        else if (p.def.chute) p.chuteState = 1;
      }
      for (const p of group) if (p.def.decoupler && !p.spent && this.partById.has(p.id)) this.decouple(p);
      this.world && this.world.msg(`Stage ${n} activated`, 'info');
      return true;
    }

    decouple(p) {
      if (p.spent) return;
      p.spent = true;
      const kids = this.tree.children.get(p.id) || [];
      if (!kids.length) return;
      const dirs = new Map();
      for (const k of kids) {
        const kid = this.partById.get(k);
        const j = this.tree.jointTo.get(k);
        this.joints = this.joints.filter(x => x !== j);
        dirs.set(k, p.def.decoupler.radial ? { lat: true, s: Math.sign(kid.x - p.x) || p.side } : { lat: false, s: Math.sign(kid.y - p.y) || -1 });
      }
      const spawned = this.splitComponents();
      const imp = p.def.decoupler.impulse;
      const c = Math.cos(this.theta), s = Math.sin(this.theta);
      let mainPush = 0;
      for (const v of spawned) {
        for (const [k, dr] of dirs) {
          if (!v.partById.has(k)) continue;
          const ax = dr.lat ? c * dr.s : -s * dr.s, ay = dr.lat ? s * dr.s : c * dr.s;
          v.vx += (ax * imp) / v.M; v.vy += (ay * imp) / v.M;
          this.vx -= (ax * imp) / this.M / Math.max(1, dirs.size); this.vy -= (ay * imp) / this.M / Math.max(1, dirs.size);
          mainPush++;
        }
      }
    }

    /** Split into connected components (using this.joints). Returns the newly created vessels; this keeps the root's piece. */
    splitComponents() {
      const parts = this.parts;
      const adj = new Map(parts.map(p => [p.id, []]));
      for (const j of this.joints) { adj.get(j.a)?.push(j.b); adj.get(j.b)?.push(j.a); }
      const seen = new Set(), comps = [];
      const rootId = this.tree.root ? this.tree.root.id : parts[0]?.id;
      const starts = parts.map(p => p.id);
      starts.sort((a, b) => (a === rootId ? -1 : b === rootId ? 1 : 0));
      for (const s of starts) {
        if (seen.has(s)) continue;
        const comp = [], st = [s]; seen.add(s);
        while (st.length) { const i = st.pop(); comp.push(i); for (const o of adj.get(i) || []) if (!seen.has(o)) { seen.add(o); st.push(o); } }
        comps.push(comp);
      }
      const spawned = [];
      const c = Math.cos(this.theta), s = Math.sin(this.theta);
      // control: the piece with a pod (or the biggest) keeps player focus — handled by world
      for (let i = 1; i < comps.length; i++) {
        const subset = comps[i].map(id => this.partById.get(id));
        let M = 0, sx = 0, sy = 0;
        for (const p of subset) { M += p.m; sx += p.m * p.x; sy += p.m * p.y; }
        const cx = sx / M, cy = sy / M;
        const dx = cx - this.cx, dy = cy - this.cy;
        const wx = c * dx - s * dy, wy = s * dx + c * dy;
        if (!this.world) continue; // analysis mode: just drop the piece
        const v = new Vessel(this.world, subset);
        v.x = this.x + wx; v.y = this.y + wy;
        v.vx = this.vx - this.omega * wy; v.vy = this.vy + this.omega * wx;
        v.theta = this.theta; v.omega = this.omega;
        v.stageNum = this.stageNum; v.sasOn = false; v.name = (v.hasControl ? this.name : 'Debris') ;
        v.sasTarget = this.theta;
        spawned.push(v);
      }
      const keep = new Set(comps[0]);
      this.parts = this.parts.filter(p => keep.has(p.id));
      this.joints = this.joints.filter(j => keep.has(j.a) && keep.has(j.b));
      if (this.parts.length === 0) { this.alive = false; return spawned; }
      this.rebuild();
      if (this.world) this.world.onSplit(this, spawned);
      return spawned;
    }

    destroyPart(p, reason, silent) {
      if (!this.partById.has(p.id)) return;
      if (this.world) this.world.partDestroyed(this, p, reason, silent);
      this.parts = this.parts.filter(q => q !== p);
      this.joints = this.joints.filter(j => j.a !== p.id && j.b !== p.id);
      if (!this.parts.length) { this.alive = false; return; }
      this.partById.delete(p.id);
      // rebuild() needs tree to know the root; do a cheap tree rebuild first so split can pick the right piece
      this.tree = Craft.tree(this.parts, this.joints);
      this.splitComponents();
    }

    /* -------------------------------------------------------- control */
    controlAuthority() {
      let rw = 0;
      for (const p of this.pods) rw += p.def.pod.rw;
      let gim = 0;
      for (const e of this.engines) {
        if (e.thrustNow > 0 && e.def.engine.gimbal > 0) gim += e.thrustNow * Math.abs(e.ry) * Math.sin(e.def.engine.gimbal);
      }
      return { rw: this.hasControl ? rw : 0, gim: this.hasControl ? gim : 0 };
    }

    sasDirection(atmVel) {
      const r = Math.hypot(this.x, this.y);
      switch (this.sasMode) {
        case 'radialOut': return [this.x / r, this.y / r];
        case 'radialIn': return [-this.x / r, -this.y / r];
        default: {
          let vx = this.vx, vy = this.vy;
          if (this.sasRef === 'surface') { vx -= atmVel[0]; vy -= atmVel[1]; }
          const v = Math.hypot(vx, vy);
          if (v < 0.5) return null;
          const sg = this.sasMode === 'retrograde' ? -1 : 1;
          return [(sg * vx) / v, (sg * vy) / v];
        }
      }
    }

    computeControl(atmVel) {
      const auth = this.controlAuthority();
      const Tmax = auth.rw + auth.gim;
      this.u = 0;
      if (Tmax <= 0) return;
      let u = 0;
      if (Math.abs(this.steer) > 0.01) {
        u = this.steer;
        this.sasTarget = this.theta + this.omega * 0.6;
      } else if (this.sasOn) {
        if (this.sasMode !== 'hold') {
          const d = this.sasDirection(atmVel);
          if (d) this.sasTarget = Math.atan2(-d[0], d[1]);
        }
        const e = wrapPi(this.sasTarget - this.theta);
        const aMax = Tmax / this.I;
        const wn2 = Math.min(2.5, aMax / 0.6);
        const wn = Math.sqrt(wn2);
        const ades = wn2 * e - 2 * 0.9 * wn * this.omega;
        u = clamp((ades * this.I) / Tmax, -1, 1);
      }
      this.u = u;
    }

    /* -------------------------------------------------------- propulsion */
    propulsion(dt, pFrac) {
      let total = 0;
      for (const e of this.engines) {
        const en = e.def.engine;
        e.thrustNow = 0;
        if (!e.ignited || e.flameout) { e.thr = Math.max(0, e.thr - dt * 2); continue; }
        const demand = en.solid ? 1 : this.throttle;
        e.thr = en.solid ? 1 : SS.approach(e.thr, demand, dt / 0.35);
        if (e.thr < 0.005) continue;
        const isp = en.ispVac + (en.ispSL - en.ispVac) * pFrac;
        const need = en.mdot * e.thr * dt;
        let avail = 0;
        for (const t of e.tanks) avail += t.fuel;
        if (avail <= 1e-6) { e.flameout = true; e.thr = 0; if (this.world) this.world.msg(en.solid ? 'Booster burnout' : 'Engine flameout - out of propellant', 'warn'); continue; }
        const frac = Math.min(1, avail / need);
        const take = need * frac;
        for (const t of e.tanks) t.fuel = Math.max(0, t.fuel - take * (t.fuel / avail));
        e.thrustNow = en.mdot * e.thr * frac * isp * G0;
        total += e.thrustNow;
        e.dirtyMass = true;
      }
      return total;
    }

    /* -------------------------------------------------------- the physics step */
    step(dt) {
      this.massProps();
      const w = this.world;
      const set = w ? w.settings : SS.defaultSettings;
      const px = this.x, py = this.y;
      const r = Math.hypot(px, py), alt = r - P.R;
      const atm = alt < P.atmTop ? SS.atmosphere(alt) : SS.atmosphere(P.atmTop);
      const rho = atm.rho;
      const nx = px / r, ny = py / r; // local up
      const Om = P.omega;
      const avx = -Om * py, avy = Om * px; // air velocity at the centre
      const c = Math.cos(this.theta), s = Math.sin(this.theta);
      const axX = -s, axY = c, latX = c, latY = s;

      this.computeControl([avx, avy]);
      const thrustTotal = this.propulsion(dt, atm.P / P.P0);

      const u = this.u;
      let gx = (-P.mu / (r * r)) * nx, gy = (-P.mu / (r * r)) * ny;
      let rwTorque = 0;
      if (this.hasControl) { let rw = 0; for (const p of this.pods) rw += p.def.pod.rw; rwTorque = u * rw; }

      const parts = this.parts;
      const om = this.omega;
      let heatMax = 0;
      let relVx = this.vx - avx, relVy = this.vy - avy;
      const vrel = Math.hypot(relVx, relVy);
      const machG = vrel / atm.a;
      const qDyn = 0.5 * rho * vrel * vrel;
      this.tel.aoa = vrel > 5 ? wrapPi(Math.atan2(relVx * latX + relVy * latY, relVx * axX + relVy * axY)) : 0;

      for (const p of parts) {
        p.wx = c * p.rx - s * p.ry; p.wy = s * p.rx + c * p.ry;
        p.fx = p.m * gx; p.fy = p.m * gy; p.tq = 0;
        p.touchNew = false;
      }

      /* thrust */
      for (const e of this.engines) {
        if (e.thrustNow <= 0) { e.gim = SS.approach(e.gim, 0, dt * 1); continue; }
        const gmax = e.def.engine.gimbal;
        e.gim = SS.approach(e.gim, gmax > 0 ? -u * gmax : 0, dt * 0.8);
        const a = this.theta + e.gim;
        e.fxT = -Math.sin(a) * e.thrustNow; e.fyT = Math.cos(a) * e.thrustNow;
        e.fx += e.fxT; e.fy += e.fyT;
      }

      /* aerodynamics + heating + chutes */
      if (rho > 1e-9) {
        const mf = SS.machFactor(machG);
        const half = 0.5 * rho;
        const stag = 1.7415e-4 * Math.sqrt(rho);
        const Taw = atm.T + 0.85 * vrel * vrel / 2010;
        for (const p of parts) {
          const d = p.def;
          const pvx = this.vx - om * p.wy - (-Om * (py + p.wy)), pvy = this.vy + om * p.wx - (Om * (px + p.wx));
          const va = pvx * axX + pvy * axY, vl = pvx * latX + pvy * latY;
          const sp2 = va * va + vl * vl;
          const sp = Math.sqrt(sp2);
          if (sp < 0.05) continue;
          let cdA;
          if (va >= 0) cdA = d.cdF * p.aF + 0.12 * p.aB;
          else cdA = d.cdR * p.aB + 0.12 * p.aF;
          const fa = -Math.sign(va) * half * va * va * cdA * mf;
          let fl = -half * vl * Math.abs(vl) * d.cdCross * d.latArea * mf;
          if (d.fin) {
            const al = Math.atan2(vl, Math.abs(va));
            let cn = 2 * Math.PI * Math.sin(al) * Math.abs(Math.cos(al));
            const aa = Math.abs(al);
            if (aa > 0.26) cn *= Math.exp(-(aa - 0.26) * 3);
            fl += -half * sp2 * d.fin.area * clamp(cn, -1.3, 1.3);
          }
          p.fx += fa * axX + fl * latX * 1; p.fy += fa * axY + fl * latY * 1;
          // chute (drag along relative velocity, applied at the part)
          if (p.chuteState && !p.torn) {
            const ch = p.def.chute;
            const qopen = (0.8 * ch.fMax) / (ch.cd * ch.area);
            const q = half * sp2;
            const target = q < qopen ? 1 : 0.07;
            p.chuteFrac = target > p.chuteFrac ? Math.min(target, p.chuteFrac + dt * 0.25) : target;
            const F = q * ch.cd * ch.area * p.chuteFrac;
            if (F > ch.fMax) { p.torn = true; this.destroyQueue.push([p, 'chute torn', true]); }
            else { p.fx += (-pvx / sp) * F; p.fy += (-pvy / sp) * F; }
          }
          // aerodynamic heating (Sutton-Graves stagnation flux, limited by recovery temperature)
          if (set.heating && sp > 250) {
            const Rn = Math.max(0.08, d.noseR ?? d.wMax / 2);
            const flux = (stag / Math.sqrt(Rn)) * sp2 * sp * clamp(1 - p.temp / Taw, 0, 1);
            const front = va >= 0 ? p.aF : p.aB;
            const cosA = Math.abs(va) / sp, sinA = Math.abs(vl) / sp;
            const area = front * cosA * 0.5 + d.latArea * sinA * 0.3;
            p.heatIn = p.def.chute && !p.chuteState ? 0 : flux * area; // stowed chutes sit in a fairing
          } else p.heatIn = 0;
        }
      } else {
        for (const p of parts) p.heatIn = 0;
      }

      /* ground contact */
      let contacts = 0;
      if (alt < this.boundR + 5) {
        const M = this.M;
        for (const p of parts) {
          const d = p.def;
          const k = M * (d.contactK ?? 160) * 0.5, cdmp = M * 6;
          for (let ci = 0; ci < 4; ci++) {
            const q = p.corners[ci];
            const lx = q[0] - this.cx, ly = q[1] - this.cy;
            const wx = c * lx - s * ly, wy = s * lx + c * ly;
            const X = px + wx, Y = py + wy;
            const rr = Math.hypot(X, Y);
            const pen = P.R - rr;
            if (pen <= 0) continue;
            const cnx = X / rr, cny = Y / rr;
            const vx = this.vx - om * wy - (-Om * Y), vy = this.vy + om * wx - Om * X;
            const vn = vx * cnx + vy * cny;
            if (!p.touch && -vn > d.crash && set.crashDamage) this.destroyQueue.push([p, 'impact', false]);
            let Fn = k * pen - cdmp * vn;
            if (Fn < 0) Fn = 0;
            const tx = -cny, ty = cnx;
            const vt = vx * tx + vy * ty;
            let Ft = -M * 18 * vt;
            const lim = 0.8 * Fn;
            Ft = clamp(Ft, -lim, lim);
            const fx = Fn * cnx + Ft * tx, fy = Fn * cny + Ft * ty;
            p.fx += fx; p.fy += fy;
            // torque about the part centre
            const ox = X - (px + p.wx), oy = Y - (py + p.wy);
            p.tq += ox * fy - oy * fx;
            p.touchNew = true;
            contacts++;
          }
        }
      }
      this.landed = contacts > 0;

      /* totals */
      let sumFx = 0, sumFy = 0, sumT = rwTorque;
      for (const p of parts) {
        sumFx += p.fx; sumFy += p.fy;
        sumT += p.wx * p.fy - p.wy * p.fx + p.tq;
      }
      const M = this.M;
      const ax = sumFx / M, ay = sumFy / M, alpha = sumT / this.I;

      /* telemetry (before integrating) */
      const tel = this.tel;
      const ngx = ax - gx, ngy = ay - gy;
      tel.g = Math.hypot(ngx, ngy) / G0;
      tel.alt = alt; tel.rho = rho; tel.q = qDyn; tel.mach = machG;
      tel.speed = vrel; tel.orbSpeed = Math.hypot(this.vx, this.vy);
      tel.vs = relVx * nx + relVy * ny;
      tel.hs = relVx * -ny + relVy * nx;
      tel.thrust = thrustTotal; tel.mass = M;
      let fuel = 0; for (const p of parts) if (p.def.fuel > 0) fuel += p.fuel;
      tel.fuel = fuel;
      tel.twr = thrustTotal / (M * (P.mu / (r * r)));

      /* joint loads -> structural failure */
      if (set.structural && parts.length > 1) this.checkJoints(ax, ay, alpha, axX, axY, latX, latY, dt, set);

      /* integrate */
      this.vx += ax * dt; this.vy += ay * dt;
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.omega += alpha * dt;
      this.theta += this.omega * dt;
      if (this.theta > 1e3 || this.theta < -1e3) this.theta = wrapPi(this.theta);

      /* thermal */
      for (const p of parts) {
        p.touch = p.touchNew;
        const C = p.m * p.def.cp * (p.def.skin ?? 0.12); // only the heated skin takes part
        let net = p.heatIn || 0;
        if (p.temp > 330) {
          net -= 0.8 * 5.67e-8 * p.radArea * (Math.pow(p.temp, 4) - Math.pow(250, 4));
        }
        if (rho > 1e-4 && p.temp > atm.T) net -= Math.min(1, rho / 0.5) * 18 * p.radArea * (p.temp - atm.T) * Math.min(3, 1 + vrel / 150);
        if (p.ablator > 0 && p.temp > 2000 && p.heatIn > 0) {
          const dQ = (p.temp - 2000) * C + net * dt; // excess energy above ablation temperature
          p.temp = 2000;
          p.ablator = Math.max(0, p.ablator - Math.max(0, dQ) / 1.1e7);
          p.dirtyMass = true;
          if (p.ablator <= 0) p.temp = 2001;
        } else if (set.heating || p.temp > 400) {
          p.temp += (net * dt) / C;
          if (p.temp < 3) p.temp = 3;
        }
        if (p.temp > p.def.maxTemp && set.heating) this.destroyQueue.push([p, 'overheated', false]);
        const hr = (p.temp - 300) / (p.def.maxTemp - 300);
        if (hr > heatMax) heatMax = hr;
      }
      tel.heat = heatMax;

      if (this.destroyQueue.length) {
        const q = this.destroyQueue; this.destroyQueue = [];
        const done = new Set();
        for (const [p, reason, silent] of q) {
          if (done.has(p.id)) continue;
          done.add(p.id);
          const owner = this.partById.has(p.id) ? this : null;
          if (owner) this.destroyPart(p, reason, silent);
        }
      }
    }

    /** Net internal force/moment at each joint from the rigid-body accelerations. */
    checkJoints(ax, ay, alpha, axX, axY, latX, latY, dt, set) {
      const T = this.tree;
      const n = T.order.length;
      const S = this._S || (this._S = new Map());
      const om2 = this.omega * this.omega;
      const sums = new Map();
      for (const id of T.order) {
        const p = this.partById.get(id);
        const aix = ax - alpha * p.wy - om2 * p.wx, aiy = ay + alpha * p.wx - om2 * p.wy;
        const Dx = p.m * aix - p.fx, Dy = p.m * aiy - p.fy;
        const Ii = p.m * (p.def.wAvg * p.def.wAvg / 16 + p.def.h * p.def.h / 12);
        sums.set(id, { Dx, Dy, C: p.wx * Dy - p.wy * Dx + Ii * alpha - p.tq });
      }
      const c = Math.cos(this.theta), s = Math.sin(this.theta);
      const mult = set.jointStrength;
      for (let i = n - 1; i >= 1; i--) {
        const id = T.order[i];
        const sm = sums.get(id);
        const par = sums.get(T.parent.get(id));
        par.Dx += sm.Dx; par.Dy += sm.Dy; par.C += sm.C;
        const j = T.jointTo.get(id);
        const lx = j.x - this.cx, ly = j.y - this.cy;
        const Jx = c * lx - s * ly, Jy = s * lx + c * ly;
        const M = sm.C - (Jx * sm.Dy - Jy * sm.Dx);
        const axial = sm.Dx * axX + sm.Dy * axY, shear = sm.Dx * latX + sm.Dy * latY;
        const d = j.d;
        const Sa = 1.6e6 * d * d * mult, Ss = 0.95e6 * d * d * mult, Sm = 0.5e6 * j.dm * j.dm * j.dm * mult;
        const ratio = Math.abs(axial) / Sa + Math.abs(shear) / Ss + Math.abs(M) / Sm;
        const p = this.partById.get(id);
        p.strain = ratio;
        if (ratio > 1) {
          p.over = (p.over || 0) + dt;
          if (p.over > 0.04) {
            p.over = 0;
            this.breakJoint(j, id);
            return;
          }
        } else p.over = 0;
      }
    }

    breakJoint(j, childId) {
      this.joints = this.joints.filter(x => x !== j);
      this.world && this.world.msg('Structural failure! Joint snapped', 'bad');
      this.splitComponents();
    }

    /** World position of a craft-frame point. */
    worldPoint(lx, ly) {
      const c = Math.cos(this.theta), s = Math.sin(this.theta);
      lx -= this.cx; ly -= this.cy;
      return [this.x + c * lx - s * ly, this.y + s * lx + c * ly];
    }

    /** Place on the planet surface at the launch site. */
    placeOnPad(angle) {
      let low = Infinity;
      for (const p of this.parts) for (const q of p.corners) low = Math.min(low, q[1] - this.cy);
      const rad = P.R - low - 0.01;
      this.x = rad * Math.cos(angle); this.y = rad * Math.sin(angle);
      this.theta = angle - Math.PI / 2;
      this.vx = -P.omega * this.y; this.vy = P.omega * this.x;
      this.omega = 0;
      this.sasTarget = this.theta;
    }

    totalFuel() { let f = 0; for (const p of this.parts) if (p.def.fuel > 0) f += p.fuel; return f; }
  }

  Vessel.SAS_MODES = SAS_MODES;
  SS.Vessel = Vessel;

  SS.defaultSettings = { heating: true, structural: true, crashDamage: true, jointStrength: 1 };
})(typeof window !== 'undefined' ? window : globalThis);
