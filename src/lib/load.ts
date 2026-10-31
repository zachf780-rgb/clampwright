/** Estimated loads for an EMT frame. Not a rating.
 *
 * Steel numbers are ordinary mild steel (E 29e6 psi, Fy 33 ksi). Section sizes
 * are the EMT outside and inside diameters from the catalog. A simply supported
 * beam is the right picture for a slip-on clamp: it does not fully fix the end.
 *
 * Checked against Maker Pipe's 5 ft shelf test: two 3/4" rails, weight spread
 * along them, held about 180–210 lb and took a permanent bend by about 450 lb.
 * Two rails at yield under a spread load land near 250 lb here, so a single
 * anvil in the middle of one pipe is harsher than that video, on purpose.
 *
 * Sideways, a tightened clamp is assumed to develop about 35% of the pipe's
 * bending moment before the joint slips, and a cup slips axially before the
 * pipe tears (about 180 lb on native 3/4"). A diagonal is limited by that slip
 * or by buckling, whichever is smaller.
 */

import { tradeById, type TradeId } from "./catalog";
import type { Fitting, Member } from "./build";
import { layoutBoard, STOCK_MAP, type Board, type LayoutContext } from "./lumber";

export type ForceDir = "+x" | "-x" | "+z" | "-z";

export type ShopLoad = {
  id: string;
  kind: "weight" | "push";
  /** Member id, or `board:…`. */
  target: string;
  /** 0–1 along that piece. */
  t: number;
  pounds: number;
  dir: ForceDir;
};

export type LoadTone = "ok" | "soft" | "bad";

export type LoadMark = {
  id: string;
  kind: "weight" | "push";
  pounds: number;
  /** World point the anvil sits on, or the arrow starts at. */
  seat: [number, number, number];
  dir: [number, number, number];
  tone: LoadTone;
};

export type MemberStrain = {
  id: string;
  util: number;
  /** Bow to draw, inches. Small real sags are stretched so they read on screen. */
  bow: number;
  sag: number;
  axis: [number, number, number];
};

export type LoadRow = {
  id: string;
  title: string;
  pounds: number;
  kind: "weight" | "push";
  dir: ForceDir;
  tone: LoadTone;
  line: string;
};

export type LoadReport = {
  marks: LoadMark[];
  strains: MemberStrain[];
  tone: LoadTone;
  headline: string;
  detail: string;
  rows: LoadRow[];
};

const E_STEEL = 29_000_000;
const FY = 33_000;
const E_WOOD = 1_200_000;
const FB_WOOD = 875;
/** Share of the pipe's yield moment a clamp can hold before the bay racks. */
const CLAMP_MOMENT = 0.35;
const SLIP: Record<TradeId, number> = { half: 110, "three-quarter": 180, one: 280 };

const DIRS = new Set<ForceDir>(["+x", "-x", "+z", "-z"]);

type V3 = [number, number, number];

type Hit = { loadId: string; along: number; down: number; x: number; z: number };

type How = "sag" | "yield" | "buckle" | "rack" | "slip" | "crush";

type Concern = {
  memberId: string;
  util: number;
  how: How;
  sag: number;
  axis: V3;
  /** Pounds of the loads on this member that this check is scaling. */
  bundle: number;
  loadIds: string[];
};

export function cleanLoads(raw: unknown): ShopLoad[] {
  if (!Array.isArray(raw)) return [];
  const out: ShopLoad[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<ShopLoad>;
    if (typeof row.id !== "string" || (row.kind !== "weight" && row.kind !== "push")) continue;
    if (typeof row.target !== "string") continue;
    const pounds = Number(row.pounds);
    const t = Number(row.t);
    if (!Number.isFinite(pounds) || !Number.isFinite(t)) continue;
    out.push({
      id: row.id,
      kind: row.kind,
      target: row.target,
      t: Math.min(0.92, Math.max(0.08, t)),
      pounds: Math.min(5000, Math.max(1, Math.round(pounds))),
      dir: DIRS.has(row.dir as ForceDir) ? (row.dir as ForceDir) : "+x",
    });
    if (out.length >= 24) break;
  }
  return out;
}

export function stationAlong(a: V3, b: V3, point: V3): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len2 = dx * dx + dy * dy + dz * dz;
  if (len2 < 1) return 0.5;
  const t = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy + (point[2] - a[2]) * dz) / len2;
  return Math.min(0.92, Math.max(0.08, t));
}

export function dirVector(dir: ForceDir): V3 {
  if (dir === "-x") return [-1, 0, 0];
  if (dir === "+z") return [0, 0, 1];
  if (dir === "-z") return [0, 0, -1];
  return [1, 0, 0];
}

type Section = { i: number; s: number; area: number };

function section(od: number, id: number): Section {
  const i = (Math.PI / 64) * (od ** 4 - id ** 4);
  return { i, s: i / (od / 2), area: (Math.PI / 4) * (od ** 2 - id ** 2) };
}

function pipeSection(trade: TradeId): Section {
  const spec = tradeById(trade);
  return section(spec.od, spec.id_in);
}

function lengthOf(a: V3, b: V3): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}

