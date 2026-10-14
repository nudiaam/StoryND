// Small geometry helpers for hand-drawn arrows. Points are [x, y] pairs.

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function perpDist(p, a, b) {
  const l = dist(a, b);
  if (!l) return dist(p, a);
  return Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / l;
}

// Ramer–Douglas–Peucker: drops points that add no shape (hand jitter).
export function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  let max = 0;
  let idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > max) { max = d; idx = i; }
  }
  if (max <= eps) return [pts[0], pts[pts.length - 1]];
  return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)];
}

// Chaikin corner cutting, keeping both ends where they were drawn.
export function chaikin(pts, rounds = 2) {
  let out = pts;
  for (let r = 0; r < rounds; r++) {
    if (out.length < 3) return out;
    const next = [out[0]];
    for (let i = 0; i < out.length - 1; i++) {
      const [a, b] = [out[i], out[i + 1]];
      next.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]]);
      next.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    next.push(out[out.length - 1]);
    out = next;
  }
  return out;
}

// Moves and stretches a stroke so its ends land on new positions while it
// keeps its drawn shape (rotation + uniform scale + translation).
export function refit(pts, q0, q1) {
  const p0 = pts[0];
  const p1 = pts[pts.length - 1];
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  const den = dx * dx + dy * dy;
  if (den < 1) return pts.map(([x, y]) => [x + q0[0] - p0[0], y + q0[1] - p0[1]]);
  const ex = q1[0] - q0[0];
  const ey = q1[1] - q0[1];
  // a = (q1 - q0) / (p1 - p0) as complex numbers
  const ar = (ex * dx + ey * dy) / den;
  const ai = (ey * dx - ex * dy) / den;
  return pts.map(([x, y]) => {
    const rx = x - p0[0];
    const ry = y - p0[1];
    return [q0[0] + ar * rx - ai * ry, q0[1] + ai * rx + ar * ry];
  });
}

// Smooth SVG path through the points (Catmull–Rom as cubic Béziers).
export function toPath(pts) {
  if (!pts.length) return '';
  if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]}`;
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

// The stroke without its last `len` units: the line stops at the base of
// the arrowhead, so its rounded end never shows past the tip.
export function trimEnd(pts, len) {
  let left = len;
  const out = pts.map((p) => [...p]);
  while (out.length > 1) {
    const a = out[out.length - 2];
    const b = out[out.length - 1];
    const d = dist(a, b);
    if (d > left) {
      const k = (d - left) / d;
      out[out.length - 1] = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
      return out;
    }
    left -= d;
    out.pop();
  }
  return out;
}

// Arrowhead triangle at the end of the stroke.
export function arrowHead(pts, size = 13) {
  const end = pts[pts.length - 1];
  let i = pts.length - 2;
  while (i > 0 && dist(pts[i], end) < size) i--;
  const from = pts[Math.max(0, i)];
  const ang = Math.atan2(end[1] - from[1], end[0] - from[0]);
  const a1 = ang + Math.PI - 0.42;
  const a2 = ang + Math.PI + 0.42;
  return `M${end[0]},${end[1]} L${end[0] + size * Math.cos(a1)},${end[1] + size * Math.sin(a1)} L${end[0] + size * Math.cos(a2)},${end[1] + size * Math.sin(a2)} Z`;
}

// Distance along the stroke at each point.
function arc(pts) {
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + dist(pts[i - 1], pts[i]));
  return s;
}

// Point at fraction t (0 = start, 1 = end) of the stroke's length.
export function pointAt(pts, t) {
  const s = arc(pts);
  const target = s[s.length - 1] * Math.max(0, Math.min(1, t));
  for (let i = 1; i < pts.length; i++) {
    if (target <= s[i]) {
      const d = s[i] - s[i - 1];
      const k = d ? (target - s[i - 1]) / d : 0;
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k];
    }
  }
  return pts[pts.length - 1];
}

// Fraction of the stroke closest to point p (to slide a label along it).
export function nearestT(pts, p) {
  const s = arc(pts);
  const total = s[s.length - 1] || 1;
  let best = { d: Infinity, t: 0.5 };
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const k = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
    const d = dist(p, [a[0] + dx * k, a[1] + dy * k]);
    if (d < best.d) best = { d, t: (s[i - 1] + (s[i] - s[i - 1]) * k) / total };
  }
  return best.t;
}

// Index of the stroke point closest to fraction t.
export function indexAt(pts, t) {
  const s = arc(pts);
  const target = s[s.length - 1] * t;
  let best = 0;
  for (let i = 1; i < s.length; i++) if (Math.abs(s[i] - target) < Math.abs(s[best] - target)) best = i;
  return best;
}

// Pulls the stroke at point `idx` by (dx, dy). The pull is full at that
// point and fades smoothly to nothing at each end (along the stroke's
// length), so the whole arrow bends like a rubber band: no loops next to an
// end, no corners where the pull stops. Dragging an end moves that end fully
// and keeps the other one where it is.
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export function deform(pts, idx, dx, dy) {
  const s = arc(pts);
  const total = s[s.length - 1];
  const at = s[idx];
  return pts.map(([x, y], i) => {
    let w;
    if (i === idx) w = 1;
    else if (s[i] < at) w = smooth(s[i] / at);
    else w = smooth((total - s[i]) / (total - at || 1));
    return [x + dx * w, y + dy * w];
  });
}

// A clean curve through the given points (centripetal Catmull–Rom: never
// loops or makes cusps), `per` samples between each two of them. Used when
// an arrow is bent by one of its middle handles: it goes through both ends
// and both handles, wherever they are.
export function through(ctrl, per = 16) {
  const P = [ctrl[0], ...ctrl, ctrl[ctrl.length - 1]];
  const out = [ctrl[0]];
  const tj = (a, b) => Math.max(Math.sqrt(dist(a, b)), 1e-4);
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const t0 = 0;
    const t1 = t0 + tj(p0, p1);
    const t2 = t1 + tj(p1, p2);
    const t3 = t2 + tj(p2, p3);
    for (let k = 1; k <= per; k++) {
      const t = t1 + ((t2 - t1) * k) / per;
      const lerp = (a, b, ta, tb) => [((tb - t) * a[0] + (t - ta) * b[0]) / (tb - ta), ((tb - t) * a[1] + (t - ta) * b[1]) / (tb - ta)];
      const a1 = lerp(p0, p1, t0, t1);
      const a2 = lerp(p1, p2, t1, t2);
      const a3 = lerp(p2, p3, t2, t3);
      const b1 = lerp(a1, a2, t0, t2);
      const b2 = lerp(a2, a3, t1, t3);
      out.push(lerp(b1, b2, t1, t2));
    }
  }
  return out;
}

// Anchor points for a hand-drawn stroke: the few points that keep its shape
// (at most 6), so it can be edited like a curve in Illustrator.
export function anchorsOf(pts) {
  const eps = Math.max(5, strokeLength(pts) * 0.035);
  let inner = simplify(pts, eps).slice(1, -1);
  if (inner.length > 6) inner = Array.from({ length: 6 }, (_, i) => inner[Math.round(((i + 0.5) * inner.length) / 6 - 0.5)]);
  return inner;
}

export const midpoint = (pts) => pointAt(pts, 0.5);

export function strokeLength(pts) {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i]);
  return total;
}
