/* Shared helpers. Everything hangs off the global SS namespace so the game also runs from file://. */
(function (g) {
  const SS = (g.SS = g.SS || {});
  const TAU = Math.PI * 2;
  SS.TAU = TAU;
  SS.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  SS.lerp = (a, b, t) => a + (b - a) * t;
  SS.sign = v => (v < 0 ? -1 : 1);
  SS.wrapPi = a => {
    a %= TAU;
    if (a > Math.PI) a -= TAU;
    else if (a < -Math.PI) a += TAU;
    return a;
  };
  /** Piecewise-linear table lookup, table = [[x0,y0],[x1,y1],...] */
  SS.interp = (tbl, x) => {
    if (x <= tbl[0][0]) return tbl[0][1];
    for (let i = 1; i < tbl.length; i++) {
      if (x <= tbl[i][0]) {
        const [x0, y0] = tbl[i - 1], [x1, y1] = tbl[i];
        return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
      }
    }
    return tbl[tbl.length - 1][1];
  };
  SS.approach = (v, target, maxStep) =>
    v < target ? Math.min(target, v + maxStep) : Math.max(target, v - maxStep);

  const pad = n => (n < 10 ? '0' + n : '' + n);
  SS.fmt = {
    dist(m) {
      const a = Math.abs(m);
      if (a < 1000) return m.toFixed(a < 10 ? 1 : 0) + ' m';
      if (a < 1e6) return (m / 1000).toFixed(a < 1e4 ? 2 : 1) + ' km';
      if (a < 1e9) return (m / 1e6).toFixed(2) + ' Mm';
      return (m / 1e9).toFixed(2) + ' Gm';
    },
    speed(v) {
      const a = Math.abs(v);
      return a < 1e4 ? v.toFixed(a < 100 ? 1 : 0) + ' m/s' : (v / 1000).toFixed(2) + ' km/s';
    },
    mass(kg) {
      return kg < 10000 ? kg.toFixed(0) + ' kg' : (kg / 1000).toFixed(kg < 1e5 ? 2 : 1) + ' t';
    },
    force(n) {
      if (n < 1e4) return n.toFixed(0) + ' N';
      if (n < 1e7) return (n / 1000).toFixed(0) + ' kN';
      return (n / 1e6).toFixed(2) + ' MN';
    },
    time(s) {
      if (!isFinite(s)) return '--';
      s = Math.max(0, Math.round(s));
      const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
      if (d) return `${d}d ${pad(h)}:${pad(m)}:${pad(sec)}`;
      if (h) return `${h}:${pad(m)}:${pad(sec)}`;
      return `${m}:${pad(sec)}`;
    },
    pa(p) {
      return p >= 1000 ? (p / 1000).toFixed(1) + ' kPa' : p.toFixed(0) + ' Pa';
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