function lerp(a: V3, b: V3, t: number): V3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function isPost(member: Member): boolean {
  const dx = Math.abs(member.b[0] - member.a[0]);
  const dz = Math.abs(member.b[2] - member.a[2]);
  return member.kind === "post" || (dx < 0.8 && dz < 0.8 && Math.abs(member.b[1] - member.a[1]) > 4);
}

function isDiagonal(member: Member): boolean {
  const dx = member.b[0] - member.a[0];
  const dy = member.b[1] - member.a[1];
  const dz = member.b[2] - member.a[2];
  return Math.hypot(dx, dz) > 4 && Math.abs(dy) > 4 && !isPost(member);
}

function momentAt(points: { a: number; p: number }[], span: number, x: number): number {
  let ra = 0;
  for (const pt of points) ra += (pt.p * (span - pt.a)) / span;
  let m = ra * x;
  for (const pt of points) if (pt.a < x - 1e-4) m -= pt.p * (x - pt.a);
  return m;
}

function maxMoment(points: { a: number; p: number }[], span: number): number {
  if (!points.length || span < 1) return 0;
  const xs = [span / 2, ...points.map((pt) => pt.a)];
  let max = 0;
  for (const x of xs) max = Math.max(max, Math.abs(momentAt(points, span, x)));
  return max;
}

/** Inches. Point load P at `a` inches, measured at `x`. */
function deflect(p: number, span: number, a: number, x: number, ei: number): number {
  if (span < 1 || ei < 1 || Math.abs(p) < 1e-6) return 0;
  const b = span - a;
  if (x <= a) return ((p * b * x) / (6 * ei * span)) * (span * span - b * b - x * x);
  const xr = span - x;
  return ((p * a * xr) / (6 * ei * span)) * (span * span - a * a - xr * xr);
}

function maxDeflect(points: { a: number; p: number }[], span: number, ei: number): number {
  if (!points.length) return 0;
  const xs = [span / 2, ...points.map((pt) => pt.a)];
  let max = 0;
  for (const x of xs) {
    let d = 0;
    for (const pt of points) d += deflect(pt.p, span, pt.a, x, ei);
    max = Math.max(max, Math.abs(d));
  }
  return max;
}

function euler(i: number, span: number, k: number): number {
  const len = Math.max(6, span * k);
  return (Math.PI ** 2 * E_STEEL * i) / (len * len);
}

function toneOf(util: number): LoadTone {
  if (util >= 1) return "bad";
  if (util >= 0.7) return "soft";
  return "ok";
}

function lb(n: number): string {
  if (!Number.isFinite(n) || n > 20000) return "well over a ton";
  return `${Math.max(1, Math.round(n))} lb`;
}

function inches(n: number): string {
  if (n < 0.08) return "under 0.1 in";
  return `${n.toFixed(1)} in`;
}

function bowOf(sag: number): number {
  if (sag < 0.08) return 0;
  if (sag < 1) return Math.max(sag * 2.2, 0.35);
  return sag;
}

type FrameBits = {
  trade: TradeId;
  members: Member[];
  boards: Board[];
  fittings: Fitting[];
  footed: (member: Member) => boolean;
};

function postAt(members: Member[], point: V3): Member | null {
  let best: Member | null = null;
  let dist = 2.2;
  for (const member of members) {
    if (!isPost(member)) continue;
    const d = Math.hypot(member.a[0] - point[0], member.a[2] - point[2]);
    if (d < dist) {
      dist = d;
      best = member;
    }
  }
  return best;
}

function hostRail(members: Member[], point: V3, skip: string): { member: Member; t: number } | null {
  let best: { member: Member; t: number; d: number } | null = null;
  for (const member of members) {
    if (member.id === skip || isPost(member)) continue;
    const span = Math.max(1, member.span);
    const t = stationAlong(member.a, member.b, point);
    const q = lerp(member.a, member.b, t);
    const d = Math.hypot(q[0] - point[0], q[1] - point[1], q[2] - point[2]);
    if (d > 3.5) continue;
    if (!best || d < best.d) best = { member, t: t * span, d };
  }
  return best ? { member: best.member, t: best.t } : null;
}

function nearestPipe(members: Member[], point: V3): { member: Member; along: number } | null {
  let best: { member: Member; along: number; d: number } | null = null;
  for (const member of members) {
    const span = Math.max(1, member.span);
    const t = stationAlong(member.a, member.b, point);
    const q = lerp(member.a, member.b, t);
    const d = Math.hypot(q[0] - point[0], q[1] - point[1], q[2] - point[2]);
    if (d > 8) continue;
    if (!best || d < best.d) best = { member, along: t * span, d };
  }
  return best ? { member: best.member, along: best.along } : null;
}

function hasLevelRail(members: Member[], post: Member): boolean {
  for (const member of members) {
    if (member.id === post.id || isPost(member) || isDiagonal(member)) continue;
    const span = Math.hypot(member.b[0] - member.a[0], member.b[2] - member.a[2]);
    if (span < 4) continue;
    for (const end of [member.a, member.b]) {
      if (Math.hypot(end[0] - post.a[0], end[2] - post.a[2]) < 2.2) return true;
    }
  }
  return false;
}

