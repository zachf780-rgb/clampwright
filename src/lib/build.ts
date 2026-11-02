import {
  ALSO_SOLD,
  CONNECTOR_MAP,
  FAMILIES,
  SHIM_PRICE,
  ONE_SHIM_PRICE,
  STRAP_PRICE,
  ANGLE_HINGE_PRICE,
  BARREL_LENGTH,
  BARREL_PRICE,
  LEAF_SET_COUNT,
  LEAF_SET_PRICE,
  CAP_PACK,
  capEach,
  capPackPrice,
  connectorPrice,
  skuShort,
  type FamilySpec,
  type Finish,
  type Sku,
  type TradeId,
  tradeById,
} from "./catalog";
import { formatDecimal, formatLen, money, parseLength } from "./format";
import { cleanBoards, lumberSlideSelfCheck, type Board } from "./lumber";
import { loadSelfCheck, type ShopLoad } from "./load";

export type { Finish, TradeId };

export type Vec3 = [number, number, number];
export type Dir = "+x" | "-x" | "+z" | "-z";

export type FloorKind = "grass" | "dirt" | "concrete" | "wood";

/** End cap on a rectangle post. Free-build caps are stored on the post itself. */
export type Plug = {
  id: string;
  top?: boolean;
  foot?: boolean;
};

export type Project = {
  id: string;
  name: string;
  trade: TradeId;
  stick: 96 | 120 | 240;
  kerf: number;
  baysX: number[];
  baysZ: number[];
  postHeight: number;
  levels: number[];
  flanges: boolean;
  braces: boolean;
  showFigure: boolean;
  finish: Finish;
  stickPrice: number;
  /** `grid` is a rectangle of bays. `sketch` is posts you place yourself. */
  mode?: "grid" | "sketch";
  nodes?: SketchNode[];
  links?: SketchLink[];
  /** Height of the next rail you draw in a free build. */
  railHeight?: number;
  /** Ghost boxes used only for measuring. They are not pipe. */
  references?: MeasureRef[];
  /** One-hole straps that snap onto a pipe and screw to wood. They do not change a cut. */
  straps?: Strap[];
  /** Boards and panels screwed to clamps or to other lumber. */
  boards?: Board[];
  /** Weights and sideways shoves for the load test. They do not change a cut. */
  loads?: ShopLoad[];
  /** Ground in the finished view. Editing still uses the grid. */
  floor?: FloorKind;
  /** End caps on rectangle posts, keyed by member id. Free-build caps live on the post. */
  plugs?: Plug[];
  /** Door hardware on a post or a rail. The pale gate is only a preview. */
  hinges?: Hinge[];
  /** How far each hinged pipe is swung open, in degrees. Closed is omitted. */
  hingeSwing?: HingeSwing[];
  /** A real door frame hung on one pipe's hinges. The pipes are ordinary posts and rails. */
  doors?: Door[];
};

export type SketchNode = {
  id: string;
  x: number;
  z: number;
  height: number;
  flange: boolean;
  /** Inches of this post below grade. Shown faint, and added to the cut, not to the size on screen. */
  bury?: number;
  /** Overrides the frame's EMT size for this post. */
  trade?: TradeId;
  /** Set when this point is a joint on a rail, not a post in the ground. */
  host?: string;
  /** Fraction along the host rail, so the joint stays put when an end moves. */
  hostT?: number;
  /** Plug the open top of this post. */
  cap?: boolean;
  /** Plug the foot. Counted only when the post is not buried and has no flange. */
  capFoot?: boolean;
  /** Height above the floor where this post is two pieces. A rail at that height is the through pipe. */
  split?: number;
  /** Free end of a rail. Not a post, and not a clamp. */
  tip?: boolean;
  /** Where a post starts, if it does not sit on the floor. Used by door stiles. */
  base?: number;
  /** Set when this post is one stile of a door. */
  door?: string;
};

export type SketchLink = {
  id: string;
  a: string;
  b: string;
  /** Height where this pipe meets post A. */
  y: number;
  /** Height where it meets post B. Omit, or match `y`, for a level pipe. */
  yB?: number;
  kind: "rail" | "brace";
  /** Overrides the frame's EMT size for this rail. */
  trade?: TradeId;
  /** Inches the pipe continues past the post at A. On a split post this lengthens the through rail. On a cut rail it is a separate stub. */
  pastA?: number;
  /** Inches the pipe continues past the post at B. */
  pastB?: number;
  /** Plug the open tip at A. A free end, the stick-out past a split post, or the stub of a cut rail. */
  capA?: boolean;
  /** Plug the open tip at B. */
  capB?: boolean;
  /** Which pipe is cut where this rail meets post A. `vertical` cuts the post. `horizontal` cuts this rail. */
  cutA?: "vertical" | "horizontal";
  /** Which pipe is cut where this rail meets post B. */
  cutB?: "vertical" | "horizontal";
};

export type MeasureRef = {
  id: string;
  name: string;
  w: number;
  d: number;
  h: number;
  x: number;
  z: number;
};

/** A wood strap on one pipe. `at` is inches from that member's start (a post: up from the floor). */
export type Strap = {
  id: string;
  memberId: string;
  at: number;
};

/** MakerPipe hinge that can actually swing. `leaf` is the offset EMT set, `barrel` is inline, `angle` folds to 90°. */
export type HingeKind = "leaf" | "barrel" | "angle";

export type Hinge = {
  id: string;
  memberId: string;
  kind: HingeKind;
  /** Inches from the start of the pipe. A post starts at the floor. */
  at: number;
  /** Which face of the bar the knuckle sits on. The other face swings the other way. */
  side: 1 | -1;
};

export type HingeSwing = {
  memberId: string;
  deg: number;
};

/** A rectangular pipe door. The hinge stile is `hingeNode`, the latch stile is `latchNode`. */
export type Door = {
  id: string;
  /** Post the hinges are on. The door is not clamped to it. */
  memberId: string;
  /** Inches from the hinge stile to the latch stile, closed. */
  width: number;
  hingeNode: string;
  latchNode: string;
  bottomRail: string;
  topRail: string;
  /** Plan direction from the hinge stile to the latch stile. One axis is 1 or -1, the other is 0. */
  dirX: number;
  dirZ: number;
};

export type HardwareLine = {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
  purchasable: boolean;
  detail: string;
};

export const MEASURE_REFERENCES: { name: string; w: number; d: number; h: number }[] = [
  { name: "4×8 sheet", w: 96, d: 48, h: 0.75 },
  { name: "Door", w: 32, d: 1.75, h: 80 },
  { name: "Counter", w: 48, d: 25, h: 36 },
  { name: "Fridge", w: 36, d: 30, h: 70 },
];

export type FullProject = Project & {
  mode: "grid" | "sketch";
  nodes: SketchNode[];
  links: SketchLink[];
  railHeight: number;
  references: MeasureRef[];
  straps: Strap[];
  boards: Board[];
  loads: ShopLoad[];
  hinges: Hinge[];
  hingeSwing: HingeSwing[];
  doors: Door[];
};

function cleanStraps(raw: Strap[] | undefined): Strap[] {
  if (!Array.isArray(raw)) return [];
  const out: Strap[] = [];
  for (const item of raw) {
    if (!item || typeof item.id !== "string" || typeof item.memberId !== "string") continue;
    if (!Number.isFinite(item.at)) continue;
    out.push({ id: item.id, memberId: item.memberId, at: Math.max(0, item.at) });
    if (out.length >= 240) break;
  }
  return out;
}

function cleanHinges(raw: Hinge[] | undefined): Hinge[] {
  if (!Array.isArray(raw)) return [];
  const out: Hinge[] = [];
  for (const item of raw) {
    if (!item || typeof item.id !== "string" || typeof item.memberId !== "string") continue;
    if (item.kind !== "leaf" && item.kind !== "barrel" && item.kind !== "angle") continue;
    if (!Number.isFinite(item.at)) continue;
    out.push({
      id: item.id,
      memberId: item.memberId,
      kind: item.kind,
      at: Math.max(0, item.at),
      side: item.side === -1 ? -1 : 1,
    });
    if (out.length >= 80) break;
  }
  return out;
}

function cleanDoors(raw: Door[] | undefined, nodes: SketchNode[]): Door[] {
  if (!Array.isArray(raw)) return [];
  const ids = new Set(nodes.map((node) => node.id));
  const out: Door[] = [];
  for (const item of raw) {
    if (!item || typeof item.id !== "string" || typeof item.memberId !== "string") continue;
    if (!ids.has(item.hingeNode) || !ids.has(item.latchNode)) continue;
    if (!Number.isFinite(item.width) || item.width < 6) continue;
    const dirX = item.dirX === -1 || item.dirX === 1 ? item.dirX : 0;
    const dirZ = item.dirZ === -1 || item.dirZ === 1 ? item.dirZ : 0;
    if (Math.abs(dirX) + Math.abs(dirZ) !== 1) continue;
    out.push({
      id: item.id,
      memberId: item.memberId,
      width: Math.round(Math.min(96, item.width) * 32) / 32,
      hingeNode: item.hingeNode,
      latchNode: item.latchNode,
      bottomRail: typeof item.bottomRail === "string" ? item.bottomRail : "",
      topRail: typeof item.topRail === "string" ? item.topRail : "",
      dirX,
      dirZ,
    });
    if (out.length >= 12) break;
  }
  return out;
}

function cleanSwings(raw: HingeSwing[] | undefined): HingeSwing[] {
  if (!Array.isArray(raw)) return [];
  const out: HingeSwing[] = [];
  for (const item of raw) {
    if (!item || typeof item.memberId !== "string" || !Number.isFinite(item.deg)) continue;
    const deg = Math.round(Math.min(170, Math.max(0, item.deg)));
    if (deg <= 0) continue;
    out.push({ memberId: item.memberId, deg });
    if (out.length >= 40) break;
  }
  return out;
}

function cleanPast(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  return Math.min(96, Math.max(0, Math.round(n * 32) / 32));
}

function cleanCut(raw: unknown): "vertical" | "horizontal" | undefined {
  return raw === "vertical" || raw === "horizontal" ? raw : undefined;
}

/** Split height, or null when this node is one piece of pipe. */
export function postSplit(node: SketchNode): number | null {
  if (node.host || node.tip) return null;
  if (typeof node.split !== "number" || !Number.isFinite(node.split)) return null;
  const split = Math.round(node.split * 32) / 32;
  if (split <= 1 || split >= node.height - 1) return null;
  return split;
}

/** Height where a post leaves the floor. Door stiles start higher. */
export function postFoot(node: SketchNode): number {
  if (node.host || node.tip) return 0;
  if (typeof node.base !== "number" || !Number.isFinite(node.base)) return 0;
  const base = Math.round(node.base * 32) / 32;
  if (base <= 0.5 || base >= node.height - 1) return 0;
  return base;
}

function cleanPlugs(raw: unknown): Plug[] {
  if (!Array.isArray(raw)) return [];
  const out: Plug[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const plug = item as Plug;
    if (typeof plug.id !== "string") continue;
    const top = plug.top === true;
    const foot = plug.foot === true;
    if (!top && !foot) continue;
    out.push({ id: plug.id, top: top || undefined, foot: foot || undefined });
    if (out.length >= 80) break;
  }
  return out;
}

export function normalizeProject(project: Project): FullProject {
  const levels = project.levels ?? [];
  const railHeight = Number.isFinite(project.railHeight)
    ? (project.railHeight as number)
    : levels.length
      ? levels[levels.length - 1]
      : Math.max(8, (project.postHeight ?? 36) - 1);
  const nodes = (Array.isArray(project.nodes) ? project.nodes : []).map((node) => {
    const tip = node.tip === true && !node.host;
    const height = Number.isFinite(node.height) ? (node.height as number) : 0;
    const door = typeof node.door === "string" && node.door ? node.door : undefined;
    let base: number | undefined;
    if (!tip && !node.host && typeof node.base === "number" && Number.isFinite(node.base)) {
      const next = Math.round(node.base * 32) / 32;
      if (next > 0.5 && next < height - 1) base = next;
    }
    let split: number | undefined;
    if (!tip && !node.host && !door && typeof node.split === "number" && Number.isFinite(node.split)) {
      const next = Math.round(node.split * 32) / 32;
      if (next > 1 && next < height - 1) split = next;
    }
    return {
      ...node,
      bury: tip || door ? 0 : Number.isFinite(node.bury) ? Math.max(0, node.bury as number) : 0,
      flange: tip || door ? false : node.flange,
      tip: tip || undefined,
      split,
      base,
      door,
      cap: !tip && node.cap === true ? true : undefined,
      capFoot: !tip && !door && node.capFoot === true ? true : undefined,
    };
  });
  const links = (Array.isArray(project.links) ? project.links : []).map((link) => {
    const pastA = cleanPast(link.pastA);
    const pastB = cleanPast(link.pastB);
    return {
      ...link,
      kind: link.kind === "brace" ? ("rail" as const) : link.kind,
      pastA: pastA > 0 ? pastA : undefined,
      pastB: pastB > 0 ? pastB : undefined,
      capA: link.capA === true ? true : undefined,
      capB: link.capB === true ? true : undefined,
      cutA: cleanCut(link.cutA),
      cutB: cleanCut(link.cutB),
    };
  });
  const seated = reseatHosts(nodes, links);
  const boards = cleanBoards((project as Project & { boards?: unknown }).boards);
  const floor: FloorKind = project.floor === "grass" || project.floor === "dirt" || project.floor === "wood" ? project.floor : "concrete";
  return {
    ...project,
    mode: project.mode === "sketch" ? "sketch" : "grid",
    references: Array.isArray(project.references) ? project.references : [],
    straps: cleanStraps(project.straps),
    boards,
    loads: [],
    hinges: cleanHinges(project.hinges),
    hingeSwing: cleanSwings(project.hingeSwing),
    doors: cleanDoors(project.doors, seated.nodes),
    braces: false,
    plugs: cleanPlugs(project.plugs),
    stick: project.stick === 96 || project.stick === 240 ? project.stick : 120,
    links: seated.links,
    nodes: seated.nodes,
    railHeight,
    floor,
  };
}

/** Keep mid-rail joints on their rail, and keep pipes that end there at that height. */
export function reseatHosts(nodes: SketchNode[], links: SketchLink[]): { nodes: SketchNode[]; links: SketchLink[] } {
  const next = nodes.map((node) => ({ ...node }));
  const byId = new Map(next.map((node) => [node.id, node]));
  for (const node of next) {
    if (!node.host) continue;
    const link = links.find((item) => item.id === node.host);
    const a = link ? byId.get(link.a) : undefined;
    const b = link ? byId.get(link.b) : undefined;
    node.flange = false;
    node.bury = 0;
    if (!link || !a || !b || a.host || b.host) continue;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    let t = node.hostT;
    if (t == null || !Number.isFinite(t)) {
      t = len2 > 1 ? ((node.x - a.x) * dx + (node.z - a.z) * dz) / len2 : 0.5;
    }
    t = Math.min(0.92, Math.max(0.08, t));
    node.hostT = t;
    node.x = Math.round((a.x + dx * t) * 32) / 32;
    node.z = Math.round((a.z + dz * t) * 32) / 32;
    const [ya, yb] = endHeights(link);
    node.height = Math.round((ya + (yb - ya) * t) * 32) / 32;
  }
  const seated = new Map(next.map((node) => [node.id, node]));
  const nextLinks = links.map((link) => {
    const a = seated.get(link.a);
    const b = seated.get(link.b);
    if (!a?.host && !b?.host) return link;
    const y = a?.host ? a.height : link.y;
    const other = b?.host ? b.height : link.yB ?? link.y;
    const level = Math.abs(y - other) < 1 / 16;
    return { ...link, y, yB: level ? undefined : other };
  });
  return { nodes: next, links: nextLinks };
}

export function stickName(stick: number): string {
  if (stick === 96) return "8 ft";
  if (stick === 240) return "20 ft";
  return "10 ft";
}

export type Segment = { a: Vec3; b: Vec3 };

export type Member = {
  id: string;
  kind: "post" | "rail" | "brace";
  label: string;
  a: Vec3;
  b: Vec3;
  span: number;
  metal: number;
  pieces: number[];
  segments: Segment[];
  couplings: Segment[];
  couplingCount: number;
  approx: boolean;
  angle: number | null;
  /** Set only when this piece is a different EMT size than the frame. */
  trade?: TradeId;
  /** Inches of this post below grade. Already included in `pieces`. */
  buried?: number;
  /** Inches of the centerline that sit inside the clamp at `a`. That length is not extra pipe. */
  setbackA: number;
  /** Inches of the centerline that sit inside the clamp at `b`. */
  setbackB: number;
  /** Clamp this end seats in, when the cut is shortened. */
  seatA: string;
  seatB: string;
  /** MakerPipe plugs on the exposed ends of this pipe. */
  caps: number;
  /** Where those plugs sit, and which way is out of the pipe. */
  capAt: { at: Vec3; axis: Vec3 }[];
};

export type Branch = { dir: Vec3; setback: number; outer: number; inner: number };

export type Fitting = {
  id: string;
  sku: Sku;
  position: Vec3;
  branches: Branch[];
  purchasable: boolean;
  approx: boolean;
  /** Clamp family at this joint when it isn't the frame size. */
  trade?: TradeId;
  /** Extra 3/4"-to-1/2" shims when a 3/4" clamp grabs a 1/2" pipe. */
  extraHalfShims?: number;
  /** 1"-to-3/4" shims. One per 3/4" pipe a 1" clamp grabs. 1/2" is not a published fit. */
  extraOneShims?: number;
  /** Through-pipe direction. Omitted means the post, straight up. */
  axis?: Vec3;
};

export type Issue = { severity: "warn" | "info"; text: string };

export type CutRow = {
  key: string;
  kind: Member["kind"];
  length: number;
  qty: number;
  approx: boolean;
  label: string;
};

export type BomLine = {
  sku: Sku;
  name: string;
  qty: number;
  unitPrice: number;
  shimsEach: number;
  purchasable: boolean;
  detail: string;
};

export type AxisMeasure = {
  centers: number;
  fittingOutside: number;
  fittingInside: number;
  pipeOutside: number;
  pipeClear: number;
};

export type StickPack = {
  trade: TradeId;
  label: string;
  sticks: number;
  inches: number;
  waste: number;
};

export type Build = {
  tradeLabel: string;
  posts: Member[];
  rails: Member[];
  braces: Member[];
  members: Member[];
  fittings: Fitting[];
  issues: Issue[];
  cuts: CutRow[];
  bom: BomLine[];
  shimCount: number;
  shimCost: number;
  connectorCost: number;
  pipeInches: number;
  weightLb: number;
  sticks: number;
  wasteInches: number;
  conduitCost: number;
  packs: StickPack[];
  oneShimCount: number;
  /** One-hole straps that landed on a real pipe, clamped onto the metal. */
  straps: Strap[];
  strapCost: number;
  /** Hinges that landed on a real post or rail. */
  hinges: Hinge[];
  hardware: HardwareLine[];
  /** End plugs grouped by EMT size. */
  caps: { trade: TradeId; label: string; qty: number; unitPrice: number; packPrice: number }[];
  capCost: number;
  width: AxisMeasure;
  depth: AxisMeasure;
  postHeight: number;
  postCount: number;
  xs: number[];
  zs: number[];
  levels: number[];
  alsoSold: typeof ALSO_SOLD;
};

const DIR_VEC: Record<Dir, Vec3> = {
  "+x": [1, 0, 0],
  "-x": [-1, 0, 0],
  "+z": [0, 0, 1],
  "-z": [0, 0, -1],
};

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}
function vlen(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}
function norm(a: Vec3): Vec3 {
  const l = vlen(a) || 1;
  return scale(a, 1 / l);
}

function meetAngle(axis: Vec3, pipe: Vec3): number {
  const denom = (vlen(axis) || 1) * (vlen(pipe) || 1);
  const along = Math.abs(axis[0] * pipe[0] + axis[1] * pipe[1] + axis[2] * pipe[2]) / denom;
  return (Math.acos(Math.min(1, along)) * 180) / Math.PI;
}

function throughAxis(node: SketchNode, byId: Map<string, SketchNode>, links: SketchLink[]): Vec3 {
  if (node.host) {
    const link = links.find((item) => item.id === node.host);
    const a = link ? byId.get(link.a) : undefined;
    const b = link ? byId.get(link.b) : undefined;
    if (link && a && b) {
      const [ya, yb] = endHeights(link);
      const ha = a.host ? a.height : ya;
      const hb = b.host ? b.height : yb;
      return norm([b.x - a.x, hb - ha, b.z - a.z]);
    }
  }
  return [0, 1, 0];
}
function at(origin: Vec3, dir: Vec3, d: number): Vec3 {
  return add(origin, scale(dir, d));
}

export function cumulate(spans: number[]): number[] {
  const out = [0];
  for (const s of spans) out.push(out[out.length - 1] + s);
  return out;
}

