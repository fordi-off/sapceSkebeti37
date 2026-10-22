/* Planet constants, International-Standard-Atmosphere model and Keplerian orbit maths. */
(function (g) {
  const SS = g.SS;
  const P = (SS.Planet = {
    name: 'Earth',
    R: 6371000,
    mu: 3.986004418e14,
    omega: -7.2921159e-5, // rad/s, negative = clockwise so "east" is +x at the launch site
    g0: 9.80665,
    atmTop: 200000,
    spaceAlt: 100000,
    P0: 101325,
    siteAngle: Math.PI / 2,
  });

  // ISA layers: base altitude, base temperature, lapse rate (K/m)
  const RG = 287.05;
  const layers = [
    [0, 288.15, -0.0065], [11000, 216.65, 0], [20000, 216.65, 0.001], [32000, 228.65, 0.0028],
    [47000, 270.65, 0], [51000, 270.65, -0.0028], [71000, 214.65, -0.002], [84852, 186.946, 0],
  ];
  const basePressure = [P.P0];
  for (let i = 0; i < layers.length - 1; i++) {
    const [h0, T0, L] = layers[i], h1 = layers[i + 1][0];
    const p0 = basePressure[i];
    basePressure.push(
      L !== 0
        ? p0 * Math.pow((T0 + L * (h1 - h0)) / T0, -P.g0 / (L * RG))
        : p0 * Math.exp((-P.g0 * (h1 - h0)) / (RG * T0))
    );
  }

  const out = { rho: 0, P: 0, T: 186.9, a: 274 };
  /** Atmosphere at geometric altitude h (m). Returns a shared object — copy values if you keep them. */
  SS.atmosphere = function (h) {
    if (h >= P.atmTop) {
      out.rho = 0; out.P = 0; out.T = 186.9; out.a = 274;
      return out;
    }
    if (h < 0) h = 0;
    let T, p;
    if (h < 84852) {
      let i = 0;
      while (i < layers.length - 2 && h >= layers[i + 1][0]) i++;
      const [h0, T0, L] = layers[i];
      T = T0 + L * (h - h0);
      p = L !== 0 ? basePressure[i] * Math.pow(T / T0, -P.g0 / (L * RG)) : basePressure[i] * Math.exp((-P.g0 * (h - h0)) / (RG * T0));
    } else {
      const x = h - 84852;
      T = 186.946 + Math.min(600, x * 0.012);
      p = basePressure[layers.length - 1] * Math.exp(-x / (5400 + 0.05 * x));
    }
    out.T = T; out.P = p; out.rho = p / (RG * T); out.a = Math.sqrt(1.4 * RG * T);
    return out;
  };

  /** Drag-coefficient multiplier vs Mach number (transonic wave-drag rise). */
  const MACH = [[0, 1], [0.8, 1], [1.0, 1.9], [1.15, 2.1], [1.5, 1.8], [2.5, 1.4], [4, 1.2], [8, 1.1], [30, 1.05]];
  SS.machFactor = m => SS.interp(MACH, m);

  /* ---------------------------------------------------------------- Orbits */
  const O = (SS.orbit = {});
  const stumpffC = z => (z > 1e-6 ? (1 - Math.cos(Math.sqrt(z))) / z : z < -1e-6 ? (Math.cosh(Math.sqrt(-z)) - 1) / -z : 0.5 - z / 24);
  const stumpffS = z => {
    if (z > 1e-6) { const s = Math.sqrt(z); return (s - Math.sin(s)) / (s * s * s); }
    if (z < -1e-6) { const s = Math.sqrt(-z); return (Math.sinh(s) - s) / (s * s * s); }
    return 1 / 6 - z / 120;
  };

  /** Propagate a 2D two-body state by dt seconds using universal variables. Returns [x,y,vx,vy]. */
  O.propagate = function (x, y, vx, vy, dt, mu) {
    mu = mu || P.mu;
    const r0 = Math.hypot(x, y), v0 = Math.hypot(vx, vy);
    const vr0 = (x * vx + y * vy) / r0;
    const alpha = 2 / r0 - (v0 * v0) / mu;
    if (alpha > 1e-12) {
      const period = (2 * Math.PI) / (Math.sqrt(mu) * Math.pow(alpha, 1.5));
      dt %= period;
      if (dt > period / 2) dt -= period;
    }
    const sm = Math.sqrt(mu);
    let chi = sm * Math.abs(alpha) * dt;
    if (alpha < -1e-12) {
      const a = 1 / alpha, sg = Math.sign(dt) || 1;
      const guess = sg * Math.sqrt(-a) * Math.log((-2 * mu * dt) / (a * (x * vx + y * vy + sg * Math.sqrt(-mu * a) * (1 - r0 / a))));
      if (isFinite(guess)) chi = guess;
    }
    if (!isFinite(chi)) chi = sm * Math.abs(alpha) * dt;
    let C = 0, S = 0;
    for (let i = 0; i < 80; i++) {
      const z = alpha * chi * chi;
      C = stumpffC(z); S = stumpffS(z);
      const F = ((r0 * vr0) / sm) * chi * chi * C + (1 - alpha * r0) * chi * chi * chi * S + r0 * chi - sm * dt;
      const dF = ((r0 * vr0) / sm) * chi * (1 - z * S) + (1 - alpha * r0) * chi * chi * C + r0;
      const ratio = F / dF;
      chi -= ratio;
      if (Math.abs(ratio) < 1e-7 * Math.max(1, Math.abs(chi))) break;
    }
    const z = alpha * chi * chi;
    C = stumpffC(z); S = stumpffS(z);
    const f = 1 - ((chi * chi) / r0) * C;
    const gg = dt - ((chi * chi * chi) / sm) * S;
    const nx = f * x + gg * vx, ny = f * y + gg * vy;
    const r = Math.hypot(nx, ny);
    const fd = (sm / (r * r0)) * (alpha * chi * chi * chi * S - chi);
    const gd = 1 - ((chi * chi) / r) * C;
    return [nx, ny, fd * x + gd * vx, fd * y + gd * vy];
  };

  /** Classical elements of the 2D orbit. */
  O.elements = function (x, y, vx, vy, mu) {
    mu = mu || P.mu;
    const r = Math.hypot(x, y), v2 = vx * vx + vy * vy;
    const h = x * vy - y * vx; // signed: + = counter-clockwise
    const rv = x * vx + y * vy;
    const ex = ((v2 - mu / r) * x - rv * vx) / mu, ey = ((v2 - mu / r) * y - rv * vy) / mu;
    const e = Math.hypot(ex, ey);
    const energy = v2 / 2 - mu / r;
    const a = Math.abs(energy) < 1e-9 ? Infinity : -mu / (2 * energy);
    const p = (h * h) / mu;
    const argPe = e > 1e-9 ? Math.atan2(ey, ex) : Math.atan2(y, x);
    const el = {
      r, h, e, a, p, argPe, energy, ccw: h >= 0,
      hyperbolic: e >= 1,
      pe: p / (1 + e),
      ap: e < 1 ? p / (1 - e) : Infinity,
      period: e < 1 ? 2 * Math.PI * Math.sqrt((a * a * a) / mu) : Infinity,
    };
    // true anomaly measured along direction of travel
    let nu = (el.ccw ? 1 : -1) * SS.wrapPi(Math.atan2(y, x) - argPe);
    el.nu = nu;
    if (e < 1) {
      const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
      const M = E - e * Math.sin(E);
      const n = Math.sqrt(mu / (a * a * a));
      const wrap = t => ((t % el.period) + el.period) % el.period;
      el.timeToPe = wrap((2 * Math.PI - (M < 0 ? M + 2 * Math.PI : M)) / n);
      el.timeToAp = wrap((Math.PI - M) / n);
    } else {
      // hyperbolic: time to periapsis (negative once past it)
      const H = 2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(nu / 2));
      const M = e * Math.sinh(H) - H;
      el.timeToPe = -M / Math.sqrt(mu / Math.pow(-a, 3));
      el.timeToAp = Infinity;
    }
    return el;
  };

  /** Points of the orbit path in world coordinates, n samples. */
  O.sample = function (el, n) {
    const pts = [];
    const lim = el.e < 1 ? Math.PI : Math.acos(-1 / el.e) * 0.98;
    for (let i = 0; i <= n; i++) {
      const nu = -lim + (2 * lim * i) / n;
      const r = el.p / (1 + el.e * Math.cos(nu));
      const ang = el.argPe + (el.ccw ? nu : -nu);
      pts.push([r * Math.cos(ang), r * Math.sin(ang)]);
    }
    return pts;
  };
})(typeof window !== 'undefined' ? window : globalThis);