function woodCheck(board: Board, load: ShopLoad, ctx: LayoutContext): Concern | null {
  const stock = STOCK_MAP[board.kind];
  if (!stock || stock.sheet) return null;
  const laid = layoutBoard(board, ctx);
  if (!laid || laid.error || laid.length < 6) return null;
  const depth = board.face === "edge" ? stock.wide : stock.thick;
  const width = board.face === "edge" ? stock.thick : stock.wide;
  const inertia = (width * depth ** 3) / 12;
  const modulus = (width * depth ** 2) / 6;
  const span = laid.length;
  const along = Math.min(span * 0.92, Math.max(span * 0.08, load.t * span));
  const moment = maxMoment([{ a: along, p: load.pounds }], span);
  const sag = maxDeflect([{ a: along, p: load.pounds }], span, E_WOOD * inertia);
  const stress = modulus > 0 ? moment / modulus : 0;
  const sagLimit = span / 180;
  const utilYield = stress / FB_WOOD;
  const utilSag = sagLimit > 0 ? sag / sagLimit : 0;
  const util = Math.max(utilYield, utilSag);
  const how: How = utilYield >= utilSag ? "yield" : "sag";
  return {
    memberId: `board:${board.id}`,
    util,
    how,
    sag,
    axis: [0, -1, 0],
    bundle: load.pounds,
    loadIds: [load.id],
  };
}

function studyPipe(
  member: Member,
  hits: Hit[],
  bits: FrameBits,
  axial: number,
): Concern[] {
  const trade = member.trade ?? bits.trade;
  const sec = pipeSection(trade);
  const span = Math.max(1, member.span);
  const out: Concern[] = [];
  const ids = [...new Set(hits.map((hit) => hit.loadId))];
  const bundle = hits.reduce((sum, hit) => sum + Math.abs(hit.down) + Math.abs(hit.x) + Math.abs(hit.z), 0);

  if (!isPost(member) && span >= 3 && hits.length) {
    const down = hits.filter((hit) => Math.abs(hit.down) > 0.05).map((hit) => ({ a: hit.along, p: hit.down }));
    const xs = hits.filter((hit) => Math.abs(hit.x) > 0.05).map((hit) => ({ a: hit.along, p: hit.x }));
    const zs = hits.filter((hit) => Math.abs(hit.z) > 0.05).map((hit) => ({ a: hit.along, p: hit.z }));
    const mv = maxMoment(down, span);
    const mx = maxMoment(xs, span);
    const mz = maxMoment(zs, span);
    const moment = Math.hypot(mv, mx, mz);
    const stress = sec.s > 0 ? moment / sec.s : 0;
    const sag = maxDeflect(down, span, E_STEEL * sec.i);
    const side = Math.hypot(maxDeflect(xs, span, E_STEEL * sec.i), maxDeflect(zs, span, E_STEEL * sec.i));
    const sagLimit = span / 120;
    const sideLimit = span / 90;
    const utilYield = FY > 0 ? stress / FY : 0;
    const utilSag = sagLimit > 0 ? sag / sagLimit : 0;
    const utilSide = sideLimit > 0 ? side / sideLimit : 0;
    const util = Math.max(utilYield, utilSag, utilSide);
    let how: How = "sag";
    let shown = sag;
    let axis: V3 = [0, -1, 0];
    const sideAxis = (): V3 => {
      const sx = xs.reduce((s, pt) => s + pt.p, 0);
      const sz = zs.reduce((s, pt) => s + pt.p, 0);
      const mag = Math.hypot(sx, sz) || 1;
      return [sx / mag, 0, sz / mag];
    };
    if (utilYield >= 1 || (utilYield >= utilSag && utilYield >= utilSide && utilYield >= 0.7)) {
      how = "yield";
      shown = Math.max(sag, side);
      if (side > sag) axis = sideAxis();
    } else if (utilSide >= utilSag) {
      how = "sag";
      shown = side;
      axis = sideAxis();
    } else {
      how = "sag";
      shown = sag;
    }
    if (util > 0.02) {
      out.push({ memberId: member.id, util, how, sag: shown, axis, bundle, loadIds: ids });
    }
  }

  if (isPost(member)) {
    const lateral = hits.filter((hit) => Math.abs(hit.x) + Math.abs(hit.z) > 0.05);
    const lonely = bits.footed(member) && !hasLevelRail(bits.members, member);
    if (lonely && lateral.length) {
      let worst = 0;
      let sag = 0;
      let axis: V3 = [1, 0, 0];
      for (const hit of lateral) {
        const force = Math.hypot(hit.x, hit.z);
        const height = Math.max(6, hit.along);
        const moment = force * height;
        const stress = sec.s > 0 ? moment / sec.s : 0;
        const lean = (force * height ** 3) / (3 * E_STEEL * sec.i);
        const util = Math.max(stress / FY, lean / (member.span / 60));
        if (util > worst) {
          worst = util;
          sag = lean;
          const mag = force || 1;
          axis = [hit.x / mag, 0, hit.z / mag];
        }
      }
      if (worst > 0.02) {
        out.push({
          memberId: member.id,
          util: worst,
          how: worst > 0 && lateral.some((hit) => Math.hypot(hit.x, hit.z) * hit.along / (sec.s * FY) >= 1) ? "yield" : "sag",
          sag,
          axis,
          bundle,
          loadIds: ids,
        });
      }
    }
    const cap = Math.min(0.45 * FY * sec.area, euler(sec.i, member.span, bits.footed(member) ? 0.75 : 1));
    const buckles = euler(sec.i, member.span, bits.footed(member) ? 0.75 : 1) < 0.45 * FY * sec.area;
    if (axial > 1 && cap > 0) {
      out.push({
        memberId: member.id,
        util: axial / cap,
        how: buckles ? "buckle" : "crush",
        sag: axial / cap > 1 ? 1.4 : 0,
        axis: [1, 0, 0],
        bundle: axial,
        loadIds: ids.length ? ids : ["axial"],
      });
    }
  }
  return out;
}