export function colName(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    n -= 1;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

function dirsAt(ix: number, iz: number, nx: number, nz: number): Dir[] {
  const d: Dir[] = [];
  if (ix < nx) d.push("+x");
  if (ix > 0) d.push("-x");
  if (iz < nz) d.push("+z");
  if (iz > 0) d.push("-z");
  return d;
}

function skuFor(dirs: Dir[]): Sku | null {
  const n = dirs.length;
  if (n === 0) return null;
  if (n === 1) return "T";
  const oppX = dirs.includes("+x") && dirs.includes("-x");
  const oppZ = dirs.includes("+z") && dirs.includes("-z");
  if (n === 2 && (oppX || oppZ)) return "180";
  if (n === 2) return "90";
  if (n === 3) return "4way";
  return "5way";
}

function armSpec(family: FamilySpec, dirs: Dir[], dir: Dir) {
  const n = dirs.length;
  const oppX = dirs.includes("+x") && dirs.includes("-x");
  const oppZ = dirs.includes("+z") && dirs.includes("-z");
  const axis = dir === "+x" || dir === "-x" ? "x" : "z";
  if (n <= 1) return family.T;
  if (n === 2 && (oppX || oppZ)) return family.inline;
  if (n === 2) return family.corner;
  if (n === 3) {
    const inlineAxis = oppX ? "x" : "z";
    return axis === inlineAxis ? family.inline : family.corner;
  }
  return family.inline;
}

function planPieces(metal: number, stick: number, gap: number): { pieces: number[]; couplings: number } {
  if (!(metal > 0.05)) return { pieces: [], couplings: 0 };
  if (metal <= stick + 1e-6) return { pieces: [metal], couplings: 0 };
  let n = 2;
  while (n < 16) {
    const each = (metal - (n - 1) * gap) / n;
    if (each > 0.5 && each <= stick + 1e-6) {
      return { pieces: Array.from({ length: n }, () => each), couplings: n - 1 };
    }
    n += 1;
  }
  const each = Math.max(0.5, (metal - 15 * gap) / 16);
  return { pieces: Array.from({ length: 16 }, () => each), couplings: 15 };
}

function layoutPieces(start: Vec3, end: Vec3, pieces: number[], gap: number): { segments: Segment[]; couplings: Segment[] } {
  const delta = sub(end, start);
  const total = vlen(delta);
  const dir = norm(delta);
  const segments: Segment[] = [];
  const couplings: Segment[] = [];
  let dist = 0;
  const overlap = 0.4;
  pieces.forEach((p, i) => {
    const a = at(start, dir, dist);
    dist += p;
    const b = at(start, dir, Math.min(dist, total));
    if (vlen(sub(b, a)) > 0.05) segments.push({ a, b });
    if (i < pieces.length - 1 && gap > 0) {
      const g0 = dist;
      dist += gap;
      couplings.push({
        a: at(start, dir, g0 - overlap),
        b: at(start, dir, dist + overlap),
      });
    } else if (i < pieces.length - 1) {
      couplings.push({
        a: at(start, dir, dist - 0.55),
        b: at(start, dir, dist + 0.55),
      });
    }
  });
  return { segments, couplings };
}

function makeMember(opts: {
  id: string;
  kind: Member["kind"];
  label: string;
  a: Vec3;
  b: Vec3;
  setbackA: number;
  setbackB: number;
  stick: number;
  gap: number;
  approx: boolean;
  angle?: number | null;
  trade?: TradeId;
  seatA?: string;
  seatB?: string;
  pastA?: number;
  pastB?: number;
  capA?: boolean;
  capB?: boolean;
}): Member {
  const span = vlen(sub(opts.b, opts.a));
  const dir = norm(sub(opts.b, opts.a));
  const pastA = Math.max(0, opts.pastA ?? 0);
  const pastB = Math.max(0, opts.pastB ?? 0);
  const trimA = opts.setbackA - pastA;
  const trimB = opts.setbackB - pastB;
  const metal = span - trimA - trimB;
  const start = at(opts.a, dir, trimA);
  const end = at(opts.a, dir, Math.max(trimA + 0.05, span - trimB));
  const planned = planPieces(metal, opts.stick, opts.gap);
  const laid = metal > 0.05 ? layoutPieces(start, end, planned.pieces, opts.gap) : { segments: [], couplings: [] };
  const capAt: { at: Vec3; axis: Vec3 }[] = [];
  if (opts.capA) capAt.push({ at: start, axis: scale(dir, -1) });
  if (opts.capB) capAt.push({ at: end, axis: dir });
  return {
    id: opts.id,
    kind: opts.kind,
    label: opts.label,
    a: opts.a,
    b: opts.b,
    span,
    metal: Math.max(0, metal),
    pieces: planned.pieces,
    segments: laid.segments,
    couplings: laid.couplings,
    couplingCount: planned.couplings,
    approx: opts.approx,
    angle: opts.angle ?? null,
    trade: opts.trade,
    setbackA: opts.setbackA,
    setbackB: opts.setbackB,
    seatA: opts.seatA ?? "",
    seatB: opts.seatB ?? "",
    caps: capAt.length,
    capAt,
  };
}

function nudge(y: number, levels: number[], min: number, max: number): number | null {
  let cur = y;
  for (let i = 0; i < 8; i += 1) {
    if (cur < min - 1e-6 || cur > max + 1e-6) return null;
    const hit = levels.find((l) => Math.abs(l - cur) < 2.2);
    if (!hit) return Math.min(max, Math.max(min, cur));
    const up = hit + 2.2;
    const down = hit - 2.2;
    if (cur <= hit && up <= max) {
      cur = up;
      continue;
    }
    if (down >= min) {
      cur = down;
      continue;
    }
    if (up <= max) {
      cur = up;
      continue;
    }
    return null;
  }
  return null;
}

function planBrace(postH: number, run: number, levels: number[]): { y0: number; y1: number; sku: "45" | "hinge" } | null {
  const min = 2;
  const max = postH - 1.25;
  if (max - min < 8 || run < 4) return null;
  for (const base of [2.5, 4.75, 7]) {
    const y0 = nudge(base, levels, min, max);
    if (y0 == null) continue;
    const y1raw = y0 + run;
    if (y1raw > max + 1e-6) break;
    const y1 = nudge(y1raw, levels, min, max);
    if (y1 == null) continue;
    if (Math.abs(y1 - y0 - run) > 1.25) continue;
    const ang = (Math.atan2(y1 - y0, run) * 180) / Math.PI;
    if (Math.abs(ang - 45) <= 3) return { y0, y1, sku: "45" };
  }
  const y0 = nudge(3, levels, min, max);
  const y1 = nudge(max, levels, min, max);
  if (y0 == null || y1 == null || y1 - y0 < 8) return null;
  return { y0, y1, sku: "hinge" };
}

function packSticks(pieces: number[], stick: number, kerf: number): { sticks: number; waste: number } {
  const items = pieces.filter((p) => p > 0).map((p) => Math.round(p * 64) / 64);
  if (items.length === 0) return { sticks: 0, waste: 0 };
  const sticks = items.length <= 14 ? packExact(items, stick, kerf) : packGreedy(items, stick, kerf);
  const kerfs = Math.max(0, items.length - sticks);
  const used = items.reduce((s, n) => s + n, 0) + kerf * kerfs;
  return { sticks, waste: Math.max(0, sticks * stick - used) };
}

/** Minimum sticks. Subset DP is exact while a frame stays under 17 cuts. */
function packExact(items: number[], stick: number, kerf: number): number {
  const n = items.length;
  const fit = new Uint8Array(1 << n);
  for (let sub = 1; sub < 1 << n; sub += 1) {
    let sum = 0;
    let count = 0;
    for (let i = 0; i < n; i += 1) {
      if (sub & (1 << i)) {
        sum += items[i];
        count += 1;
      }
    }
    if (sum + kerf * (count - 1) <= stick + 1e-6) fit[sub] = 1;
  }
  const dp = new Uint16Array(1 << n);
  dp.fill(n + 1);
  dp[0] = 0;
  const full = (1 << n) - 1;
  for (let mask = 0; mask < full; mask += 1) {
    if (dp[mask] > n) continue;
    const remain = full ^ mask;
    for (let sub = remain; sub > 0; sub = (sub - 1) & remain) {
      if (!fit[sub]) continue;
      const next = mask | sub;
      const bins = dp[mask] + 1;
      if (bins < dp[next]) dp[next] = bins;
    }
  }
  return dp[full];
}

function packGreedy(items: number[], stick: number, kerf: number): number {
  const sorted = [...items].sort((a, b) => b - a);
  const bins: { used: number; count: number }[] = [];
  for (const item of sorted) {
    let best = -1;
    let bestRem = Infinity;
    for (let i = 0; i < bins.length; i += 1) {
      const next = bins[i].count === 0 ? item : bins[i].used + kerf + item;
      const rem = stick - next;
      if (rem >= -1e-6 && rem < bestRem) {
        best = i;
        bestRem = rem;
      }
    }
    if (best === -1) bins.push({ used: Math.min(item, stick), count: 1 });
    else {
      bins[best].used = bins[best].count === 0 ? item : bins[best].used + kerf + item;
      bins[best].count += 1;
    }
  }
  return bins.length;
}

function uniqueSorted(levels: number[], postH: number): { levels: number[]; dropped: number } {
  const ok = levels
    .filter((y) => Number.isFinite(y))
    .map((y) => Math.round(y * 32) / 32)
    .filter((y) => y > 0 && y < postH + 1e-6)
    .sort((a, b) => a - b);
  const out: number[] = [];
  let dropped = 0;
  for (const y of ok) {
    if (out.length && Math.abs(out[out.length - 1] - y) < 0.2) dropped += 1;
    else out.push(y);
  }
  return { levels: out, dropped };
}

function emptyMeasure(): AxisMeasure {
  return { centers: 0, fittingOutside: 0, fittingInside: 0, pipeOutside: 0, pipeClear: 0 };
}

const MAGNET = 2;

/** Snap a floor click to the inch, and to an existing post line when you're close, so clamps stay at 90°. */
export function snapSketch(x: number, z: number, nodes: SketchNode[]): { x: number; z: number; lockX: boolean; lockZ: boolean } {
  let sx = x;
  let sz = z;
  let bestX = MAGNET;
  let bestZ = MAGNET;
  let lockX = false;
  let lockZ = false;
  for (const node of nodes) {
    const dx = Math.abs(node.x - x);
    const dz = Math.abs(node.z - z);
    if (dx < bestX) {
      bestX = dx;
      sx = node.x;
      lockX = true;
    }
    if (dz < bestZ) {
      bestZ = dz;
      sz = node.z;
      lockZ = true;
    }
  }
  if (!lockX) sx = Math.round(x);
  if (!lockZ) sz = Math.round(z);
  return { x: round32(sx), z: round32(sz), lockX, lockZ };
}

/** An open rail end lands on a square axis from the post it starts at. Turn it after it is placed. */
export function squareFrom(from: { x: number; z: number }, x: number, z: number): { x: number; z: number } {
  const dx = x - from.x;
  const dz = z - from.z;
  if (Math.abs(dx) >= Math.abs(dz)) return { x: round32(x), z: round32(from.z) };
  return { x: round32(from.x), z: round32(z) };
}

/** Plan angle of a rail, degrees. 0 runs along +X (the width). 90 runs along +Z (the depth). */
export function planAngle(a: { x: number; z: number }, b: { x: number; z: number }): number {
  const deg = (Math.atan2(b.z - a.z, b.x - a.x) * 180) / Math.PI;
  return Math.round((((deg % 360) + 360) % 360) * 10) / 10;
}

/** Height of a sketch pipe at each post. A missing second height means the pipe is level. */
export function endHeights(link: SketchLink): [number, number] {
  const yb = link.yB == null || !Number.isFinite(link.yB) ? link.y : link.yB;
  return [link.y, yb];
}

function shortName(label: string): string {
  return label.replace(/^(Post |Rail |Adjustable brace |45° brace )/, "").slice(0, 28);
}

/** Move one clamp up or down the post. Other ends stay put, so a level pipe becomes a hinge. */
export function moveClamp(
  links: SketchLink[],
  id: string,
  height: number,
  currentY: number,
  otherY?: number,
): { links: SketchLink[]; selectedId: string } {
  const h = Math.round(Math.min(240, Math.max(1, height)) * 32) / 32;
  const single = id.startsWith("hinge:") || id.startsWith("bfit:");
  if (single) {
    const parts = id.split(":");
    const linkId = parts[1] ?? "";
    const end = parts[2] === "b" ? "b" : "a";
    const next = links.map((link) => {
      if (link.id !== linkId) return link;
      const [ya, yb] = endHeights(link);
      const auto = link.yB == null && id.startsWith("bfit:");
      const far = end === "a" ? (auto ? (otherY ?? yb) : yb) : auto ? (otherY ?? ya) : ya;
      const y = end === "a" ? h : far;
      const yEnd = end === "b" ? h : far;
      if (Math.abs(y - yEnd) < 1 / 16) return { ...link, y, yB: undefined };
      return { ...link, y, yB: yEnd };
    });
    return { links: next, selectedId: id };
  }
  const nodeId = id.startsWith("fit:") ? id.slice(4, id.lastIndexOf(":")) : "";
  if (!nodeId) return { links, selectedId: id };
  let selectedId = `fit:${nodeId}:${Math.round(h * 32)}`;
  const next = links.map((link) => {
    if (link.kind !== "rail" || (link.a !== nodeId && link.b !== nodeId)) return link;
    const [ya, yb] = endHeights(link);
    let y = ya;
    let yB = link.yB == null ? ya : yb;
    let touch = false;
    let end: "a" | "b" = "a";
    if (link.a === nodeId && Math.abs(ya - currentY) < 0.08) {
      y = h;
      touch = true;
      end = "a";
    }
    if (link.b === nodeId && Math.abs(yb - currentY) < 0.08) {
      yB = h;
      touch = true;
      end = "b";
    }
    if (!touch) return link;
    if (Math.abs(y - yB) < 1 / 16) return { ...link, y, yB: undefined };
    selectedId = `hinge:${link.id}:${end}`;
    return { ...link, y, yB };
  });
  const stillLevel = next.some((link) => {
    if (link.kind !== "rail") return false;
    const [ya, yb] = endHeights(link);
    return Math.abs(ya - yb) < 1 / 16 && ((link.a === nodeId && Math.abs(ya - h) < 0.08) || (link.b === nodeId && Math.abs(yb - h) < 0.08));
  });
  if (stillLevel) selectedId = `fit:${nodeId}:${Math.round(h * 32)}`;
  return { links: next, selectedId };
}
export function alignmentNotes(members: Member[], selectedId: string | null): string[] {
  const sel = members.find((m) => m.id === selectedId);
  if (!sel) return [];
  const notes: string[] = [];
  if (sel.kind === "post") {
    const line = members.filter(
      (m) => m.kind === "post" && m.id !== sel.id && (Math.abs(m.a[0] - sel.a[0]) < 0.35 || Math.abs(m.a[2] - sel.a[2]) < 0.35),
    );
    const same = members.filter((m) => m.kind === "post" && m.id !== sel.id && Math.abs(m.b[1] - sel.b[1]) < 1 / 16);
    if (line.length) notes.push(`In line with ${line.slice(0, 3).map((m) => shortName(m.label)).join(", ")}`);
    if (same.length) notes.push(`Same height as ${same.slice(0, 3).map((m) => shortName(m.label)).join(", ")}`);
    return notes;
  }
  if (sel.kind !== "rail" && sel.kind !== "brace") return notes;
  const dir = norm(sub(sel.b, sel.a));
  const level: string[] = [];
  const parallel: string[] = [];
  for (const m of members) {
    if (m.id === sel.id || (m.kind !== "rail" && m.kind !== "brace")) continue;
    const d2 = norm(sub(m.b, m.a));
    const dot = Math.abs(dir[0] * d2[0] + dir[1] * d2[1] + dir[2] * d2[2]);
    if (dot > 0.985) parallel.push(shortName(m.label));
    const same =
      Math.abs(sel.a[1] - sel.b[1]) < 1 / 16 &&
      Math.abs(m.a[1] - m.b[1]) < 1 / 16 &&
      Math.abs(m.a[1] - sel.a[1]) < 1 / 16;
    if (same) level.push(shortName(m.label));
  }
  if (level.length) notes.push(`Same height as ${level.slice(0, 3).join(", ")}`);
  if (parallel.length) notes.push(`Parallel to ${parallel.slice(0, 3).join(", ")}`);
  if (Math.abs(sel.a[1] - sel.b[1]) > 1 / 16) notes.push("Ends are at different heights — pivot clamp");
  return notes;
}

export function explodeGrid(project: Project): { nodes: SketchNode[]; links: SketchLink[]; railHeight: number } {
  const xs = cumulate(project.baysX);
  const zs = cumulate(project.baysZ);
  const { levels } = uniqueSorted(project.levels, project.postHeight);
  const nodes: SketchNode[] = [];
  const ids: string[][] = [];
  for (let iz = 0; iz < zs.length; iz += 1) {
    ids[iz] = [];
    for (let ix = 0; ix < xs.length; ix += 1) {
      const id = `n-${ix}-${iz}`;
      ids[iz][ix] = id;
      nodes.push({
        id,
        x: round32(xs[ix]),
        z: round32(zs[iz]),
        height: project.postHeight,
        flange: project.flanges,
      });
    }
  }
  const links: SketchLink[] = [];
  levels.forEach((y, li) => {
    for (let iz = 0; iz < zs.length; iz += 1) {
      for (let ix = 0; ix < project.baysX.length; ix += 1) {
        links.push({ id: `lx-${li}-${iz}-${ix}`, a: ids[iz][ix], b: ids[iz][ix + 1], y, kind: "rail" });
      }
    }
    for (let ix = 0; ix < xs.length; ix += 1) {
      for (let iz = 0; iz < project.baysZ.length; iz += 1) {
        links.push({ id: `lz-${li}-${ix}-${iz}`, a: ids[iz][ix], b: ids[iz + 1][ix], y, kind: "rail" });
      }
    }
  });
  if (false && project.braces) {
    const ctcX = xs[xs.length - 1] ?? 0;
    const ctcZ = zs[zs.length - 1] ?? 0;
    if (project.baysX.length && (project.baysZ.length === 0 || ctcX >= ctcZ)) {
      const ks = zs.length <= 1 ? [0] : [0, zs.length - 1];
      for (const k of ks) {
        for (let i = 0; i < project.baysX.length; i += 1) {
          links.push({ id: `br-x-${k}-${i}`, a: ids[k][i], b: ids[k][i + 1], y: 0, kind: "brace" });
        }
      }
    } else if (project.baysZ.length) {
      const is = xs.length <= 1 ? [0] : [0, xs.length - 1];
      for (const i of is) {
        for (let k = 0; k < project.baysZ.length; k += 1) {
          links.push({ id: `br-z-${i}-${k}`, a: ids[k][i], b: ids[k + 1][i], y: 0, kind: "brace" });
        }
      }
    }
  }
  return { nodes, links, railHeight: levels.at(-1) ?? Math.max(8, project.postHeight - 1) };
}

function cardinalDir(dx: number, dz: number): Dir | null {
  if (Math.abs(dz) <= 0.35 && Math.abs(dx) > 0.35) return dx > 0 ? "+x" : "-x";
  if (Math.abs(dx) <= 0.35 && Math.abs(dz) > 0.35) return dz > 0 ? "+z" : "-z";
  return null;
}

function oppositeDir(dir: Dir): Dir {
  if (dir === "+x") return "-x";
  if (dir === "-x") return "+x";
  if (dir === "+z") return "-z";
  return "+z";
}

function largerTrade(ids: TradeId[]): TradeId {
  if (ids.includes("one")) return "one";
  if (ids.includes("three-quarter")) return "three-quarter";
  return "half";
}

/** Shims a clamp needs for the pipes it actually grabs. A 1" clamp on 3/4" EMT takes one 1" shim per pipe. 1/2" into a 1" clamp is not a MakerPipe fit. */
function grabShims(joint: TradeId, pipes: TradeId[]): { extraHalfShims: number; extraOneShims: number } {
  return {
    extraHalfShims: joint === "three-quarter" ? pipes.filter((pipe) => pipe === "half").length : 0,
    extraOneShims: joint === "one" ? pipes.filter((pipe) => pipe === "three-quarter").length : 0,
  };
}

const ONE_ON_HALF =
  'A 1" clamp is on 1/2" EMT. MakerPipe doesn\'t sell a shim for that. Use 3/4" tube with a 1" to 3/4" shim, or stay on 1" tube.';

function noteOneOnHalf(issues: Issue[], joint: TradeId, pipes: TradeId[]) {
  if (joint === "one" && pipes.includes("half")) issues.push({ severity: "warn", text: ONE_ON_HALF });
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function closestSeg(p0: Vec3, p1: Vec3, q0: Vec3, q1: Vec3): { dist: number; tp: number; tq: number; point: Vec3 } {
  const u = sub(p1, p0);
  const v = sub(q1, q0);
  const w = sub(p0, q0);
  const a = dot(u, u);
  const b = dot(u, v);
  const c = dot(v, v);
  const d = dot(u, w);
  const e = dot(v, w);
  const D = a * c - b * b;
  let sN: number;
  let sD = D;
  let tN: number;
  let tD = D;
  if (D < 1e-6) {
    sN = 0;
    sD = 1;
    tN = e;
    tD = c;
  } else {
    sN = b * e - c * d;
    tN = a * e - b * d;
    if (sN < 0) {
      sN = 0;
      tN = e;
      tD = c;
    } else if (sN > sD) {
      sN = sD;
      tN = e + b;
      tD = c;
    }
  }
  if (tN < 0) {
    tN = 0;
    if (-d < 0) sN = 0;
    else if (-d > a) sN = sD;
    else {
      sN = -d;
      sD = a;
    }
  } else if (tN > tD) {
    tN = tD;
    if (-d + b < 0) sN = 0;
    else if (-d + b > a) sN = sD;
    else {
      sN = -d + b;
      sD = a;
    }
  }
  const sc = Math.abs(sN) < 1e-8 ? 0 : sN / sD;
  const tc = Math.abs(tN) < 1e-8 ? 0 : tN / tD;
  const p = add(p0, scale(u, sc));
  const q = add(q0, scale(v, tc));
  return {
    dist: vlen(sub(p, q)),
    tp: sc,
    tq: tc,
    point: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2],
  };
}

function metalFraction(member: Member, point: Vec3): number | null {
  if (member.metal < 1 || member.segments.length === 0) return null;
  const start = member.segments[0].a;
  const end = member.segments[member.segments.length - 1].b;
  const axis = norm(sub(end, start));
  const along = dot(sub(point, start), axis);
  const f = along / member.metal;
  if (f <= 0.05 || f >= 0.95) return null;
  return f;
}

function splitMetal(member: Member, fracs: number[], stick: number, gap: number) {
  const cuts = [0, ...fracs.filter((f) => f > 0.04 && f < 0.96).sort((a, b) => a - b), 1];
  const uniq: number[] = [];
  for (const cut of cuts) {
    if (!uniq.length || cut - uniq[uniq.length - 1] > 0.02) uniq.push(cut);
  }
  if (uniq.length < 3) return;
  const pieces: number[] = [];
  let couplings = 0;
  for (let i = 1; i < uniq.length; i += 1) {
    const len = (uniq[i] - uniq[i - 1]) * member.metal;
    if (len <= 0.05) continue;
    const planned = planPieces(len, stick, gap);
    pieces.push(...planned.pieces);
    couplings += planned.couplings;
  }
  if (pieces.length < 2) return;
  member.pieces = pieces;
  member.couplingCount = couplings;
}

function applyCrossings(project: FullProject, rails: Member[], fittings: Fitting[], issues: Issue[]) {
  const pending = new Map<string, number[]>();
  const seen = new Set<string>();
  const linkOf = (member: Member) => project.links.find((link) => member.id === `rail:${link.id}`);
  for (let i = 0; i < rails.length; i += 1) {
    for (let j = i + 1; j < rails.length; j += 1) {
      const ri = rails[i];
      const rj = rails[j];
      const la = linkOf(ri);
      const lb = linkOf(rj);
      if (la && lb && (la.a === lb.a || la.a === lb.b || la.b === lb.a || la.b === lb.b)) continue;
      const hit = closestSeg(ri.a, ri.b, rj.a, rj.b);
      if (hit.dist > 1.25) continue;
      if (hit.tp < 0.08 || hit.tp > 0.92 || hit.tq < 0.08 || hit.tq > 0.92) continue;
      const fa = metalFraction(ri, hit.point);
      const fb = metalFraction(rj, hit.point);
      if (fa == null || fb == null) continue;
      const key = ri.id < rj.id ? `${ri.id}|${rj.id}` : `${rj.id}|${ri.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const ta = ri.trade ?? project.trade;
      const tb = rj.trade ?? project.trade;
      const clamp = largerTrade([ta, tb]);
      const dirA = norm(sub(ri.b, ri.a));
      const dirB = norm(sub(rj.b, rj.a));
      const arm = { setback: 0.85, outer: 0.45, inner: 0.45 };
      fittings.push({
        id: `cross:${key}`,
        sku: "cross",
        position: hit.point,
        branches: [
          { dir: dirA, ...arm },
          { dir: scale(dirA, -1), ...arm },
          { dir: dirB, ...arm },
          { dir: scale(dirB, -1), ...arm },
        ],
        purchasable: CONNECTOR_MAP.cross.trades.includes(clamp),
        approx: false,
        trade: clamp,
        ...grabShims(clamp, [ta, tb]),
      });
      noteOneOnHalf(issues, clamp, [ta, tb]);
      const qa = pending.get(ri.id) ?? [];
      qa.push(fa);
      pending.set(ri.id, qa);
      const qb = pending.get(rj.id) ?? [];
      qb.push(fb);
      pending.set(rj.id, qb);
    }
  }
  for (const [id, fracs] of pending) {
    const member = rails.find((item) => item.id === id);
    if (!member) continue;
    const gap = FAMILIES[tradeById(member.trade ?? project.trade).family].coupleGap;
    splitMetal(member, fracs, project.stick, gap);
  }
}

type ThroughPick = {
  linkId: string;
  end: "a" | "b";
  nodeId: string;
  y: number;
  trade: TradeId;
  dir: Vec3;
  past: number;
};

/** One rail may run through a split post. Every other rail at that height is left off. */
function collectThrough(project: FullProject, byId: Map<string, SketchNode>, issues: Issue[], nameOf: Map<string, string>): Map<string, ThroughPick> {
  const cands = new Map<string, ThroughPick[]>();
  for (const link of project.links) {
    if (link.kind !== "rail") continue;
    const a = byId.get(link.a);
    const b = byId.get(link.b);
    if (!a || !b || a.id === b.id) continue;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const stored = endHeights(link);
    const ya = a.host || a.tip ? (a.tip ? stored[0] : a.height) : stored[0];
    const yb = b.host || b.tip ? (b.tip ? stored[1] : b.height) : stored[1];
    if (Math.abs(ya - yb) > 1 / 16) continue;
    if (!cardinalDir(dx, dz)) continue;
    const len = Math.hypot(dx, dz) || 1;
    const dir: Vec3 = [dx / len, 0, dz / len];
    const pipe = link.trade ?? project.trade;
    const consider = (end: "a" | "b", node: SketchNode, y: number) => {
      if (node.tip || node.host || y > node.height + 0.05) return;
      const cut = end === "a" ? link.cutA : link.cutB;
      if (cut === "horizontal") return;
      const stored = postSplit(node);
      const split = stored ?? (cut === "vertical" && y > 1 && y < node.height - 1 ? Math.round(y * 32) / 32 : null);
      if (split == null || Math.abs(y - split) > 0.75) return;
      const past = end === "a" ? cleanPast(link.pastA) : cleanPast(link.pastB);
      const list = cands.get(node.id) ?? [];
      list.push({ linkId: link.id, end, nodeId: node.id, y, trade: pipe, dir, past });
      cands.set(node.id, list);
    };
    consider("a", a, ya);
    consider("b", b, yb);
  }
  const chosen = new Map<string, ThroughPick>();
  for (const [nodeId, list] of cands) {
    const best = [...list].sort((p, q) => Number(q.past > 0.05) - Number(p.past > 0.05))[0];
    chosen.set(nodeId, best);
    if (list.length > 1) {
      issues.push({
        severity: "warn",
        text: `Post ${nameOf.get(nodeId) ?? "?"} is split, so only one rail can run through it. The other rail at that height was left off.`,
      });
    }
  }
  return chosen;
}

function withBury(member: Member, bury: number, stick: number, gap: number): Member {
  if (bury <= 0.05) return member;
  const metal = member.metal + bury;
  const planned = planPieces(metal, stick, gap);
  return { ...member, metal, pieces: planned.pieces, couplingCount: planned.couplings, buried: bury };
}

function buildSketch(project: FullProject): Build {
  const trade = tradeById(project.trade);
  const family = FAMILIES[trade.family];
  const issues: Issue[] = [];
  const nodes = project.nodes.filter((n) => Number.isFinite(n.x) && Number.isFinite(n.z) && n.height > 1);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const real = nodes.filter((n) => !n.host && !n.tip);
  const ordered = [...real].sort((a, b) => a.z - b.z || a.x - b.x);
  const nameOf = new Map(ordered.map((n, i) => [n.id, colName(i)]));
  for (const node of nodes) {
    if (node.tip) nameOf.set(node.id, "open end");
    else if (node.host) nameOf.set(node.id, "joint");
  }
  const throughByPost = collectThrough(project, byId, issues, nameOf);

  if (real.length === 0) {
    issues.push({
      severity: "info",
      text: "Free build is empty. Choose Post and click the floor — posts snap to the inch and to each other so the clamps stay square.",
    });
  }
  if (nodes.some((node) => node.door)) {
    issues.push({
      severity: "info",
      text: "A door is real pipe on the cut list. The hinges hold it — it is not clamped to that post. Straps on the door take lumber, and swinging the hinge swings the door and that lumber.",
    });
  }

  const posts: Member[] = [];
  const splitByPost = new Map<string, number>();
  for (const node of real) {
    const pipe = node.trade ?? project.trade;
    const fam = FAMILIES[tradeById(pipe).family];
    const bury = Math.max(0, node.bury ?? 0);
    const through = throughByPost.get(node.id);
    const storedSplit = postSplit(node);
    const split =
      storedSplit ??
      (through && through.y > 1 && through.y < node.height - 1 ? Math.round(through.y * 32) / 32 : null);
    if (split != null) splitByPost.set(node.id, split);
    const joint = through ? largerTrade([pipe, through.trade]) : pipe;
    const inline = FAMILIES[tradeById(joint).family].inline.setback;
    const footCap = node.capFoot === true && !node.flange && bury < 0.05;
    const topCap = node.cap === true;
    if (split == null) {
      posts.push(
        withBury(
          makeMember({
            id: `post:${node.id}`,
            kind: "post",
            label: `Post ${nameOf.get(node.id)}`,
            a: [node.x, postFoot(node), node.z],
            b: [node.x, node.height, node.z],
            setbackA: 0,
            setbackB: 0,
            stick: project.stick,
            gap: fam.coupleGap,
            approx: false,
            trade: node.trade,
            capA: footCap,
            capB: topCap,
          }),
          bury,
          project.stick,
          fam.coupleGap,
        ),
      );
      continue;
    }
    if (!through) {
      issues.push({
        severity: "warn",
        text: `Post ${nameOf.get(node.id)} is split at ${formatDecimal(split)}, but no rail runs through it. The two pieces need that rail and a 180° clamp.`,
      });
    }
    if (split - inline < 0.75 || node.height - split - inline < 0.75) {
      issues.push({
        severity: "warn",
        text: `Post ${nameOf.get(node.id)} doesn't leave enough pipe on both sides of the split for the 180° clamp.`,
      });
    }
    posts.push(
      withBury(
        makeMember({
          id: `post:${node.id}`,
          kind: "post",
          label: `Post ${nameOf.get(node.id)} lower`,
          a: [node.x, 0, node.z],
          b: [node.x, split, node.z],
          setbackA: 0,
          setbackB: inline,
          seatB: "180°",
          stick: project.stick,
          gap: fam.coupleGap,
          approx: false,
          trade: node.trade,
          capA: footCap,
          capB: false,
        }),
        bury,
        project.stick,
        fam.coupleGap,
      ),
    );
    posts.push(
      makeMember({
        id: `post:${node.id}:hi`,
        kind: "post",
        label: `Post ${nameOf.get(node.id)} upper`,
        a: [node.x, split, node.z],
        b: [node.x, node.height, node.z],
        setbackA: inline,
        setbackB: 0,
        seatA: "180°",
        stick: project.stick,
        gap: fam.coupleGap,
        approx: false,
        trade: node.trade,
        capA: false,
        capB: topCap,
      }),
    );
  }

  type End = { linkId: string; end: "a" | "b"; nodeId: string; dir: Dir; y: number; trade: TradeId; phantom?: boolean };
  const ends: End[] = [];
  const hostEnds: End[] = [];
  const diagonal = new Set<string>();
  const hingeEnd = new Set<string>();
  const stubPlans = new Map<string, { nodeId: string; dir: Dir; y: number; past: number }>();

  for (const link of project.links) {
    if (link.kind !== "rail") continue;
    const a = byId.get(link.a);
    const b = byId.get(link.b);
    if (!a || !b || a.id === b.id) continue;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const stored = endHeights(link);
    const ya = a.host ? a.height : stored[0];
    const yb = b.host ? b.height : stored[1];
    if (Math.hypot(dx, dz, ya - yb) < 0.5) continue;
    if ((!a.host && !a.tip && ya > a.height + 0.05) || (!b.host && !b.tip && yb > b.height + 0.05)) {
      issues.push({
        severity: "warn",
        text: `Rail ${nameOf.get(a.id)}–${nameOf.get(b.id)} is above one of the posts, so it was left off.`,
      });
      continue;
    }
    const pipe = link.trade ?? project.trade;
    const da = cardinalDir(dx, dz);
    const db = da ? (cardinalDir(-dx, -dz) as Dir) : null;
    if (!da || !db || Math.abs(ya - yb) > 1 / 16) {
      diagonal.add(link.id);
      continue;
    }
    const push = (end: "a" | "b", node: SketchNode, dir: Dir, y: number) => {
      if (node.tip) return;
      const cut = end === "a" ? link.cutA : link.cutB;
      const through = throughByPost.get(node.id);
      const split = splitByPost.get(node.id) ?? null;
      if (cut === "horizontal") {
        if (!node.host && split != null && Math.abs(y - split) <= 0.75) {
          issues.push({
            severity: "warn",
            text: `Post ${nameOf.get(node.id)} is already two pieces at this rail, so the rail stays in the saddle.`,
          });
          return;
        }
      } else if (through && through.linkId === link.id && through.end === end) {
        return;
      } else if (!node.host && split != null && Math.abs(y - split) <= 0.75) {
        return;
      }
      const rec: End = { linkId: link.id, end, nodeId: node.id, dir, y, trade: pipe };
      if (node.host && node.host !== link.id) hostEnds.push(rec);
      else ends.push(rec);
    };
    push("a", a, da, ya);
    push("b", b, db, yb);
  }

  for (const link of project.links) {
    if (link.kind !== "rail") continue;
    for (const end of ["a", "b"] as const) {
      if ((end === "a" ? link.cutA : link.cutB) !== "horizontal") continue;
      const real = ends.find((item) => item.linkId === link.id && item.end === end && !item.phantom);
      if (!real) continue;
      const yKey = Math.round(real.y * 32);
      const crowded = ends.some(
        (item) =>
          item.nodeId === real.nodeId &&
          Math.round(item.y * 32) === yKey &&
          item.dir === real.dir &&
          item.linkId !== real.linkId,
      );
      if (crowded) continue;
      const opp = oppositeDir(real.dir);
      const taken = ends.some(
        (item) => item.nodeId === real.nodeId && Math.round(item.y * 32) === yKey && item.dir === opp,
      );
      const past = end === "a" ? cleanPast(link.pastA) : cleanPast(link.pastB);
      if (taken) {
        if (past > 0.05) {
          issues.push({
            severity: "info",
            text: `Another pipe already continues past post ${nameOf.get(real.nodeId) ?? "?"}, so this rail doesn't stick out there.`,
          });
        }
        continue;
      }
      ends.push({ ...real, dir: opp, phantom: true });
      stubPlans.set(`${link.id}:${end}`, { nodeId: real.nodeId, dir: opp, y: real.y, past });
    }
  }

  const fittings: Fitting[] = [];
  const setbacks = new Map<string, { setback: number; outer: number; inner: number; approx: boolean; seat: string }>();
  const buckets = new Map<string, End[]>();
  for (const end of ends) {
    const key = `${end.nodeId}|${Math.round(end.y * 32)}`;
    const list = buckets.get(key) ?? [];
    list.push(end);
    buckets.set(key, list);
  }

  for (const list of buckets.values()) {
    const used = new Set<Dir>();
    const kept: End[] = [];
    for (const end of list) {
      if (used.has(end.dir)) {
        hingeEnd.add(`${end.linkId}:${end.end}`);
        issues.push({
          severity: "warn",
          text: `Two rails leave post ${nameOf.get(end.nodeId)} the same way at ${formatDecimal(end.y)}. A clamp has one saddle per direction, so the extra one is an adjustable hinge (estimated).`,
        });
      } else {
        used.add(end.dir);
        kept.push(end);
      }
    }
    const dirs = kept.map((e) => e.dir);
    const sku = skuFor(dirs);
    if (!sku) continue;
    const node = byId.get(kept[0].nodeId)!;
    const y = kept[0].y;
    const postTrade = node.trade ?? project.trade;
    const pipes = [postTrade, ...kept.map((end) => end.trade)];
    const joint = largerTrade(pipes);
    const jointFamily = FAMILIES[tradeById(joint).family];
    const branches: Branch[] = dirs.map((dir) => {
      const spec = armSpec(jointFamily, dirs, dir);
      return { dir: DIR_VEC[dir], setback: spec.setback, outer: spec.outer, inner: spec.inner };
    });
    fittings.push({
      id: `fit:${node.id}:${Math.round(y * 32)}`,
      sku,
      position: [node.x, y, node.z],
      branches,
      purchasable: CONNECTOR_MAP[sku].trades.includes(joint),
      approx: false,
      trade: joint,
      ...grabShims(joint, pipes),
    });
    noteOneOnHalf(issues, joint, pipes);
    for (const end of kept) {
      if (end.phantom) continue;
      const spec = armSpec(jointFamily, dirs, end.dir);
      setbacks.set(`${end.linkId}:${end.end}`, { ...spec, approx: false, seat: skuShort(sku) });
    }
    if (!node.host && y - postFoot(node) < 1.25) {
      issues.push({
        severity: "warn",
        text: `A rail at ${formatDecimal(y)} on post ${nameOf.get(node.id)} sits too close to the ${postFoot(node) > 0.5 ? "end of the pipe" : "floor"} for the clamp to bite. Leave about 1" of pipe past the fitting.`,
      });
    }
    const split = splitByPost.get(node.id) ?? null;
    if (!node.host && split != null && y < split - 0.05 && split - y < 1) {
      issues.push({
        severity: "warn",
        text: `Post ${nameOf.get(node.id)} doesn't have an inch of pipe between the rail at ${formatDecimal(y)} and the split.`,
      });
    } else if (!node.host && node.height - y < 1 && (split == null || y > split + 0.05)) {
      issues.push({
        severity: "warn",
        text: `Post ${nameOf.get(node.id)} doesn't have an inch of pipe above the rail at ${formatDecimal(y)}. The through-clamp needs that stub.`,
      });
    }
  }

  const hostBuckets = new Map<string, End[]>();
  for (const end of hostEnds) {
    const list = hostBuckets.get(end.nodeId) ?? [];
    list.push(end);
    hostBuckets.set(end.nodeId, list);
  }
  for (const list of hostBuckets.values()) {
    const used = new Set<Dir>();
    const kept: End[] = [];
    for (const end of list) {
      if (used.has(end.dir)) {
        hingeEnd.add(`${end.linkId}:${end.end}`);
      } else {
        used.add(end.dir);
        kept.push(end);
      }
    }
    const dirs = kept.map((end) => end.dir);
    const sku = skuFor(dirs);
    if (!sku) continue;
    const node = byId.get(kept[0].nodeId);
    if (!node) continue;
    const hostLink = project.links.find((link) => link.id === node.host);
    const through = hostLink?.trade ?? project.trade;
    const pipes = [through, ...kept.map((end) => end.trade)];
    const joint = largerTrade(pipes);
    const jointFamily = FAMILIES[tradeById(joint).family];
    const y = node.height;
    fittings.push({
      id: `fit:${node.id}:${Math.round(y * 32)}`,
      sku,
      position: [node.x, y, node.z],
      axis: throughAxis(node, byId, project.links),
      branches: dirs.map((dir) => {
        const spec = armSpec(jointFamily, dirs, dir);
        return { dir: DIR_VEC[dir], setback: spec.setback, outer: spec.outer, inner: spec.inner };
      }),
      purchasable: CONNECTOR_MAP[sku].trades.includes(joint),
      approx: false,
      trade: joint,
      ...grabShims(joint, pipes),
    });
    noteOneOnHalf(issues, joint, pipes);
    for (const end of kept) {
      const spec = armSpec(jointFamily, dirs, end.dir);
      setbacks.set(`${end.linkId}:${end.end}`, { ...spec, approx: false, seat: skuShort(sku) });
    }
  }

  for (const through of throughByPost.values()) {
    const node = byId.get(through.nodeId);
    if (!node) continue;
    const split = splitByPost.get(node.id) ?? null;
    if (split == null) continue;
    const postTrade = node.trade ?? project.trade;
    const pipes = [postTrade, postTrade, through.trade];
    const joint = largerTrade(pipes);
    const spec = FAMILIES[tradeById(joint).family].inline;
    noteOneOnHalf(issues, joint, pipes);
    const clash = fittings.some(
      (fitting) => Math.hypot(fitting.position[0] - node.x, fitting.position[2] - node.z) < 0.5 && Math.abs(fitting.position[1] - split) < 2.1,
    );
    if (clash) {
      issues.push({
        severity: "warn",
        text: `The 180° on post ${nameOf.get(node.id)} sits on another clamp. Keep clamp centers at least 2 1/4" apart.`,
      });
    }
    fittings.push({
      id: `fit:${node.id}:${Math.round(split * 32)}`,
      sku: "180",
      position: [node.x, split, node.z],
      axis: through.dir,
      branches: [
        { dir: [0, 1, 0], setback: spec.setback, outer: spec.outer, inner: spec.inner },
        { dir: [0, -1, 0], setback: spec.setback, outer: spec.outer, inner: spec.inner },
      ],
      purchasable: CONNECTOR_MAP["180"].trades.includes(joint),
      approx: false,
      trade: joint,
      ...grabShims(joint, pipes),
    });
  }

  const rails: Member[] = [];
  let diagonalNoted = false;

  for (const link of project.links) {
    if (link.kind !== "rail") continue;
    const a = byId.get(link.a);
    const b = byId.get(link.b);
    if (!a || !b) continue;
    const stored = endHeights(link);
    const ya = a.host ? a.height : stored[0];
    const yb = b.host ? b.height : stored[1];
    if ((!a.host && !a.tip && ya > a.height + 0.05) || (!b.host && !b.tip && yb > b.height + 0.05)) continue;
    const run = Math.hypot(b.x - a.x, b.z - a.z);
    if (Math.hypot(run, ya - yb) < 0.5) continue;
    const sloped = Math.abs(ya - yb) > 1 / 16;
    const keyA = `${link.id}:a`;
    const keyB = `${link.id}:b`;
    const linkFam = FAMILIES[tradeById(link.trade ?? project.trade).family];
    const throughA = throughByPost.get(a.id);
    const throughB = throughByPost.get(b.id);
    const tipA = a.tip === true;
    const tipB = b.tip === true;
    const passA = Boolean(throughA && throughA.linkId === link.id && throughA.end === "a");
    const passB = Boolean(throughB && throughB.linkId === link.id && throughB.end === "b");
    const pastA = passA && link.cutA !== "horizontal" ? cleanPast(link.pastA) : 0;
    const pastB = passB && link.cutB !== "horizontal" ? cleanPast(link.pastB) : 0;
    const openSpec = { setback: 0, outer: 0, inner: 0, approx: false, seat: "open" };
    const throughSpec = { setback: 0, outer: 0, inner: 0, approx: false, seat: "180°" };
    const hingeFor = { setback: linkFam.braceSetback, outer: linkFam.T.outer, inner: linkFam.T.inner, approx: true, seat: "hinge" };
    const specA = tipA ? openSpec : passA ? throughSpec : (setbacks.get(keyA) ?? (diagonal.has(link.id) || hingeEnd.has(keyA) ? hingeFor : null));
    const specB = tipB ? openSpec : passB ? throughSpec : (setbacks.get(keyB) ?? (diagonal.has(link.id) || hingeEnd.has(keyB) ? hingeFor : null));
    if (!specA || !specB) continue;
    const approx = specA.approx || specB.approx || diagonal.has(link.id);
    if (diagonal.has(link.id)) {
      const dir = norm([b.x - a.x, yb - ya, b.z - a.z]);
      const angA = meetAngle(throughAxis(a, byId, project.links), sub([b.x, yb, b.z], [a.x, ya, a.z]));
      const angB = meetAngle(throughAxis(b, byId, project.links), sub([a.x, ya, a.z], [b.x, yb, b.z]));
      const skuA = Math.abs(angA - 45) <= 3 ? "45" : "hinge";
      const skuB = Math.abs(angB - 45) <= 3 ? "45" : "hinge";
      specA.seat = a.tip ? "open" : skuA === "45" ? "45°" : "hinge";
      specB.seat = b.tip ? "open" : skuB === "45" ? "45°" : "hinge";
      const pushAngle = (end: "a" | "b", sku: "45" | "hinge", node: SketchNode, at: Vec3, aim: Vec3, axis: Vec3) => {
        if (node.tip) return;
        const through = node.host ? (project.links.find((item) => item.id === node.host)?.trade ?? project.trade) : (node.trade ?? project.trade);
        const pipes = [through, link.trade ?? project.trade];
        const joint = largerTrade(pipes);
        noteOneOnHalf(issues, joint, pipes);
        fittings.push({
          id: `hinge:${link.id}:${end}`,
          sku,
          position: at,
          axis,
          branches: [{ dir: aim, setback: linkFam.braceSetback, outer: linkFam.T.outer, inner: linkFam.T.inner }],
          purchasable: CONNECTOR_MAP[sku].trades.includes(joint),
          approx: sku !== "45",
          trade: joint,
          ...grabShims(joint, pipes),
        });
      };
      pushAngle("a", skuA, a, [a.x, ya, a.z], dir, throughAxis(a, byId, project.links));
      pushAngle("b", skuB, b, [b.x, yb, b.z], scale(dir, -1), throughAxis(b, byId, project.links));
      if (!diagonalNoted) {
        diagonalNoted = true;
        issues.push({
          severity: "info",
          text: "A pipe at 45° to a post or a rail uses the fixed 45° connector. Any other angle uses the adjustable hinge. Those hinge cuts are estimates — rough-cut, then slide the clamp.",
        });
      }
    } else if (hingeEnd.has(keyA) || hingeEnd.has(keyB)) {
      for (const end of ["a", "b"] as const) {
        if (!hingeEnd.has(`${link.id}:${end}`)) continue;
        const node = end === "a" ? a : b;
        const other = end === "a" ? b : a;
        const oy = end === "a" ? yb : ya;
        const ny = end === "a" ? ya : yb;
        const dir = norm([other.x - node.x, oy - ny, other.z - node.z]);
        const through = node.host ? (project.links.find((item) => item.id === node.host)?.trade ?? project.trade) : (node.trade ?? project.trade);
        const pipes = [through, link.trade ?? project.trade];
        const joint = largerTrade(pipes);
        noteOneOnHalf(issues, joint, pipes);
        fittings.push({
          id: `hinge:${link.id}:${end}`,
          sku: "hinge",
          position: [node.x, ny, node.z],
          axis: throughAxis(node, byId, project.links),
          branches: [{ dir, setback: linkFam.braceSetback, outer: linkFam.T.outer, inner: linkFam.T.inner }],
          purchasable: CONNECTOR_MAP.hinge.trades.includes(joint),
          approx: true,
          trade: joint,
          ...grabShims(joint, pipes),
        });
      }
    }
    const span3 = Math.hypot(run, yb - ya);
    const metal = span3 - specA.setback - specB.setback;
    if (metal < 0.75) {
      issues.push({
        severity: "warn",
        text: `Rail ${nameOf.get(a.id)}–${nameOf.get(b.id)} is only ${formatDecimal(span3)} long — shorter than the clamps. Move the posts apart.`,
      });
    }
    const hostedEnd = Boolean(a.host || b.host);
    const endCall = (node: SketchNode) => {
      if (!node.host) return nameOf.get(node.id) ?? "?";
      const host = project.links.find((item) => item.id === node.host);
      const ha = host ? nameOf.get(host.a) : undefined;
      const hb = host ? nameOf.get(host.b) : undefined;
      return ha && hb ? `${ha}–${hb} @ ${formatDecimal(node.height)}` : "rail";
    };
    const braceWord = specA.seat === "45°" && specB.seat === "45°" ? "45° brace" : "Brace";
    rails.push(
      makeMember({
        id: `rail:${link.id}`,
        kind: "rail",
        label: diagonal.has(link.id) && hostedEnd
          ? `${braceWord} ${endCall(a)} to ${endCall(b)}`
          : sloped
            ? `Rail ${nameOf.get(a.id)}–${nameOf.get(b.id)} ${formatDecimal(ya)} to ${formatDecimal(yb)}`
            : `Rail ${nameOf.get(a.id)}–${nameOf.get(b.id)} @ ${formatDecimal(ya)}`,
        a: [a.x, ya, a.z],
        b: [b.x, yb, b.z],
        setbackA: specA.setback,
        setbackB: specB.setback,
        seatA: specA.seat,
        seatB: specB.seat,
        stick: project.stick,
        gap: linkFam.coupleGap,
        approx,
        trade: link.trade,
        angle: sloped ? (Math.atan2(yb - ya, run) * 180) / Math.PI : null,
        pastA,
        pastB,
        capA: (tipA && link.capA === true) || (pastA > 0.05 && link.capA === true),
        capB: (tipB && link.capB === true) || (pastB > 0.05 && link.capB === true),
      }),
    );
    const pushStub = (end: "a" | "b", node: SketchNode, yEnd: number) => {
      const plan = stubPlans.get(`${link.id}:${end}`);
      if (!plan || node.id !== plan.nodeId) return;
      const spec = setbacks.get(`${link.id}:${end}`);
      if (!spec) return;
      const name = nameOf.get(node.id) ?? "?";
      if (plan.past - spec.setback < 0.75) {
        issues.push({
          severity: "warn",
          text: `The piece of rail past post ${name} is shorter than the clamp. Leave at least an inch or two past the fitting.`,
        });
      }
      if (plan.past - spec.setback <= 0.05) return;
      const away = DIR_VEC[plan.dir];
      const origin: Vec3 = [node.x, yEnd, node.z];
      const far: Vec3 = [origin[0] + away[0] * plan.past, yEnd, origin[2] + away[2] * plan.past];
      const cap = end === "a" ? link.capA === true : link.capB === true;
      rails.push(
        makeMember({
          id: `rail:${link.id}:stub${end === "a" ? "A" : "B"}`,
          kind: "rail",
          label: `Rail past post ${name}`,
          a: origin,
          b: far,
          setbackA: spec.setback,
          setbackB: 0,
          seatA: spec.seat,
          seatB: "open",
          stick: project.stick,
          gap: linkFam.coupleGap,
          approx: false,
          trade: link.trade,
          capB: cap,
        }),
      );
    };
    pushStub("a", a, ya);
    pushStub("b", b, yb);
  }

  applyCrossings(project, rails, fittings, issues);

  const seenGap = new Set<string>();
  for (const node of nodes) {
    if (node.host || node.tip) continue;
    const ys = project.links
      .filter((l) => l.kind === "rail" && (l.a === node.id || l.b === node.id))
      .map((l) => (l.a === node.id ? endHeights(l)[0] : endHeights(l)[1]))
      .filter((y) => y <= node.height + 0.05);
    const split = splitByPost.get(node.id) ?? null;
    if (split != null) ys.push(split);
    ys.sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i += 1) {
      const gap = ys[i] - ys[i - 1];
      if (gap >= 0.2 && gap < 2.15) {
        const key = `${node.id}|${Math.round(ys[i - 1] * 32)}`;
        if (seenGap.has(key)) continue;
        seenGap.add(key);
        issues.push({
          severity: "warn",
          text: `Post ${nameOf.get(node.id)} has rails at ${formatDecimal(ys[i - 1])} and ${formatDecimal(ys[i])}. Keep clamp centers at least 2 1/4" apart.`,
        });
      }
    }
  }

  const braces: Member[] = [];
  for (const link of project.links) {
    if (link.kind !== "brace") continue;
    const a = byId.get(link.a);
    const b = byId.get(link.b);
    if (!a || !b || a.id === b.id) continue;
    const run = Math.hypot(b.x - a.x, b.z - a.z);
    const postH = Math.min(a.height, b.height);
    const explicit = link.yB != null && Number.isFinite(link.yB) && Math.abs(link.y - link.yB) > 0.2;
    let plan: { y0: number; y1: number; sku: "45" | "hinge" } | null;
    if (explicit) {
      const y0 = link.y;
      const y1 = link.yB as number;
      if (y0 > a.height + 0.05 || y1 > b.height + 0.05 || y0 < 1 || y1 < 1) {
        issues.push({
          severity: "warn",
          text: `Brace ${nameOf.get(a.id)}–${nameOf.get(b.id)} doesn't land on both posts. Keep each end at least 1" up and below the top.`,
        });
        continue;
      }
      const ang = Math.abs((Math.atan2(y1 - y0, run) * 180) / Math.PI);
      plan = { y0, y1, sku: Math.abs(ang - 45) <= 3 ? "45" : "hinge" };
    } else {
      const localLevels = project.links
        .filter((l) => l.kind === "rail" && (l.a === a.id || l.b === a.id || l.a === b.id || l.b === b.id))
        .flatMap((l) => endHeights(l));
      plan = planBrace(postH, run, localLevels);
    }
    if (!plan) {
      issues.push({
        severity: "warn",
        text: `No brace fits between post ${nameOf.get(a.id)} and ${nameOf.get(b.id)}. They need more height, or the shelves are in the way.`,
      });
      continue;
    }
    const sb = family.braceSetback;
    const angle = (Math.atan2(plan.y1 - plan.y0, run) * 180) / Math.PI;
    const pa: Vec3 = [a.x, plan.y0, a.z];
    const pb: Vec3 = [b.x, plan.y1, b.z];
    braces.push(
      makeMember({
        id: `brace:${link.id}`,
        kind: "brace",
        label: `${plan.sku === "45" ? "45°" : "Adjustable"} brace ${nameOf.get(a.id)}–${nameOf.get(b.id)}`,
        a: pa,
        b: pb,
        setbackA: sb,
        setbackB: sb,
        seatA: plan.sku === "45" ? "45°" : "hinge",
        seatB: plan.sku === "45" ? "45°" : "hinge",
        stick: project.stick,
        gap: family.coupleGap,
        approx: true,
        angle,
      }),
    );
    const branchDir = norm(sub(pb, pa));
    const bracePipe = link.trade ?? project.trade;
    const pushBrace = (end: "a" | "b", node: SketchNode, pos: Vec3, dir: Vec3) => {
      const pipes = [node.trade ?? project.trade, bracePipe];
      const joint = largerTrade(pipes);
      noteOneOnHalf(issues, joint, pipes);
      fittings.push({
        id: `bfit:${link.id}:${end}`,
        sku: plan.sku,
        position: pos,
        branches: [{ dir, setback: sb, outer: family.T.outer, inner: family.T.inner }],
        purchasable: CONNECTOR_MAP[plan.sku].trades.includes(joint),
        approx: true,
        trade: joint,
        ...grabShims(joint, pipes),
      });
    };
    pushBrace("a", a, pa, branchDir);
    pushBrace("b", b, pb, scale(branchDir, -1));
  }
  if (braces.length) {
    issues.push({
      severity: "info",
      text: "Brace lengths are estimates. MakerPipe's cut chart doesn't publish 45° or hinge setbacks, so these use the T-branch setback. Rough-cut, then slide the clamp.",
    });
  }

  const flangeOk = CONNECTOR_MAP.flange.trades.includes(project.trade);
  let flangeGhost = false;
  for (const node of nodes) {
    if (!node.flange || node.host) continue;
    if (!flangeOk) flangeGhost = true;
    const postTrade = node.trade ?? project.trade;
    fittings.push({
      id: `flange:${node.id}`,
      sku: "flange",
      position: [node.x, 0, node.z],
      branches: [],
      purchasable: CONNECTOR_MAP.flange.trades.includes(postTrade),
      approx: false,
      trade: postTrade,
      ...grabShims(postTrade, [postTrade]),
    });
  }
  if (flangeGhost) {
    issues.push({
      severity: "warn",
      text: "MakerPipe flanges are made for 3/4\" and shimmed 1/2\" EMT, not 1\". They're shown ghosted and left off the buy list.",
    });
  }

  const sized = real;
  const minX = sized.length ? Math.min(...sized.map((n) => n.x)) : 0;
  const maxX = sized.length ? Math.max(...sized.map((n) => n.x)) : 0;
  const minZ = sized.length ? Math.min(...sized.map((n) => n.z)) : 0;
  const maxZ = sized.length ? Math.max(...sized.map((n) => n.z)) : 0;
  const width = spanMeasure(sized, fittings, "x", minX, maxX, trade.od);
  const depth = spanMeasure(sized, fittings, "z", minZ, maxZ, trade.od);
  const postHeight = sized.length ? Math.max(...sized.map((n) => n.height)) : project.postHeight;
  const levels = [...new Set(rails.map((r) => Math.round((r.a[1] + r.b[1]) / 2 * 32) / 32))].sort((a, b) => a - b);

  return finishBuild({
    project,
    trade,
    fittings,
    posts,
    rails,
    braces,
    issues,
    width,
    depth,
    postHeight,
    xs: sized.length ? [minX, maxX] : [0],
    zs: sized.length ? [minZ, maxZ] : [0],
    levels,
  });
}

