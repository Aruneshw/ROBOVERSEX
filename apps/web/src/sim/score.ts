/**
 * RVX-Sim scorer (TypeScript) — exact port of rvx_sim/score.py.
 * Used ONLY for the live "Preview match %" in the browser. The server score is official.
 */
import type { Segment } from "./engine";

export type Target = {
  version: 1;
  start_pose: { x: number; y: number; theta: number };
  strokes: { points: [number, number][]; color?: [number, number, number] }[];
  tolerance?: number;
};
export type ScoreResult = {
  score: number; recall: number; precision: number;
  diff: { missed: [number, number][]; extra: [number, number][] };
};
type Seg = [number, number, number, number, [number, number, number]];

const DEFAULT_TOLERANCE = 0.12;
const COLOR_TOL = 12;

function targetSegments(t: Target): Seg[] {
  const out: Seg[] = [];
  for (const st of t.strokes) {
    const col = (st.color ?? [179, 184, 255]) as [number, number, number];
    for (let i = 0; i + 1 < st.points.length; i++) {
      const [x0, y0] = st.points[i], [x1, y1] = st.points[i + 1];
      if (x0 !== x1 || y0 !== y1) out.push([x0, y0, x1, y1, col]);
    }
  }
  return out;
}

function mergeCollinear(segs: Seg[], eps = 1e-6): Seg[] {
  const out: Seg[] = [];
  for (const s of segs) {
    const p = out[out.length - 1];
    if (p) {
      const [px0, py0, px1, py1, pc] = p, [x0, y0, x1, y1, c] = s;
      const sameColor = pc[0] === c[0] && pc[1] === c[1] && pc[2] === c[2];
      if (sameColor && Math.abs(px1 - x0) < 1e-9 && Math.abs(py1 - y0) < 1e-9) {
        const ax = px1 - px0, ay = py1 - py0, bx = x1 - x0, by = y1 - y0;
        const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
        if (la > 0 && lb > 0 && Math.abs(ax * by - ay * bx) <= eps * la * lb && ax * bx + ay * by > 0) {
          out[out.length - 1] = [px0, py0, x1, y1, pc];
          continue;
        }
      }
    }
    out.push(s);
  }
  return out;
}

function sample(segs: Seg[], step: number): [number, number, [number, number, number]][] {
  const pts: [number, number, [number, number, number]][] = [];
  for (const [x0, y0, x1, y1, c] of segs) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let i = 0; i <= n; i++) { const t = i / n; pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, c]); }
  }
  return pts;
}

class Grid {
  private cells = new Map<string, number[]>();
  private segs: Seg[];
  private cell: number;
  constructor(segs: Seg[], cell: number) {
    this.segs = segs;
    this.cell = cell;
    segs.forEach(([x0, y0, x1, y1], i) => {
      const gx0 = Math.floor((Math.min(x0, x1) - cell) / cell), gx1 = Math.floor((Math.max(x0, x1) + cell) / cell);
      const gy0 = Math.floor((Math.min(y0, y1) - cell) / cell), gy1 = Math.floor((Math.max(y0, y1) + cell) / cell);
      for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) {
        const k = gx + "," + gy;
        const a = this.cells.get(k); if (a) a.push(i); else this.cells.set(k, [i]);
      }
    });
  }
  near(x: number, y: number, tol: number, color: [number, number, number] | null): boolean {
    const ids = this.cells.get(Math.floor(x / this.cell) + "," + Math.floor(y / this.cell));
    if (!ids) return false;
    const tol2 = tol * tol;
    for (const i of ids) {
      const [x0, y0, x1, y1, c] = this.segs[i];
      if (color && (Math.abs(color[0] - c[0]) > COLOR_TOL || Math.abs(color[1] - c[1]) > COLOR_TOL || Math.abs(color[2] - c[2]) > COLOR_TOL)) continue;
      const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy;
      const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / L2));
      const ex = x0 + t * dx - x, ey = y0 + t * dy - y;
      if (ex * ex + ey * ey <= tol2) return true;
    }
    return false;
  }
}