function braceCapacity(member: Member, axis: "x" | "z", trade: TradeId): { cap: number; how: How } {
  const dx = member.b[0] - member.a[0];
  const dy = member.b[1] - member.a[1];
  const dz = member.b[2] - member.a[2];
  const run = Math.abs(axis === "x" ? dx : dz);
  const horiz = Math.hypot(dx, dz);
  const span = Math.hypot(dx, dy, dz);
  if (run < horiz * 0.45 || span < 4) return { cap: 0, how: "slip" };
  const sec = pipeSection(member.trade ?? trade);
  const slip = SLIP[member.trade ?? trade];
  const squash = 0.5 * FY * sec.area;
  const bow = euler(sec.i, span, 1);
  const axial = Math.min(slip, squash, bow);
  const how: How = bow <= slip && bow <= squash ? "buckle" : "slip";
  return { cap: axial * (run / span), how };
}

function jointMoment(members: Member[], axis: "x" | "z", trade: TradeId): number {
  let cap = 0;
  for (const member of members) {
    if (isPost(member) || isDiagonal(member)) continue;
    const dx = Math.abs(member.b[0] - member.a[0]);
    const dz = Math.abs(member.b[2] - member.a[2]);
    const run = Math.hypot(dx, dz);
    if (run < 4) continue;
    const mine = axis === "x" ? dx : dz;
    if (mine < run * 0.55) continue;
    const sec = pipeSection(member.trade ?? trade);
    cap += 2 * CLAMP_MOMENT * FY * sec.s;
  }
  return cap;
}

export const WEIGHT_BANDS: { max: number; label: string; color: string }[] = [
  { max: 50, label: "Under 50 lb", color: "#d4533c" },
  { max: 100, label: "50–100 lb", color: "#e07a3d" },
  { max: 200, label: "100–200 lb", color: "#e2a322" },
  { max: 400, label: "200–400 lb", color: "#c5d36a" },
  { max: Infinity, label: "400 lb and up", color: "#3d8f62" },
];

export type MemberCapacity = { id: string; pounds: number; color: string };

export function weightBand(pounds: number): { label: string; color: string } {
  return WEIGHT_BANDS.find((band) => pounds < band.max) ?? WEIGHT_BANDS[WEIGHT_BANDS.length - 1];
}

function fromProbe(id: string, probe: number, concerns: Concern[]): MemberCapacity {
  const util = concerns.reduce((max, item) => Math.max(max, item.util), 0);
  const pounds = util < 0.002 ? 5000 : Math.min(5000, Math.max(1, Math.round(probe / util)));
  return { id, pounds, color: weightBand(pounds).color };
}

/** How much weight each piece can take, with no anvil placed. A rail is one weight in the middle. A post is weight standing on it. */
export function rateCapacities(input: {
  trade: TradeId;
  members: Member[];
  boards: Board[];
  fittings: Pick<Fitting, "id" | "sku" | "position">[];
  footed: (member: Member) => boolean;
  pipeRadius: number;
}): MemberCapacity[] {
  const bits: FrameBits = {
    trade: input.trade,
    members: input.members,
    boards: input.boards,
    fittings: input.fittings as Fitting[],
    footed: input.footed,
  };
  const ctx: LayoutContext = {
    fittings: input.fittings.map((item) => ({ id: item.id, sku: item.sku, position: item.position })),
    members: input.members.map((item) => ({ id: item.id, a: item.a, b: item.b })),
    boards: input.boards,
    straps: [],
    pipeRadius: input.pipeRadius,
  };
  const probe = 100;
  const out: MemberCapacity[] = [];
  for (const member of input.members) {
    if (isPost(member)) {
      out.push(fromProbe(member.id, probe, studyPipe(member, [], bits, probe)));
      continue;
    }
    const span = Math.max(1, member.span);
    const hits: Hit[] = [{ loadId: "probe", along: span * 0.5, down: probe, x: 0, z: 0 }];
    out.push(fromProbe(member.id, probe, studyPipe(member, hits, bits, 0)));
  }
  for (const board of input.boards) {
    const concern = woodCheck(
      board,
      { id: "probe", kind: "weight", target: `board:${board.id}`, t: 0.5, pounds: probe, dir: "+x" },
      ctx,
    );
    if (!concern) continue;
    out.push(fromProbe(`board:${board.id}`, probe, [concern]));
  }
  return out;
}