function spanMeasure(
  nodes: SketchNode[],
  fittings: Fitting[],
  axis: "x" | "z",
  min: number,
  max: number,
  od: number,
): AxisMeasure {
  const centers = nodes.length >= 2 ? max - min : 0;
  if (centers <= 0.2) {
    return { centers: 0, fittingOutside: nodes.length ? od : 0, fittingInside: 0, pipeOutside: nodes.length ? od : 0, pipeClear: 0 };
  }
  const outwardNeg: Vec3 = axis === "x" ? [-1, 0, 0] : [0, 0, -1];
  const outwardPos: Vec3 = axis === "x" ? [1, 0, 0] : [0, 0, 1];
  const coord = (n: SketchNode) => (axis === "x" ? n.x : n.z);
  const lo = nodes.filter((n) => Math.abs(coord(n) - min) < 0.25);
  const hi = nodes.filter((n) => Math.abs(coord(n) - max) < 0.25);
  const left = edgeExtension(fittings, lo, outwardNeg, od / 2);
  const right = edgeExtension(fittings, hi, outwardPos, od / 2);
  const leftIn = edgeExtension(fittings, lo, outwardNeg, od / 2, "inner");
  const rightIn = edgeExtension(fittings, hi, outwardPos, od / 2, "inner");
  return {
    centers,
    fittingOutside: centers + left + right,
    fittingInside: Math.max(0, centers - leftIn - rightIn),
    pipeOutside: centers + od,
    pipeClear: Math.max(0, centers - od),
  };
}

