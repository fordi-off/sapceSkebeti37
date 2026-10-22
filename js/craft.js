/* Craft documents: the data the builder edits and the flight sim consumes.
 * A craft is { name, next, parts:[{id,type,x,y,side,parent,stage}] } in metres, y up, x right.
 * Parts connect when stack faces touch, or explicitly through `parent` for side-mounted (radial) parts.
 */
(function (g) {
  const SS = g.SS;
  const defOf = p => p.def || SS.Parts.byId[p.type];

  const Craft = (SS.Craft = {});
  Craft.defOf = defOf;

  Craft.create = (name = 'Untitled') => ({ name, next: 1, parts: [] });
  Craft.clone = doc => JSON.parse(JSON.stringify(doc));

  Craft.add = function (doc, type, x, y, opts = {}) {
    const p = { id: doc.next++, type, x, y, side: opts.side || 1, parent: opts.parent ?? null, stage: opts.stage ?? -1 };
    doc.parts.push(p);
    return p;
  };

  /** Body width at height y (trapezoid interpolation). */
  Craft.widthAt = function (p, y) {
    const d = defOf(p);
    const t = SS.clamp((y - (p.y - d.h / 2)) / d.h, 0, 1);
    return d.wBot + (d.wTop - d.wBot) * t;
  };

  Craft.rect = function (p) {
    const d = defOf(p);
    return { l: p.x - d.wMax / 2, r: p.x + d.wMax / 2, b: p.y - d.h / 2, t: p.y + d.h / 2 };
  };

  /** Connection list: stack joints from touching faces, radial joints from explicit parent links. */
  Craft.joints = function (parts) {
    const js = [];
    const byId = new Map(parts.map(p => [p.id, p]));
    for (let i = 0; i < parts.length; i++) {
      const A = parts[i], da = defOf(A);
      for (let j = 0; j < parts.length; j++) {
        if (i === j) continue;
        const B = parts[j], db = defOf(B);
        // A sits directly above B
        if (!da.nodeBot || !db.nodeTop) continue;
        if (da.nodeBotOnly && !db[da.nodeBotOnly]) continue;
        if (Math.abs(A.y - da.h / 2 - (B.y + db.h / 2)) > 0.03) continue;
        const lo = Math.max(A.x - da.wBot / 2, B.x - db.wTop / 2), hi = Math.min(A.x + da.wBot / 2, B.x + db.wTop / 2);
        if (hi - lo < 0.05) continue;
        js.push({ a: A.id, b: B.id, x: (lo + hi) / 2, y: A.y - da.h / 2, d: hi - lo, radial: false });
      }
      if (A.parent != null) {
        const P = byId.get(A.parent);
        if (P) js.push({ a: P.id, b: A.id, x: P.x + A.side * (Craft.widthAt(P, A.y) / 2), y: A.y, d: da.jd, radial: true });
      }
    }
    return js;
  };

  Craft.pickRoot = parts => parts.find(p => defOf(p).pod) || parts[0];

  /** BFS spanning tree from root. Returns {root, order, parent:Map, children:Map}. */
  Craft.tree = function (parts, joints, rootPart) {
    const root = rootPart || Craft.pickRoot(parts);
    const adj = new Map(parts.map(p => [p.id, []]));
    for (const j of joints) { adj.get(j.a)?.push(j); adj.get(j.b)?.push(j); }
    const parent = new Map(), children = new Map(parts.map(p => [p.id, []])), jointTo = new Map();
    const order = [];
    if (!root) return { root: null, order, parent, children, jointTo };
    const seen = new Set([root.id]);
    const q = [root.id];
    while (q.length) {
      const id = q.shift();
      order.push(id);
      for (const j of adj.get(id)) {
        const other = j.a === id ? j.b : j.a;
        if (seen.has(other)) continue;
        seen.add(other);
        parent.set(other, id);
        jointTo.set(other, j);
        children.get(id).push(other);
        q.push(other);
      }
    }
    return { root, order, parent, children, jointTo };
  };

  /** Ids of parts connected to the root (everything else is floating / orphaned). */
  Craft.connected = (parts, joints) => new Set(Craft.tree(parts, joints).order);

  /** Part and everything hanging beyond it, as seen from the root. */
  Craft.subtree = function (parts, id) {
    const T = Craft.tree(parts, Craft.joints(parts));
    const out = [];
    const walk = i => { out.push(i); T.children.get(i).forEach(walk); };
    if (T.children.has(id)) walk(id);
    return out;
  };

  /** Heuristic staging: engines of the outermost stage fire first, decouplers release spent stages. */
  Craft.autoStage = function (parts) {
    const T = Craft.tree(parts, Craft.joints(parts));
    const byId = new Map(parts.map(p => [p.id, p]));
    const depth = new Map();
    for (const id of T.order) {
      const p = byId.get(id), d = defOf(p);
      const par = T.parent.get(id);
      let dep = par == null ? 0 : depth.get(par);
      if (par != null && d.decoupler && !d.decoupler.radial) dep += 1;
      depth.set(id, dep);
    }
    let maxD = 0;
    for (const p of parts) if (defOf(p).engine && depth.has(p.id)) maxD = Math.max(maxD, depth.get(p.id) - (defOf(p).decoupler ? 1 : 0));
    // decouplers sitting above engines also need their depth considered
    for (const p of parts) if (defOf(p).decoupler && !defOf(p).decoupler.radial && depth.has(p.id)) maxD = Math.max(maxD, depth.get(p.id));
    let s = 0;
    for (let d = maxD; d >= 0; d--) {
      const at = pred => parts.filter(p => depth.has(p.id) && depth.get(p.id) === d && pred(defOf(p)));
      at(df => df.engine).forEach(p => (p.stage = s));
      const rad = at(df => df.decoupler && df.decoupler.radial);
      if (rad.length) { s++; rad.forEach(p => (p.stage = s)); }
      if (d > 0) {
        s++;
        at(df => df.decoupler && !df.decoupler.radial).forEach(p => (p.stage = s));
      }
    }
    parts.forEach(p => { if (defOf(p).chute) p.stage = s + 1; });
    parts.forEach(p => { if (!defOf(p).stageable) p.stage = -1; });
    // compact stage numbers so there are no empty rows
    const used = [...new Set(parts.filter(p => p.stage >= 0).map(p => p.stage))].sort((a, b) => a - b);
    parts.forEach(p => { if (p.stage >= 0) p.stage = used.indexOf(p.stage); });
  };

  /** Build a craft from a compact description (used for the example vehicles). */
  Craft.build = function (name, ops) {
    const doc = Craft.create(name);
    const made = [];
    let last = null;
    const radial = (parentIdx, type, side, dy) => {
      const P = made[parentIdx], d = SS.Parts.byId[type];
      const y = P.y + (dy || 0);
      const x = P.x + side * (Craft.widthAt(P, y) / 2 + d.w / 2);
      return Craft.add(doc, type, x, y, { side, parent: P.id });
    };
    for (const op of ops) {
      if (typeof op === 'string') {
        const d = SS.Parts.byId[op];
        const y = last ? last.y - defOf(last).h / 2 - d.h / 2 : 0;
        last = Craft.add(doc, op, last ? last.x : 0, y);
        made.push(last);
      } else {
        const [parentIdx, type, dy, mirror = true] = op;
        const sides = mirror ? [1, -1] : [1];
        for (const s of sides) made.push(radial(parentIdx, type, s, dy));
      }
    }
    Craft.autoStage(doc.parts);
    return doc;
  };

  Craft.mass = function (doc) {
    let dry = 0, wet = 0;
    for (const p of doc.parts) { const d = defOf(p); dry += d.mass + (d.shield ? d.shield.ablator : 0); wet += d.mass + d.fuel + (d.shield ? d.shield.ablator : 0); }
    return { dry, wet };
  };
})(typeof window !== 'undefined' ? window : globalThis);