function emptyReport(): LoadReport {
  return {
    marks: [],
    strains: [],
    tone: "ok",
    headline: "Set a weight on the frame.",
    detail: "An anvil pushes down. A push is sideways. The pounds are an estimate, not a rating.",
    rows: [],
  };
}

function lineFor(concern: Concern | undefined, kind: "weight" | "push", pounds: number): string {
  if (!concern || concern.util < 0.02) {
    return kind === "weight"
      ? "This barely bends the pipe. You can go heavier."
      : "This shove barely moves the frame.";
  }
  const sole = concern.loadIds.length <= 1;
  const cap = concern.util > 0.02 ? concern.bundle / concern.util : Infinity;
  const share = sole ? cap : pounds * (cap / Math.max(concern.bundle, 1));
  if (concern.how === "rack") {
    return concern.util >= 1
      ? `The bay racks. Sideways, without a brace, this is only good for about ${lb(share)}.`
      : `The clamps are what resist this shove. They start to slip around ${lb(share)}.`;
  }
  if (concern.how === "slip") {
    return concern.util >= 1
      ? `A clamp slips. The diagonal was good for about ${lb(share)} of shove.`
      : `The diagonal takes it. The clamp on that brace starts to slip around ${lb(share)}.`;
  }
  if (concern.how === "buckle") {
    return concern.util >= 1
      ? `Bows out sideways. Good for about ${lb(share)} before it buckles.`
      : `Still standing. It buckles around ${lb(share)}.`;
  }
  if (concern.how === "crush") {
    return concern.util >= 1
      ? `The post crushes. About ${lb(share)} is the limit here.`
      : `The post can take about ${lb(share)} standing on it.`;
  }
  if (concern.how === "yield") {
    return concern.util >= 1
      ? `Bends and stays bent. It was good for about ${lb(share)} before the kink.`
      : `Springs back at this weight. It stays bent around ${lb(share)}.`;
  }
  return concern.util >= 1
    ? `Sags about ${inches(concern.sag)} and looks tired. The sag limit was about ${lb(share)}.`
    : `Sags about ${inches(concern.sag)}. Comfortable to about ${lb(share)}.`;
}