function edgeExtension(
  fittings: Fitting[],
  posts: SketchNode[],
  outward: Vec3,
  fallback: number,
  field: "outer" | "inner" = "outer",
): number {
  let best = fallback;
  let found = false;
  for (const post of posts) {
    for (const f of fittings) {
      if (f.approx || f.sku === "flange" || f.sku === "coupling" || f.sku === "hinge" || f.sku === "45") continue;
      if (Math.hypot(f.position[0] - post.x, f.position[2] - post.z) > 0.35) continue;
      for (const br of f.branches) {
        const dot = br.dir[0] * outward[0] + br.dir[1] * outward[1] + br.dir[2] * outward[2];
        if (dot < -0.8) {
          found = true;
          best = Math.max(best, field === "outer" ? br.outer : br.inner);
        }
      }
    }
  }
  return found ? best : fallback;
}

export function buildProject(project: Project): Build {
  const full = normalizeProject(project);
  if (full.mode === "sketch") return buildSketch(full);
  const trade = tradeById(full.trade);
  const family = FAMILIES[trade.family];
  const issues: Issue[] = [];
  const xs = cumulate(project.baysX);
  const zs = cumulate(project.baysZ);
  const { levels, dropped } = uniqueSorted(project.levels, project.postHeight);
  if (dropped) {
    issues.push({
      severity: "warn",
      text: `${dropped} shelf ${dropped === 1 ? "height was" : "heights were"} duplicated or past the post and ignored.`,
    });
  }
  if (project.postHeight > project.stick) {
    issues.push({
      severity: "info",
      text: "Posts are longer than one stick, so each one is spliced with a structural coupling. Don't count on an unspliced 20–30 ft tube — brace it.",
    });
  }

  const fittings: Fitting[] = [];
  const rails: Member[] = [];

  for (let li = 0; li < levels.length; li += 1) {
    const y = levels[li];
    if (y < 1.25) {
      issues.push({
        severity: "warn",
        text: `Shelf at ${formatDecimal(y)} sits too close to the end of the post for a clamp to bite. Leave about 1" of pipe past the fitting center.`,
      });
    }
    if (project.postHeight - y < 1) {
      issues.push({
        severity: "warn",
        text: `Shelf at ${formatDecimal(y)} is too close to the top of a ${formatDecimal(project.postHeight)} post. The through-clamp needs pipe above the rail.`,
      });
    }
    for (let i = 1; i < levels.length; i += 1) {
      if (i <= li) continue;
      if (Math.abs(levels[i] - y) < 2.15 && Math.abs(levels[i] - y) >= 0.2) {
        issues.push({
          severity: "warn",
          text: `Shelves at ${formatDecimal(y)} and ${formatDecimal(levels[i])} will stack their clamps on the same post. Keep shelf centers at least 2 1/4" apart.`,
        });
      }
    }

    for (let iz = 0; iz < zs.length; iz += 1) {
      for (let ix = 0; ix < xs.length; ix += 1) {
        const dirs = dirsAt(ix, iz, project.baysX.length, project.baysZ.length);
        const sku = skuFor(dirs);
        if (!sku) continue;
        const branches: Branch[] = dirs.map((dir) => {
          const spec = armSpec(family, dirs, dir);
          return { dir: DIR_VEC[dir], setback: spec.setback, outer: spec.outer, inner: spec.inner };
        });
        fittings.push({
          id: `fit-${ix}-${iz}-${li}`,
          sku,
          position: [xs[ix], y, zs[iz]],
          branches,
          purchasable: CONNECTOR_MAP[sku].trades.includes(project.trade),
          approx: false,
        });
      }
    }

    for (let iz = 0; iz < zs.length; iz += 1) {
      for (let ix = 0; ix < project.baysX.length; ix += 1) {
        const left = armSpec(family, dirsAt(ix, iz, project.baysX.length, project.baysZ.length), "+x");
        const right = armSpec(family, dirsAt(ix + 1, iz, project.baysX.length, project.baysZ.length), "-x");
        const span = project.baysX[ix];
        rails.push(
          makeMember({
            id: `rail-x-${li}-${iz}-${ix}`,
            kind: "rail",
            label: `Width rail ${colName(ix)}${iz + 1}–${colName(ix + 1)}${iz + 1} @ ${formatDecimal(y)}`,
            a: [xs[ix], y, zs[iz]],
            b: [xs[ix + 1], y, zs[iz]],
            setbackA: left.setback,
            setbackB: right.setback,
            seatA: skuShort(skuFor(dirsAt(ix, iz, project.baysX.length, project.baysZ.length))),
            seatB: skuShort(skuFor(dirsAt(ix + 1, iz, project.baysX.length, project.baysZ.length))),
            stick: project.stick,
            gap: family.coupleGap,
            approx: false,
          }),
        );
        if (span - left.setback - right.setback < 0.75) {
          issues.push({
            severity: "warn",
            text: `Width bay ${ix + 1} (${formatDecimal(span)} center to center) is shorter than the clamps at ${formatDecimal(y)}. Widen it.`,
          });
        }
      }
    }

    for (let ix = 0; ix < xs.length; ix += 1) {
      for (let iz = 0; iz < project.baysZ.length; iz += 1) {
        const near = armSpec(family, dirsAt(ix, iz, project.baysX.length, project.baysZ.length), "+z");
        const far = armSpec(family, dirsAt(ix, iz + 1, project.baysX.length, project.baysZ.length), "-z");
        const span = project.baysZ[iz];
        rails.push(
          makeMember({
            id: `rail-z-${li}-${ix}-${iz}`,
            kind: "rail",
            label: `Depth rail ${colName(ix)}${iz + 1}–${colName(ix)}${iz + 2} @ ${formatDecimal(y)}`,
            a: [xs[ix], y, zs[iz]],
            b: [xs[ix], y, zs[iz + 1]],
            setbackA: near.setback,
            setbackB: far.setback,
            seatA: skuShort(skuFor(dirsAt(ix, iz, project.baysX.length, project.baysZ.length))),
            seatB: skuShort(skuFor(dirsAt(ix, iz + 1, project.baysX.length, project.baysZ.length))),
            stick: project.stick,
            gap: family.coupleGap,
            approx: false,
          }),
        );
        if (span - near.setback - far.setback < 0.75) {
          issues.push({
            severity: "warn",
            text: `Depth bay ${iz + 1} (${formatDecimal(span)} center to center) is shorter than the clamps at ${formatDecimal(y)}. Deepen it.`,
          });
        }
      }
    }
  }

  if (levels.length === 0) {
    issues.push({ severity: "info", text: "No shelves yet — posts are standing with nothing tying them together." });
  }

  const posts: Member[] = [];
  for (let iz = 0; iz < zs.length; iz += 1) {
    for (let ix = 0; ix < xs.length; ix += 1) {
      posts.push(
        makeMember({
          id: `post-${ix}-${iz}`,
          kind: "post",
          label: `Post ${colName(ix)}${iz + 1}`,
          a: [xs[ix], 0, zs[iz]],
          b: [xs[ix], project.postHeight, zs[iz]],
          setbackA: 0,
          setbackB: 0,
          stick: project.stick,
          gap: family.coupleGap,
          approx: false,
          capB: (full.plugs ?? []).some((plug) => plug.id === `post-${ix}-${iz}` && plug.top),
          capA: !project.flanges && (full.plugs ?? []).some((plug) => plug.id === `post-${ix}-${iz}` && plug.foot),
        }),
      );
    }
  }

  const braces: Member[] = [];
  if (false && project.braces) {
    const ctcX = xs[xs.length - 1] ?? 0;
    const ctcZ = zs[zs.length - 1] ?? 0;
    const faces: { axis: "x" | "z"; i: number; k: number }[] = [];
    if (project.baysX.length && (project.baysZ.length === 0 || ctcX >= ctcZ)) {
      const ks = zs.length <= 1 ? [0] : [0, zs.length - 1];
      for (const k of ks) for (let i = 0; i < project.baysX.length; i += 1) faces.push({ axis: "x", i, k });
    } else if (project.baysZ.length) {
      const is = xs.length <= 1 ? [0] : [0, xs.length - 1];
      for (const i of is) for (let k = 0; k < project.baysZ.length; k += 1) faces.push({ axis: "z", i, k });
    }
    let skipped = 0;
    let usedHinge = 0;
    let used45 = 0;
    faces.forEach((face, n) => {
      const run = face.axis === "x" ? project.baysX[face.i] : project.baysZ[face.k];
      const plan = planBrace(project.postHeight, run, levels);
      if (!plan) {
        skipped += 1;
        return;
      }
      if (plan.sku === "hinge") usedHinge += 1;
      else used45 += 1;
      const y0 = plan.y0;
      const y1 = plan.y1;
      const a: Vec3 =
        face.axis === "x"
          ? [xs[face.i], y0, zs[face.k]]
          : [xs[face.i], y0, zs[face.k]];
      const b: Vec3 =
        face.axis === "x"
          ? [xs[face.i + 1], y1, zs[face.k]]
          : [xs[face.i], y1, zs[face.k + 1]];
      const angle = (Math.atan2(y1 - y0, run) * 180) / Math.PI;
      const sb = family.braceSetback;
      braces.push(
        makeMember({
          id: `brace-${n}`,
          kind: "brace",
          label: `${plan.sku === "45" ? "45°" : "Adjustable"} brace, bay ${face.axis === "x" ? face.i + 1 : face.k + 1}`,
          a,
          b,
          setbackA: sb,
          setbackB: sb,
          seatA: plan.sku === "45" ? "45°" : "hinge",
          seatB: plan.sku === "45" ? "45°" : "hinge",
          stick: project.stick,
          gap: family.coupleGap,
          approx: true,
          angle,
        }),
      );
      const branchDir = norm(sub(b, a));
      const back = scale(branchDir, -1);
      for (const end of [
        { pos: a, dir: branchDir },
        { pos: b, dir: back },
      ]) {
        fittings.push({
          id: `brace-fit-${n}-${end.pos[0].toFixed(2)}-${end.pos[1].toFixed(2)}-${end.pos[2].toFixed(2)}`,
          sku: plan.sku,
          position: end.pos,
          branches: [{ dir: end.dir, setback: sb, outer: family.T.outer, inner: family.T.inner }],
          purchasable: true,
          approx: true,
        });
      }
    });
    if (faces.length === 0) {
      issues.push({ severity: "info", text: "Braces need at least one bay." });
    }
    if (skipped) {
      issues.push({
        severity: "warn",
        text: `${skipped} brace${skipped === 1 ? "" : "s"} didn't fit between the shelves and the ends of the posts.`,
      });
    }
    if (used45 || usedHinge) {
      issues.push({
        severity: "info",
        text: "Brace lengths are estimates. MakerPipe's cut chart doesn't publish 45° or hinge setbacks, so these use the T-branch setback. Rough-cut, then slide the clamp.",
      });
    }
    if (usedHinge && !used45) {
      issues.push({
        severity: "info",
        text: "These bays are too long for a fixed 45° inside the post height, so the braces use adjustable angle hinges.",
      });
    }
  }

  if (project.flanges) {
    const ok = CONNECTOR_MAP.flange.trades.includes(project.trade);
    if (!ok) {
      issues.push({
        severity: "warn",
        text: "MakerPipe flanges are made for 3/4\" and shimmed 1/2\" EMT, not 1\". They're shown ghosted and left off the buy list.",
      });
    } else if (levels.some((y) => y < 2.4)) {
      issues.push({
        severity: "warn",
        text: "A low shelf may collide with the flange cup. Keep the first rail about 2 1/2\" up.",
      });
    }
    if (ok) {
      issues.push({
        severity: "info",
        text: "Post cuts are the tube only. The flange plate sits under the post and adds a fraction of an inch to the standing height.",
      });
    }
    for (let iz = 0; iz < zs.length; iz += 1) {
      for (let ix = 0; ix < xs.length; ix += 1) {
        fittings.push({
          id: `flange-${ix}-${iz}`,
          sku: "flange",
          position: [xs[ix], 0, zs[iz]],
          branches: [],
          purchasable: ok,
          approx: false,
        });
      }
    }
  }

  const od = trade.od;
  const width = measureAxis(xs, zs, "x", fittings, od, levels);
  const depth = measureAxis(xs, zs, "z", fittings, od, levels);

  return finishBuild({
    project: { ...project, straps: full.straps },
    trade,
    fittings,
    posts,
    rails,
    braces,
    issues,
    width,
    depth,
    postHeight: project.postHeight,
    xs,
    zs,
    levels,
  });
}

/** Where a wood strap may sit: on the pipe, past the clamp seat. */
export function strapWindow(member: Member): [number, number] {
  const lo = Math.min(Math.max(0.75, member.setbackA + 0.5), Math.max(0.75, member.span / 2));
  const hi = Math.max(lo, member.span - Math.max(member.setbackB, 0) - 0.5);
  return [lo, hi];
}

function resolveStraps(raw: Strap[] | undefined, members: Member[]): Strap[] {
  const byId = new Map(members.map((member) => [member.id, member]));
  const out: Strap[] = [];
  for (const strap of raw ?? []) {
    const member = byId.get(strap.memberId);
    if (!member || !(member.span > 1)) continue;
    const [lo, hi] = strapWindow(member);
    const at = Math.round(Math.min(hi, Math.max(lo, strap.at)) * 32) / 32;
    out.push({ id: strap.id, memberId: strap.memberId, at });
  }
  return out;
}

/** Where a hinge may sit. A barrel is 4" tall, so it needs room on both sides. */
export function hingeWindow(member: Member, kind: HingeKind): [number, number] {
  const pad = kind === "barrel" ? BARREL_LENGTH / 2 + 0.25 : 1;
  const lo = Math.min(Math.max(pad, member.setbackA + 0.35), Math.max(pad, member.span / 2));
  const hi = Math.max(lo, member.span - Math.max(member.setbackB, 0) - pad);
  return [Math.round(lo * 32) / 32, Math.round(hi * 32) / 32];
}

/** How far this hinge will swing before it binds. */
export function hingeOpenMax(kind: HingeKind): number {
  if (kind === "angle") return 90;
  if (kind === "barrel") return 170;
  return 120;
}

export type DoorFrame = {
  hinge: { x: number; z: number; base: number; height: number };
  latch: { x: number; z: number; base: number; height: number };
  bottom: number;
  top: number;
  dirX: number;
  dirZ: number;
  width: number;
};

/** Closed door rectangle hung beside an upright post. Null when the pipe is not upright or the hinges cannot hold a door. */
export function doorFrame(member: Member, hinges: Hinge[], widthIn: number): DoorFrame | null {
  const usable = hinges.filter((hinge) => hinge.memberId === member.id && hinge.kind !== "angle");
  if (!usable.length || member.kind !== "post") return null;
  const axis = sub(member.b, member.a);
  const span = vlen(axis) || 1;
  const up = norm(axis);
  if (up[1] < 0.92) return null;
  const side = usable[0].side === -1 ? -1 : 1;
  let faceX = -axis[2];
  let faceZ = axis[0];
  if (faceX * faceX + faceZ * faceZ < 0.04) {
    faceX = 1;
    faceZ = 0;
  }
  const faceLen = Math.hypot(faceX, faceZ) || 1;
  faceX = (faceX / faceLen) * side;
  faceZ = (faceZ / faceLen) * side;
  if (Math.abs(faceX) >= Math.abs(faceZ)) {
    faceX = faceX >= 0 ? 1 : -1;
    faceZ = 0;
  } else {
    faceX = 0;
    faceZ = faceZ >= 0 ? 1 : -1;
  }
  let dirX = -faceZ;
  let dirZ = faceX;
  if (Math.abs(dirX) >= Math.abs(dirZ)) {
    dirX = dirX >= 0 ? 1 : -1;
    dirZ = 0;
  } else {
    dirX = 0;
    dirZ = dirZ >= 0 ? 1 : -1;
  }
  const width = Math.round(Math.min(96, Math.max(8, widthIn)) * 32) / 32;
  const knuckle = usable[0].kind === "barrel" ? 0.85 : 1.55;
  const ats = usable.map((hinge) => hinge.at).sort((a, b) => a - b);
  let bottom: number;
  let top: number;
  if (ats.length >= 2 && ats[ats.length - 1] - ats[0] >= 8) {
    bottom = ats[0];
    top = ats[ats.length - 1];
  } else {
    const c = ats[Math.floor(ats.length / 2)];
    bottom = c - 14;
    top = c + 14;
  }
  bottom = Math.max(2, bottom);
  top = Math.min(span - 2, top);
  if (top - bottom < 10) {
    bottom = Math.max(2, Math.min(bottom, span - 14));
    top = Math.min(span - 2, bottom + 12);
  }
  if (top - bottom < 8) return null;
  const pad = 1.5;
  const base = Math.round(Math.max(0.75, bottom - pad) * 32) / 32;
  const height = Math.round(Math.min(span, top + pad) * 32) / 32;
  if (height - base < 8) return null;
  const hx = Math.round((member.a[0] + faceX * knuckle) * 32) / 32;
  const hz = Math.round((member.a[2] + faceZ * knuckle) * 32) / 32;
  const lx = Math.round((hx + dirX * width) * 32) / 32;
  const lz = Math.round((hz + dirZ * width) * 32) / 32;
  const actual = Math.hypot(lx - hx, lz - hz);
  if (actual < 6) return null;
  return {
    hinge: { x: hx, z: hz, base, height },
    latch: { x: lx, z: lz, base, height },
    bottom: Math.round(bottom * 32) / 32,
    top: Math.round(top * 32) / 32,
    dirX,
    dirZ,
    width: Math.round(actual * 32) / 32,
  };
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function rotVec(v: Vec3, axis: Vec3, deg: number): Vec3 {
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const along = dot(axis, v);
  const cr = cross3(axis, v);
  return [v[0] * c + cr[0] * s + axis[0] * along * (1 - c), v[1] * c + cr[1] * s + axis[1] * along * (1 - c), v[2] * c + cr[2] * s + axis[2] * along * (1 - c)];
}

function rotPoint(p: Vec3, pivot: Vec3, axis: Vec3, deg: number): Vec3 {
  return add(pivot, rotVec(sub(p, pivot), axis, deg));
}

/** Nodes that swing with a door: the stiles, plus tips and joints that hang only off them. */
export function swingingNodeIds(project: FullProject): Set<string> {
  const swing = new Set(project.nodes.filter((node) => node.door).map((node) => node.id));
  let guard = 0;
  let grew = true;
  while (grew && guard < 8) {
    grew = false;
    guard += 1;
    for (const node of project.nodes) {
      if (swing.has(node.id)) continue;
      if (node.host) {
        const link = project.links.find((item) => item.id === node.host);
        if (link && swing.has(link.a) && swing.has(link.b)) {
          swing.add(node.id);
          grew = true;
        }
        continue;
      }
      if (!node.tip) continue;
      const touch = project.links.filter((link) => link.a === node.id || link.b === node.id);
      if (touch.length && touch.every((link) => swing.has(link.a === node.id ? link.b : link.a))) {
        swing.add(node.id);
        grew = true;
      }
    }
  }
  return swing;
}

function doorIdFor(project: FullProject, nodeId: string): string | null {
  const node = project.nodes.find((item) => item.id === nodeId);
  if (node?.door) return node.door;
  for (const link of project.links) {
    const other = link.a === nodeId ? link.b : link.b === nodeId ? link.a : null;
    if (!other) continue;
    const mate = project.nodes.find((item) => item.id === other);
    if (mate?.door) return mate.door;
  }
  return null;
}

/** Draw the door open. Cuts stay at the closed size — swinging does not change a length. */
export function poseSwung(project: FullProject, build: Build): { members: Member[]; fittings: Fitting[] } {
  const swing = swingingNodeIds(project);
  if (!swing.size) return { members: build.members, fittings: build.fittings };
  const degOf = new Map<string, number>();
  for (const door of project.doors) {
    const deg = project.hingeSwing.find((item) => item.memberId === door.memberId)?.deg ?? 0;
    if (deg > 0.05) degOf.set(door.id, deg);
  }
  if (!degOf.size) return { members: build.members, fittings: build.fittings };
  const pivotOf = new Map<string, Vec3>();
  for (const door of project.doors) {
    const hinge = project.nodes.find((node) => node.id === door.hingeNode);
    if (hinge) pivotOf.set(door.id, [hinge.x, 0, hinge.z]);
  }
  const axis: Vec3 = [0, 1, 0];
  const spinPoint = (doorId: string, point: Vec3): Vec3 => {
    const deg = degOf.get(doorId);
    const pivot = pivotOf.get(doorId);
    if (!deg || !pivot) return point;
    return rotPoint(point, pivot, axis, deg);
  };
  const spinDir = (doorId: string, dir: Vec3): Vec3 => {
    const deg = degOf.get(doorId);
    if (!deg) return dir;
    return rotVec(dir, axis, deg);
  };
  const memberDoor = (member: Member): string | null => {
    if (member.id.startsWith("post:")) {
      const nodeId = member.id.slice(5).replace(/:hi$/, "");
      return swing.has(nodeId) ? doorIdFor(project, nodeId) : null;
    }
    if (member.id.startsWith("rail:") || member.id.startsWith("brace:")) {
      const linkId = member.id.slice(member.id.indexOf(":") + 1).replace(/:stub[AB]$/, "");
      const link = project.links.find((item) => item.id === linkId);
      if (!link || !swing.has(link.a) || !swing.has(link.b)) return null;
      return doorIdFor(project, link.a);
    }
    return null;
  };
  const members = build.members.map((member) => {
    const doorId = memberDoor(member);
    if (!doorId || !degOf.has(doorId)) return member;
    const move = (point: Vec3) => spinPoint(doorId, point);
    return {
      ...member,
      a: move(member.a),
      b: move(member.b),
      segments: member.segments.map((seg) => ({ a: move(seg.a), b: move(seg.b) })),
      couplings: member.couplings.map((seg) => ({ a: move(seg.a), b: move(seg.b) })),
      capAt: member.capAt.map((cap) => ({ at: move(cap.at), axis: spinDir(doorId, cap.axis) })),
    };
  });
  const fittings = build.fittings.map((fitting) => {
    let doorId: string | null = null;
    if (fitting.id.startsWith("fit:") || fitting.id.startsWith("bfit:")) {
      const rest = fitting.id.slice(fitting.id.indexOf(":") + 1);
      const nodeId = rest.slice(0, rest.lastIndexOf(":"));
      if (swing.has(nodeId)) doorId = doorIdFor(project, nodeId);
    } else if (fitting.id.startsWith("flange:")) {
      const nodeId = fitting.id.slice(7);
      if (swing.has(nodeId)) doorId = doorIdFor(project, nodeId);
    } else if (fitting.id.startsWith("hinge:")) {
      const linkId = fitting.id.split(":")[1];
      const link = project.links.find((item) => item.id === linkId);
      if (link && swing.has(link.a) && swing.has(link.b)) doorId = doorIdFor(project, link.a);
    }
    if (!doorId || !degOf.has(doorId)) return fitting;
    return {
      ...fitting,
      position: spinPoint(doorId, fitting.position),
      axis: fitting.axis ? spinDir(doorId, fitting.axis) : fitting.axis,
      branches: fitting.branches.map((branch) => ({ ...branch, dir: spinDir(doorId, branch.dir) })),
    };
  });
  return { members, fittings };
}

function hingeBill(project: Project, members: Member[], issues: Issue[]): { hinges: Hinge[]; lines: HardwareLine[]; halfShims: number; oneShims: number } {
  const byId = new Map(members.map((member) => [member.id, member]));
  const hinges: Hinge[] = [];
  for (const hinge of project.hinges ?? []) {
    const member = byId.get(hinge.memberId);
    if (!member || member.kind === "brace" || !(member.span > 1)) continue;
    const [lo, hi] = hingeWindow(member, hinge.kind);
    hinges.push({ ...hinge, at: Math.round(Math.min(hi, Math.max(lo, hinge.at)) * 32) / 32 });
  }
  const lines: HardwareLine[] = [];
  let halfShims = 0;
  let oneShims = 0;
  const leaf = new Map<TradeId, number>();
  const angle = new Map<TradeId, number>();
  let barrels = 0;
  const barrelNoted = new Set<string>();
  for (const hinge of hinges) {
    const member = byId.get(hinge.memberId);
    if (!member) continue;
    const trade = member.trade ?? project.trade;
    if (hinge.kind === "leaf") leaf.set(trade, (leaf.get(trade) ?? 0) + 1);
    else if (hinge.kind === "angle") angle.set(trade, (angle.get(trade) ?? 0) + 1);
    else {
      barrels += 1;
      if (trade === "one") oneShims += 2;
      else if (trade === "half") halfShims += 2;
      if (!barrelNoted.has(member.id)) {
        barrelNoted.add(member.id);
        const shim =
          trade === "one"
            ? " Each half needs a 1\" to 3/4\" shim, because the barrel is 0.94\" and a 1\" clamp is too big."
            : trade === "half"
              ? " Clamp it with 3/4\" connectors. Each of those needs a 3/4\" to 1/2\" shim on the 1/2\" pipe. The barrel itself is too big for a 1/2\" clamp."
              : " A 3/4\" clamp closes on the 0.94\" barrel. That is 0.018\" over 3/4\" EMT, and MakerPipe does not sell a shim for it.";
        issues.push({
          severity: "info",
          text: `${member.label} is cut for a ${BARREL_LENGTH}" barrel hinge. Take ${BARREL_LENGTH}" out of that stick — the hinge is not conduit.${shim}`,
        });
      }
    }
  }
  for (const [trade, count] of leaf) {
    const sold = trade !== "half";
    if (!sold) {
      issues.push({
        severity: "warn",
        text: "The EMT conduit hinge set is sold for 3/4\" and 1\" only. A 1/2\" pipe cannot take it.",
      });
    }
    lines.push({
      id: `leaf-${trade}`,
      name: trade === project.trade ? "EMT conduit hinge set" : `EMT conduit hinge set · ${tradeById(trade).label}`,
      qty: Math.ceil(count / LEAF_SET_COUNT),
      unitPrice: LEAF_SET_PRICE,
      purchasable: sold,
      detail: sold
        ? `A set is ${LEAF_SET_COUNT} offset hinges and the 1/4\" bolts, ${money(LEAF_SET_PRICE)}. Drill through the pipe. This build uses ${count}.`
        : "Not sold for 1/2\" EMT.",
    });
  }
  if (barrels) {
    lines.push({
      id: "barrel",
      name: "Barrel hinge",
      qty: barrels,
      unitPrice: BARREL_PRICE,
      purchasable: true,
      detail: `${BARREL_LENGTH}" inline hinge, 0.94\" outside. Clamp a connector on each half. On 1\" EMT that connector needs a shim. On 3/4\" it does not.`,
    });
  }
  for (const [trade, count] of angle) {
    lines.push({
      id: `angle-${trade}`,
      name: trade === project.trade ? "Adjustable angle hinge" : `Adjustable angle hinge · ${tradeById(trade).label}`,
      qty: count,
      unitPrice: ANGLE_HINGE_PRICE[trade],
      purchasable: true,
      detail:
        trade === "half"
          ? "Complete connector. The 1/2\" price includes the adapter shims. Leave the top bolt loose and it folds up to 90° either way."
          : "Complete connector. Leave the top bolt loose and it folds up to 90°. The face you pick is which way it folds.",
    });
  }
  return { hinges, lines, halfShims, oneShims };
}

function finishBuild(opts: {
  project: Project;
  trade: ReturnType<typeof tradeById>;
  fittings: Fitting[];
  posts: Member[];
  rails: Member[];
  braces: Member[];
  issues: Issue[];
  width: AxisMeasure;
  depth: AxisMeasure;
  postHeight: number;
  xs: number[];
  zs: number[];
  levels: number[];
}): Build {
  const { project, trade, fittings, posts, rails, braces, width, depth, postHeight, xs, zs, levels } = opts;
  const issues = opts.issues;
  for (const m of [...posts, ...rails, ...braces]) {
    if (m.couplingCount > 0 && m.kind !== "post") {
      issues.push({
        severity: "info",
        text: `${m.label} is longer than one stick, so it's spliced with ${m.couplingCount} coupling${m.couplingCount === 1 ? "" : "s"}.`,
      });
    }
  }

  const members = [...posts, ...rails, ...braces];
  const groups = new Map<TradeId, number[]>();
  for (const member of members) {
    const id = member.trade ?? project.trade;
    const list = groups.get(id) ?? [];
    list.push(...member.pieces);
    groups.set(id, list);
  }
  const packs: StickPack[] = [];
  let sticks = 0;
  let wasteInches = 0;
  let pipeInches = 0;
  let weightLb = 0;
  const packEntries = groups.size ? [...groups.entries()] : ([[project.trade, [] as number[]]] as [TradeId, number[]][]);
  for (const [id, pieces] of packEntries) {
    const spec = tradeById(id);
    const packed = pieces.length ? packSticks(pieces, project.stick, project.kerf) : { sticks: 0, waste: 0 };
    const inches = pieces.reduce((sum, n) => sum + n, 0);
    sticks += packed.sticks;
    wasteInches += packed.waste;
    pipeInches += inches;
    weightLb += (inches / 12) * spec.lbPerFt;
    if (pieces.length) packs.push({ trade: id, label: spec.label, sticks: packed.sticks, inches, waste: packed.waste });
  }

  const mixed =
    members.some((member) => member.trade && member.trade !== project.trade) ||
    fittings.some((fitting) => fitting.trade && fitting.trade !== project.trade);

  const bom: BomLine[] = [];
  if (!mixed) {
    const counts = new Map<Sku, number>();
    for (const fitting of fittings) counts.set(fitting.sku, (counts.get(fitting.sku) ?? 0) + 1);
    for (const member of members) {
      if (member.couplingCount) counts.set("coupling", (counts.get("coupling") ?? 0) + member.couplingCount);
    }
    for (const info of Object.values(CONNECTOR_MAP)) {
      const qty = counts.get(info.sku) ?? 0;
      if (!qty) continue;
      const purchasable = info.trades.includes(project.trade);
      bom.push({
        sku: info.sku,
        name: info.name,
        qty,
        unitPrice: connectorPrice(info, project.trade),
        shimsEach: trade.shims && purchasable ? info.shims : 0,
        purchasable,
        detail: info.detail,
      });
    }
  } else {
    const grouped = new Map<string, { sku: Sku; trade: TradeId; qty: number }>();
    const add = (sku: Sku, id: TradeId, qty: number) => {
      const key = `${sku}|${id}`;
      const row = grouped.get(key) ?? { sku, trade: id, qty: 0 };
      row.qty += qty;
      grouped.set(key, row);
    };
    for (const fitting of fittings) add(fitting.sku, fitting.trade ?? project.trade, 1);
    for (const member of members) {
      if (member.couplingCount) add("coupling", member.trade ?? project.trade, member.couplingCount);
    }
    for (const row of grouped.values()) {
      const info = CONNECTOR_MAP[row.sku];
      const purchasable = info.trades.includes(row.trade);
      bom.push({
        sku: row.sku,
        name: `${info.name} · ${tradeById(row.trade).label}`,
        qty: row.qty,
        unitPrice: connectorPrice(info, row.trade),
        shimsEach: row.trade === "half" && purchasable ? info.shims : 0,
        purchasable,
        detail: info.detail,
      });
    }
  }
  bom.sort((a, b) => b.qty - a.qty);

  const hardware = hingeBill(project, members, issues);
  const extraHalf = fittings.reduce((sum, fitting) => sum + (fitting.extraHalfShims ?? 0), 0) + hardware.halfShims;
  const oneShimCount = fittings.reduce((sum, fitting) => sum + (fitting.extraOneShims ?? 0), 0) + hardware.oneShims;
  const shimCount = bom.reduce((sum, line) => sum + (line.purchasable ? line.qty * line.shimsEach : 0), 0) + extraHalf;
  const shimCost = shimCount * SHIM_PRICE + oneShimCount * ONE_SHIM_PRICE;
  const straps = resolveStraps(project.straps, members);
  const strapCost = straps.length * STRAP_PRICE;
  const capMap = new Map<TradeId, number>();
  for (const member of members) {
    if (!member.caps) continue;
    const id = member.trade ?? project.trade;
    capMap.set(id, (capMap.get(id) ?? 0) + member.caps);
  }
  const caps = [...capMap.entries()].map(([id, qty]) => ({
    trade: id,
    label: tradeById(id).label,
    qty,
    unitPrice: capEach(id),
    packPrice: capPackPrice(id),
  }));
  const capCost = cents(caps.reduce((sum, line) => sum + (line.qty * line.packPrice) / CAP_PACK, 0));
  const hardwareCost = hardware.lines.reduce((sum, line) => sum + (line.purchasable ? line.qty * line.unitPrice : 0), 0);
  const connectorCost = bom.reduce((sum, line) => sum + (line.purchasable ? line.qty * line.unitPrice : 0), 0) + shimCost + strapCost + capCost + hardwareCost;

  const cutMap = new Map<string, CutRow>();
  const mixedPipe = groups.size > 1;
  for (const member of members) {
    const id = member.trade ?? project.trade;
    for (const length of member.pieces) {
      const snapped = Math.round(length * 32) / 32;
      const key = `${member.kind}|${snapped}|${member.approx ? 1 : 0}|${id}|${member.buried ? 1 : 0}`;
      const row = cutMap.get(key);
      if (row) row.qty += 1;
      else {
        const base = member.kind === "post" ? "Post" : member.kind === "rail" ? "Rail" : "Brace";
        const buryNote = member.buried ? `, includes ${formatDecimal(member.buried)} underground` : "";
        cutMap.set(key, {
          key,
          kind: member.kind,
          length: snapped,
          qty: 1,
          approx: member.approx,
          label: `${base}${mixedPipe ? ` ${tradeById(id).label}` : ""}${buryNote}`,
        });
      }
    }
  }
  const kindOrder = { post: 0, rail: 1, brace: 2 };
  const cuts = [...cutMap.values()].sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || b.length - a.length);

  return {
    tradeLabel: trade.label,
    posts,
    rails,
    braces,
    members,
    fittings,
    issues: dedupeIssues(issues),
    cuts,
    bom,
    shimCount,
    shimCost,
    connectorCost,
    pipeInches,
    weightLb,
    sticks,
    wasteInches,
    conduitCost: project.stickPrice > 0 ? sticks * project.stickPrice : 0,
    packs,
    oneShimCount,
    straps,
    strapCost,
    hinges: hardware.hinges,
    hardware: hardware.lines,
    caps,
    capCost,
    width,
    depth,
    postHeight,
    postCount: posts.length,
    xs,
    zs,
    levels,
    alsoSold: ALSO_SOLD,
  };
}

