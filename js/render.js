/* Canvas rendering: part artwork (shared by builder and flight), flight scene, map view, navball. */
(function (g) {
  const SS = g.SS;
  const P = SS.Planet;
  const { clamp, lerp } = SS;
  const R = (SS.Render = { dpr: 1 });

  /* ------------------------------------------------------------------ part artwork (local coords: y up, origin = part centre) */
  const shade = (hex, f) => {
    const n = parseInt(hex.slice(1), 16);
    const r = clamp(Math.round(((n >> 16) & 255) * f), 0, 255), gg = clamp(Math.round(((n >> 8) & 255) * f), 0, 255), b = clamp(Math.round((n & 255) * f), 0, 255);
    return `rgb(${r},${gg},${b})`;
  };
  R.shade = shade;

  function cyl(ctx, x0, x1, base) {
    const gr = ctx.createLinearGradient(x0, 0, x1, 0);
    gr.addColorStop(0, shade(base, 0.62)); gr.addColorStop(0.3, shade(base, 1.08)); gr.addColorStop(0.55, shade(base, 0.95)); gr.addColorStop(1, shade(base, 0.55));
    return gr;
  }

  function trap(ctx, d, h = d.h) {
    ctx.beginPath();
    ctx.moveTo(-d.wTop / 2, h / 2); ctx.lineTo(d.wTop / 2, h / 2); ctx.lineTo(d.wBot / 2, -h / 2); ctx.lineTo(-d.wBot / 2, -h / 2); ctx.closePath();
  }

  /** Draw one part. opts: {lw (line width in local units), glow 0..1, chuteFrac, flipX, ghost} */
  R.drawPart = function (ctx, d, side, opts) {
    opts = opts || {};
    const lw = opts.lw || 0.03;
    ctx.save();
    if (side < 0 && (d.radial || d.kind === 'fin' || d.kind === 'leg')) ctx.scale(-1, 1);
    ctx.lineWidth = lw; ctx.strokeStyle = '#11141a'; ctx.lineJoin = 'round';
    const w = d.wMax, h = d.h;
    let path = null;
    switch (d.kind) {
      case 'tank': {
        trap(ctx, d); ctx.fillStyle = cyl(ctx, -w / 2, w / 2, d.color); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        const n = Math.max(1, Math.round(h / 2));
        for (let i = 1; i < n * 2; i += 2) ctx.fillRect(-w / 2, -h / 2 + (h * i) / (n * 2) - 0.03, w, 0.06);
        ctx.fillStyle = 'rgba(30,60,120,0.55)'; ctx.fillRect(-w / 2 * 0.98, -h * 0.07, w * 0.98, h * 0.14);
        ctx.strokeRect(-w / 2, -h / 2, w, h);
        break;
      }
      case 'cone': {
        ctx.beginPath();
        ctx.moveTo(-d.wBot / 2, -h / 2); ctx.quadraticCurveTo(-d.wBot / 2, h * 0.2, -d.wTop / 2, h / 2);
        ctx.lineTo(d.wTop / 2, h / 2); ctx.quadraticCurveTo(d.wBot / 2, h * 0.2, d.wBot / 2, -h / 2); ctx.closePath();
        ctx.fillStyle = cyl(ctx, -d.wBot / 2, d.wBot / 2, d.color); ctx.fill(); ctx.stroke();
        break;
      }
      case 'adapter': {
        trap(ctx, d); ctx.fillStyle = cyl(ctx, -w / 2, w / 2, d.color); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-d.wTop / 2 * 0.9, h * 0.35, d.wTop * 0.9, 0.04);
        break;
      }
      case 'pod': {
        ctx.beginPath();
        if (d.id === 'probe') {
          ctx.rect(-d.wTop / 2, -h / 2, d.wTop, h);
        } else {
          ctx.moveTo(-d.wBot / 2, -h / 2); ctx.lineTo(-d.wTop / 2 - 0.02, h / 2 - 0.12);
          ctx.quadraticCurveTo(0, h / 2 + 0.08, d.wTop / 2 + 0.02, h / 2 - 0.12); ctx.lineTo(d.wBot / 2, -h / 2); ctx.closePath();
        }
        ctx.fillStyle = cyl(ctx, -d.wBot / 2, d.wBot / 2, d.color); ctx.fill(); ctx.stroke();
        if (d.id === 'probe') {
          ctx.fillStyle = '#2b3a55'; ctx.fillRect(-d.wTop * 0.3, -h * 0.2, d.wTop * 0.6, h * 0.4);
          ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(0, h / 2 + 0.3); ctx.stroke();
        } else {
          ctx.beginPath(); ctx.ellipse(0, h * 0.1, d.wTop * 0.42, h * 0.16, 0, 0, 7); ctx.fillStyle = '#243b5e'; ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.ellipse(-d.wTop * 0.1, h * 0.14, d.wTop * 0.14, h * 0.05, 0, 0, 7); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill();
        }
        break;
      }
      case 'engine': {
        const mount = h * 0.22;
        ctx.beginPath(); ctx.rect(-d.wTop / 2 * 0.62, h / 2 - mount, d.wTop * 0.62, mount);
        ctx.fillStyle = cyl(ctx, -d.wTop / 2, d.wTop / 2, '#5d636e'); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-d.wTop / 2 * 0.5, h / 2 - mount); ctx.lineTo(d.wTop / 2 * 0.5, h / 2 - mount);
        ctx.quadraticCurveTo(d.wBot / 2 * 0.55, -h * 0.1, d.wBot / 2, -h / 2); ctx.lineTo(-d.wBot / 2, -h / 2);
        ctx.quadraticCurveTo(-d.wBot / 2 * 0.55, -h * 0.1, -d.wTop / 2 * 0.5, h / 2 - mount); ctx.closePath();
        ctx.fillStyle = cyl(ctx, -d.wBot / 2, d.wBot / 2, d.color); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.rect(-d.wTop / 2, h / 2 - mount * 0.3, d.wTop, mount * 0.3); ctx.fillStyle = '#3c4048'; ctx.fill(); ctx.stroke();
        break;
      }
      case 'srb': {
        const noz = h * 0.06;
        ctx.beginPath();
        ctx.moveTo(-d.wBot / 2, -h / 2 + noz); ctx.lineTo(-d.wBot / 2, h * 0.28); ctx.quadraticCurveTo(-d.wBot / 2, h / 2, 0, h / 2);
        ctx.quadraticCurveTo(d.wBot / 2, h / 2, d.wBot / 2, h * 0.28); ctx.lineTo(d.wBot / 2, -h / 2 + noz); ctx.closePath();
        ctx.fillStyle = cyl(ctx, -d.wBot / 2, d.wBot / 2, d.color); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(200,40,30,0.8)'; ctx.fillRect(-d.wBot / 2, h * 0.1, d.wBot, h * 0.04);
        ctx.fillRect(-d.wBot / 2, -h * 0.3, d.wBot, h * 0.04);
        ctx.beginPath(); ctx.moveTo(-d.wBot * 0.32, -h / 2 + noz); ctx.lineTo(d.wBot * 0.32, -h / 2 + noz); ctx.lineTo(d.wBot * 0.42, -h / 2); ctx.lineTo(-d.wBot * 0.42, -h / 2); ctx.closePath();
        ctx.fillStyle = '#3c4048'; ctx.fill(); ctx.stroke();
        break;
      }
      case 'decoupler': {
        ctx.beginPath(); ctx.rect(-d.wMax / 2, -h / 2, d.wMax, h);
        ctx.fillStyle = cyl(ctx, -d.wMax / 2, d.wMax / 2, d.color); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#1a1a1a';
        const n = Math.max(2, Math.round((d.wMax / h) * 0.9));
        const sw = d.wMax / (n * 2);
        for (let i = 0; i < n; i++) ctx.fillRect(-d.wMax / 2 + sw * (2 * i + 0.5), -h / 2, sw, h);
        ctx.strokeRect(-d.wMax / 2, -h / 2, d.wMax, h);
        break;
      }
      case 'shield': {
        ctx.beginPath(); ctx.moveTo(-w / 2, h / 2); ctx.lineTo(w / 2, h / 2); ctx.lineTo(w / 2, -h * 0.1);
        ctx.quadraticCurveTo(0, -h * 1.8, -w / 2, -h * 0.1); ctx.closePath();
        ctx.fillStyle = cyl(ctx, -w / 2, w / 2, d.color); ctx.fill(); ctx.stroke();
        break;
      }
      case 'chute': {
        ctx.beginPath(); ctx.moveTo(-d.wBot / 2, -h / 2); ctx.lineTo(-d.wBot / 2, h * 0.2); ctx.quadraticCurveTo(0, h * 0.9, d.wBot / 2, h * 0.2); ctx.lineTo(d.wBot / 2, -h / 2); ctx.closePath();
        ctx.fillStyle = cyl(ctx, -d.wBot / 2, d.wBot / 2, d.color); ctx.fill(); ctx.stroke();
        const f = opts.chuteFrac || 0;
        if (f > 0.02 && !opts.torn) {
          const rr = Math.sqrt((d.chute.area * f) / Math.PI) * 0.9;
          const hh = rr * 0.7, base = rr * 1.9 + 1;
          ctx.strokeStyle = 'rgba(240,240,240,0.7)';
          ctx.beginPath(); ctx.moveTo(-rr, base); ctx.lineTo(0, h / 2); ctx.lineTo(rr, base); ctx.moveTo(0, base); ctx.lineTo(0, h / 2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-rr, base); ctx.quadraticCurveTo(0, base + hh * 2, rr, base); ctx.quadraticCurveTo(0, base - hh * 0.35, -rr, base); ctx.closePath();
          ctx.fillStyle = '#e8672d'; ctx.fill(); ctx.strokeStyle = '#11141a'; ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-rr * 0.35, base - hh * 0.1); ctx.quadraticCurveTo(-rr * 0.2, base + hh * 1.3, 0, base + hh * 1.45); ctx.moveTo(rr * 0.35, base - hh * 0.1); ctx.quadraticCurveTo(rr * 0.2, base + hh * 1.3, 0, base + hh * 1.45); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.stroke();
        }
        break;
      }
      case 'fin': {
        // inner edge at -w/2 (towards the body), tip at +w/2
        ctx.beginPath(); ctx.moveTo(-w / 2, h / 2); ctx.lineTo(w / 2, -h / 2 * 0.8); ctx.lineTo(w / 2, -h / 2); ctx.lineTo(-w / 2, -h / 2); ctx.closePath();
        ctx.fillStyle = cyl(ctx, -w / 2, w / 2, d.color); ctx.fill(); ctx.stroke();
        break;
      }
      case 'leg': {
        ctx.lineWidth = lw * 2.5; ctx.strokeStyle = '#7d8591';
        ctx.beginPath(); ctx.moveTo(-w / 2, h * 0.4); ctx.lineTo(w / 2 - 0.05, -h / 2 + 0.1); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-w / 2, -h * 0.1); ctx.lineTo(w / 2 - 0.05, -h / 2 + 0.1); ctx.stroke();
        ctx.lineWidth = lw; ctx.strokeStyle = '#11141a';
        ctx.beginPath(); ctx.ellipse(w / 2 - 0.05, -h / 2 + 0.06, Math.max(0.15, w * 0.15), 0.07, 0, 0, 7); ctx.fillStyle = '#4b5059'; ctx.fill(); ctx.stroke();
        break;
      }
      default:
        trap(ctx, d); ctx.fillStyle = d.color; ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  };

  R.partOutline = function (ctx, d) {
    ctx.beginPath();
    ctx.moveTo(-d.wTop / 2, d.h / 2); ctx.lineTo(d.wTop / 2, d.h / 2); ctx.lineTo(d.wBot / 2, -d.h / 2); ctx.lineTo(-d.wBot / 2, -d.h / 2); ctx.closePath();
  };

  /** Small icon for the palette */
  R.icon = function (canvas, d) {
    const c = canvas.getContext('2d'), W = canvas.width, Hh = canvas.height;
    c.clearRect(0, 0, W, Hh);
    const ext = Math.max(d.h, d.wMax + (d.kind === 'fin' || d.kind === 'leg' ? 0 : 0));
    const s = Math.min((W - 6) / Math.max(d.wMax, 0.01), (Hh - 6) / d.h, 40);
    c.save(); c.translate(W / 2, Hh / 2); c.scale(s, -s);
    R.drawPart(c, d, 1, { lw: 1.2 / s });
    c.restore();
  };

  /* ------------------------------------------------------------------ soft particle sprites */
  const sprites = {};
  function sprite(kind) {
    if (sprites[kind] || typeof document === 'undefined') return sprites[kind];
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    if (kind === 'fire') { gr.addColorStop(0, 'rgba(255,255,235,1)'); gr.addColorStop(0.25, 'rgba(255,200,110,0.85)'); gr.addColorStop(0.6, 'rgba(255,110,30,0.4)'); gr.addColorStop(1, 'rgba(255,60,0,0)'); }
    else if (kind === 'smoke') { gr.addColorStop(0, 'rgba(220,220,220,0.9)'); gr.addColorStop(0.6, 'rgba(200,200,200,0.45)'); gr.addColorStop(1, 'rgba(190,190,190,0)'); }
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    return (sprites[kind] = c);
  }

  /* ------------------------------------------------------------------ stars / clouds */
  const stars = [];
  for (let i = 0; i < 260; i++) stars.push([Math.random(), Math.random(), Math.random() * 0.8 + 0.2, Math.random() * 1.4 + 0.4]);
  R.stars = stars;
  const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  R.hash = hash;

  function skyColors(alt) {
    const f = Math.exp(-alt / 11000); // 1 at ground -> 0 in space
    const top = [lerp(2, 38, f), lerp(3, 96, f), lerp(10, 178, f)];
    const hor = [lerp(2, 152, f), lerp(3, 200, f), lerp(10, 236, f)];
    return [top, hor, f];
  }

  /* ------------------------------------------------------------------ flight scene */
  R.makeCamera = () => ({ zoom: 8, mapZoom: 0, map: false, x: 0, y: 0, mapX: 0, mapY: 0, shake: 0 });

  /** Transform helper: world (planet-centred) -> screen, with camera-relative precision. */
  function setupView(ctx, cam, W, H, up) {
    const a = Math.PI / 2 - up;
    const S = cam.zoom, ca = Math.cos(a) * S, sa = Math.sin(a) * S;
    const d = R.dpr;
    ctx.setTransform(ca * d, -sa * d, -sa * d, -ca * d, (W / 2) * d, (H / 2) * d);
    return { a, S, ca, sa };
  }

  R.drawFlight = function (ctx, world, cam, W, H, now) {
    const v = cam.target || world.active;
    ctx.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
    const alt = Math.hypot(cam.x, cam.y) - P.R;
    const camPhi = Math.atan2(cam.y, cam.x);
    const [top, hor, f] = skyColors(alt);
    // sky
    const gr = ctx.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, `rgb(${top[0] | 0},${top[1] | 0},${top[2] | 0})`);
    gr.addColorStop(1, `rgb(${hor[0] | 0},${hor[1] | 0},${hor[2] | 0})`);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    // stars
    const sa = clamp(1 - f * 1.6, 0, 1);
    if (sa > 0.01) {
      const rot = camPhi * 0.8;
      for (const s of stars) {
        const x = ((s[0] + rot * 0.15) % 1 + 1) % 1 * W, y = s[1] * H;
        ctx.fillStyle = `rgba(255,255,255,${(sa * s[2]).toFixed(2)})`;
        ctx.fillRect(x, y, s[3], s[3]);
      }
    }
    const S = cam.zoom;
    const shake = world.shake * 12;
    const up = camPhi + (shake ? (Math.random() - 0.5) * 0.02 * world.shake : 0);
    const V = setupView(ctx, cam, W, H, up);
    ctx.translate(0, 0);
    const toRel = (x, y) => [x - cam.x, y - cam.y];
    const halfDiag = Math.hypot(W, H) / 2 / S;

    // atmosphere + planet
    const polygon = (rad, color, stroke) => {
      const span = Math.min(Math.PI, ((halfDiag * 1.3 + 50) / rad));
      const n = span >= Math.PI ? 360 : 140;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const ang = camPhi - span + (2 * span * i) / n;
        const [rx, ry] = toRel(rad * Math.cos(ang), rad * Math.sin(ang));
        i ? ctx.lineTo(rx, ry) : ctx.moveTo(rx, ry);
      }
      if (span < Math.PI) { const [cx, cy] = toRel(0, 0); ctx.lineTo(cx, cy); }
      ctx.closePath();
      ctx.fillStyle = color; ctx.fill();
      if (stroke) { ctx.lineWidth = stroke / S; ctx.strokeStyle = 'rgba(160,210,255,0.5)'; ctx.stroke(); }
      return span;
    };
    if (S * 70000 > 3 || alt > 30000) {
      for (let k = 3; k >= 1; k--) polygon(P.R + k * 22000, `rgba(110,170,235,${0.07 + 0.0 * k})`);
    }
    // clouds
    if (S > 0.0008 && alt < 25000) {
      const bin = 6000, n0 = Math.floor(((camPhi - 0.02) * P.R) / bin) - 8, n1 = Math.ceil(((camPhi + 0.02) * P.R) / bin) + 8;
      const visSpan = (halfDiag + 8000) / bin;
      const cb = Math.floor((camPhi * P.R) / bin);
      ctx.fillStyle = `rgba(255,255,255,${(0.55 * f).toFixed(2)})`;
      for (let k = cb - Math.min(60, Math.ceil(visSpan)); k <= cb + Math.min(60, Math.ceil(visSpan)); k++) {
        const hseed = hash(k * 1.7 + 3), hseed2 = hash(k * 3.1 + 9);
        if (hseed < 0.45) continue;
        const ang = ((k + hseed2) * bin) / P.R + P.omega * world.time * 0.3 * 0;
        const hh = 1500 + hseed * 5000;
        const rr = P.R + hh;
        const [rx, ry] = toRel(rr * Math.cos(ang), rr * Math.sin(ang));
        const wdt = 800 + hseed2 * 2500;
        ctx.save(); ctx.translate(rx, ry); ctx.rotate(ang - Math.PI / 2);
        for (let j = 0; j < 5; j++) { ctx.beginPath(); ctx.ellipse((j - 2) * wdt * 0.28, (hash(k * 7 + j) - 0.3) * 120, wdt * 0.32, 90 + 80 * hash(k + j * 3), 0, 0, 7); ctx.fill(); }
        ctx.restore();
      }
    }
    // ground
    const groundGrad = '#3c5b3a';
    polygon(P.R, groundGrad, alt > 3000 ? 0 : 0);
    if (alt > 20000) {
      // thin atmosphere limb
      ctx.lineWidth = 2 / S; ctx.strokeStyle = 'rgba(130,190,255,0.55)';
      const span = Math.min(Math.PI, (halfDiag * 1.3) / P.R);
      ctx.beginPath();
      for (let i = 0; i <= 200; i++) { const ang = camPhi - span + (2 * span * i) / 200; const [rx, ry] = toRel(P.R * Math.cos(ang), P.R * Math.sin(ang)); i ? ctx.lineTo(rx, ry) : ctx.moveTo(rx, ry); }
      ctx.stroke();
    }
    // ground markers + texture (scroll with the planet's rotation)
    if (S > 0.05 && alt < 8000) {
      const spacing = Math.pow(10, Math.ceil(Math.log10(70 / S)));
      const dAng = spacing / P.R, rot = P.omega * world.time;
      const span = Math.min(0.5, halfDiag * 1.3 / P.R);
      const k0 = Math.floor((camPhi - span - rot) / dAng), k1 = Math.ceil((camPhi + span - rot) / dAng);
      ctx.strokeStyle = 'rgba(20,40,20,0.45)'; ctx.lineWidth = 1.2 / S;
      ctx.beginPath();
      for (let k = k0; k <= k1 && k - k0 < 400; k++) {
        const ang = k * dAng + rot;
        const depth = (k % 5 === 0 ? 14 : 7) / S;
        const [x1, y1] = toRel(P.R * Math.cos(ang), P.R * Math.sin(ang));
        const [x2, y2] = toRel((P.R - depth) * Math.cos(ang), (P.R - depth) * Math.sin(ang));
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      }
      ctx.stroke();
      // darker soil band
      ctx.strokeStyle = 'rgba(70,50,30,0.5)'; ctx.lineWidth = 3 / S;
      ctx.beginPath();
      for (let i = 0; i <= 80; i++) { const ang = camPhi - span + (2 * span * i) / 80; const [rx, ry] = toRel((P.R - 4 / S) * Math.cos(ang), (P.R - 4 / S) * Math.sin(ang)); i ? ctx.lineTo(rx, ry) : ctx.moveTo(rx, ry); }
      ctx.stroke();
    }
    // launch pad
    {
      const ang = world.siteAngle();
      const [rx, ry] = toRel(P.R * Math.cos(ang), P.R * Math.sin(ang));
      if (Math.hypot(rx, ry) < halfDiag + 200) {
        ctx.save(); ctx.translate(rx, ry); ctx.rotate(ang - Math.PI / 2);
        ctx.fillStyle = '#8c9096'; ctx.fillRect(-24, -3, 48, 3.1);
        ctx.fillStyle = '#6d7076'; ctx.fillRect(-24, -3, 48, 0.5);
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; for (let i = -20; i <= 20; i += 8) ctx.fillRect(i, -0.4, 3, 0.35);
        // service tower
        ctx.strokeStyle = '#a33'; ctx.lineWidth = 0.25;
        const tx = -17;
        ctx.beginPath(); ctx.moveTo(tx - 1.5, 0); ctx.lineTo(tx - 1.5, 55); ctx.moveTo(tx + 1.5, 0); ctx.lineTo(tx + 1.5, 55); ctx.stroke();
        ctx.lineWidth = 0.12;
        ctx.beginPath(); for (let y = 0; y < 55; y += 3) { ctx.moveTo(tx - 1.5, y); ctx.lineTo(tx + 1.5, y + 3); ctx.moveTo(tx + 1.5, y); ctx.lineTo(tx - 1.5, y + 3); ctx.moveTo(tx - 1.5, y + 3); ctx.lineTo(tx + 1.5, y + 3); } ctx.stroke();
        ctx.fillStyle = '#c33'; ctx.fillRect(tx - 0.8, 55, 1.6, 0.3);
        // light mast
        ctx.fillStyle = '#ddd'; ctx.fillRect(20, 0, 0.3, 14); ctx.fillStyle = (now % 1000 < 500) ? '#f55' : '#511'; ctx.beginPath(); ctx.arc(20.15, 14.3, 0.4, 0, 7); ctx.fill();
        ctx.restore();
      }
    }

    const smokeS = sprite('smoke'), fireS = sprite('fire');
    for (const p of world.particles) {
      if (p.type !== 'smoke') continue;
      const [rx, ry] = toRel(p.x, p.y);
      if (Math.abs(rx * S) > W || Math.abs(ry * S) > H) continue;
      const k = p.life / p.max, rad = p.size * (0.8 + k * 2.4);
      ctx.globalAlpha = (1 - k) * 0.5;
      ctx.drawImage(smokeS, rx - rad, ry - rad, rad * 2, rad * 2);
    }
    ctx.globalAlpha = 1;
    // vessels
    for (const vs of world.vessels) {
      if (!vs.alive) continue;
      const [rx, ry] = toRel(vs.x, vs.y);
      const extent = vs.boundR * S;
      if (Math.abs(rx) * S > W + 400 || Math.abs(ry) * S > H + 400) continue;
      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(vs.theta);
      if (extent < 5) {
        // too small to see: draw a marker
        ctx.restore(); ctx.save(); ctx.translate(rx, ry);
        ctx.fillStyle = vs === world.active ? '#7ff' : '#aaa';
        const rr = 4 / S; ctx.beginPath(); ctx.arc(0, 0, rr, 0, 7); ctx.fill();
        ctx.restore();
        continue;
      }
      ctx.translate(-vs.cx, -vs.cy);
      R.drawVessel(ctx, vs, S, now, world);
      ctx.restore();
      R.drawPlasma(ctx, vs, rx, ry, S);
    }

    // particles
    ctx.globalCompositeOperation = 'lighter';
    for (const p of world.particles) {
      if (p.type === 'smoke' || p.type === 'debris') continue;
      const [rx, ry] = toRel(p.x, p.y);
      if (Math.abs(rx * S) > W || Math.abs(ry * S) > H) continue;
      const k = p.life / p.max;
      let rad = p.size * (p.type === 'exhaust' ? 1 + k * 1.6 : 0.6 + k * 1.4) * 1.25;
      if (rad * S < 1.5) rad = 1.5 / S;
      ctx.globalAlpha = (1 - k) * (p.type === 'exhaust' ? 0.55 : 0.9);
      ctx.drawImage(fireS, rx - rad, ry - rad, rad * 2, rad * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    for (const p of world.particles) {
      if (p.type !== 'debris') continue;
      const [rx, ry] = toRel(p.x, p.y);
      if (Math.abs(rx * S) > W || Math.abs(ry * S) > H) continue;
      const k = p.life / p.max;
      ctx.fillStyle = k < 0.5 ? '#ffb347' : '#555';
      const sz = Math.max(p.size, 1.5 / S);
      ctx.fillRect(rx - sz / 2, ry - sz / 2, sz, sz);
    }
    ctx.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
    // speed lines / re-entry glow overlay
    const act = world.active;
    if (act && act.tel.heat > 0.15 && act.tel.rho > 1e-6) {
      const a = clamp((act.tel.heat - 0.15) * 0.6, 0, 0.5);
      const rg = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, Math.max(W, H) * 0.7);
      rg.addColorStop(0, 'rgba(255,120,40,0)'); rg.addColorStop(1, `rgba(255,110,30,${a})`);
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    }
    if (act && act.tel.g > 5) {
      const a = clamp((act.tel.g - 5) / 8, 0, 0.75);
      const rg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.7);
      rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, `rgba(0,0,0,${a})`);
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    }
  };

  /** Shock-layer glow ahead of a fast vessel in thick-enough air. */
  R.drawPlasma = function (ctx, vs, rx, ry, S) {
    const t = vs.tel;
    if (t.speed < 1800 || t.rho < 1e-7) return;
    const power = Math.sqrt(t.rho) * t.speed * t.speed * t.speed;
    const k = clamp((Math.log10(power + 1) - 8.2) / 1.6, 0, 1);
    if (k < 0.02) return;
    const vx = vs.vx - -P.omega * vs.y, vy = vs.vy - P.omega * vs.x;
    const sp = Math.hypot(vx, vy) || 1;
    const dx = vx / sp, dy = vy / sp;
    const rad = Math.max(vs.boundR * 1.1, 2);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const cx = rx + dx * rad * 0.55, cy = ry + dy * rad * 0.55;
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    gr.addColorStop(0, `rgba(255,235,200,${(0.75 * k).toFixed(2)})`); gr.addColorStop(0.35, `rgba(255,140,60,${(0.5 * k).toFixed(2)})`); gr.addColorStop(1, 'rgba(255,60,20,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 7); ctx.fill();
    // wake streaks
    ctx.strokeStyle = `rgba(255,170,90,${(0.16 * k).toFixed(2)})`; ctx.lineWidth = Math.max(1.2 / S, rad * 0.07);
    for (let i = -2; i <= 2; i++) {
      const px = -dy * i * rad * 0.18, py = dx * i * rad * 0.18;
      const len = rad * (2.5 + Math.random() * 1.5);
      ctx.beginPath(); ctx.moveTo(rx + px, ry + py); ctx.lineTo(rx + px - dx * len, ry + py - dy * len); ctx.stroke();
    }
    ctx.restore();
  };

  R.drawVessel = function (ctx, vs, S, now, world) {
    const lw = 1.3 / S;
    // flames behind parts
    for (const e of vs.engines) {
      if (e.thrustNow <= 0) continue;
      const d = e.def;
      const atm = SS.atmosphere(vs.tel.alt);
      const exp = clamp(1 + 3 * (1 - atm.P / P.P0), 1, 4);
      const len = (1.5 + Math.sqrt(e.thrustNow / 1e5) * 2.2 + (d.engine.solid ? 2 : 0)) * (0.9 + 0.2 * Math.random()) * (1 + 0.3 * (exp - 1));
      const wd = d.wBot * 0.5 * exp * 0.75;
      ctx.save();
      ctx.translate(e.x, e.y - d.h / 2);
      ctx.rotate(e.gim);
      const gr = ctx.createLinearGradient(0, 0, 0, -len);
      gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.2, 'rgba(255,220,120,0.9)'); gr.addColorStop(0.6, 'rgba(255,120,30,0.5)'); gr.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = gr; ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath(); ctx.moveTo(-d.wBot / 2 * 0.8, 0); ctx.quadraticCurveTo(-wd, -len * 0.5, 0, -len); ctx.quadraticCurveTo(wd, -len * 0.5, d.wBot / 2 * 0.8, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const p of vs.parts) {
      ctx.save();
      ctx.translate(p.x, p.y);
      if (p.def.kind === 'engine' && p.gim) { ctx.translate(0, p.def.h / 2); ctx.rotate(p.gim); ctx.translate(0, -p.def.h / 2); }
      R.drawPart(ctx, p.def, p.side, { lw, chuteFrac: p.chuteFrac, torn: p.torn });
      const hr = (p.temp - 500) / (p.def.maxTemp - 500);
      if (hr > 0.02) {
        R.partOutline(ctx, p.def);
        ctx.fillStyle = `rgba(255,${(140 - hr * 80) | 0},40,${clamp(hr * 0.75, 0, 0.8).toFixed(2)})`;
        ctx.globalCompositeOperation = 'lighter'; ctx.fill(); ctx.globalCompositeOperation = 'source-over';
      }
      if (p.strain > 0.6) {
        R.partOutline(ctx, p.def);
        ctx.strokeStyle = `rgba(255,60,60,${clamp((p.strain - 0.6) * 2.5, 0, 1).toFixed(2)})`; ctx.lineWidth = lw * 3; ctx.stroke();
      }
      ctx.restore();
    }
  };

  /* ------------------------------------------------------------------ map view */
  R.drawMap = function (ctx, world, cam, W, H) {
    ctx.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
    ctx.fillStyle = '#04060c'; ctx.fillRect(0, 0, W, H);
    for (const s of stars) { ctx.fillStyle = `rgba(255,255,255,${(s[2] * 0.7).toFixed(2)})`; ctx.fillRect(s[0] * W, s[1] * H, s[3], s[3]); }
    const S = cam.mapZoom, cx = W / 2 - cam.mapX * S, cy = H / 2 + cam.mapY * S;
    const sx = x => cx + x * S, sy = y => cy - y * S;
    // planet
    const pr = P.R * S;
    const grd = ctx.createRadialGradient(sx(0) - pr * 0.3, sy(0) - pr * 0.3, pr * 0.1, sx(0), sy(0), pr);
    grd.addColorStop(0, '#4a86c8'); grd.addColorStop(0.6, '#2a5d98'); grd.addColorStop(1, '#16335c');
    ctx.fillStyle = 'rgba(120,180,255,0.18)'; ctx.beginPath(); ctx.arc(sx(0), sy(0), (P.R + 100000) * S, 0, 7); ctx.fill();
    ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(sx(0), sy(0), pr, 0, 7); ctx.fill();
    // continents (decorative, rotate with the planet)
    ctx.save(); ctx.beginPath(); ctx.arc(sx(0), sy(0), pr, 0, 7); ctx.clip();
    ctx.translate(sx(0), sy(0)); ctx.rotate(-P.omega * world.time);
    ctx.fillStyle = 'rgba(70,140,80,0.8)';
    for (let i = 0; i < 9; i++) { const a = hash(i * 2.3) * 6.28, r = pr * (0.45 + 0.5 * hash(i + 7)); ctx.beginPath(); ctx.ellipse(Math.cos(a) * r * 0.9, -Math.sin(a) * r * 0.9, pr * (0.05 + hash(i) * 0.12), pr * (0.04 + hash(i + 3) * 0.09), a, 0, 7); ctx.fill(); }
    ctx.restore();
    // launch site marker
    { const a = world.siteAngle(); ctx.fillStyle = '#f4d35e'; ctx.beginPath(); ctx.arc(sx(P.R * Math.cos(a)), sy(P.R * Math.sin(a)), 3, 0, 7); ctx.fill(); }
    // vessels + orbits
    ctx.font = '11px system-ui,sans-serif';
    for (const v of world.vessels) {
      if (!v.alive) continue;
      const isA = v === world.active;
      if (!isA && !v.hasControl && v.tel.alt < 100000) continue;
      const el = SS.orbit.elements(v.x, v.y, v.vx, v.vy);
      if (el.pe < P.R * 1.4 || true) {
        const pts = SS.orbit.sample(el, 240);
        ctx.strokeStyle = isA ? '#6ff' : 'rgba(180,180,180,0.5)'; ctx.lineWidth = isA ? 1.6 : 1;
        ctx.beginPath();
        let started = false;
        for (const [x, y] of pts) { if (!isFinite(x) || Math.abs(x * S) > 1e5 || Math.abs(y * S) > 1e5) { started = false; continue; } started ? ctx.lineTo(sx(x), sy(y)) : ctx.moveTo(sx(x), sy(y)); started = true; }
        ctx.stroke();
        if (isA && el.e < 1) {
          // apoapsis / periapsis markers
          const peX = el.pe * Math.cos(el.argPe), peY = el.pe * Math.sin(el.argPe);
          const apX = -el.ap * Math.cos(el.argPe), apY = -el.ap * Math.sin(el.argPe);
          ctx.fillStyle = '#9f9'; ctx.beginPath(); ctx.arc(sx(peX), sy(peY), 4, 0, 7); ctx.fill(); ctx.fillText('Pe ' + SS.fmt.dist(el.pe - P.R), sx(peX) + 8, sy(peY) + 4);
          ctx.fillStyle = '#f99'; ctx.beginPath(); ctx.arc(sx(apX), sy(apY), 4, 0, 7); ctx.fill(); ctx.fillText('Ap ' + SS.fmt.dist(el.ap - P.R), sx(apX) + 8, sy(apY) + 4);
        }
      }
      ctx.fillStyle = isA ? '#fff' : '#bbb';
      ctx.beginPath(); ctx.moveTo(sx(v.x), sy(v.y) - 7); ctx.lineTo(sx(v.x) + 5, sy(v.y) + 5); ctx.lineTo(sx(v.x) - 5, sy(v.y) + 5); ctx.closePath(); ctx.fill();
      ctx.fillText(v.name, sx(v.x) + 9, sy(v.y) - 6);
    }
  };

  /* ------------------------------------------------------------------ navball (2D heading dial) */
  R.drawNavball = function (canvas, world) {
    const c = canvas.getContext('2d'), W = canvas.width, Hh = canvas.height, r = W / 2 - 4;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, W, Hh);
    const v = world.active;
    c.save(); c.translate(W / 2, Hh / 2);
    c.beginPath(); c.arc(0, 0, r, 0, 7); c.clip();
    if (!v) { c.fillStyle = '#222'; c.fillRect(-r, -r, 2 * r, 2 * r); c.restore(); return; }
    // The dial rotates so that the local horizon is shown relative to the craft's nose (nose = screen up).
    const up = Math.atan2(v.y, v.x) - Math.PI / 2; // body angle that points straight up
    const rel = up - v.theta; // angle from nose to local "up" (CCW +)
    c.rotate(-rel); // local up direction drawn at +y... (screen y is down)
    // sky (towards local up) and ground
    c.fillStyle = '#3d86c8'; c.fillRect(-r, -r, 2 * r, r);
    c.fillStyle = '#8a5a34'; c.fillRect(-r, 0, 2 * r, r);
    c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 1;
    for (let a = -75; a <= 75; a += 15) { const y = -a / 90 * r * 0.0; }
    c.fillStyle = '#fff'; c.fillRect(-r, -1, 2 * r, 2);
    // compass-like ticks every 30 deg around the rim
    c.restore();
    c.save(); c.translate(W / 2, Hh / 2);
    c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, r, 0, 7); c.stroke();
    // markers: vector directions relative to nose. angle from nose (CCW +) = theta_vec - theta; screen: up = nose.
    const mark = (ang, col, shape) => {
      const x = -Math.sin(ang) * r * 0.72, y = -Math.cos(ang) * r * 0.72;
      c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 2;
      c.beginPath();
      if (shape === 'pro') { c.arc(x, y, 7, 0, 7); c.stroke(); c.beginPath(); c.arc(x, y, 1.6, 0, 7); c.fill(); c.moveTo(x - 12, y); c.lineTo(x - 7, y); c.moveTo(x + 7, y); c.lineTo(x + 12, y); c.moveTo(x, y - 7); c.lineTo(x, y - 12); c.stroke(); }
      else if (shape === 'retro') { c.arc(x, y, 7, 0, 7); c.stroke(); c.moveTo(x - 5, y - 5); c.lineTo(x + 5, y + 5); c.moveTo(x + 5, y - 5); c.lineTo(x - 5, y + 5); c.stroke(); }
      else if (shape === 'tgt') { c.moveTo(x, y - 8); c.lineTo(x + 6, y + 5); c.lineTo(x - 6, y + 5); c.closePath(); c.stroke(); }
    };
    const vx = v.vx + P.omega * v.y, vy = v.vy - P.omega * v.x; // surface-relative velocity
    const useSurf = v.tel.alt < 36000;
    const wx = useSurf ? vx : v.vx, wy = useSurf ? vy : v.vy;
    if (Math.hypot(wx, wy) > 0.5) {
      const th = Math.atan2(-wx, wy);
      mark(th - v.theta, '#f2e94e', 'pro'); mark(th - v.theta + Math.PI, '#f2e94e', 'retro');
    }
    if (v.sasOn && v.sasMode === 'hold') mark(v.sasTarget - v.theta, '#6cf', 'tgt');
    // craft symbol (fixed)
    c.strokeStyle = '#ffa63d'; c.lineWidth = 3; c.beginPath(); c.moveTo(-18, 6); c.lineTo(-6, 6); c.lineTo(0, -4); c.lineTo(6, 6); c.lineTo(18, 6); c.stroke();
    c.restore();
  };
})(typeof window !== 'undefined' ? window : globalThis);