export function rateLoads(input: {
  trade: TradeId;
  members: Member[];
  boards: Board[];
  fittings: Pick<Fitting, "id" | "sku" | "position">[];
  loads: ShopLoad[];
  footed: (member: Member) => boolean;
  pipeRadius: number;
}): LoadReport {
  const loads = input.loads;
  if (!loads.length) return emptyReport();
  if (!input.members.length && !input.boards.length) {
    return { ...emptyReport(), headline: "Draw a frame first.", detail: "There's nothing here to put weight on." };
  }
  const bits: FrameBits = {
    trade: input.trade,
    members: input.members,
    boards: input.boards,
    fittings: input.fittings as Fitting[],
    footed: input.footed,
  };
  const ctx: LayoutContext = {
    fittings: input.fittings.map((item) => ({ id: item.id, sku: item.sku, position: item.position })),
    members: input.members.map((item) => ({ id: item.id, a: item.a, b: item.b })),
    boards: input.boards,
    straps: [],
    pipeRadius: input.pipeRadius,
  };
  const byId = new Map(input.members.map((member) => [member.id, member]));
  const hits = new Map<string, Hit[]>();
  const axial = new Map<string, { pounds: number; loadIds: string[] }>();
  const concerns: Concern[] = [];
  const seats = new Map<string, { seat: V3; dir: V3 }>();

  const pushHit = (id: string, hit: Hit) => {
    const list = hits.get(id) ?? [];
    list.push(hit);
    hits.set(id, list);
  };
  const addAxial = (id: string, pounds: number, loadId: string) => {
    const cur = axial.get(id) ?? { pounds: 0, loadIds: [] };
    cur.pounds += pounds;
    if (!cur.loadIds.includes(loadId)) cur.loadIds.push(loadId);
    axial.set(id, cur);
  };

  const seatOnMember = (member: Member, t: number): V3 => {
    const at = lerp(member.a, member.b, t);
    const spec = tradeById(member.trade ?? input.trade);
    return [at[0], at[1] + spec.od / 2, at[2]];
  };

  for (const load of loads) {
    const vector = dirVector(load.dir);
    if (load.target.startsWith("board:")) {
      const board = input.boards.find((item) => item.id === load.target.slice(6));
      if (!board) continue;
      const laid = layoutBoard(board, ctx);
      if (laid && !laid.error) {
        const start: V3 = [
          laid.origin[0] - laid.long[0] * laid.length * 0.5,
          laid.origin[1] - laid.long[1] * laid.length * 0.5,
          laid.origin[2] - laid.long[2] * laid.length * 0.5,
        ];
        const at: V3 = [
          start[0] + laid.long[0] * laid.length * load.t,
          start[1] + laid.long[1] * laid.length * load.t,
          start[2] + laid.long[2] * laid.length * load.t,
        ];
        const lift = laid.rise / 2;
        seats.set(load.id, {
          seat: [at[0] + laid.up[0] * lift, at[1] + laid.up[1] * lift, at[2] + laid.up[2] * lift],
          dir: vector,
        });
      }
      if (load.kind === "weight") {
        const wood = woodCheck(board, load, ctx);
        if (wood) concerns.push(wood);
        const supports = board.anchors
          .map((anchor) => nearestPipe(input.members, anchor.at))
          .filter((item): item is { member: Member; along: number } => Boolean(item));
        const share = supports.length ? load.pounds / supports.length : 0;
        for (const support of supports) {
          if (isPost(support.member)) addAxial(support.member.id, share, load.id);
          else pushHit(support.member.id, { loadId: load.id, along: support.along, down: share, x: 0, z: 0 });
        }
      }
      continue;
    }
    const member = byId.get(load.target);
    if (!member) continue;
    const span = Math.max(1, member.span);
    const along = load.t * span;
    seats.set(load.id, { seat: seatOnMember(member, load.t), dir: vector });
    if (load.kind === "weight") {
      if (isPost(member)) addAxial(member.id, load.pounds, load.id);
      else pushHit(member.id, { loadId: load.id, along, down: load.pounds, x: 0, z: 0 });
    } else {
      const signX = vector[0];
      const signZ = vector[2];
      pushHit(member.id, { loadId: load.id, along, down: 0, x: load.pounds * signX, z: load.pounds * signZ });
    }
  }

  const extra: { id: string; hit: Hit }[] = [];
  for (const [id, list] of hits) {
    const member = byId.get(id);
    if (!member || isPost(member)) continue;
    const span = Math.max(1, member.span);
    for (const hit of list) {
      if (Math.abs(hit.down) < 0.05) continue;
      const ra = (hit.down * (span - hit.along)) / span;
      const rb = (hit.down * hit.along) / span;
      const ends: [number, V3][] = [
        [ra, member.a],
        [rb, member.b],
      ];
      for (const [reaction, at] of ends) {
        if (reaction < 0.05) continue;
        const post = postAt(input.members, at);
        if (post) {
          addAxial(post.id, reaction, hit.loadId);
          continue;
        }
        const host = hostRail(input.members, at, member.id);
        if (host) extra.push({ id: host.member.id, hit: { loadId: hit.loadId, along: host.t, down: reaction, x: 0, z: 0 } });
      }
    }
  }
  for (const item of extra) pushHit(item.id, item.hit);

  for (const member of input.members) {
    const list = hits.get(member.id) ?? [];
    const stand = axial.get(member.id);
    if (stand && stand.pounds > 0) {
      for (const loadId of stand.loadIds) {
        if (!list.some((hit) => hit.loadId === loadId)) list.push({ loadId, along: member.span * 0.5, down: 0, x: 0, z: 0 });
      }
    }
    concerns.push(...studyPipe(member, list, bits, stand?.pounds ?? 0));
  }

  for (const axis of ["x", "z"] as const) {
    let force = 0;
    let moment = 0;
    const ids: string[] = [];
    for (const load of loads) {
      if (load.kind !== "push") continue;
      const vector = dirVector(load.dir);
      const component = axis === "x" ? load.pounds * vector[0] : load.pounds * vector[2];
      if (Math.abs(component) < 0.05) continue;
      const member = byId.get(load.target);
      const y = member ? lerp(member.a, member.b, load.t)[1] : 24;
      force += component;
      moment += Math.abs(component) * Math.max(8, y);
      ids.push(load.id);
    }
    if (Math.abs(force) < 0.5) continue;
    let braceCap = 0;
    let braceHow: How = "slip";
    const braceIds: string[] = [];
    for (const member of input.members) {
      if (!isDiagonal(member)) continue;
      const help = braceCapacity(member, axis, input.trade);
      if (help.cap <= 0) continue;
      braceCap += help.cap;
      braceIds.push(member.id);
      if (help.how === "buckle") braceHow = "buckle";
    }
    const joints = jointMoment(input.members, axis, input.trade);
    if (braceCap > 1) {
      const util = Math.abs(force) / braceCap;
      for (const id of braceIds) {
        concerns.push({
          memberId: id,
          util,
          how: braceHow,
          sag: util >= 1 ? 1.2 : 0,
          axis: axis === "x" ? [1, 0, 0] : [0, 0, 1],
          bundle: Math.abs(force),
          loadIds: ids,
        });
      }
    } else if (joints > 1) {
      const util = moment / joints;
      const rails = input.members.filter((member) => {
        if (isPost(member) || isDiagonal(member)) return false;
        const dx = Math.abs(member.b[0] - member.a[0]);
        const dz = Math.abs(member.b[2] - member.a[2]);
        const run = Math.hypot(dx, dz);
        return run > 4 && (axis === "x" ? dx : dz) >= run * 0.55;
      });
      for (const member of rails) {
        concerns.push({
          memberId: member.id,
          util,
          how: "rack",
          sag: util >= 1 ? 1.6 : util * 0.6,
          axis: axis === "x" ? [1, 0, 0] : [0, 0, 1],
          bundle: Math.abs(force),
          loadIds: ids,
        });
      }
    }
  }

  const worstByMember = new Map<string, Concern>();
  for (const concern of concerns) {
    const prev = worstByMember.get(concern.memberId);
    if (!prev || concern.util > prev.util) worstByMember.set(concern.memberId, concern);
  }

  const strains: MemberStrain[] = [];
  for (const [id, concern] of worstByMember) {
    if (id.startsWith("board:")) continue;
    strains.push({
      id,
      util: concern.util,
      sag: concern.sag,
      bow: concern.how === "buckle" && concern.util >= 1 ? 1.6 : bowOf(concern.sag),
      axis: concern.axis,
    });
  }

  const rows: LoadRow[] = loads.map((load) => {
    const related = concerns.filter((concern) => concern.loadIds.includes(load.id));
    const worst = related.reduce<Concern | undefined>((best, concern) => (!best || concern.util > best.util ? concern : best), undefined);
    const member = byId.get(load.target);
    const board = load.target.startsWith("board:") ? input.boards.find((item) => `board:${item.id}` === load.target) : undefined;
    const title = member?.label ?? (board ? STOCK_MAP[board.kind].label : "Missing piece");
    return {
      id: load.id,
      title,
      pounds: load.pounds,
      kind: load.kind,
      dir: load.dir,
      tone: toneOf(worst?.util ?? 0),
      line: member || board ? lineFor(worst, load.kind, load.pounds) : "That piece is gone. Remove this load.",
    };
  });

  const worst = [...worstByMember.values()].reduce<Concern | undefined>((best, concern) => (!best || concern.util > best.util ? concern : best), undefined);
  const tone = toneOf(worst?.util ?? 0);
  let headline = "Comfortable. The pipes should spring back.";
  if (!worst) headline = "Nothing much is stressed yet.";
  else if (tone === "bad" && worst.how === "yield") headline = "Too much. A pipe bends and stays bent.";
  else if (tone === "bad" && worst.how === "sag") headline = "Too much sag. It would look bowed.";
  else if (tone === "bad" && worst.how === "rack") headline = "The frame racks. The clamps slip and it leans.";
  else if (tone === "bad" && (worst.how === "buckle" || worst.how === "crush")) headline = "A post gives up under this load.";
  else if (tone === "bad" && worst.how === "slip") headline = "A brace clamp slips.";
  else if (tone === "soft" && worst.how === "rack") headline = "It holds, but a harder shove racks it.";
  else if (tone === "soft") headline = "It holds, with a visible sag.";

  const named = worst ? input.members.find((member) => member.id === worst.memberId) : undefined;
  const detail = [
    named ? `${named.label}: ${lineFor(worst, "weight", worst?.bundle ?? 0)}` : worst ? lineFor(worst, "weight", worst.bundle) : "",
    "Estimate only, not a rating. A single anvil is harder on one pipe than the same weight spread along a shelf. Don't trust it for anything that could fall on someone.",
  ]
    .filter(Boolean)
    .join(" ");

  const marks: LoadMark[] = loads.map((load) => {
    const placed = seats.get(load.id);
    const row = rows.find((item) => item.id === load.id);
    const member = byId.get(load.target);
    const fallback = member ? seatOnMember(member, load.t) : ([0, 0, 0] as V3);
    return {
      id: load.id,
      kind: load.kind,
      pounds: load.pounds,
      seat: placed?.seat ?? fallback,
      dir: placed?.dir ?? dirVector(load.dir),
      tone: row?.tone ?? "ok",
    };
  });

  return { marks, strains, tone, headline, detail, rows };
}