function measureAxis(xs: number[], zs: number[], axis: "x" | "z", fittings: Fitting[], od: number, levels: number[]): AxisMeasure {
  const line = axis === "x" ? xs : zs;
  const centers = line.length ? line[line.length - 1] - line[0] : 0;
  if (centers <= 0 || line.length < 2) {
    return {
      centers,
      fittingOutside: od,
      fittingInside: 0,
      pipeOutside: od,
      pipeClear: 0,
    };
  }
  const y = levels[0];
  const outwardNeg: Vec3 = axis === "x" ? [-1, 0, 0] : [0, 0, -1];
  const outwardPos: Vec3 = axis === "x" ? [1, 0, 0] : [0, 0, 1];
  const origin = axis === "x" ? [line[0], y ?? 0, zs[0] ?? 0] : [xs[0] ?? 0, y ?? 0, line[0]];
  const far = axis === "x" ? [line[line.length - 1], y ?? 0, zs[0] ?? 0] : [xs[0] ?? 0, y ?? 0, line[line.length - 1]];
  const left = extension(fittings, origin as Vec3, outwardNeg, od / 2, y);
  const right = extension(fittings, far as Vec3, outwardPos, od / 2, y);
  const leftIn = extension(fittings, origin as Vec3, outwardNeg, od / 2, y, "inner");
  const rightIn = extension(fittings, far as Vec3, outwardPos, od / 2, y, "inner");
  return {
    centers,
    fittingOutside: centers + left + right,
    fittingInside: Math.max(0, centers - leftIn - rightIn),
    pipeOutside: centers + od,
    pipeClear: Math.max(0, centers - od),
  };
}

function extension(
  fittings: Fitting[],
  post: Vec3,
  outward: Vec3,
  fallback: number,
  y: number | undefined,
  field: "outer" | "inner" = "outer",
): number {
  let best = fallback;
  let found = false;
  for (const f of fittings) {
    if (f.approx || f.sku === "flange" || f.sku === "coupling") continue;
    if (y != null && Math.abs(f.position[1] - y) > 0.2) continue;
    if (Math.hypot(f.position[0] - post[0], f.position[2] - post[2]) > 0.2) continue;
    for (const br of f.branches) {
      const dot = br.dir[0] * outward[0] + br.dir[1] * outward[1] + br.dir[2] * outward[2];
      if (dot < -0.8) {
        found = true;
        best = Math.max(best, field === "outer" ? br.outer : br.inner);
      }
    }
  }
  return found ? best : fallback;
}

function dedupeIssues(issues: Issue[]): Issue[] {
  const seen = new Set<string>();
  const out: Issue[] = [];
  for (const issue of issues) {
    if (seen.has(issue.text)) continue;
    seen.add(issue.text);
    out.push(issue);
  }
  return out;
}

const MIN_BAY = 6;

function round32(n: number): number {
  return Math.round(n * 32) / 32;
}

/** Keep each bay's share of the run, snapped to 1/32", summing to `targetSum`. */
export function distribute(bays: number[], targetSum: number): number[] {
  if (bays.length === 0) return [];
  const target = round32(Math.max(0, targetSum));
  const sum = bays.reduce((s, n) => s + n, 0);
  const weights = sum > 0 ? bays.map((b) => b / sum) : bays.map(() => 1 / bays.length);
  const out: number[] = [];
  let used = 0;
  for (let i = 0; i < weights.length - 1; i += 1) {
    const piece = Math.max(MIN_BAY, round32(weights[i] * target));
    out.push(piece);
    used += piece;
  }
  out.push(round32(target - used));
  if (out[out.length - 1] < MIN_BAY - 1e-6) {
    const even = round32(target / bays.length);
    const evenOut = Array.from({ length: bays.length - 1 }, () => even);
    evenOut.push(round32(target - even * (bays.length - 1)));
    return evenOut;
  }
  return out;
}

/** Resize center-to-center bays so the finished outside measurement lands on `targetOutside`. */
export function baysMatchingOutside(project: Project, axis: "x" | "z", targetOutside: number): Partial<Project> {
  const grid: Project = { ...project, mode: "grid" };
  const key = axis === "x" ? "baysX" : "baysZ";
  const seeded: Project =
    grid[key].length > 0 ? grid : { ...grid, [key]: [Math.max(MIN_BAY, targetOutside)] };
  const built = buildProject(seeded);
  const measure = axis === "x" ? built.width : built.depth;
  const bays = seeded[key];
  const overhang = measure.centers > 0 ? measure.fittingOutside - measure.centers : 0;
  const centers = Math.max(MIN_BAY * bays.length, targetOutside - overhang);
  return { [key]: distribute(bays, centers) };
}

export function resizeBays(bays: number[], count: number): number[] {
  const n = Math.max(0, Math.min(12, Math.round(count)));
  if (n === bays.length) return bays.slice();
  if (n === 0) return [];
  const sum = bays.reduce((s, b) => s + b, 0);
  return distribute(
    Array.from({ length: n }, () => 1),
    Math.max(sum, MIN_BAY * n),
  );
}

/** Change how many bays are on one axis. A new run starts at 24" outside; the other axis keeps its outside size when fittings change. */
export function withAxisCount(
  project: Project,
  axis: "x" | "z",
  count: number,
  keptOutside: { x: number; z: number },
): Pick<Project, "baysX" | "baysZ"> {
  const key = axis === "x" ? "baysX" : "baysZ";
  const otherAxis: "x" | "z" = axis === "x" ? "z" : "x";
  const otherKey = otherAxis === "x" ? "baysX" : "baysZ";
  const mine = project[key];
  const n = Math.max(0, Math.min(12, Math.round(count)));
  if (n === 0 && project[otherKey].length === 0) return { baysX: project.baysX, baysZ: project.baysZ };
  const wasEmpty = mine.length === 0;
  const nowEmpty = n === 0;
  let draft: Project = { ...project, [key]: nowEmpty ? [] : wasEmpty ? Array.from({ length: n }, () => 24) : resizeBays(mine, n) };
  if (wasEmpty !== nowEmpty) {
    if (!nowEmpty) draft = { ...draft, ...baysMatchingOutside(draft, axis, 24) };
    if (draft[otherKey].length) draft = { ...draft, ...baysMatchingOutside(draft, otherAxis, keptOutside[otherAxis]) };
  }
  return { baysX: draft.baysX, baysZ: draft.baysZ };
}

export type SheetItem = {
  no: number;
  name: string;
  detail: string;
  qty: number;
  unitPrice: number | null;
  extension: number | null;
  /** Fitting this row balloons on the side views. Null for tube, shims, and straps. */
  fittingSku: Sku | null;
  /** Set when one sku is bought in more than one EMT size. */
  fittingTradeLabel: string | null;
  kind: "emt" | "fitting" | "shim" | "strap" | "cap" | "hinge";
};

export type SheetIndex = {
  items: SheetItem[];
  /** member id → P1, R2, B1. These marks are on the side views and the cut sheets. */
  marks: Map<string, string>;
  /** fitting id → parts-list number. */
  fittingItem: Map<string, number>;
  strapNo: number | null;
  couplingNo: number | null;
  /** Clamps, shims, and straps. Tube is separate until a stick price is entered. */
  partsTotal: number;
  conduitTotal: number;
  conduitPriced: boolean;
  /** Parts, plus conduit when a stick price is entered. */
  jobTotal: number;
};

const SHEET_SKU_ORDER: Sku[] = ["T", "90", "180", "4way", "5way", "45", "hinge", "flange", "coupling", "cross"];