const down = <T,>(a: T[], limit = 400): T[] => (a.length <= limit ? a : Array.from({ length: limit }, (_, i) => a[Math.floor((i * a.length) / limit)]));
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export function scoreSegments(segments: Segment[], target: Target, opts: { tolerance?: number; checkColor?: boolean } = {}): ScoreResult {
  const tol = opts.tolerance ?? target.tolerance ?? DEFAULT_TOLERANCE;
  const checkColor = !!opts.checkColor;
  const tsegs = targetSegments(target);
  const dsegs = mergeCollinear(segments.map((s) => [s[1], s[2], s[3], s[4], [s[5], s[6], s[7]]] as Seg));
  if (!tsegs.length) return { score: 0, recall: 0, precision: 0, diff: { missed: [], extra: [] } };
  if (!dsegs.length) return { score: 0, recall: 0, precision: 0, diff: { missed: down(sample(tsegs, tol / 2).map(([x, y]) => [r3(x), r3(y)] as [number, number])), extra: [] } };

  const step = tol / 3;
  const tPts = sample(tsegs, step), dPts = sample(dsegs, step);
  const dGrid = new Grid(dsegs, tol), tGrid = new Grid(tsegs, tol);
  const missed = tPts.filter(([x, y, c]) => !dGrid.near(x, y, tol, checkColor ? c : null)).map(([x, y]) => [r3(x), r3(y)] as [number, number]);
  const extra = dPts.filter(([x, y, c]) => !tGrid.near(x, y, tol, checkColor ? c : null)).map(([x, y]) => [r3(x), r3(y)] as [number, number]);
  const recall = 1 - missed.length / tPts.length;
  const precision = 1 - extra.length / dPts.length;
  return {
    score: Math.floor(100 * Math.min(recall, precision) * 100) / 100,
    recall: Math.round(recall * 1e4) / 1e4,
    precision: Math.round(precision * 1e4) / 1e4,
    diff: { missed: down(missed), extra: down(extra) },
  };
}

/** Ramer–Douglas–Peucker simplification (iterative). eps in world units. */
export function simplify(points: [number, number][], eps = 0.002): [number, number][] {
  if (points.length < 3) return points.slice();
  const keep = new Uint8Array(points.length); keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [x0, y0] = points[a], [x1, y1] = points[b];
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
    let best = -1, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i];
      // closed loops (a == b position): fall back to point distance
      const d = L < 1e-9 ? Math.hypot(px - x0, py - y0) : Math.abs(dy * px - dx * py + x1 * y0 - y1 * x0) / L;
      if (d > best) { best = d; idx = i; }
    }
    if (best > eps) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  const kept = points.filter((_, i) => keep[i]);
  // RDP can keep a redundant collinear vertex when distances tie — drop those.
  const out: [number, number][] = [kept[0]];
  for (let i = 1; i < kept.length - 1; i++) {
    const [ax, ay] = out[out.length - 1], [px, py] = kept[i], [bx, by] = kept[i + 1];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
    const d = L < 1e-9 ? Math.hypot(px - ax, py - ay) : Math.abs(dy * px - dx * py + bx * ay - by * ax) / L;
    const between = (px - ax) * dx + (py - ay) * dy > 0 && (px - bx) * -dx + (py - by) * -dy > 0;
    if (!(d <= eps && between)) out.push(kept[i]);
  }
  out.push(kept[kept.length - 1]);
  return out;
}

/**
 * Admin target designer: turn the ink of a reference run into target strokes.
 * Chains touching segments of the same colour into polylines, then simplifies them (RDP).
 */
export function segmentsToStrokes(segments: Segment[], decimals = 4, eps = 0.002): Target["strokes"] {
  const k = 10 ** decimals, rd = (v: number) => Math.round(v * k) / k;
  const strokes: Target["strokes"] = [];
  for (const s of segments) {
    const [, x0, y0, x1, y1, r, g, b] = s;
    const cur = strokes[strokes.length - 1];
    const last = cur?.points[cur.points.length - 1];
    const sameColor = !!cur?.color && cur.color[0] === r && cur.color[1] === g && cur.color[2] === b;
    if (cur && last && sameColor && Math.abs(last[0] - x0) < 1e-6 && Math.abs(last[1] - y0) < 1e-6) cur.points.push([x1, y1]);
    else strokes.push({ points: [[x0, y0], [x1, y1]], color: [r, g, b] });
  }
  return strokes.map((st) => ({ ...st, points: simplify(st.points, eps).map(([x, y]) => [rd(x), rd(y)] as [number, number]) }));
}