export function loadSelfCheck(): void {
  const sec = section(0.922, 0.824);
  const yieldMoment = FY * sec.s;
  const center = (4 * yieldMoment) / 60;
  if (center < 55 || center > 80) throw new Error(`3/4" center yield ${center.toFixed(1)}`);
  const spread = (2 * 8 * yieldMoment) / 60;
  if (spread < 210 || spread > 300) throw new Error(`two-rail spread ${spread.toFixed(1)}`);

  const rail = fake("rail-1", "rail", [0, 36, 0], [60, 36, 0], "Front rail");
  const postA = fake("post-a", "post", [0, 0, 0], [0, 36, 0], "Post A");
  const postB = fake("post-b", "post", [60, 0, 0], [60, 36, 0], "Post B");
  const light = rateLoads({
    trade: "three-quarter",
    members: [postA, postB, rail],
    boards: [],
    fittings: [],
    loads: [{ id: "w", kind: "weight", target: "rail-1", t: 0.5, pounds: 40, dir: "+x" }],
    footed: () => false,
    pipeRadius: 0.461,
  });
  const lightRow = light.rows[0];
  if (!lightRow || lightRow.tone === "bad") throw new Error(`40 lb should still spring back, got ${lightRow?.tone} ${lightRow?.line}`);
  if (!light.strains.some((item) => item.id === "rail-1" && item.sag > 0.25 && item.sag < 0.9)) {
    throw new Error(`40 lb sag ${light.strains.map((item) => item.sag).join(",")}`);
  }

  const heavy = rateLoads({
    trade: "three-quarter",
    members: [postA, postB, rail],
    boards: [],
    fittings: [],
    loads: [{ id: "w", kind: "weight", target: "rail-1", t: 0.5, pounds: 200, dir: "+x" }],
    footed: () => false,
    pipeRadius: 0.461,
  });
  if (heavy.tone !== "bad" || heavy.headline.indexOf("bend") === -1) {
    throw new Error(`200 lb should kink, got ${heavy.tone} ${heavy.headline}`);
  }

  const shove = rateLoads({
    trade: "three-quarter",
    members: [postA, postB, rail],
    boards: [],
    fittings: [],
    loads: [{ id: "p", kind: "push", target: "post-a", t: 0.95, pounds: 80, dir: "+x" }],
    footed: () => false,
    pipeRadius: 0.461,
  });
  if (shove.tone !== "bad") throw new Error(`unbraced 80 lb shove should rack, got ${shove.tone} ${shove.headline}`);

  const brace = fake("brace-1", "rail", [0, 4, 0], [60, 36, 0], "Diagonal");
  const braced = rateLoads({
    trade: "three-quarter",
    members: [postA, postB, rail, brace],
    boards: [],
    fittings: [],
    loads: [{ id: "p", kind: "push", target: "post-a", t: 0.95, pounds: 80, dir: "+x" }],
    footed: () => false,
    pipeRadius: 0.461,
  });
  const bareUtil = Math.max(0, ...shove.strains.map((item) => item.util));
  const bracedUtil = Math.max(0, ...braced.strains.map((item) => item.util));
  if (!(bracedUtil < bareUtil * 0.7)) {
    throw new Error(`brace should help, bare ${bareUtil.toFixed(2)} braced ${bracedUtil.toFixed(2)} ${braced.headline}`);
  }

  const tall = fake("post-t", "post", [0, 0, 0], [0, 96, 0], "Tall post");
  const buckled = rateLoads({
    trade: "three-quarter",
    members: [tall],
    boards: [],
    fittings: [],
    loads: [{ id: "w", kind: "weight", target: "post-t", t: 0.9, pounds: 800, dir: "+x" }],
    footed: () => false,
    pipeRadius: 0.461,
  });
  if (!buckled.strains.some((item) => item.util >= 1)) throw new Error("tall post should buckle under 800 lb");

  const short = fake("post-s", "post", [0, 0, 0], [0, 36, 0], "Short post");
  const standing = rateLoads({
    trade: "three-quarter",
    members: [short],
    boards: [],
    fittings: [],
    loads: [{ id: "w", kind: "weight", target: "post-s", t: 0.9, pounds: 800, dir: "+x" }],
    footed: () => true,
    pipeRadius: 0.461,
  });
  if (standing.tone === "bad") throw new Error(`short footed post should hold 800 lb, got ${standing.headline}`);

  const caps = rateCapacities({
    trade: "three-quarter",
    members: [postA, postB, rail],
    boards: [],
    fittings: [],
    footed: () => false,
    pipeRadius: 0.461,
  });
  const railCap = caps.find((item) => item.id === "rail-1");
  if (!railCap || railCap.pounds < 35 || railCap.pounds > 100) throw new Error(`60" rail capacity ${railCap?.pounds}`);
  if (railCap.color !== weightBand(railCap.pounds).color) throw new Error("band color drifted");
  const shortRail = fake("short", "rail", [0, 36, 0], [18, 36, 0], "Short rail");
  const shortCap = rateCapacities({
    trade: "three-quarter",
    members: [shortRail],
    boards: [],
    fittings: [],
    footed: () => false,
    pipeRadius: 0.461,
  })[0];
  if (!shortCap || shortCap.pounds <= railCap.pounds) throw new Error(`short rail should be stronger, got ${shortCap?.pounds} vs ${railCap.pounds}`);
  const postCap = caps.find((item) => item.id === "post-a");
  if (!postCap || postCap.pounds < 400) throw new Error(`post capacity ${postCap?.pounds}`);
  const longRail = fake("long", "rail", [0, 36, 0], [96, 36, 0], "Long rail");
  const longCap = rateCapacities({
    trade: "three-quarter",
    members: [longRail],
    boards: [],
    fittings: [],
    footed: () => false,
    pipeRadius: 0.461,
  })[0];
  if (!longCap || longCap.pounds >= railCap.pounds) throw new Error(`longer rail should be weaker ${longCap?.pounds} vs ${railCap.pounds}`);
  if (weightBand(49).label !== "Under 50 lb" || weightBand(50).label !== "50–100 lb" || weightBand(400).label !== "400 lb and up") {
    throw new Error("weight bands");
  }
}

function fake(id: string, kind: Member["kind"], a: V3, b: V3, label: string): Member {
  const span = lengthOf(a, b);
  return {
    id,
    kind,
    label,
    a,
    b,
    span,
    metal: span,
    pieces: [],
    segments: [],
    couplings: [],
    couplingCount: 0,
    approx: false,
    angle: null,
    setbackA: 0,
    setbackB: 0,
    seatA: "",
    seatB: "",
  };
}