function cents(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Numbers and piece marks shared by the side views, the buy list, and the cut sheets. */
export function sheetIndex(project: Project, build: Build, unit: "in" | "ft" = "in"): SheetIndex {
  const items: SheetItem[] = [];
  const push = (item: Omit<SheetItem, "no">) => {
    items.push({ ...item, no: items.length + 1 });
  };
  for (const pack of build.packs) {
    const unitPrice = project.stickPrice > 0 ? project.stickPrice : null;
    push({
      name: `${pack.label} EMT, ${stickName(project.stick)} sticks`,
      detail: unitPrice == null ? `${formatLen(pack.inches, unit)} of tube · enter a stick price to cost it` : `${formatLen(pack.inches, unit)} of tube`,
      qty: pack.sticks,
      unitPrice,
      extension: unitPrice == null ? null : cents(unitPrice * pack.sticks),
      fittingSku: null,
      fittingTradeLabel: null,
      kind: "emt",
    });
  }
  const bom = [...build.bom].sort((a, b) => {
    const order = SHEET_SKU_ORDER.indexOf(a.sku) - SHEET_SKU_ORDER.indexOf(b.sku);
    return order !== 0 ? order : a.name.localeCompare(b.name);
  });
  for (const line of bom) {
    const fittingTradeLabel = line.name.includes("·") ? (line.name.split("·").pop()?.trim() ?? null) : null;
    push({
      name: line.name,
      detail: line.purchasable
        ? `${money(line.unitPrice)} each${line.shimsEach ? ` · ${line.shimsEach} shim${line.shimsEach === 1 ? "" : "s"} each` : ""}`
        : "Not sold for this size",
      qty: line.qty,
      unitPrice: line.purchasable ? line.unitPrice : null,
      extension: line.purchasable ? cents(line.qty * line.unitPrice) : null,
      fittingSku: line.sku,
      fittingTradeLabel,
      kind: "fitting",
    });
  }
  if (build.shimCount > 0) {
    push({
      name: '3/4" to 1/2" adapter shim',
      detail: `${money(SHIM_PRICE)} each · a 1/2" pipe in a 3/4" clamp needs one`,
      qty: build.shimCount,
      unitPrice: SHIM_PRICE,
      extension: cents(build.shimCount * SHIM_PRICE),
      fittingSku: null,
      fittingTradeLabel: null,
      kind: "shim",
    });
  }
  if (build.oneShimCount > 0) {
    push({
      name: '1" to 3/4" adapter shim',
      detail: `${money(ONE_SHIM_PRICE)} each · one for every 3/4" pipe a 1" clamp grabs`,
      qty: build.oneShimCount,
      unitPrice: ONE_SHIM_PRICE,
      extension: cents(build.oneShimCount * ONE_SHIM_PRICE),
      fittingSku: null,
      fittingTradeLabel: null,
      kind: "shim",
    });
  }
  if (build.straps.length > 0) {
    push({
      name: "One-hole strap",
      detail: `${money(STRAP_PRICE)} each · pack of 4 is ${money(STRAP_PRICE * 4)}. Does not change the cut.`,
      qty: build.straps.length,
      unitPrice: STRAP_PRICE,
      extension: cents(build.strapCost),
      fittingSku: null,
      fittingTradeLabel: null,
      kind: "strap",
    });
  }
  for (const line of build.caps) {
    push({
      name: `${line.label} end cap`,
      detail: `${money(line.unitPrice)} each · sold in packs of ${CAP_PACK} for ${money(line.packPrice)}. Taps into an open end.`,
      qty: line.qty,
      unitPrice: line.unitPrice,
      extension: cents((line.qty * line.packPrice) / CAP_PACK),
      fittingSku: null,
      fittingTradeLabel: null,
      kind: "cap",
    });
  }
  for (const line of build.hardware) {
    push({
      name: line.name,
      detail: line.detail,
      qty: line.qty,
      unitPrice: line.purchasable ? line.unitPrice : null,
      extension: line.purchasable ? cents(line.qty * line.unitPrice) : null,
      fittingSku: null,
      fittingTradeLabel: null,
      kind: "hinge",
    });
  }

  const fittingItem = new Map<string, number>();
  for (const fitting of build.fittings) {
    const matches = items.filter((item) => item.fittingSku === fitting.sku);
    const tradeLabel = tradeById(fitting.trade ?? project.trade).label;
    const hit = matches.length <= 1 ? matches[0] : (matches.find((item) => item.fittingTradeLabel === tradeLabel) ?? matches[0]);
    if (hit) fittingItem.set(fitting.id, hit.no);
  }
  const marks = new Map<string, string>();
  const counts = { post: 0, rail: 0, brace: 0 };
  const prefix = { post: "P", rail: "R", brace: "B" } as const;
  for (const member of build.members) {
    counts[member.kind] += 1;
    marks.set(member.id, `${prefix[member.kind]}${counts[member.kind]}`);
  }
  const partsTotal = cents(items.filter((item) => item.kind !== "emt").reduce((sum, item) => sum + (item.extension ?? 0), 0));
  const conduitTotal = cents(items.filter((item) => item.kind === "emt").reduce((sum, item) => sum + (item.extension ?? 0), 0));
  return {
    items,
    marks,
    fittingItem,
    strapNo: items.find((item) => item.kind === "strap")?.no ?? null,
    couplingNo: items.find((item) => item.fittingSku === "coupling")?.no ?? null,
    partsTotal,
    conduitTotal,
    conduitPriced: project.stickPrice > 0,
    jobTotal: cents(partsTotal + conduitTotal),
  };
}

export function reportText(project: Project, build: Build, unit: "in" | "ft"): string {
  const L = (n: number) => formatLen(n, unit);
  const lines: string[] = [];
  lines.push(`${project.name} — Clampwright${project.mode === "sketch" ? " · free build" : ""}`);
  lines.push(`${build.tradeLabel} EMT · ${stickName(project.stick)} sticks`);
  lines.push("");
  lines.push("Overall (posts on center, then MakerPipe outside-to-outside). Underground length is not included here.");
  lines.push(`Width centers ${L(build.width.centers)} · fitting outside ${L(build.width.fittingOutside)} · pipe outside ${L(build.width.pipeOutside)} · clear ${L(build.width.pipeClear)}`);
  if (build.depth.centers > 0) {
    lines.push(`Depth centers ${L(build.depth.centers)} · fitting outside ${L(build.depth.fittingOutside)} · pipe outside ${L(build.depth.pipeOutside)} · clear ${L(build.depth.pipeClear)}`);
  }
  lines.push(`Posts ${L(build.postHeight)} · ${build.postCount} posts`);
  lines.push("");
  lines.push("Cut list");
  for (const row of build.cuts) {
    lines.push(`${row.qty} × ${L(row.length)}  ${row.label}${row.approx ? " (approx)" : ""}   ${formatDecimal(row.length)}`);
  }
  lines.push("");
  const sheet = sheetIndex(project, build, unit);
  lines.push("Piece marks — the same P, R, and B marks are on each side view and on the cut sheets.");
  if (!build.members.length) lines.push("No pipe yet.");
  for (const member of build.members) {
    const mark = sheet.marks.get(member.id) ?? "";
    const cuts = member.pieces.length ? member.pieces.map((piece) => L(piece)).join(" + ") : L(member.metal);
    lines.push(`${mark}  ${member.label}${member.approx ? " (approx)" : ""}  cut ${cuts}`);
  }
  lines.push("");
  lines.push(
    `${build.sticks} stick${build.sticks === 1 ? "" : "s"} · ${formatDecimal(build.pipeInches)} of tube · ${build.weightLb.toFixed(1)} lb · ${formatDecimal(build.wasteInches)} offcut`,
  );
  if (build.packs.length > 1) {
    for (const pack of build.packs) lines.push(`${pack.label}: ${pack.sticks} × ${stickName(project.stick)}`);
  }
  lines.push("Stick count includes 1/8\" kerf between pieces cut from the same stick.");
  if (build.posts.some((post) => (post.buried ?? 0) > 0)) {
    lines.push("Post cuts include the underground length. The size on screen stays above the floor.");
  }
  lines.push("");
  lines.push("Parts — circled numbers on the side views match this list.");
  if (!sheet.items.length) lines.push("No parts yet.");
  for (const item of sheet.items) {
    const each = item.unitPrice == null ? "" : ` @ ${money(item.unitPrice)}`;
    const ext = item.extension == null ? "not priced" : money(item.extension);
    lines.push(`${item.no}.  ${item.qty} × ${item.name}${each}  ${ext}`);
  }
  lines.push(`Fittings and hardware  ${money(sheet.partsTotal)}`);
  lines.push(sheet.conduitPriced ? `Conduit  ${money(sheet.conduitTotal)}` : "Conduit  not priced (enter a price per stick)");
  lines.push(`Job total  ${money(sheet.jobTotal)}`);
  lines.push("");
  lines.push("Cuts for T, 90°, 180°, 4-way, 5-way, and couplings follow MakerPipe's conduit length calculator.");
  lines.push("A rail cut is the tube after each end seats in the clamp. The center-to-center length is longer than the piece you cut. Posts run through, so clamps do not shorten them.");
  lines.push("Brace cuts are estimates. This planner is not affiliated with MakerPipe.");
  return lines.join("\n");
}

/** Inches from the start of a rail, or halfway. Clamped so the joint stays on the pipe. */
export function hostOffsetT(span: number, inches: number | "center"): number {
  if (!(span > 1)) return 0.5;
  if (inches === "center") return 0.5;
  return Math.min(0.92, Math.max(0.08, inches / span));
}

type FortyFiveLayout = {
  error: string | null;
  /** Height of the chosen pipe's two ends, in stop order. */
  y: [number, number];
  /** Joints that have to slide along a rail so the pipe actually hits 45°. */
  hosts: { id: string; hostT: number }[];
};

function endSamples(
  node: SketchNode,
  byId: Map<string, SketchNode>,
  links: SketchLink[],
): { x: number; y: number; z: number; hostT?: number }[] {
  if (!node.host) {
    const top = node.height - 1;
    if (top < 1.25) return [];
    const out: { x: number; y: number; z: number }[] = [];
    for (let y = 1.25; y <= top + 1e-6; y += 0.5) {
      out.push({ x: node.x, y: Math.min(top, round32(y)), z: node.z });
    }
    const last = out[out.length - 1];
    if (!last || Math.abs(last.y - top) > 0.05) out.push({ x: node.x, y: round32(top), z: node.z });
    return out;
  }
  const link = links.find((item) => item.id === node.host);
  const ha = link ? byId.get(link.a) : undefined;
  const hb = link ? byId.get(link.b) : undefined;
  if (!link || !ha || !hb) return [];
  const [ya, yb] = endHeights(link);
  const y0 = ha.host ? ha.height : ya;
  const y1 = hb.host ? hb.height : yb;
  const out: { x: number; y: number; z: number; hostT: number }[] = [];
  for (let i = 0; i <= 40; i += 1) {
    const t = Math.round((0.1 + i * 0.02) * 100) / 100;
    out.push({
      x: ha.x + (hb.x - ha.x) * t,
      y: y0 + (y1 - y0) * t,
      z: ha.z + (hb.z - ha.z) * t,
      hostT: t,
    });
  }
  return out;
}

/**
 * Place the last pipe of a run on the fixed 45° connector.
 * Between posts the low end sits 1 1/4" up and the rise equals the run. Flip swaps which end is high.
 * A joint on a rail slides along that rail. Flip leans the diagonal the other way.
 */
export function fortyFiveLayout(
  project: Project,
  stops: { nodeId: string; y: number }[],
  flip: boolean,
  segment?: number,
  shift = 0,
): FortyFiveLayout {
  const none = (error: string, y: [number, number] = [0, 0]): FortyFiveLayout => ({ error, y, hosts: [] });
  if (stops.length < 2) return none("Pick two ends first.");
  const i0 = Math.min(stops.length - 2, Math.max(0, segment ?? stops.length - 2));
  const full = normalizeProject(project);
  const byId = new Map(full.nodes.map((node) => [node.id, node]));
  const names = sketchNames(full.nodes);
  const label = (id: string) => names.get(id) ?? "that joint";
  const pair = [stops[i0], stops[i0 + 1]];
  const a = byId.get(pair[0].nodeId);
  const b = byId.get(pair[1].nodeId);
  if (!a || !b || a.id === b.id) return none("A pipe needs two different ends.");
  const wanted = flip ? -1 : 1;
  const stamp = (list: { nodeId: string; y: number }[], yA: number, yB: number) =>
    list.map((stop, index) => {
      if (index === i0) return { ...stop, y: yA };
      if (index === i0 + 1) return { ...stop, y: yB };
      return stop;
    });

  if (!a.host && !b.host) {
    const span = Math.hypot(b.x - a.x, b.z - a.z);
    if (span < 6) {
      return none(`${label(a.id)} and ${label(b.id)} are too close. A clamp needs at least 6" between the two ends.`);
    }
    const low = round32(1.25 + Math.max(0, shift));
    const high = round32(low + span);
    const yA = flip ? high : low;
    const yB = flip ? low : high;
    const highNode = flip ? a : b;
    const lowNode = flip ? b : a;
    if (low > lowNode.height - 1 + 1e-6) {
      return none(
        `Post ${label(lowNode.id)} can't take the 45° clamp at ${formatDecimal(low)}. It is only ${formatDecimal(lowNode.height)} tall. The pipe was not placed.`,
        [yA, yB],
      );
    }
    if (high > highNode.height - 1 + 1e-6) {
      return none(
        `A 45° between these posts rises ${formatDecimal(span)}. Post ${label(highNode.id)} can't take the 45° clamp unless it is at least ${formatDecimal(span + 2.25)} tall, with an inch of pipe above the clamp. The pipe was not placed.`,
        [yA, yB],
      );
    }
    const trial = stamp(stops, yA, yB);
    const problem = railRunError(project, trial);
    if (problem) return none(problem, [yA, yB]);
    return { error: null, y: [yA, yB], hosts: [] };
  }

  const bothHosts = Boolean(a.host && b.host);
  const axis = a.host ? throughAxis(a, byId, full.links) : b.host ? throughAxis(b, byId, full.links) : ([b.x - a.x, 0, b.z - a.z] as Vec3);
  const axisA = throughAxis(a, byId, full.links);
  const axisB = throughAxis(b, byId, full.links);
  const samplesA = endSamples(a, byId, full.links);
  const samplesB = endSamples(b, byId, full.links);
  if (!samplesA.length || !samplesB.length) {
    return none("One of these ends can't take a 45° clamp — there isn't room on the pipe. The pipe was not placed.");
  }

  type Cand = {
    score: number;
    lean: number;
    delta: number;
    clearance: number;
    y: [number, number];
    hosts: { id: string; hostT: number }[];
  };
  let nearest: { score: number; angA: number; angB: number } | null = null;
  const cands: Cand[] = [];
  for (const sa of samplesA) {
    for (const sb of samplesB) {
      const vx = sb.x - sa.x;
      const vy = sb.y - sa.y;
      const vz = sb.z - sa.z;
      const len = Math.hypot(vx, vy, vz);
      if (len < 6) continue;
      const angA = meetAngle(axisA, [vx, vy, vz]);
      const angB = meetAngle(axisB, [-vx, -vy, -vz]);
      const score = Math.max(Math.abs(angA - 45), Math.abs(angB - 45));
      if (!nearest || score < nearest.score) nearest = { score, angA, angB };
      if (score > 8) continue;
      const along = vx * axis[0] + vz * axis[2];
      let lean = 1;
      if (bothHosts) {
        if (Math.abs(along) > 0.75) lean = Math.sign(along);
        else if (Math.abs(vy) > 0.75) lean = Math.sign(vy);
      } else if (Math.abs(vy) > 0.75) lean = Math.sign(vy);
      else if (Math.abs(along) > 0.75) lean = Math.sign(along);
      const hosts: { id: string; hostT: number }[] = [];
      if (sa.hostT != null) hosts.push({ id: a.id, hostT: sa.hostT });
      if (sb.hostT != null) hosts.push({ id: b.id, hostT: sb.hostT });
      const delta =
        (sa.hostT != null ? Math.abs(sa.hostT - (a.hostT ?? 0.5)) : Math.abs(sa.y - pair[0].y) / 48) +
        (sb.hostT != null ? Math.abs(sb.hostT - (b.hostT ?? 0.5)) : Math.abs(sb.y - pair[1].y) / 48);
      const clearance = Math.min(
        sa.hostT == null ? 1 : Math.min(sa.hostT, 1 - sa.hostT),
        sb.hostT == null ? 1 : Math.min(sb.hostT, 1 - sb.hostT),
      );
      cands.push({ score, lean, delta, clearance, y: [round32(sa.y), round32(sb.y)], hosts });
    }
  }

  const rank = (p: Cand, q: Cand) => p.score - q.score || p.delta - q.delta || q.clearance - p.clearance;
  const wantedCands = cands.filter((cand) => cand.lean === wanted).sort(rank);
  const otherCands = cands.filter((cand) => cand.lean !== wanted).sort(rank);
  const accept = (cand: Cand): string | null => {
    const hosts = new Map(cand.hosts.map((item) => [item.id, item.hostT]));
    const next: Project = hosts.size
      ? {
          ...project,
          nodes: (project.nodes ?? []).map((node) => {
            const hostT = hosts.get(node.id);
            return hostT == null ? node : { ...node, hostT };
          }),
        }
      : project;
    const trial = stamp(stops, cand.y[0], cand.y[1]);
    return railRunError(next, trial);
  };
  const firstLegal = (list: Cand[]): { cand: Cand; error: string | null } | null => {
    if (!list.length) return null;
    let firstError: string | null = null;
    for (const cand of list.slice(0, 30)) {
      const error = accept(cand);
      if (!error) return { cand, error: null };
      if (!firstError) firstError = error;
    }
    return { cand: list[0], error: firstError };
  };

  const hit = firstLegal(wantedCands);
  if (hit && !hit.error) return { error: null, y: hit.cand.y, hosts: hit.cand.hosts };
  const other = firstLegal(otherCands);
  if (other && !other.error) return none("That arrow doesn't put a 45° clamp on both ends. Use the other arrow. The pipe was not placed.");
  if (hit?.error) return none(`${hit.error} The pipe was not placed.`, hit.cand.y);
  if (nearest && nearest.score > 8) {
    const blame = (ang: number, node: SketchNode) => {
      if (Math.abs(ang - 45) <= 8) return null;
      const where = node.host && Math.abs(throughAxis(node, byId, full.links)[1]) <= 0.75 ? "horizontal" : "vertical";
      return `${label(node.id)} can't take a 45° clamp. The pipe meets that ${where} at ${Math.round(ang)}°, not 45°.`;
    };
    const aBad = blame(nearest.angA, a);
    const bBad = blame(nearest.angB, b);
    if (aBad || bBad) return none(`${[aBad, bBad].filter(Boolean).join(" ")} The pipe was not placed.`);
  }
  return none("A fixed 45° doesn't reach between these two. One end doesn't have room for the clamp. The pipe was not placed.");
}

function sketchNames(nodes: SketchNode[]): Map<string, string> {
  const real = nodes.filter((node) => !node.host && !node.tip).sort((a, b) => a.z - b.z || a.x - b.x);
  const names = new Map(real.map((node, i) => [node.id, colName(i)]));
  for (const node of nodes) {
    if (node.tip) names.set(node.id, "open end");
    else if (node.host) names.set(node.id, "joint");
  }
  return names;
}

function hostPoint(node: SketchNode, hostT: number, byId: Map<string, SketchNode>, links: SketchLink[]): Vec3 {
  const link = links.find((item) => item.id === node.host);
  const ha = link ? byId.get(link.a) : undefined;
  const hb = link ? byId.get(link.b) : undefined;
  if (!link || !ha || !hb) return [node.x, node.height, node.z];
  const [ya, yb] = endHeights(link);
  const y0 = ha.host ? ha.height : ya;
  const y1 = hb.host ? hb.height : yb;
  return [ha.x + (hb.x - ha.x) * hostT, y0 + (y1 - y0) * hostT, ha.z + (hb.z - ha.z) * hostT];
}

/** Arrows for one pipe. Up/down ride a post. Left/right ride a rail. */
export type FortyDir = "up" | "down" | "left" | "right";

export type FortyButton = {
  end: 0 | 1;
  dir: FortyDir;
  /** Lean this arrow selects. Clicking the active arrow slides the clamp further that way. */
  flip: boolean;
  label: string;
  title: string;
  active: boolean;
  at: Vec3;
  arrow: Vec3;
};

const FORTY_LABEL: Record<FortyDir, string> = { up: "↑", down: "↓", left: "←", right: "→" };

function fortyEndPoint(
  node: SketchNode,
  end: 0 | 1,
  layout: FortyFiveLayout,
  stopY: number,
  byId: Map<string, SketchNode>,
  links: SketchLink[],
): Vec3 {
  if (!node.host) return [node.x, layout.error ? stopY : layout.y[end] || stopY, node.z];
  const hostT = layout.hosts.find((item) => item.id === node.id)?.hostT ?? node.hostT ?? 0.5;
  return hostPoint(node, hostT, byId, links);
}

export function fortyFiveButtons(
  project: Project,
  stops: { nodeId: string; y: number }[],
  segment: number,
  lean: { flip: boolean; shift: number },
): FortyButton[] {
  if (stops.length < segment + 2) return [];
  const full = normalizeProject(project);
  const byId = new Map(full.nodes.map((node) => [node.id, node]));
  const names = sketchNames(full.nodes);
  const stopA = stops[segment];
  const stopB = stops[segment + 1];
  const a = byId.get(stopA.nodeId);
  const b = byId.get(stopB.nodeId);
  if (!a || !b || a.id === b.id) return [];
  const layouts = [false, true].map((flip) => fortyFiveLayout(project, stops, flip, segment, 0));
  const current = fortyFiveLayout(project, stops, lean.flip, segment, lean.shift);
  const ends = [
    { node: a, end: 0 as const, stopY: stopA.y },
    { node: b, end: 1 as const, stopY: stopB.y },
  ];
  const buttons: FortyButton[] = [];
  for (const { node, end, stopY } of ends) {
    const axis = throughAxis(node, byId, full.links);
    const vertical = !node.host || Math.abs(axis[1]) > 0.75;
    const at = fortyEndPoint(node, end, current, stopY, byId, full.links);
    const who = node.host ? "the rail" : (names.get(node.id) ?? "the post");
    if (vertical) {
      const yOf = (flip: boolean) => layouts[flip ? 1 : 0].y[end];
      const upFlip = yOf(true) === yOf(false) ? end === 0 : yOf(true) > yOf(false);
      const push = (dir: FortyDir, flip: boolean, arrow: Vec3) => {
        buttons.push({
          end,
          dir,
          flip,
          label: FORTY_LABEL[dir],
          title: dir === "up" ? `Up on ${who}` : `Down on ${who}`,
          active: lean.flip === flip,
          at,
          arrow,
        });
      };
      push("up", upFlip, [0, 1, 0]);
      push("down", !upFlip, [0, -1, 0]);
      continue;
    }
    const link = full.links.find((item) => item.id === node.host);
    const ha = link ? byId.get(link.a) : undefined;
    const hb = link ? byId.get(link.b) : undefined;
    const flat = ha && hb ? norm([hb.x - ha.x, 0, hb.z - ha.z]) : ([1, 0, 0] as Vec3);
    const tOf = (flip: boolean) => layouts[flip ? 1 : 0].hosts.find((item) => item.id === node.id)?.hostT ?? node.hostT ?? 0.5;
    const rightFlip = tOf(true) === tOf(false) ? true : tOf(true) > tOf(false);
    const startName = ha ? (names.get(ha.id) ?? "the start") : "the start";
    const endName = hb ? (names.get(hb.id) ?? "the end") : "the end";
    buttons.push({
      end,
      dir: "left",
      flip: !rightFlip,
      label: FORTY_LABEL.left,
      title: `Toward ${startName}`,
      active: lean.flip === !rightFlip,
      at,
      arrow: [-flat[0], 0, -flat[2]],
    });
    buttons.push({
      end,
      dir: "right",
      flip: rightFlip,
      label: FORTY_LABEL.right,
      title: `Toward ${endName}`,
      active: lean.flip === rightFlip,
      at,
      arrow: flat,
    });
  }
  return buttons;
}

type EndSlide = {
  id: string;
  kind: "post" | "rail";
  param: number;
  min: number;
  max: number;
  origin: Vec3;
  span: Vec3;
  axis: Vec3;
  inches: number;
};

function quadraticRoots(a: number, b: number, c: number): number[] {
  if (Math.abs(a) < 1e-8) {
    if (Math.abs(b) < 1e-8) return [];
    return [-c / b];
  }
  const disc = b * b - 4 * a * c;
  if (disc < -1e-4) return [];
  const s = Math.sqrt(Math.max(0, disc));
  const hi = (-b + s) / (2 * a);
  const lo = (-b - s) / (2 * a);
  return Math.abs(hi - lo) < 1e-6 ? [hi] : [hi, lo];
}

/** Parameter values where the brace from `fixed` to `origin + t * span` meets `axis` at 45°. */
function rootsAt45(origin: Vec3, span: Vec3, fixed: Vec3, axis: Vec3): number[] {
  const V0 = sub(origin, fixed);
  const p = dot(V0, axis);
  const q = dot(span, axis);
  const A = 2 * q * q - dot(span, span);
  const B = 4 * p * q - 2 * dot(V0, span);
  const C = 2 * p * p - dot(V0, V0);
  return quadraticRoots(A, B, C);
}

function pointOn(slide: EndSlide, param: number): Vec3 {
  return add(slide.origin, scale(slide.span, param));
}

function fortyAngles(a: Vec3, axisA: Vec3, b: Vec3, axisB: Vec3): boolean {
  const V = sub(b, a);
  if (vlen(V) < 6 - 1e-3) return false;
  return Math.abs(meetAngle(axisA, V) - 45) <= 0.85 && Math.abs(meetAngle(axisB, V) - 45) <= 0.85;
}

function slideFor(
  node: SketchNode,
  y: number,
  hostT: number | undefined,
  byId: Map<string, SketchNode>,
  links: SketchLink[],
): EndSlide | null {
  const axis = throughAxis(node, byId, links);
  if (!node.host) {
    const max = node.height - 1;
    if (max < 1.25) return null;
    return { id: node.id, kind: "post", param: y, min: 1.25, max, origin: [node.x, 0, node.z], span: [0, 1, 0], axis, inches: 1 };
  }
  const link = links.find((item) => item.id === node.host);
  const ha = link ? byId.get(link.a) : undefined;
  const hb = link ? byId.get(link.b) : undefined;
  if (!link || !ha || !hb) return null;
  const [ya, yb] = endHeights(link);
  const y0 = ha.host ? ha.height : ya;
  const y1 = hb.host ? hb.height : yb;
  const origin: Vec3 = [ha.x, y0, ha.z];
  const span: Vec3 = [hb.x - ha.x, y1 - y0, hb.z - ha.z];
  const inches = vlen(span) || 1;
  return {
    id: node.id,
    kind: "rail",
    param: hostT ?? node.hostT ?? 0.5,
    min: 0.1,
    max: 0.9,
    origin,
    span,
    axis,
    inches,
  };
}

/** The pose already stored on the stops, when it is already a true 45°. */
function exactForty(project: FullProject, stops: { nodeId: string; y: number }[], segment: number): FortyFiveLayout | null {
  const byId = new Map(project.nodes.map((node) => [node.id, node]));
  const nodeA = byId.get(stops[segment]?.nodeId ?? "");
  const nodeB = byId.get(stops[segment + 1]?.nodeId ?? "");
  if (!nodeA || !nodeB) return null;
  const slideA = slideFor(nodeA, nodeA.host ? nodeA.height : stops[segment].y, nodeA.hostT, byId, project.links);
  const slideB = slideFor(nodeB, nodeB.host ? nodeB.height : stops[segment + 1].y, nodeB.hostT, byId, project.links);
  if (!slideA || !slideB) return null;
  const pa = pointOn(slideA, slideA.param);
  const pb = pointOn(slideB, slideB.param);
  if (!fortyAngles(pa, slideA.axis, pb, slideB.axis)) return null;
  const hosts: { id: string; hostT: number }[] = [];
  if (nodeA.host) hosts.push({ id: nodeA.id, hostT: nodeA.hostT ?? 0.5 });
  if (nodeB.host) hosts.push({ id: nodeB.id, hostT: nodeB.hostT ?? 0.5 });
  return { error: null, y: [round32(pa[1]), round32(pb[1])], hosts };
}

/** Move one 45° clamp. The other end slides with it so both fittings stay at 45°. An illegal move does not change the pipe. */
export function nudgeFortyFive(
  project: Project,
  stops: { nodeId: string; y: number }[],
  segment: number,
  lean: { flip: boolean; shift: number },
  end: 0 | 1,
  dir: FortyDir,
): { lean: { flip: boolean; shift: number }; layout: FortyFiveLayout } {
  const stuck = (error: string): { lean: { flip: boolean; shift: number }; layout: FortyFiveLayout } => ({
    lean,
    layout: { error, y: [0, 0], hosts: [] },
  });
  const button = fortyFiveButtons(project, stops, segment, lean).find((item) => item.end === end && item.dir === dir);
  if (!button) return stuck("That arrow doesn't apply to this end.");
  if (!button.active) {
    const layout = fortyFiveLayout(project, stops, button.flip, segment, 0);
    return { lean: { flip: button.flip, shift: 0 }, layout };
  }
  const full = normalizeProject(project);
  const byId = new Map(full.nodes.map((node) => [node.id, node]));
  const nodeA = byId.get(stops[segment]?.nodeId ?? "");
  const nodeB = byId.get(stops[segment + 1]?.nodeId ?? "");
  if (!nodeA || !nodeB) return stuck("A pipe needs two different ends.");
  const base = exactForty(full, stops, segment) ?? fortyFiveLayout(project, stops, lean.flip, segment, lean.shift);
  if (base.error) return { lean, layout: base };
  const slideA = slideFor(nodeA, nodeA.host ? base.y[0] : base.y[0], base.hosts.find((item) => item.id === nodeA.id)?.hostT, byId, full.links);
  const slideB = slideFor(nodeB, base.y[1], base.hosts.find((item) => item.id === nodeB.id)?.hostT, byId, full.links);
  if (!slideA || !slideB) return stuck("One of these ends can't take a 45° clamp. The pipe was not moved.");
  const clicked = end === 0 ? slideA : slideB;
  const other = end === 0 ? slideB : slideA;
  const travel = norm(clicked.span);
  const sign = dot(travel, button.arrow) >= 0 ? 1 : -1;
  const settle = (slide: EndSlide, param: number) => (slide.kind === "post" ? round32(param) : round32(param * slide.inches) / slide.inches);
  let chosen: { a: number; b: number } | null = null;
  let refused = "";
  for (const step of [2, 1, 0.5]) {
    const raw = clicked.param + sign * (step / clicked.inches);
    if (raw < clicked.min - 1e-4 || raw > clicked.max + 1e-4) {
      refused = "That clamp is already as far as it can go that way. The pipe was not moved.";
      continue;
    }
    const moved = Math.min(clicked.max, Math.max(clicked.min, raw));
    const fixedPoint = pointOn(clicked, moved);
    const roots = [
      ...rootsAt45(other.origin, other.span, fixedPoint, clicked.axis),
      ...rootsAt45(other.origin, other.span, fixedPoint, other.axis),
    ];
    const rise = pointOn(slideB, slideB.param)[1] - pointOn(slideA, slideA.param)[1];
    let best: number | null = null;
    let bestScore = Infinity;
    for (const root of roots) {
      if (root < other.min - 1e-3 || root > other.max + 1e-3) continue;
      const t = Math.min(other.max, Math.max(other.min, root));
      const there = pointOn(other, t);
      const pa = end === 0 ? fixedPoint : there;
      const pb = end === 0 ? there : fixedPoint;
      if (!fortyAngles(pa, slideA.axis, pb, slideB.axis)) continue;
      const nextRise = pb[1] - pa[1];
      const score = Math.abs(t - other.param) * other.inches + (rise * nextRise < -0.5 ? 80 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = t;
      }
    }
    if (best == null) {
      refused = "That arrow keeps the pipe at 45° by moving the other clamp, and there isn't room on that pipe. The pipe was not moved.";
      continue;
    }
    const paramA = settle(slideA, end === 0 ? moved : best);
    const paramB = settle(slideB, end === 0 ? best : moved);
    const pa = pointOn(slideA, paramA);
    const pb = pointOn(slideB, paramB);
    if (!fortyAngles(pa, slideA.axis, pb, slideB.axis)) {
      refused = "That arrow keeps the pipe at 45° by moving the other clamp, and there isn't room on that pipe. The pipe was not moved.";
      continue;
    }
    const yA = round32(pa[1]);
    const yB = round32(pb[1]);
    const hosts: { id: string; hostT: number }[] = [];
    if (slideA.kind === "rail") hosts.push({ id: slideA.id, hostT: paramA });
    if (slideB.kind === "rail") hosts.push({ id: slideB.id, hostT: paramB });
    const hostMap = new Map(hosts.map((item) => [item.id, item.hostT]));
    const nextProject: Project = hostMap.size
      ? {
          ...project,
          nodes: (project.nodes ?? []).map((node) => {
            const hostT = hostMap.get(node.id);
            return hostT == null ? node : { ...node, hostT };
          }),
        }
      : project;
    const trial = stops.map((stop, index) => {
      if (index === segment) return { ...stop, y: yA };
      if (index === segment + 1) return { ...stop, y: yB };
      return stop;
    });
    const problem = railRunError(nextProject, trial);
    if (problem) {
      refused = `${problem} The pipe was not moved.`;
      continue;
    }
    const bothPosts = slideA.kind === "post" && slideB.kind === "post";
    chosen = { a: paramA, b: paramB };
    return {
      lean: { flip: lean.flip, shift: bothPosts ? round32(Math.min(yA, yB) - 1.25) : lean.shift },
      layout: { error: null, y: [yA, yB], hosts },
    };
  }
  if (!chosen) return stuck(refused || "That clamp can't move that way. The pipe was not moved.");
  return stuck("That clamp can't move that way. The pipe was not moved.");
}

/** @deprecated Use fortyFiveButtons. Kept so older calls still describe a lean. */
/** Why a proposed run of pipes cannot be built with MakerPipe fittings. Null when it can. */
export function railRunError(project: Project, stops: { nodeId: string; y: number }[]): string | null {
  const full = normalizeProject(project);
  if (stops.length < 2) return null;
  if (stops.length > 24) return "That's too many pipes for one run. Place these, then start another.";
  const byId = new Map(full.nodes.map((node) => [node.id, node]));
  const names = sketchNames(full.nodes);
  const label = (id: string) => names.get(id) ?? "that joint";
  const segments: { a: SketchNode; b: SketchNode; y: number; yB: number }[] = [];
  for (let i = 0; i < stops.length - 1; i += 1) {
    const a = byId.get(stops[i].nodeId);
    const b = byId.get(stops[i + 1].nodeId);
    if (!a || !b || a.id === b.id) return "A pipe needs two different ends.";
    const y = a.host ? a.height : stops[i].y;
    const yB = b.host ? b.height : stops[i + 1].y;
    if (Math.hypot(b.x - a.x, yB - y, b.z - a.z) < 6) {
      return `${label(a.id)} and ${label(b.id)} are too close. A clamp needs at least 6" between the two ends.`;
    }
    segments.push({ a, b, y, yB });
  }
  if (full.links.length + segments.length > 64) return "This frame can't hold that many pipes.";

  const pairKey = (a: string, b: string, y: number) => {
    const [p, q] = a < b ? [a, b] : [b, a];
    return `${p}|${q}|${Math.round(y * 4)}`;
  };
  const seen = new Set<string>();
  for (const link of full.links) {
    if (link.kind !== "rail") continue;
    seen.add(pairKey(link.a, link.b, endHeights(link)[0]));
  }
  for (const seg of segments) {
    if (Math.abs(seg.y - seg.yB) > 1 / 16) continue;
    const key = pairKey(seg.a.id, seg.b.id, seg.y);
    if (seen.has(key)) return `There's already a pipe from ${label(seg.a.id)} to ${label(seg.b.id)} at that height.`;
    seen.add(key);
  }

  for (const seg of segments) {
    for (const end of [seg.a, seg.b]) {
      if (!end.host) continue;
      const host = full.links.find((link) => link.id === end.host);
      const ha = host ? byId.get(host.a) : undefined;
      const hb = host ? byId.get(host.b) : undefined;
      if (!host || !ha || !hb) continue;
      const other = end.id === seg.a.id ? seg.b : seg.a;
      const otherY = end.id === seg.a.id ? seg.yB : seg.y;
      const endY = end.id === seg.a.id ? seg.y : seg.yB;
      const [hya, hyb] = endHeights(host);
      const hostVec: Vec3 = [hb.x - ha.x, (hb.host ? hb.height : hyb) - (ha.host ? ha.height : hya), hb.z - ha.z];
      const branch: Vec3 = [other.x - end.x, otherY - endY, other.z - end.z];
      const hostLen = Math.hypot(hostVec[0], hostVec[1], hostVec[2]) || 1;
      const branchLen = Math.hypot(branch[0], branch[1], branch[2]) || 1;
      const dot = Math.abs((hostVec[0] * branch[0] + hostVec[1] * branch[1] + hostVec[2] * branch[2]) / (hostLen * branchLen));
      if (dot > 0.92) {
        return `That pipe runs along ${label(ha.id)}–${label(hb.id)} instead of coming off it. A 45° leaves at an angle. Flip it, or move the joint along the rail.`;
      }
    }
    for (const node of full.nodes) {
      if (node.host || node.tip || node.id === seg.a.id || node.id === seg.b.id) continue;
      const dx = seg.b.x - seg.a.x;
      const dz = seg.b.z - seg.a.z;
      const len2 = dx * dx + dz * dz;
      if (len2 < 1) continue;
      const t = ((node.x - seg.a.x) * dx + (node.z - seg.a.z) * dz) / len2;
      if (t <= 0.08 || t >= 0.92) continue;
      const dist = Math.hypot(node.x - (seg.a.x + dx * t), node.z - (seg.a.z + dz * t));
      const y = seg.y + (seg.yB - seg.y) * t;
      if (dist <= 2 && y >= 1 && y <= node.height + 0.5) {
        return `This pipe runs through post ${label(node.id)}. Stop on that post so a clamp can grab it.`;
      }
    }
  }

  const saddles = new Map<string, Set<string>>();
  const occupy = (nodeId: string, y: number, dir: string, complain: boolean): string | null => {
    const key = `${nodeId}|${Math.round(y * 32)}`;
    const set = saddles.get(key) ?? new Set<string>();
    if (set.has(dir)) {
      if (!complain) return null;
      return `${label(nodeId)} already has a pipe in that direction at ${formatDecimal(y)}. A clamp has one opening each way. The biggest joint is a 5-way: the post, plus four pipes.`;
    }
    set.add(dir);
    saddles.set(key, set);
    return null;
  };
  const arms = (a: SketchNode, b: SketchNode, y: number, yB: number, complain: boolean): string | null => {
    const da = cardinalDir(b.x - a.x, b.z - a.z);
    const db = da ? cardinalDir(a.x - b.x, a.z - b.z) : null;
    if (!da || !db || Math.abs(y - yB) > 1 / 16) return null;
    return (a.tip ? null : occupy(a.id, y, da, complain)) ?? (b.tip ? null : occupy(b.id, yB, db, complain));
  };
  for (const link of full.links) {
    if (link.kind !== "rail") continue;
    const a = byId.get(link.a);
    const b = byId.get(link.b);
    if (!a || !b) continue;
    const [ya, yb] = endHeights(link);
    arms(a, b, ya, yb, false);
  }
  for (const seg of segments) {
    const problem = arms(seg.a, seg.b, seg.y, seg.yB, true);
    if (problem) return problem;
  }

  type Hit = { point: Vec3; ids: string[] };
  const hits: Hit[] = [];
  const lines = [
    ...full.links
      .filter((link) => link.kind === "rail")
      .map((link) => {
        const a = byId.get(link.a);
        const b = byId.get(link.b);
        const [ya, yb] = endHeights(link);
        return a && b
          ? { id: link.id, a: [a.x, ya, a.z] as Vec3, b: [b.x, yb, b.z] as Vec3, ends: [link.a, link.b] }
          : null;
      })
      .filter((line): line is { id: string; a: Vec3; b: Vec3; ends: string[] } => line != null),
    ...segments.map((seg, index) => ({
      id: `new-${index}`,
      a: [seg.a.x, seg.y, seg.a.z] as Vec3,
      b: [seg.b.x, seg.yB, seg.b.z] as Vec3,
      ends: [seg.a.id, seg.b.id],
    })),
  ];
  const fresh = lines.filter((line) => line.id.startsWith("new-"));
  const older = lines.filter((line) => !line.id.startsWith("new-"));
  for (let i = 0; i < fresh.length; i += 1) {
    const line = fresh[i];
    for (const other of [...older, ...fresh.slice(0, i)]) {
      if (line.ends.some((end) => other.ends.includes(end))) continue;
      const hit = closestSeg(line.a, line.b, other.a, other.b);
      if (hit.dist > 1.25 || hit.tp < 0.08 || hit.tp > 0.92 || hit.tq < 0.08 || hit.tq > 0.92) continue;
      const cluster = hits.find((item) => Math.hypot(item.point[0] - hit.point[0], item.point[1] - hit.point[1], item.point[2] - hit.point[2]) < 2);
      if (!cluster) {
        hits.push({ point: hit.point, ids: [line.id, other.id] });
        continue;
      }
      for (const id of [line.id, other.id]) if (!cluster.ids.includes(id)) cluster.ids.push(id);
    }
  }
  if (hits.some((hit) => hit.ids.length >= 3)) {
    return "Three pipes meet in one spot. A cross clamp only holds two, so move one of them.";
  }

  for (const seg of segments) {
    for (const [end, y] of [
      [seg.a, seg.y],
      [seg.b, seg.yB],
    ] as const) {
      if (end.host || end.tip) continue;
      if (y < 1.25) {
        return `A rail at ${formatDecimal(y)} on post ${label(end.id)} sits too close to the floor for the clamp to bite. Leave about 1" of pipe past the fitting.`;
      }
      const others: number[] = [];
      for (const link of full.links) {
        if (link.kind !== "rail") continue;
        if (link.a === end.id) others.push(endHeights(link)[0]);
        if (link.b === end.id) others.push(endHeights(link)[1]);
      }
      for (const other of segments) {
        if (other === seg) continue;
        if (other.a.id === end.id) others.push(other.y);
        if (other.b.id === end.id) others.push(other.yB);
      }
      for (const otherY of others) {
        const gap = Math.abs(otherY - y);
        if (gap >= 0.2 && gap < 2.15) {
          return `Post ${label(end.id)} would stack clamps at ${formatDecimal(Math.min(y, otherY))} and ${formatDecimal(Math.max(y, otherY))}. Keep centers at least 2 1/4" apart.`;
        }
      }
      const pipes: TradeId[] = [end.trade ?? full.trade, full.trade];
      for (const link of full.links) {
        if (link.kind !== "rail") continue;
        const here = link.a === end.id ? endHeights(link)[0] : link.b === end.id ? endHeights(link)[1] : null;
        if (here == null || Math.abs(here - y) > 0.25) continue;
        pipes.push(link.trade ?? full.trade);
      }
      if (largerTrade(pipes) === "one" && pipes.includes("half")) {
        return `Post ${label(end.id)} mixes 1" and 1/2" EMT. MakerPipe doesn't sell a shim that lets a 1" clamp grab 1/2" tube.`;
      }
    }
  }
  return null;
}

export type PlannedClamp = { id: string; sku: Sku; name: string; where: string };

/** Clamps a run would add, using the same rules as the built frame. */
export function previewRailRun(project: Project, stops: { nodeId: string; y: number }[]): {
  error: string | null;
  clamps: PlannedClamp[];
} {
  const error = railRunError(project, stops);
  if (error || stops.length < 2) return { error, clamps: [] };
  const full = normalizeProject(project);
  const byId = new Map(full.nodes.map((node) => [node.id, node]));
  const names = sketchNames(full.nodes);
  const links = [...full.links];
  const fresh = new Set<string>();
  for (let i = 0; i < stops.length - 1; i += 1) {
    const from = stops[i];
    const to = stops[i + 1];
    const a = byId.get(from.nodeId);
    const b = byId.get(to.nodeId);
    if (!a || !b) continue;
    const y = a.host ? a.height : Math.min(240, Math.max(1, from.y));
    const yB = b.host ? b.height : Math.min(240, Math.max(1, to.y));
    const level = Math.abs(y - yB) < 1 / 16;
    const id = `__new_${i}`;
    fresh.add(id);
    links.push({ id, a: a.id, b: b.id, y, yB: level ? undefined : yB, kind: "rail" });
  }
  const built = buildProject({ ...full, links });
  const wanted = new Map<string, number>();
  for (const stop of stops) {
    const node = byId.get(stop.nodeId);
    if (!node) continue;
    const y = node.host ? node.height : stop.y;
    wanted.set(stop.nodeId, y);
  }
  const clamps: PlannedClamp[] = [];
  for (const fitting of built.fittings) {
    if (fitting.sku === "flange" || fitting.sku === "coupling") continue;
    if (fitting.sku === "cross") {
      if (![...fresh].some((id) => fitting.id.includes(id))) continue;
      clamps.push({ id: fitting.id, sku: fitting.sku, name: CONNECTOR_MAP.cross.name, where: "where the pipes cross" });
      continue;
    }
    const touchesNew = [...fresh].some((id) => fitting.id.includes(id));
    let where = "";
    if (fitting.id.startsWith("fit:")) {
      const nodeId = fitting.id.slice(4, fitting.id.lastIndexOf(":"));
      const y = wanted.get(nodeId);
      if (y == null || Math.abs(fitting.position[1] - y) > 0.35) continue;
      const node = byId.get(nodeId);
      where = node?.host ? "on the rail" : `post ${names.get(nodeId) ?? ""}`.trim();
    } else if (touchesNew) {
      const parts = fitting.id.split(":");
      const link = links.find((item) => item.id === parts[1]);
      const nodeId = parts[2] === "b" ? link?.b : link?.a;
      const node = nodeId ? byId.get(nodeId) : undefined;
      where = node?.host ? "on the rail" : `post ${names.get(nodeId ?? "") ?? ""}`.trim();
    } else {
      continue;
    }
    clamps.push({ id: fitting.id, sku: fitting.sku, name: CONNECTOR_MAP[fitting.sku].name, where });
  }
  return { error: null, clamps };
}

export function selfCheck(): void {
  lumberSlideSelfCheck();
  loadSelfCheck();
  const base: Project = {
    id: "t",
    name: "check",
    trade: "three-quarter",
    stick: 120,
    kerf: 0.125,
    baysX: [46.875],
    baysZ: [],
    postHeight: 36,
    levels: [34],
    flanges: false,
    braces: false,
    showFigure: false,
    finish: "zinc",
    stickPrice: 0,
  };
  // Single bay, no depth → T at each end. Not the 90 case.
  // Two 90s need a depth bay so each corner has two arms.
  const corner: Project = { ...base, baysX: [46.875], baysZ: [24], levels: [34] };
  const built = buildProject(corner);
  const xRails = built.rails.filter((r) => r.label.startsWith("Width"));
  if (xRails.length !== 2) throw new Error(`expected 2 width rails, got ${xRails.length}`);
  const cut = xRails[0].pieces[0];
  // CTC 46.875, 90 setback 1.3125 each end → 44.25
  if (Math.abs(cut - 44.25) > 1e-6) throw new Error(`90 cut ${cut} !== 44.25`);
  if (Math.abs(built.width.fittingOutside - (46.875 + 0.5625 * 2)) > 1e-6) {
    throw new Error(`OTO ${built.width.fittingOutside}`);
  }
  if (built.bom.find((b) => b.sku === "90")?.qty !== 4) throw new Error("expected 4 corner 90s");

  const tee = buildProject({ ...base, baysX: [24], baysZ: [] });
  const teeCut = tee.rails[0].pieces[0];
  if (Math.abs(teeCut - 21.5) > 1e-6) throw new Error(`T cut ${teeCut} !== 21.5`);
  if (tee.bom.find((b) => b.sku === "T")?.qty !== 2) throw new Error("expected 2 Ts");

  const run = buildProject({ ...base, baysX: [24, 24], baysZ: [] });
  const total = run.rails.reduce((s, r) => s + r.metal, 0);
  // Official one-run: OTO 49.25 − two T ends 1.875 − one 180 middle 2.5625 = 42.9375
  if (Math.abs(total - 42.9375) > 1e-6) throw new Error(`180 run metal ${total} !== 42.9375`);
  if (run.bom.find((b) => b.sku === "180")?.qty !== 1) {
    throw new Error(`180 qty ${run.bom.find((b) => b.sku === "180")?.qty}`);
  }

  const grid = buildProject({ ...base, baysX: [24, 24], baysZ: [24, 24] });
  const five = grid.bom.find((b) => b.sku === "5way")?.qty ?? 0;
  const four = grid.bom.find((b) => b.sku === "4way")?.qty ?? 0;
  const ninety = grid.bom.find((b) => b.sku === "90")?.qty ?? 0;
  if (five !== 1 || four !== 4 || ninety !== 4) throw new Error(`grid fittings 5=${five} 4=${four} 90=${ninety}`);

  const inch = buildProject({ ...corner, trade: "one", baysX: [40], baysZ: [20] });
  const iCut = inch.rails.find((r) => r.label.startsWith("Width"))!.pieces[0];
  // 40 - 1.625 - 1.625 = 36.75; OTO subtract 2.375*2 = 40+0.75*2 - 4.75 = 36.75
  if (Math.abs(iCut - 36.75) > 1e-6) throw new Error(`1" cut ${iCut}`);

  const half = buildProject({ ...corner, trade: "half" });
  if (half.shimCount !== 4 * 3) throw new Error(`shims ${half.shimCount} expected 12`);
  if (half.oneShimCount !== 0) throw new Error(`half frame should not use a 1" shim, got ${half.oneShimCount}`);

  const pureOne = buildProject({ ...corner, trade: "one" });
  if (pureOne.oneShimCount !== 0) throw new Error(`pure 1" frame added ${pureOne.oneShimCount} shims`);

  const shimProject: Project = {
    ...base,
    mode: "sketch",
    trade: "one",
    nodes: [
      { id: "a", x: 0, z: 0, height: 36, flange: false },
      { id: "b", x: 48, z: 0, height: 36, flange: false },
    ],
    links: [{ id: "ab", a: "a", b: "b", y: 34, kind: "rail", trade: "three-quarter" }],
    baysX: [],
    baysZ: [],
    levels: [],
  };
  const mixedShim = buildProject(shimProject);
  if (mixedShim.oneShimCount !== 2) throw new Error(`1" clamp on 3/4" rail should take 2 shims, got ${mixedShim.oneShimCount}`);
  const shimSheet = sheetIndex(shimProject, mixedShim);
  const shimRow = shimSheet.items.find((item) => item.kind === "shim");
  if (!shimRow || shimRow.qty !== 2 || !shimRow.name.includes("3/4")) throw new Error(`buy list missing 1" shim (${shimSheet.items.map((item) => item.name).join(", ")})`);
  if (Math.abs((shimRow.extension ?? 0) - 2 * ONE_SHIM_PRICE) > 1e-6) throw new Error(`1" shim price ${shimRow.extension}`);

  const halfInOne = buildProject({
    ...shimProject,
    nodes: [
      { id: "a", x: 0, z: 0, height: 36, flange: false, trade: "half" },
      { id: "b", x: 48, z: 0, height: 36, flange: false },
    ],
    links: [{ id: "ab", a: "a", b: "b", y: 34, kind: "rail" }],
  });
  if (halfInOne.oneShimCount !== 0) throw new Error(`1/2" in a 1" clamp is not a shim, got ${halfInOne.oneShimCount}`);
  if (!halfInOne.issues.some((issue) => issue.text.includes("1/2"))) throw new Error("expected a warning that 1\" clamps do not shim onto 1/2\"");

  const bench = buildProject({
    ...base,
    baysX: [60],
    baysZ: [24],
    postHeight: 36,
    levels: [8, 35],
  });
  if (bench.sticks !== 4) throw new Error(`workbench sticks ${bench.sticks}, waste ${bench.wasteInches}`);
  const benchPipe = bench.members.flatMap((m) => m.pieces).reduce((s, n) => s + n, 0);
  const expectWaste = 4 * 120 - (benchPipe + 0.125 * (bench.members.flatMap((m) => m.pieces).length - 4));
  if (Math.abs(bench.wasteInches - expectWaste) > 0.05) throw new Error(`waste ${bench.wasteInches} vs ${expectWaste}`);

  const oneFlange = buildProject({ ...base, trade: "one", flanges: true });
  const flangeLine = oneFlange.bom.find((b) => b.sku === "flange");
  if (!flangeLine?.purchasable || flangeLine.unitPrice !== 5.95) throw new Error("1 inch flange should be the $5.95 MakerPipe variant");

  const long = buildProject({ ...base, baysX: [200], baysZ: [], postHeight: 48, levels: [40] });
  const rail = long.rails[0];
  if (rail.couplingCount < 1) throw new Error("expected a coupling on a 200 inch bay");
  const sumPieces = rail.pieces.reduce((s, n) => s + n, 0);
  if (Math.abs(sumPieces - (rail.metal - 0.75 * rail.couplingCount)) > 1e-4) {
    throw new Error(`coupled metal ${sumPieces} vs ${rail.metal}`);
  }

  const sized = baysMatchingOutside(corner, "x", 60);
  const sizedBuild = buildProject({ ...corner, ...sized });
  if (Math.abs(sizedBuild.width.fittingOutside - 60) > 1 / 64) {
    throw new Error(`outside width ${sizedBuild.width.fittingOutside}`);
  }
  const deep = baysMatchingOutside(corner, "z", 18);
  const deepBuild = buildProject({ ...corner, ...deep });
  if (Math.abs(deepBuild.depth.fittingOutside - 18) > 1 / 64) {
    throw new Error(`outside depth ${deepBuild.depth.fittingOutside}`);
  }
  const split = withAxisCount(corner, "x", 2, { x: built.width.fittingOutside, z: built.depth.fittingOutside });
  const splitBuild = buildProject({ ...corner, ...split });
  if (split.baysX.length !== 2) throw new Error("expected 2 width bays");
  if (Math.abs(splitBuild.width.fittingOutside - built.width.fittingOutside) > 1 / 32) {
    throw new Error(`split outside ${splitBuild.width.fittingOutside}`);
  }
  const flat = withAxisCount(corner, "z", 0, { x: built.width.fittingOutside, z: built.depth.fittingOutside });
  const flatBuild = buildProject({ ...corner, ...flat });
  if (flat.baysZ.length !== 0) throw new Error("depth should clear");
  if (Math.abs(flatBuild.width.fittingOutside - built.width.fittingOutside) > 1 / 32) {
    throw new Error(`flat width drifted to ${flatBuild.width.fittingOutside}`);
  }
  const boxed = withAxisCount(
    { ...corner, ...flat },
    "z",
    1,
    { x: flatBuild.width.fittingOutside, z: 24 },
  );
  const boxedBuild = buildProject({ ...corner, ...flat, ...boxed });
  if (Math.abs(boxedBuild.depth.fittingOutside - 24) > 1 / 32) throw new Error(`new depth ${boxedBuild.depth.fittingOutside}`);
  if (Math.abs(boxedBuild.width.fittingOutside - flatBuild.width.fittingOutside) > 1 / 32) {
    throw new Error(`width drifted when depth returned ${boxedBuild.width.fittingOutside}`);
  }

  const samples: Array<[string, number]> = [
    ["48", 48],
    ["4'", 48],
    ["4' 6\"", 54],
    ["6 1/2", 6.5],
    ["44 1/4\"", 44.25],
    ["3' 0\"", 36],
    ["5/8", 0.625],
  ];
  for (const [raw, expect] of samples) {
    const got = parseLength(raw);
    if (got == null || Math.abs(got - expect) > 1e-6) throw new Error(`parse ${raw} → ${got}`);
  }
  if (parseLength("nope") !== null) throw new Error("parse nope");

  const sketch = buildProject({
    ...base,
    mode: "sketch",
    nodes: [
      { id: "a", x: 0, z: 0, height: 36, flange: false },
      { id: "b", x: 48, z: 0, height: 36, flange: false },
      { id: "c", x: 0, z: 24, height: 36, flange: false },
    ],
    links: [
      { id: "ab", a: "a", b: "b", y: 34, kind: "rail" },
      { id: "ac", a: "a", b: "c", y: 34, kind: "rail" },
    ],
    railHeight: 34,
    baysX: [],
    baysZ: [],
    levels: [],
  });
  const ab = sketch.rails.find((r) => r.id === "rail:ab");
  if (!ab || Math.abs(ab.pieces[0] - 45.4375) > 1e-6) throw new Error(`sketch L cut ${ab?.pieces[0]}`);
  if (sketch.bom.find((b) => b.sku === "90")?.qty !== 1) throw new Error("sketch corner should be one 90");
  if (sketch.bom.find((b) => b.sku === "T")?.qty !== 2) throw new Error("sketch ends should be two Ts");

  const blown = explodeGrid(corner);
  const blownBuild = buildProject({ ...corner, mode: "sketch", nodes: blown.nodes, links: blown.links, railHeight: blown.railHeight });
  const blownCut = blownBuild.rails.find((r) => r.label.startsWith("Rail"))?.pieces[0];
  if (blownCut == null || Math.abs(blownCut - 44.25) > 1e-6) throw new Error(`exploded cut ${blownCut}`);
  if ((blownBuild.bom.find((b) => b.sku === "90")?.qty ?? 0) !== 4) throw new Error("exploded frame should keep 4 corners");

  const diag = buildProject({
    ...base,
    mode: "sketch",
    nodes: [
      { id: "a", x: 0, z: 0, height: 36, flange: false },
      { id: "b", x: 30, z: 40, height: 36, flange: false },
    ],
    links: [{ id: "ab", a: "a", b: "b", y: 30, kind: "rail" }],
    baysX: [],
    baysZ: [],
    levels: [],
  });
  if (diag.rails[0]?.approx !== true) throw new Error("diagonal rail should be approximate");
  if (Math.abs((diag.rails[0]?.pieces[0] ?? 0) - 47.5) > 1e-6) throw new Error(`diagonal cut ${diag.rails[0]?.pieces[0]}`);
  if ((diag.bom.find((b) => b.sku === "hinge")?.qty ?? 0) !== 2) throw new Error("diagonal should be two hinges");

  const slope = buildProject({
    ...base,
    mode: "sketch",
    nodes: [
      { id: "a", x: 0, z: 0, height: 48, flange: false },
      { id: "b", x: 48, z: 0, height: 48, flange: false },
    ],
    links: [{ id: "ab", a: "a", b: "b", y: 12, yB: 36, kind: "rail" }],
    baysX: [],
    baysZ: [],
    levels: [],
  });
  const sloped = slope.rails[0];
  const expect = Math.hypot(48, 24) - 2.5;
  if (!sloped?.approx || Math.abs((sloped.pieces[0] ?? 0) - expect) > 1e-6) throw new Error(`slope cut ${sloped?.pieces[0]}`);
  if ((slope.bom.find((b) => b.sku === "hinge")?.qty ?? 0) !== 2) throw new Error("sloped rail should be two hinges");

  const forty = buildProject({
    ...base,
    mode: "sketch",
    nodes: [
      { id: "a", x: 0, z: 0, height: 72, flange: false },
      { id: "b", x: 36, z: 0, height: 72, flange: false },
    ],
    links: [{ id: "ab", a: "a", b: "b", y: 8, yB: 44, kind: "rail" }],
    baysX: [],
    baysZ: [],
    levels: [],
  });
  if ((forty.bom.find((b) => b.sku === "45")?.qty ?? 0) !== 2) throw new Error("45° slope should be two 45s");

  const levelLinks: SketchLink[] = [{ id: "ab", a: "a", b: "b", y: 30, kind: "rail" }];
  const movedClamp = moveClamp(levelLinks, "fit:a:960", 18, 30);
  const movedLink = movedClamp.links[0];
  if (!movedLink || movedLink.y !== 18 || movedLink.yB !== 30) throw new Error(`clamp move ${movedLink?.y}/${movedLink?.yB}`);
  if (movedClamp.selectedId !== "hinge:ab:a") throw new Error(`clamp select ${movedClamp.selectedId}`);
  const back = moveClamp(movedClamp.links, "hinge:ab:a", 30, 18);
  if (back.links[0]?.y !== 30 || back.links[0]?.yB != null) throw new Error("clamp should level again");

  const buried = buildProject({
    ...base,
    mode: "sketch",
    nodes: [{ id: "a", x: 0, z: 0, height: 36, flange: false, bury: 12 }],
    links: [],
    baysX: [],
    baysZ: [],
    levels: [],
  });
  const buriedPost = buried.posts[0];
  if (!buriedPost || Math.abs(buriedPost.span - 36) > 1e-6 || Math.abs((buriedPost.pieces[0] ?? 0) - 48) > 1e-6) {
    throw new Error(`bury cut ${buriedPost?.pieces[0]} span ${buriedPost?.span}`);
  }
  if (Math.abs(buried.postHeight - 36) > 1e-6) throw new Error("bury should not change the height on screen");

  const crossed = buildProject({
    ...base,
    mode: "sketch",
    nodes: [
      { id: "a", x: 0, z: 0, height: 36, flange: false },
      { id: "b", x: 48, z: 0, height: 36, flange: false },
      { id: "c", x: 24, z: -24, height: 36, flange: false },
      { id: "d", x: 24, z: 24, height: 36, flange: false },
    ],
    links: [
      { id: "ab", a: "a", b: "b", y: 34, kind: "rail" },
      { id: "cd", a: "c", b: "d", y: 34, kind: "rail" },
    ],
    baysX: [],
    baysZ: [],
    levels: [],
  });
  const abRail = crossed.rails.find((rail) => rail.id === "rail:ab");
  const cdRail = crossed.rails.find((rail) => rail.id === "rail:cd");
  if (!abRail || abRail.pieces.length !== 2) throw new Error(`cross split ${abRail?.pieces.length}`);
  if (!cdRail || cdRail.pieces.length !== 2) throw new Error(`cross mate ${cdRail?.pieces.length}`);
  if (Math.abs(abRail.pieces[0] + abRail.pieces[1] - abRail.metal) > 1e-4) throw new Error("cross pieces should sum to the rail");
  if ((crossed.bom.find((line) => line.sku === "cross")?.qty ?? 0) !== 1) throw new Error("expected one cross clamp");

  const hosted = buildProject({
    ...base,
    mode: "sketch",
    nodes: [
      { id: "a", x: 0, z: 0, height: 36, flange: false },
      { id: "b", x: 48, z: 0, height: 36, flange: false },
      { id: "c", x: 24, z: 30, height: 36, flange: false },
      { id: "h", x: 24, z: 0, height: 34, flange: false, host: "ab", hostT: 0.5 },
    ],
    links: [
      { id: "ab", a: "a", b: "b", y: 34, kind: "rail" },
      { id: "ch", a: "c", b: "h", y: 34, kind: "rail" },
    ],
    baysX: [],
    baysZ: [],
    levels: [],
  });
  if (hosted.postCount !== 3) throw new Error(`host should not be a post, got ${hosted.postCount}`);
  const through = hosted.rails.find((rail) => rail.id === "rail:ab");
  if (!through || through.pieces.length !== 1 || Math.abs(through.pieces[0] - 45.5) > 1e-4) {
    throw new Error(`through rail ${through?.pieces.join(",")}`);
  }
  const branch = hosted.rails.find((rail) => rail.id === "rail:ch");
  if (!branch || Math.abs((branch.pieces[0] ?? 0) - 27.5) > 1e-4) throw new Error(`branch cut ${branch?.pieces[0]}`);
  if ((hosted.bom.find((line) => line.sku === "T")?.qty ?? 0) !== 4) throw new Error("mid-rail joint should be a T");
  if (hosted.issues.some((issue) => issue.text.includes("inch of pipe") || issue.text.includes("left off"))) {
    throw new Error(`host warnings ${hosted.issues.map((issue) => issue.text).join(" | ")}`);
  }

  const on10 = buildProject({ ...base, stick: 120, baysX: [110], baysZ: [], postHeight: 80, levels: [34] });
  const on8 = buildProject({ ...base, stick: 96, baysX: [110], baysZ: [], postHeight: 80, levels: [34] });
  if (on10.sticks !== 3) throw new Error(`10 ft sticks ${on10.sticks}`);
  if (on8.rails[0]?.pieces.length !== 2) throw new Error(`8 ft should split the long rail, got ${on8.rails[0]?.pieces.length}`);
  if (on8.sticks !== 4) throw new Error(`8 ft sticks ${on8.sticks}`);

  const widthRail = xRails[0];
  if (Math.abs(widthRail.setbackA - 1.3125) > 1e-6 || Math.abs(widthRail.setbackB - 1.3125) > 1e-6) {
    throw new Error(`90 setback ${widthRail.setbackA}/${widthRail.setbackB}`);
  }
  if (widthRail.seatA !== "90°" || widthRail.seatB !== "90°") throw new Error(`90 seat ${widthRail.seatA}`);
  if (Math.abs(widthRail.metal - (widthRail.span - widthRail.setbackA - widthRail.setbackB)) > 1e-6) {
    throw new Error("rail metal should be the span minus both seats");
  }

  const barePost: Project = {
    ...base,
    mode: "sketch",
    nodes: [{ id: "a", x: 0, z: 0, height: 36, flange: false }],
    links: [],
    baysX: [],
    baysZ: [],
    levels: [],
  };
  const open = buildProject(barePost);
  const wood = buildProject({
    ...barePost,
    straps: [
      { id: "s1", memberId: "post:a", at: 0 },
      { id: "s2", memberId: "post:a", at: 28 },
      { id: "gone", memberId: "post:missing", at: 10 },
    ],
  });
  if (Math.abs((open.posts[0]?.pieces[0] ?? 0) - (wood.posts[0]?.pieces[0] ?? -1)) > 1e-9) {
    throw new Error("wood straps should not change the post cut");
  }
  if (wood.straps.length !== 2 || Math.abs(wood.straps[0].at - 0.75) > 1e-6) {
    throw new Error(`strap place ${wood.straps.map((s) => s.at).join(",")}`);
  }
  if (Math.abs(wood.connectorCost - open.connectorCost - 2 * STRAP_PRICE) > 1e-6) {
    throw new Error(`strap cost ${wood.connectorCost - open.connectorCost}`);
  }

  const corners = [
    { id: "a", x: 0, z: 0, height: 36, flange: false },
    { id: "b", x: 48, z: 0, height: 36, flange: false },
    { id: "c", x: 48, z: 36, height: 36, flange: false },
    { id: "d", x: 0, z: 36, height: 36, flange: false },
  ];
  const around = buildProject({
    ...base,
    mode: "sketch",
    nodes: corners,
    links: [
      { id: "ab", a: "a", b: "b", y: 34, kind: "rail" },
      { id: "bc", a: "b", b: "c", y: 34, kind: "rail" },
      { id: "cd", a: "c", b: "d", y: 34, kind: "rail" },
      { id: "da", a: "d", b: "a", y: 34, kind: "rail" },
    ],
    baysX: [],
    baysZ: [],
    levels: [],
  });
  if ((around.bom.find((item) => item.sku === "90")?.qty ?? 0) !== 4) {
    throw new Error(`loop should be four 90s, got ${around.bom.find((item) => item.sku === "90")?.qty}`);
  }
  const loopStops = [
    { nodeId: "a", y: 34 },
    { nodeId: "b", y: 34 },
    { nodeId: "c", y: 34 },
    { nodeId: "d", y: 34 },
    { nodeId: "a", y: 34 },
  ];
  const empty = { ...base, mode: "sketch" as const, nodes: corners, links: [], baysX: [], baysZ: [], levels: [] };
  if (railRunError(empty, loopStops)) throw new Error(`loop should be legal: ${railRunError(empty, loopStops)}`);
  const planned = previewRailRun(empty, loopStops);
  const nineties = planned.clamps.filter((clamp) => clamp.sku === "90");
  if (planned.error || nineties.length !== 4) {
    throw new Error(`loop preview ${planned.error ?? planned.clamps.map((clamp) => clamp.sku).join(",")}`);
  }
  const stacked = railRunError(
    { ...empty, links: [{ id: "ab", a: "a", b: "b", y: 34, kind: "rail" }] },
    [
      { nodeId: "a", y: 35.2 },
      { nodeId: "d", y: 35.2 },
    ],
  );
  if (!stacked?.includes("2 1/4")) throw new Error(`stack ${stacked}`);
  const mixed = railRunError(
    {
      ...empty,
      trade: "half",
      nodes: corners.map((node, index) => (index === 0 ? { ...node, trade: "one" as const } : node)),
    },
    loopStops,
  );
  if (!mixed?.includes("1/2")) throw new Error(`mix ${mixed}`);
  const low = railRunError(empty, [
    { nodeId: "a", y: 1 },
    { nodeId: "b", y: 1 },
  ]);
  if (!low?.includes("floor")) throw new Error(`low rail ${low}`);

  const lineNodes = [
    { id: "a", x: 0, z: 0, height: 36, flange: false },
    { id: "b", x: 24, z: 0, height: 36, flange: false },
    { id: "c", x: 48, z: 0, height: 36, flange: false },
  ];
  const line = { ...base, mode: "sketch" as const, nodes: lineNodes, links: [], baysX: [], baysZ: [], levels: [] };
  const throughPost = railRunError(line, [
    { nodeId: "a", y: 34 },
    { nodeId: "c", y: 34 },
  ]);
  if (!throughPost?.includes("through")) throw new Error(`through post ${throughPost}`);
  if (railRunError(line, [
    { nodeId: "a", y: 34 },
    { nodeId: "b", y: 34 },
    { nodeId: "c", y: 34 },
  ])) {
    throw new Error("a straight run of three posts should be legal");
  }
  const straight = buildProject({
    ...line,
    links: [
      { id: "ab", a: "a", b: "b", y: 34, kind: "rail" },
      { id: "bc", a: "b", b: "c", y: 34, kind: "rail" },
    ],
  });
  if ((straight.bom.find((item) => item.sku === "180")?.qty ?? 0) !== 1) throw new Error("middle post should be a 180");
  const side = {
    ...base,
    mode: "sketch" as const,
    nodes: [
      { id: "a", x: 0, z: 0, height: 36, flange: false },
      { id: "b", x: 48, z: 0, height: 36, flange: false },
      { id: "g", x: 16, z: 0, height: 36, flange: false },
    ],
    links: [{ id: "ab", a: "a", b: "b", y: 34, kind: "rail" as const }],
    baysX: [] as number[],
    baysZ: [] as number[],
    levels: [] as number[],
  };
  const saddle = railRunError(side, [
    { nodeId: "a", y: 34 },
    { nodeId: "g", y: 34 },
  ]);
  if (!saddle?.includes("opening")) throw new Error(`saddle ${saddle}`);
  if (hostOffsetT(48, "center") !== 0.5) throw new Error("center offset");
  if (Math.abs(hostOffsetT(48, 12) - 0.25) > 1e-6) throw new Error("inch offset");
  if (hostOffsetT(48, 0) !== 0.08) throw new Error("offset should stay on the pipe");

  const sheet = sheetIndex(corner, built);
  if (Math.abs(sheet.partsTotal - built.connectorCost) > 0.02) throw new Error(`parts ${sheet.partsTotal} vs ${built.connectorCost}`);
  if (sheet.conduitPriced || Math.abs(sheet.jobTotal - built.connectorCost) > 0.02) throw new Error(`job ${sheet.jobTotal}`);
  if (built.fittings.some((fitting) => !sheet.fittingItem.has(fitting.id))) throw new Error("a fitting has no parts number");
  if (sheet.marks.get(built.posts[0]?.id ?? "") !== "P1") throw new Error(`post mark ${sheet.marks.get(built.posts[0]?.id ?? "")}`);
  const priced = sheetIndex({ ...corner, stickPrice: 12 }, built);
  if (!priced.conduitPriced || Math.abs(priced.conduitTotal - built.sticks * 12) > 0.02) throw new Error(`conduit ${priced.conduitTotal}`);
  if (Math.abs(priced.jobTotal - priced.partsTotal - priced.conduitTotal) > 0.02) throw new Error("job total should add parts and conduit");

  const shelfPosts = [
    { id: "a", x: 0, z: 0, height: 48, flange: false },
    { id: "b", x: 48, z: 0, height: 48, flange: false },
  ];
  const shelf: Project = {
    ...base,
    mode: "sketch",
    nodes: [
      ...shelfPosts,
      { id: "h1", x: 24, z: 0, height: 10, flange: false, host: "low", hostT: 0.5 },
      { id: "h2", x: 24, z: 0, height: 34, flange: false, host: "high", hostT: 0.5 },
    ],
    links: [
      { id: "low", a: "a", b: "b", y: 10, kind: "rail" },
      { id: "high", a: "a", b: "b", y: 34, kind: "rail" },
    ],
    baysX: [],
    baysZ: [],
    levels: [],
  };
  const braceStops = [
    { nodeId: "h1", y: 10 },
    { nodeId: "h2", y: 34 },
  ];
  const stackedRails = railRunError(shelf, braceStops);
  if (stackedRails) throw new Error(`stacked rails should accept a brace: ${stackedRails}`);
  const laid = fortyFiveLayout(shelf, braceStops, false);
  if (laid.error || laid.hosts.length !== 2) throw new Error(`45 layout ${laid.error ?? laid.hosts.length}`);
  const movedNodes = (shelf.nodes ?? []).map((node) => {
    const hit = laid.hosts.find((item) => item.id === node.id);
    return hit ? { ...node, hostT: hit.hostT } : node;
  });
  const moved = { ...shelf, nodes: movedNodes };
  const laidError = railRunError(moved, [
    { nodeId: "h1", y: laid.y[0] },
    { nodeId: "h2", y: laid.y[1] },
  ]);
  if (laidError) throw new Error(`45 brace illegal: ${laidError}`);
  const braced = buildProject({
    ...moved,
    links: [...(moved.links ?? []), { id: "br", a: "h1", b: "h2", y: laid.y[0], yB: laid.y[1], kind: "rail" }],
  });
  if ((braced.bom.find((item) => item.sku === "45")?.qty ?? 0) !== 2) {
    throw new Error(`rail brace fittings ${braced.bom.map((item) => `${item.sku}${item.qty}`).join(",")}`);
  }
  const flipped = fortyFiveLayout(shelf, braceStops, true);
  if (flipped.error) throw new Error(`flip 45 ${flipped.error}`);
  const t1 = laid.hosts.find((item) => item.id === "h1")?.hostT ?? 0;
  const t2 = laid.hosts.find((item) => item.id === "h2")?.hostT ?? 0;
  const f1 = flipped.hosts.find((item) => item.id === "h1")?.hostT ?? 0;
  const f2 = flipped.hosts.find((item) => item.id === "h2")?.hostT ?? 0;
  if (!(t2 > t1) || !(f2 < f1)) throw new Error(`flip should lean the other way ${t1},${t2} vs ${f1},${f2}`);

  const tall: Project = {
    ...base,
    mode: "sketch",
    nodes: [
      { id: "a", x: 0, z: 0, height: 72, flange: false },
      { id: "b", x: 36, z: 0, height: 72, flange: false },
    ],
    links: [],
    baysX: [],
    baysZ: [],
    levels: [],
  };
  const post45 = fortyFiveLayout(tall, [
    { nodeId: "a", y: 30 },
    { nodeId: "b", y: 30 },
  ], false);
  if (post45.error || Math.abs(post45.y[0] - 1.25) > 1e-6 || Math.abs(post45.y[1] - 37.25) > 1e-6) {
    throw new Error(`post 45 ${post45.error} ${post45.y.join(",")}`);
  }
  const postFlip = fortyFiveLayout(tall, [
    { nodeId: "a", y: 30 },
    { nodeId: "b", y: 30 },
  ], true);
  if (postFlip.error || Math.abs(postFlip.y[0] - 37.25) > 1e-6 || Math.abs(postFlip.y[1] - 1.25) > 1e-6) {
    throw new Error(`post flip ${postFlip.error} ${postFlip.y.join(",")}`);
  }
  const postBuilt = buildProject({
    ...tall,
    links: [{ id: "ab", a: "a", b: "b", y: post45.y[0], yB: post45.y[1], kind: "rail" }],
  });
  if ((postBuilt.bom.find((item) => item.sku === "45")?.qty ?? 0) !== 2) throw new Error("post 45 should be two connectors");
  const raised = fortyFiveLayout(tall, [
    { nodeId: "a", y: 30 },
    { nodeId: "b", y: 30 },
  ], false, undefined, 4);
  if (raised.error || Math.abs(raised.y[0] - 5.25) > 1e-6 || Math.abs(raised.y[1] - 41.25) > 1e-6) {
    throw new Error(`raised 45 ${raised.error} ${raised.y.join(",")}`);
  }
  const postStops = [
    { nodeId: "a", y: 30 },
    { nodeId: "b", y: 30 },
  ];
  const upB = nudgeFortyFive(tall, postStops, 0, { flip: false, shift: 0 }, 1, "up");
  if (upB.layout.error || Math.abs(upB.lean.shift - 2) > 1e-6 || Math.abs(upB.layout.y[1] - 39.25) > 1e-6) {
    throw new Error(`nudge up ${upB.layout.error} shift ${upB.lean.shift} y ${upB.layout.y.join(",")}`);
  }
  const upA = nudgeFortyFive(tall, postStops, 0, { flip: false, shift: 0 }, 0, "up");
  if (upA.layout.error || upA.lean.flip !== true || Math.abs(upA.layout.y[0] - 37.25) > 1e-6) {
    throw new Error(`flip up A ${upA.layout.error} ${upA.lean.flip} ${upA.layout.y.join(",")}`);
  }
  const arrows = fortyFiveButtons(shelf, braceStops, 0, { flip: false, shift: 0 });
  if (arrows.length !== 4 || arrows.some((item) => item.dir !== "left" && item.dir !== "right")) {
    throw new Error(`rail arrows ${arrows.map((item) => item.dir).join(",")}`);
  }

  const corner45: Project = {
    ...base,
    mode: "sketch",
    nodes: [
      { id: "a", x: 0, z: 0, height: 84, flange: false },
      { id: "b", x: 48, z: 0, height: 84, flange: false },
      { id: "h", x: 24, z: 0, height: 12, flange: false, host: "low", hostT: 0.5 },
    ],
    links: [{ id: "low", a: "a", b: "b", y: 12, kind: "rail" }],
    baysX: [],
    baysZ: [],
    levels: [],
  };
  const cornerStops = [
    { nodeId: "a", y: 36 },
    { nodeId: "h", y: 12 },
  ];
  const upArrow = fortyFiveButtons(corner45, cornerStops, 0, { flip: false, shift: 0 }).find((item) => item.end === 0 && item.dir === "up");
  if (!upArrow) throw new Error("mixed post has no up arrow");
  const raisedCorner = nudgeFortyFive(corner45, cornerStops, 0, { flip: upArrow.flip, shift: 0 }, 0, "up");
  if (raisedCorner.layout.error) throw new Error(`mixed nudge ${raisedCorner.layout.error}`);
  if (Math.abs(raisedCorner.layout.y[0] - 38) > 0.05) throw new Error(`post should rise to 38, got ${raisedCorner.layout.y.join(",")}`);
  const tAfter = raisedCorner.layout.hosts.find((item) => item.id === "h")?.hostT ?? 0;
  const coupledRise = Math.abs(raisedCorner.layout.y[0] - raisedCorner.layout.y[1]);
  const coupledRun = Math.abs(tAfter) * 48;
  if (Math.abs(coupledRun - coupledRise) > 0.4) throw new Error(`coupled 45 run ${coupledRun} rise ${coupledRise} t ${tAfter}`);
  if (!(tAfter > 0.5 + 0.02)) throw new Error(`rail joint should lengthen, t ${tAfter}`);

  const stickOut: Project = {
    ...base,
    mode: "sketch",
    nodes: [
      { id: "a", x: 0, z: 0, height: 48, flange: false },
      { id: "b", x: 48, z: 0, height: 48, flange: false },
    ],
    links: [{ id: "ab", a: "a", b: "b", y: 34, kind: "rail", pastB: 6 }],
    baysX: [],
    baysZ: [],
    levels: [],
  };
  const plain = buildProject(stickOut);
  const plainRail = plain.rails.find((rail) => rail.id === "rail:ab");
  if (!plainRail || Math.abs(plainRail.metal - 45.5) > 1e-6) throw new Error(`continuous post should ignore the stick-out, metal ${plainRail?.metal}`);
  if (plain.fittings.some((fitting) => fitting.sku === "cross" || fitting.sku === "180")) {
    throw new Error("a continuous post must not pass the rail");
  }
  if ((plain.bom.find((item) => item.sku === "T")?.qty ?? 0) !== 2) throw new Error("continuous rail should be two Ts");

  const passed = buildProject({
    ...stickOut,
    nodes: [
      { id: "a", x: 0, z: 0, height: 48, flange: false },
      { id: "b", x: 48, z: 0, height: 48, flange: false, split: 34 },
    ],
  });
  const passedRail = passed.rails.find((rail) => rail.id === "rail:ab");
  if (!passedRail || Math.abs(passedRail.metal - 52.75) > 1e-6) throw new Error(`split stick-out metal ${passedRail?.metal}`);
  if (passed.posts.length !== 3) throw new Error(`split post should be two pieces, posts ${passed.posts.length}`);
  const lower = passed.posts.find((post) => post.id === "post:b");
  const upper = passed.posts.find((post) => post.id === "post:b:hi");
  if (!lower || !upper) throw new Error("missing split post pieces");
  if (Math.abs(lower.setbackB - 1.28125) > 1e-6 || Math.abs(upper.setbackA - 1.28125) > 1e-6) {
    throw new Error(`split setbacks ${lower?.setbackB} ${upper?.setbackA}`);
  }
  const passFit = passed.fittings.find((fitting) => fitting.sku === "180" && fitting.id.startsWith("fit:b"));
  if (!passFit || Math.abs(passFit.axis?.[0] ?? 0) < 0.9) throw new Error("split fitting should be a 180 along the rail");
  if (!passFit.branches.some((branch) => branch.dir[1] > 0.9) || !passFit.branches.some((branch) => branch.dir[1] < -0.9)) {
    throw new Error("split 180 saddles should point up and down");
  }
  if (passed.fittings.some((fitting) => fitting.sku === "cross")) throw new Error("a split post is not a cross");
  if ((passed.bom.find((item) => item.sku === "T")?.qty ?? 0) !== 1) throw new Error("the other end stays a T");

  const sliced = buildProject({
    ...stickOut,
    links: [{ id: "ab", a: "a", b: "b", y: 34, kind: "rail", cutB: "horizontal", pastB: 6 }],
  });
  if (sliced.posts.length !== 2) throw new Error(`a cut rail should leave the post whole, posts ${sliced.posts.length}`);
  const slicedMain = sliced.rails.find((rail) => rail.id === "rail:ab");
  const slicedStub = sliced.rails.find((rail) => rail.id === "rail:ab:stubB");
  if (!slicedMain || Math.abs(slicedMain.metal - 45.46875) > 1e-6) throw new Error(`cut rail metal ${slicedMain?.metal}`);
  if (!slicedStub || Math.abs(slicedStub.metal - 4.71875) > 1e-6) throw new Error(`stub metal ${slicedStub?.metal}`);
  const footage = [...slicedMain.pieces, ...slicedStub.pieces].reduce((sum, n) => sum + n, 0);
  if (Math.abs(footage - (45.46875 + 4.71875)) > 1e-6) throw new Error(`pdf footage ${footage}`);
  if ((sliced.bom.find((item) => item.sku === "T")?.qty ?? 0) !== 1) throw new Error("cut rail should keep one T");
  const slicedFit = sliced.fittings.find((fitting) => fitting.sku === "180");
  if (!slicedFit) throw new Error("cut rail should be a 180");
  if ((slicedFit.axis?.[0] ?? 0) > 0.5) throw new Error("the post is the through, not the rail");
  if (slicedFit.axis && Math.abs(slicedFit.axis[1] - 1) > 0.05) throw new Error("180 collar should stay vertical");
  if (!slicedFit.branches.some((branch) => branch.dir[0] > 0.9) || !slicedFit.branches.some((branch) => branch.dir[0] < -0.9)) {
    throw new Error("180 saddles should face both ways along the rail");
  }
  if (sliced.fittings.some((fitting) => fitting.sku === "cross")) throw new Error("a cut rail is not a cross");
  if (!sliced.cuts.some((row) => row.kind === "rail" && Math.abs(row.length - 45.46875) < 1e-6)) throw new Error("pdf missing the main rail");
  if (!sliced.cuts.some((row) => row.kind === "rail" && Math.abs(row.length - 4.71875) < 1e-6)) throw new Error("pdf missing the stub");

  const branched = buildProject({
    ...stickOut,
    nodes: [
      { id: "a", x: 0, z: 0, height: 48, flange: false },
      { id: "b", x: 48, z: 0, height: 48, flange: false },
      { id: "c", x: 48, z: 36, height: 48, flange: false },
    ],
    links: [
      { id: "ab", a: "a", b: "b", y: 34, kind: "rail", cutB: "horizontal", pastB: 6 },
      { id: "bc", a: "b", b: "c", y: 34, kind: "rail" },
    ],
  });
  const way = branched.fittings.find((fitting) => fitting.id.startsWith("fit:b"));
  if (!way || way.sku !== "4way") throw new Error(`a third pipe should be a 4-way, got ${way?.sku}`);
  if (way.axis && Math.abs(way.axis[0]) > 0.5) throw new Error("4-way through should stay the post");
  if (branched.fittings.some((fitting) => fitting.sku === "cross" || fitting.sku === "180")) {
    throw new Error("do not fake a 4-way with a cross or a 180");
  }
  const branchMain = branched.rails.find((rail) => rail.id === "rail:ab");
  const branchStub = branched.rails.find((rail) => rail.id === "rail:ab:stubB");
  if (!branchMain || Math.abs(branchMain.metal - 45.46875) > 1e-6) throw new Error(`4-way rail metal ${branchMain?.metal}`);
  if (!branchStub || Math.abs(branchStub.metal - 4.71875) > 1e-6) throw new Error(`4-way stub metal ${branchStub?.metal}`);

  const hungProject: Project = {
    ...base,
    mode: "sketch",
    nodes: [
      { id: "a", x: 0, z: 0, height: 36, flange: false, cap: true },
      { id: "tip", x: 48, z: 0, height: 34, flange: false, tip: true },
    ],
    links: [{ id: "ab", a: "a", b: "tip", y: 34, kind: "rail", capB: true }],
    baysX: [],
    baysZ: [],
    levels: [],
  };
  const hung = buildProject(hungProject);
  const hungRail = hung.rails.find((rail) => rail.id === "rail:ab");
  if (hung.posts.length !== 1) throw new Error(`a single post should stay one post, got ${hung.posts.length}`);
  if ((hung.bom.find((item) => item.sku === "T")?.qty ?? 0) !== 1) throw new Error("one post takes one T");
  if (hung.fittings.some((fitting) => fitting.sku === "180" || fitting.sku === "cross")) throw new Error("an open end is not a clamp");
  if (!hungRail || Math.abs(hungRail.metal - 46.75) > 1e-6 || hungRail.setbackB !== 0) throw new Error(`open rail metal ${hungRail?.metal}`);
  if (hung.caps.reduce((sum, line) => sum + line.qty, 0) !== 2) throw new Error(`expected two caps, got ${hung.caps.map((line) => line.qty).join(",")}`);
  if (Math.abs(hung.capCost - 0.99) > 1e-6) throw new Error(`cap cost ${hung.capCost}`);
  const hungSheet = sheetIndex(hungProject, hung);
  const capRow = hungSheet.items.find((item) => item.kind === "cap");
  if (!capRow || capRow.qty !== 2) throw new Error("buy list missing end caps");
  if (Math.abs(hungSheet.partsTotal - hung.connectorCost) > 0.02) throw new Error(`capped parts ${hungSheet.partsTotal} vs ${hung.connectorCost}`);
  if (railRunError({ ...hungProject, links: [] }, [
    { nodeId: "a", y: 34 },
    { nodeId: "tip", y: 34 },
  ])) {
    throw new Error("a rail on one post should be legal");
  }
  const squared = squareFrom({ x: 0, z: 0 }, 10, 3);
  if (squared.x !== 10 || squared.z !== 0) throw new Error(`open end should land square, got ${squared.x},${squared.z}`);
  const door = buildProject({
    ...hungProject,
    hinges: [
      { id: "h1", memberId: "post:a", kind: "leaf", at: 10, side: 1 },
      { id: "h2", memberId: "post:a", kind: "leaf", at: 28, side: 1 },
    ],
  });
  if (door.hardware.length !== 1 || door.hardware[0]?.qty !== 1) throw new Error(`hinge set qty ${door.hardware[0]?.qty}`);
  if (Math.abs(door.connectorCost - hung.connectorCost - LEAF_SET_PRICE) > 0.02) {
    throw new Error(`hinge set cost ${door.connectorCost - hung.connectorCost}`);
  }
  if (Math.abs(sheetIndex({ ...hungProject, hinges: door.hinges }, door).partsTotal - door.connectorCost) > 0.02) {
    throw new Error("hinge sheet drifted from the buy list");
  }
  const barreled = buildProject({
    ...hungProject,
    trade: "one",
    hinges: [{ id: "b1", memberId: "post:a", kind: "barrel", at: 18, side: 1 }],
  });
  if (barreled.oneShimCount < 2) throw new Error(`barrel on 1" needs two shims, got ${barreled.oneShimCount}`);
  if (!barreled.issues.some((issue) => issue.text.includes("1\" to 3/4\" shim"))) throw new Error("barrel shim note missing");
  const plainBarrel = buildProject({
    ...hungProject,
    hinges: [{ id: "b1", memberId: "post:a", kind: "barrel", at: 18, side: 1 }],
  });
  if (plainBarrel.shimCount !== hung.shimCount || plainBarrel.oneShimCount !== hung.oneShimCount) {
    throw new Error("a 3/4\" barrel does not take a shim");
  }
  const host = hung.posts.find((post) => post.id === "post:a");
  const frame = host
    ? doorFrame(host, [
        { id: "h1", memberId: "post:a", kind: "leaf", at: 10, side: 1 },
        { id: "h2", memberId: "post:a", kind: "leaf", at: 28, side: 1 },
      ], 32)
    : null;
  if (!frame || Math.abs(frame.width - 32) > 0.05 || frame.dirZ !== 1) throw new Error(`door frame ${frame?.width} ${frame?.dirZ}`);
  const gateProject: Project = {
    ...hungProject,
    nodes: [
      ...(hungProject.nodes ?? []),
      { id: "dh", x: frame.hinge.x, z: frame.hinge.z, height: frame.hinge.height, base: frame.hinge.base, flange: false, door: "d1" },
      { id: "dl", x: frame.latch.x, z: frame.latch.z, height: frame.latch.height, base: frame.latch.base, flange: false, door: "d1" },
    ],
    links: [
      ...(hungProject.links ?? []),
      { id: "db", a: "dh", b: "dl", y: frame.bottom, kind: "rail" },
      { id: "dt", a: "dh", b: "dl", y: frame.top, kind: "rail" },
    ],
    doors: [
      {
        id: "d1",
        memberId: "post:a",
        width: frame.width,
        hingeNode: "dh",
        latchNode: "dl",
        bottomRail: "db",
        topRail: "dt",
        dirX: frame.dirX,
        dirZ: frame.dirZ,
      },
    ],
    hingeSwing: [{ memberId: "post:a", deg: 40 }],
    hinges: [
      { id: "h1", memberId: "post:a", kind: "leaf", at: 10, side: 1 },
      { id: "h2", memberId: "post:a", kind: "leaf", at: 28, side: 1 },
    ],
  };
  const gate = buildProject(gateProject);
  if (gate.posts.length !== hung.posts.length + 2) throw new Error(`door posts ${gate.posts.length}`);
  if (gate.rails.length !== hung.rails.length + 2) throw new Error(`door rails ${gate.rails.length}`);
  const closedLatch = gate.members.find((member) => member.id === "post:dl");
  const posed = poseSwung(normalizeProject(gateProject), gate);
  const openLatch = posed.members.find((member) => member.id === "post:dl");
  const closedHinge = gate.members.find((member) => member.id === "post:dh");
  const openHinge = posed.members.find((member) => member.id === "post:dh");
  if (!closedLatch || !openLatch || !closedHinge || !openHinge) throw new Error("door members missing");
  if (Math.abs(openLatch.metal - closedLatch.metal) > 0.01) throw new Error("swing changed a cut");
  if (Math.hypot(openLatch.a[0] - closedLatch.a[0], openLatch.a[2] - closedLatch.a[2]) < 1) throw new Error("latch stile should swing");
  if (Math.hypot(openHinge.a[0] - closedHinge.a[0], openHinge.a[2] - closedHinge.a[2]) > 0.2) throw new Error("hinge stile should stay on the knuckle");
}
