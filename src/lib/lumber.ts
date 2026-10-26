/** Real dressed sizes, not the nominal stamp. A 2×4 is 1 1/2" by 3 1/2". */

export type StockId =
  | "4x4"
  | "2x4"
  | "2x6"
  | "2x8"
  | "2x12"
  | "1x4"
  | "1x6"
  | "1x8"
  | "1x12"
  | "osb"
  | "plastic"
  | "shingle"
  | "metal";

export type BoardFace = "flat" | "edge";
export type BoardRun = "horizontal" | "vertical";
export type Vec3 = [number, number, number];

export type BoardAnchor = { ref: string; at: Vec3 };

export type Board = {
  id: string;
  kind: StockId;
  face: BoardFace;
  run: BoardRun;
  anchors: BoardAnchor[];
  /** Null means cut to the distance between the first and last clamp. */
  length: number | null;
  /** Inches slid along the length, from centered. Positive moves toward the last clamp. */
  along?: number;
  /** Inches a sheet has slid across the boards it sits on, from centered. */
  cross?: number;
  sheetWidth: number;
  thickness: number;
};

export type Stock = {
  id: StockId;
  label: string;
  /** Smaller dressed dimension, inches. */
  thick: number;
  /** Larger dressed dimension, inches. */
  wide: number;
  sheet: boolean;
  /** Widest a sheet of this kind is sold, inches. A 4×8 is 48" across. */
  maxWidth: number;
  /** Longest this piece is sold, inches. Sheets stop at 8 ft. */
  maxLength: number;
};

export const STOCKS: Stock[] = [
  { id: "4x4", label: "4×4", thick: 3.5, wide: 3.5, sheet: false, maxWidth: 3.5, maxLength: 240 },
  { id: "2x4", label: "2×4", thick: 1.5, wide: 3.5, sheet: false, maxWidth: 3.5, maxLength: 240 },
  { id: "2x6", label: "2×6", thick: 1.5, wide: 5.5, sheet: false, maxWidth: 5.5, maxLength: 240 },
  { id: "2x8", label: "2×8", thick: 1.5, wide: 7.25, sheet: false, maxWidth: 7.25, maxLength: 240 },
  { id: "2x12", label: "2×12", thick: 1.5, wide: 11.25, sheet: false, maxWidth: 11.25, maxLength: 240 },
  { id: "1x4", label: "1×4", thick: 0.75, wide: 3.5, sheet: false, maxWidth: 3.5, maxLength: 240 },
  { id: "1x6", label: "1×6", thick: 0.75, wide: 5.5, sheet: false, maxWidth: 5.5, maxLength: 240 },
  { id: "1x8", label: "1×8", thick: 0.75, wide: 7.25, sheet: false, maxWidth: 7.25, maxLength: 240 },
  { id: "1x12", label: "1×12", thick: 0.75, wide: 11.25, sheet: false, maxWidth: 11.25, maxLength: 240 },
  { id: "osb", label: "OSB", thick: 0.4375, wide: 48, sheet: true, maxWidth: 48, maxLength: 96 },
  { id: "plastic", label: "Plastic canvas", thick: 0.125, wide: 48, sheet: true, maxWidth: 48, maxLength: 96 },
  { id: "shingle", label: "Shingles", thick: 0.25, wide: 36, sheet: true, maxWidth: 48, maxLength: 96 },
  { id: "metal", label: "Metal roof", thick: 0.05, wide: 36, sheet: true, maxWidth: 48, maxLength: 96 },
];

export const STOCK_MAP: Record<StockId, Stock> = Object.fromEntries(STOCKS.map((item) => [item.id, item])) as Record<StockId, Stock>;

/** A flange bolts to wood. A one-hole strap screws to wood. Corners, tees, and 45° clamps do not. */
export const WOOD_SKUS = new Set<string>(["flange"]);

/** A sheet can sit on one board, such as shingles on OSB. Sticks still need two mounts. */
export function canPlaceLumber(board: { kind: StockId; anchors: { ref: string }[] }): boolean {
  if (board.anchors.length >= 2) return true;
  return STOCK_MAP[board.kind].sheet && board.anchors.length === 1 && board.anchors[0].ref.startsWith("board:");
}

export const OSB_THICKNESS = [0.4375, 0.5, 0.625, 0.75] as const;

const KINDS = new Set(STOCKS.map((item) => item.id));

export function cleanBoards(raw: unknown): Board[] {
  if (!Array.isArray(raw)) return [];
  const out: Board[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const board = item as Partial<Board>;
    if (typeof board.id !== "string" || !KINDS.has(board.kind as StockId)) continue;
    if (!Array.isArray(board.anchors) || board.anchors.length < 1) continue;
    const anchors: BoardAnchor[] = [];
    for (const anchor of board.anchors) {
      if (!anchor || typeof anchor.ref !== "string" || !Array.isArray(anchor.at) || anchor.at.length < 3) continue;
      const at = anchor.at.map((n) => Number(n));
      if (at.some((n) => !Number.isFinite(n))) continue;
      anchors.push({ ref: anchor.ref, at: [at[0], at[1], at[2]] });
    }
    if (!canPlaceLumber({ kind: board.kind as StockId, anchors })) continue;
    const stock = STOCK_MAP[board.kind as StockId];
    const sheetWidth = Number.isFinite(board.sheetWidth) ? Math.min(stock.maxWidth, Math.max(4, board.sheetWidth as number)) : stock.wide;
    const thickness = Number.isFinite(board.thickness) ? Math.max(0.03, board.thickness as number) : stock.thick;
    const rawLength = board.length == null || !Number.isFinite(board.length) ? null : Math.max(1, board.length as number);
    const length = rawLength == null ? null : Math.min(stock.maxLength, rawLength);
    const along = Number.isFinite(board.along) ? (board.along as number) : 0;
    const cross = Number.isFinite(board.cross) ? Math.max(-240, Math.min(240, board.cross as number)) : 0;
    out.push({
      id: board.id,
      kind: board.kind as StockId,
      face: board.face === "edge" ? "edge" : "flat",
      run: board.run === "vertical" ? "vertical" : "horizontal",
      anchors,
      length,
      along,
      cross,
      sheetWidth,
      thickness,
    });
    if (out.length >= 80) break;
  }
  return out;
}

export function boardTitle(board: Pick<Board, "kind" | "face" | "run">): string {
  const stock = STOCK_MAP[board.kind];
  if (stock.sheet) return stock.label;
  const face = board.face === "edge" ? "on end" : "flat";
  return `${stock.label} ${face}`;
}

type FittingHit = { id: string; sku: string; position: Vec3 };
type MemberHit = { id: string; a: Vec3; b: Vec3 };

/** A clamp the board should follow. Post clamps keep the post id so a small move does not lose them. */
export function clampAnchor(fittingId: string, at: Vec3): BoardAnchor {
  const fit = /^fit:([^:]+):(\d+)$/.exec(fittingId);
  if (fit) return { ref: `node:${fit[1]}@${fit[2]}`, at };
  return { ref: fittingId, at };
}

export function resolveClamp(anchor: BoardAnchor, fittings: FittingHit[]): FittingHit | null {
  const exact = fittings.find((item) => item.id === anchor.ref);
  if (exact) return exact;
  const node = /^node:([^@]+)@(-?\d+)$/.exec(anchor.ref);
  if (!node) return null;
  const id = node[1];
  const y = Number(node[2]) / 32;
  const mine = fittings.filter((item) => item.id.startsWith(`fit:${id}:`) || item.id === `flange:${id}`);
  if (!mine.length) return null;
  mine.sort(
    (a, b) =>
      Math.abs(a.position[1] - y) - Math.abs(b.position[1] - y) ||
      Math.hypot(a.position[0] - anchor.at[0], a.position[1] - anchor.at[1], a.position[2] - anchor.at[2]) -
        Math.hypot(b.position[0] - anchor.at[0], b.position[1] - anchor.at[1], b.position[2] - anchor.at[2]),
  );
  return mine[0];
}

/** Drop boards whose clamps or supporting boards are gone. */
export function pruneBoards(boards: Board[], gone: (ref: string) => boolean): Board[] {
  let current = boards.slice();
  for (let guard = 0; guard < 8; guard += 1) {
    const ids = new Set(current.map((board) => board.id));
    const next = current.filter((board) =>
      board.anchors.every((anchor) => {
        if (anchor.ref.startsWith("board:")) return ids.has(anchor.ref.slice(6));
        return !gone(anchor.ref);
      }),
    );
    if (next.length === current.length) return next;
    current = next;
  }
  return current;
}

export type BoardLayout = {
  error: string | null;
  origin: Vec3;
  long: Vec3;
  side: Vec3;
  up: Vec3;
  length: number;
  across: number;
  rise: number;
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
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function vlen(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}
function norm(a: Vec3): Vec3 {
  const l = vlen(a) || 1;
  return scale(a, 1 / l);
}
function distPointSeg(p: Vec3, a: Vec3, b: Vec3): number {
  const ab = sub(b, a);
  const l2 = dot(ab, ab) || 1;
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return vlen(sub(p, add(a, scale(ab, t))));
}

export type LayoutContext = {
  fittings: FittingHit[];
  members: MemberHit[];
  boards: Board[];
  straps: { id: string; position: Vec3 }[];
  pipeRadius: number;
};

export function strapPoints(
  straps: { id: string; memberId: string; at: number }[],
  members: { id: string; a: Vec3; b: Vec3 }[],
): { id: string; position: Vec3 }[] {
  const out: { id: string; position: Vec3 }[] = [];
  for (const strap of straps) {
    const member = members.find((item) => item.id === strap.memberId);
    if (!member) continue;
    const dx = member.b[0] - member.a[0];
    const dy = member.b[1] - member.a[1];
    const dz = member.b[2] - member.a[2];
    const len = Math.hypot(dx, dy, dz) || 1;
    const t = Math.min(1, Math.max(0, strap.at / len));
    out.push({ id: strap.id, position: [member.a[0] + dx * t, member.a[1] + dy * t, member.a[2] + dz * t] });
  }
  return out;
}

function supportIds(points: Vec3[], members: MemberHit[]): Set<string> {
  const ids = new Set<string>();
  for (const member of members) {
    if (points.some((point) => distPointSeg(point, member.a, member.b) < 2.4)) ids.add(member.id);
  }
  return ids;
}

function projectOnto(point: Vec3, layout: BoardLayout): Vec3 {
  const rel = sub(point, layout.origin);
  const along = Math.max(-layout.length / 2, Math.min(layout.length / 2, dot(rel, layout.long)));
  const side = Math.max(-layout.across / 2, Math.min(layout.across / 2, dot(rel, layout.side)));
  return add(layout.origin, add(scale(layout.long, along), scale(layout.side, side)));
}

function resolvePoint(anchor: BoardAnchor, ctx: LayoutContext, depth: number): Vec3 | null {
  if (anchor.ref.startsWith("board:")) {
    if (depth > 3) return anchor.at;
    const board = ctx.boards.find((item) => item.id === anchor.ref.slice(6));
    if (!board) return null;
    const laid = layoutBoard(board, ctx, depth + 1);
    if (!laid || laid.error) return anchor.at;
    return projectOnto(anchor.at, laid);
  }
  if (anchor.ref.startsWith("strap:")) {
    return ctx.straps.find((item) => item.id === anchor.ref.slice(6))?.position ?? null;
  }
  const fitting = resolveClamp(anchor, ctx.fittings);
  return fitting ? fitting.position : null;
}

function memberDir(point: Vec3, members: MemberHit[]): Vec3 | null {
  let best: Vec3 | null = null;
  let bestD = 3;
  for (const member of members) {
    const d = distPointSeg(point, member.a, member.b);
    if (d < bestD) {
      bestD = d;
      best = norm(sub(member.b, member.a));
    }
  }
  return best;
}

/** Length follows the clamps. A sloped run, or a level run across sloped pipes, tilts the board with them. */
function boardFrame(spanVec: Vec3, ends: Vec3[], members: MemberHit[]): { long: Vec3; side: Vec3; up: Vec3 } {
  const long = norm(spanVec);
  const hosts = ends
    .map((point) => memberDir(point, members))
    .filter((axis): axis is Vec3 => {
      if (!axis) return false;
      const slope = Math.abs(axis[1]);
      return slope > 0.22 && slope < 0.96;
    });
  const host = hosts.length && hosts.every((axis) => Math.abs(dot(axis, hosts[0])) > 0.8) ? hosts[0] : null;
  if (host && Math.abs(dot(host, long)) < 0.92) {
    const tilt = cross(long, host);
    if (vlen(tilt) > 0.12) {
      let up = norm(tilt);
      if (up[1] < 0) up = scale(up, -1);
      const side = norm(cross(up, long));
      return { long, side, up };
    }
  }
  let side: Vec3;
  if (Math.abs(long[1]) > 0.92) side = [1, 0, 0];
  else side = norm(cross([0, 1, 0], long));
  let up = norm(cross(long, side));
  if (up[1] < 0) {
    up = scale(up, -1);
    side = scale(side, -1);
  }
  return { long, side, up };
}

const EMPTY: BoardLayout = { error: "", origin: [0, 0, 0], long: [0, 1, 0], side: [1, 0, 0], up: [0, 0, 1], length: 0, across: 0, rise: 0 };

function refused(error: string, origin: Vec3 = [0, 0, 0], length = 0): BoardLayout {
  return { ...EMPTY, error, origin, length };
}

function agreeing(vecs: Vec3[]): boolean {
  if (vecs.length < 2) return true;
  return vecs.every((axis) => Math.abs(dot(axis, vecs[0])) > 0.8);
}

function averageDir(vecs: Vec3[], preferUp: boolean): Vec3 {
  let acc: Vec3 = [0, 0, 0];
  const ref = vecs[0];
  for (const axis of vecs) acc = add(acc, dot(axis, ref) < 0 ? scale(axis, -1) : axis);
  let out = norm(acc);
  if (preferUp && out[1] < 0) out = scale(out, -1);
  return out;
}

function newell(points: Vec3[]): Vec3 | null {
  const n: Vec3 = [0, 0, 0];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    n[0] += (p[1] - q[1]) * (p[2] + q[2]);
    n[1] += (p[2] - q[2]) * (p[0] + q[0]);
    n[2] += (p[0] - q[0]) * (p[1] + q[1]);
  }
  if (vlen(n) < 1e-4) return null;
  let up = norm(n);
  if (up[1] < 0) up = scale(up, -1);
  return up;
}

function centroid(points: Vec3[]): Vec3 {
  return scale(
    points.reduce((acc, point) => add(acc, point), [0, 0, 0] as Vec3),
    1 / points.length,
  );
}

function projectDir(axis: Vec3, up: Vec3): Vec3 | null {
  const flat = sub(axis, scale(up, dot(axis, up)));
  if (vlen(flat) < 0.15) return null;
  return norm(flat);
}

type Contact = {
  kind: "wood" | "holder";
  top: Vec3;
  up: Vec3 | null;
  long: Vec3 | null;
  side: Vec3 | null;
  halfLong: number;
  halfAcross: number;
};

function contactsOf(board: Board, ctx: LayoutContext, depth: number): { error: string } | { contacts: Contact[] } {
  const contacts: Contact[] = [];
  for (const anchor of board.anchors) {
    if (anchor.ref.startsWith("board:")) {
      if (depth > 3) return { error: "That stack of boards is too deep." };
      const under = ctx.boards.find((item) => item.id === anchor.ref.slice(6));
      if (!under) return { error: "That board is gone. Pick another." };
      const laid = layoutBoard(under, ctx, depth + 1);
      if (!laid || laid.error) return { error: laid?.error || "That board can't hold a sheet yet." };
      const onFace = projectOnto(anchor.at, laid);
      contacts.push({
        kind: "wood",
        top: add(onFace, scale(laid.up, laid.rise / 2)),
        up: laid.up,
        long: laid.long,
        side: laid.side,
        halfLong: laid.length / 2,
        halfAcross: laid.across / 2,
      });
      continue;
    }
    const point = resolvePoint(anchor, ctx, depth);
    if (!point) return { error: "One of those clamps is gone. Remove it and pick another." };
    contacts.push({ kind: "holder", top: point, up: null, long: null, side: null, halfLong: 0, halfAcross: 0 });
  }
  return { contacts };
}

type SheetMeasure = {
  up: Vec3;
  long: Vec3;
  side: Vec3;
  seat: Vec3;
  centerL: number;
  centerS: number;
  fitted: number;
  outerAcross: number;
  pointAcross: number;
  pointLen: number;
  tops: Vec3[];
};

/** How a sheet sits on the boards under it. Null when it isn't a sheet on boards. */
function measureSheet(board: Board, ctx: LayoutContext, depth: number): { error: string } | SheetMeasure {
  const stock = STOCK_MAP[board.kind];
  if (!stock.sheet || !board.anchors.some((anchor) => anchor.ref.startsWith("board:"))) return { error: "" };
  const found = contactsOf(board, ctx, depth);
  if ("error" in found && !("contacts" in found)) return found;
  const contacts = (found as { contacts: Contact[] }).contacts;
  const woods = contacts.filter((item) => item.kind === "wood");
  const holders = contacts.filter((item) => item.kind === "holder");
  if (!woods.length) return { error: "Click the boards the sheet sits on." };
  const ups = woods.map((item) => item.up).filter((axis): axis is Vec3 => Boolean(axis));
  let up = agreeing(ups) ? averageDir(ups, true) : newell(woods.map((item) => item.top)) ?? averageDir(ups, true);
  const woodTops = woods.map((item) => item.top);
  const heights = woodTops.map((point) => dot(point, up));
  const minH = Math.min(...heights);
  const lowTops = woodTops.filter((_, index) => heights[index] - minH <= 0.35);
  const highWood = woodTops.filter((_, index) => heights[index] - minH > 0.35);
  const lowSeat = centroid(lowTops.length ? lowTops : woodTops);
  const highHolders = holders.filter((item) => dot(sub(item.top, lowSeat), up) > 0.35).map((item) => item.top);
  const holding = [...highWood, ...highHolders];
  let cloud = lowTops.length ? lowTops : woodTops;
  if (holding.length) {
    const fitPts = [...cloud, ...holding];
    const fitted = fitPts.length >= 3 ? newell(fitPts) : null;
    if (fitted) {
      up = fitted;
      cloud = fitPts;
    } else {
      const hingeSrc = woods.find((item) => item.long)?.long ?? sub(woods[woods.length - 1].top, woods[0].top);
      const hinge = projectDir(hingeSrc, up) ?? projectDir([1, 0, 0], up);
      const toHigh = sub(holding[0], lowSeat);
      if (hinge && vlen(toHigh) > 0.2) {
        const n = cross(hinge, toHigh);
        if (vlen(n) > 0.05) {
          up = norm(n);
          if (up[1] < 0) up = scale(up, -1);
          cloud = fitPts;
        }
      }
    }
  }
  const spanVec = sub(woods[woods.length - 1].top, woods[0].top);
  const longs = woods.map((item) => (item.long ? projectDir(item.long, up) : null)).filter((axis): axis is Vec3 => Boolean(axis));
  let long: Vec3;
  if (longs.length && agreeing(longs)) long = averageDir(longs, false);
  else long = projectDir(spanVec, up) ?? projectDir([1, 0, 0], up) ?? [1, 0, 0];
  if (dot(long, spanVec) < -1e-3) long = scale(long, -1);
  let side = norm(cross(up, long));
  if (vlen(side) < 0.2) {
    side = norm(cross(up, [1, 0, 0]));
    long = norm(cross(side, up));
  }
  const seat = centroid(cloud);
  let minL = Infinity;
  let maxL = -Infinity;
  let minS = Infinity;
  let maxS = -Infinity;
  let pMinL = Infinity;
  let pMaxL = -Infinity;
  let pMinS = Infinity;
  let pMaxS = -Infinity;
  const mark = (point: Vec3, outer: boolean) => {
    const rel = sub(point, seat);
    const dl = dot(rel, long);
    const ds = dot(rel, side);
    if (outer) {
      minL = Math.min(minL, dl);
      maxL = Math.max(maxL, dl);
      minS = Math.min(minS, ds);
      maxS = Math.max(maxS, ds);
    } else {
      pMinL = Math.min(pMinL, dl);
      pMaxL = Math.max(pMaxL, dl);
      pMinS = Math.min(pMinS, ds);
      pMaxS = Math.max(pMaxS, ds);
    }
  };
  for (const wood of woods) {
    mark(wood.top, false);
    mark(wood.top, true);
    const axis = wood.long ?? long;
    const across = wood.side ?? side;
    for (const el of [-wood.halfLong, wood.halfLong]) {
      for (const ea of [-wood.halfAcross, wood.halfAcross]) {
        mark(add(add(wood.top, scale(axis, el)), scale(across, ea)), true);
      }
    }
  }
  for (const holder of holders) {
    mark(holder.top, false);
    mark(holder.top, true);
  }
  const pointLen = Math.max(0, pMaxL - pMinL);
  const pointAcross = Math.max(0, pMaxS - pMinS);
  const outerLen = Math.max(pointLen, maxL - minL);
  const outerAcross = Math.max(pointAcross, maxS - minS);
  if (woods.length >= 2 && pointLen < 1 && pointAcross < 1) {
    return { error: "Those supports are too close. Click boards that are at least a few inches apart." };
  }
  if (woods.length < 2 && outerLen < 1 && outerAcross < 1) {
    return { error: "That board is too small to hold a sheet." };
  }
  let fitted = board.length == null ? outerLen : board.length;
  let centerL = board.length == null && outerLen <= stock.maxLength + 1 ? (minL + maxL) / 2 : (pMinL + pMaxL) / 2;
  const centerS = board.sheetWidth + 0.2 >= outerAcross ? (minS + maxS) / 2 : (pMinS + pMaxS) / 2;
  if (board.length == null && outerLen > stock.maxLength + 0.01) {
    fitted = stock.maxLength;
    if (outerLen > stock.maxLength + 1) centerL = (pMinL + pMaxL) / 2;
  }
  fitted = Math.max(1, fitted);
  return {
    up,
    long,
    side,
    seat,
    centerL,
    centerS,
    fitted,
    outerAcross,
    pointAcross,
    pointLen,
    tops: contacts.map((item) => item.top),
  };
}

/** Inches of sheet needed to cover the boards, outer face to outer face. Null if this isn't a sheet on boards. */
export function sheetCoverWidth(board: Board, ctx: LayoutContext): number | null {
  const measured = measureSheet(board, ctx, 0);
  if ("fitted" in measured) return measured.outerAcross;
  return null;
}

function pipeClash(
  origin: Vec3,
  long: Vec3,
  side: Vec3,
  up: Vec3,
  fitted: number,
  across: number,
  rise: number,
  ends: Vec3[],
  ctx: LayoutContext,
): boolean {
  const supports = supportIds(ends, ctx.members);
  for (let i = 0; i <= 4; i += 1) {
    for (const s of [-1, 0, 1]) {
      for (const u of [-1, 0, 1]) {
        const sample = add(
          origin,
          add(add(scale(long, fitted * (i / 4 - 0.5)), scale(side, (across / 2) * s)), scale(up, (rise / 2) * u)),
        );
        if (ends.some((point) => vlen(sub(sample, point)) < 2.6)) continue;
        for (const member of ctx.members) {
          if (supports.has(member.id)) continue;
          if (distPointSeg(sample, member.a, member.b) < ctx.pipeRadius + 0.15) return true;
        }
      }
    }
  }
  return false;
}

function layoutSheet(board: Board, ctx: LayoutContext, depth: number): BoardLayout | null {
  const measured = measureSheet(board, ctx, depth);
  if (!("fitted" in measured)) {
    if (!measured.error) return null;
    return refused(measured.error);
  }
  const stock = STOCK_MAP[board.kind];
  const rise = board.thickness;
  const across = board.sheetWidth;
  if (measured.pointAcross > stock.maxWidth + 0.35) {
    return refused(`${stock.label} is only 48" wide. Those boards span ${Math.round(measured.pointAcross)}" across.`, measured.seat, measured.fitted);
  }
  if (across + 0.35 < measured.pointAcross) {
    return refused(`Widen the sheet to ${Math.ceil(measured.pointAcross)}" so it still sits on every board.`, measured.seat, measured.fitted);
  }
  if (measured.pointLen > stock.maxLength + 0.35) {
    return refused(`${stock.label} only goes to 8 ft, a 4×8 sheet. Shorten the run.`, measured.seat, measured.fitted);
  }
  if (board.length != null && board.length + 0.25 < measured.pointLen) {
    return refused("That sheet is too short to sit on every board you clicked. Lengthen it, or cover the boards.", measured.seat, board.length);
  }
  if (measured.fitted > stock.maxLength + 0.01) {
    return refused(`${stock.label} only goes to 8 ft, a 4×8 sheet. Shorten it.`, measured.seat, measured.fitted);
  }
  const along = board.along ?? 0;
  const cross = board.cross ?? 0;
  const origin = add(
    add(add(measured.seat, scale(measured.up, rise / 2)), scale(measured.long, measured.centerL + along)),
    scale(measured.side, measured.centerS + cross),
  );
  if (pipeClash(origin, measured.long, measured.side, measured.up, measured.fitted, across, rise, measured.tops, ctx)) {
    return refused(`A ${stock.label} runs into another pipe there. Slide it, or use a smaller sheet.`, origin, measured.fitted);
  }
  return {
    error: null,
    origin,
    long: measured.long,
    side: measured.side,
    up: measured.up,
    length: measured.fitted,
    across,
    rise,
  };
}

/** Where a board sits, or why it can't. Null until it has enough mounts. */
export function layoutBoard(board: Board, ctx: LayoutContext, depth = 0): BoardLayout | null {
  if (!canPlaceLumber(board)) return null;
  for (const anchor of board.anchors) {
    if (anchor.ref.startsWith("board:")) {
      if (!ctx.boards.some((item) => item.id === anchor.ref.slice(6))) return refused("That board is gone. Pick another.");
      continue;
    }
    if (anchor.ref.startsWith("strap:")) {
      if (!ctx.straps.some((item) => item.id === anchor.ref.slice(6))) return refused("That one-hole strap is gone. Pick another.");
      continue;
    }
    const fitting = resolveClamp(anchor, ctx.fittings);
    if (!fitting) return refused("One of those clamps is gone. Remove it and pick another.");
    if (!WOOD_SKUS.has(fitting.sku)) {
      const name =
        fitting.sku === "90" || fitting.sku === "180" || fitting.sku === "4way" || fitting.sku === "5way"
          ? "corner"
          : fitting.sku === "45"
            ? "45°"
            : fitting.sku === "T"
              ? "tee"
              : fitting.sku === "hinge"
                ? "hinge"
                : fitting.sku === "coupling"
                  ? "coupling"
                  : fitting.sku === "cross"
                    ? "cross"
                    : "clamp";
      return refused(`A ${name} can't hold a board. Screw lumber to a flange or a one-hole strap, or to another board.`);
    }
  }
  const stock = STOCK_MAP[board.kind];
  if (stock.sheet && board.anchors.some((anchor) => anchor.ref.startsWith("board:"))) return layoutSheet(board, ctx, depth);
  const points = board.anchors.map((anchor) => resolvePoint(anchor, ctx, depth));
  if (points.some((point) => !point)) return refused("One of those clamps is gone. Remove it and pick another.");
  const ends = points as Vec3[];
  const a = ends[0];
  const b = ends[ends.length - 1];
  const spanVec = sub(b, a);
  const span = vlen(spanVec);
  if (span < 6) {
    return { error: "Those clamps are too close. A board needs at least 6\" between the ends.", origin: a, long: [0, 1, 0], side: [1, 0, 0], up: [0, 0, 1], length: span, across: 0, rise: 0 };
  }
  for (let i = 1; i < ends.length - 1; i += 1) {
    if (distPointSeg(ends[i], a, b) > 2) {
      return {
        error: "Those clamps aren't in one straight line. A board can use several clamps, but they have to line up.",
        origin: a,
        long: norm(spanVec),
        side: [1, 0, 0],
        up: [0, 0, 1],
        length: span,
        across: 0,
        rise: 0,
      };
    }
  }
  const length = board.length == null ? span : board.length;
  if (board.length != null && board.length < span - 0.25) {
    return { error: "That board is too short to reach both clamps. Lengthen it, or use the length of the clamps.", origin: a, long: norm(spanVec), side: [1, 0, 0], up: [0, 0, 1], length, across: 0, rise: 0 };
  }
  const fitted = board.length == null ? span : Math.max(span, length);
  if (fitted > stock.maxLength + 0.01) {
    const limit = stock.sheet ? "8 ft, a 4×8 sheet" : `${Math.round(stock.maxLength / 12)} ft`;
    return {
      error: `${stock.label} only goes to ${limit}. Shorten it.`,
      origin: a,
      long: norm(spanVec),
      side: [1, 0, 0],
      up: [0, 0, 1],
      length: fitted,
      across: 0,
      rise: 0,
    };
  }
  const spare = fitted - span;
  const along = board.length == null ? 0 : Math.max(-spare / 2, Math.min(spare / 2, board.along ?? 0));
  const across = stock.sheet ? board.sheetWidth : board.face === "edge" ? stock.thick : stock.wide;
  const rise = stock.sheet ? board.thickness : board.face === "edge" ? stock.wide : stock.thick;
  if (stock.sheet && board.sheetWidth > stock.maxWidth + 0.01) {
    return { error: `${stock.label} is only sold ${stock.maxWidth}" wide. A 4×8 is 48" across.`, origin: a, long: norm(spanVec), side: [1, 0, 0], up: [0, 0, 1], length, across, rise };
  }
  const { long, side, up } = boardFrame(spanVec, ends, ctx.members);
  const verticalBoard = Math.abs(long[1]) > 0.92;
  let seat = ctx.pipeRadius;
  const underRef = board.anchors.find((anchor) => anchor.ref.startsWith("board:"));
  if (underRef) {
    const under = ctx.boards.find((item) => item.id === underRef.ref.slice(6));
    const underLay = under ? layoutBoard(under, ctx, depth + 1) : null;
    if (underLay && !underLay.error) seat = underLay.rise / 2;
  }
  const offset = seat + (verticalBoard ? across / 2 : rise / 2);
  const mid = add(scale(add(a, b), 0.5), scale(long, along));
  const origin = verticalBoard ? add(mid, scale(side, offset)) : add(mid, scale(up, offset));
  if (pipeClash(origin, long, side, up, fitted, across, rise, ends, ctx)) {
    const name = stock.sheet ? stock.label : `${stock.label}${board.face === "edge" ? " on end" : ""}`;
    return {
      error: `A ${name} is too large there — it runs into another pipe. Pick a smaller piece, lay it flat, or narrow the sheet.`,
      origin,
      long,
      side,
      up,
      length: fitted,
      across,
      rise,
    };
  }
  return { error: null, origin, long, side, up, length: fitted, across, rise };
}

/** How far the board hangs past the first and last clamp. */
export function boardHang(board: Pick<Board, "length" | "along">, span: number): { length: number; along: number; start: number; end: number } {
  const fitted = board.length == null ? span : Math.max(span, board.length);
  const spare = board.length == null ? 0 : fitted - span;
  const limit = spare / 2;
  const along = board.length == null ? 0 : Math.max(-limit, Math.min(limit, board.along ?? 0));
  return { length: fitted, along, start: limit - along, end: limit + along };
}

export type SlideAxis = "along" | "cross";

function sheetStillCovers(board: Board, ctx: LayoutContext): string | null {
  const laid = layoutBoard(board, ctx);
  if (!laid || laid.error) return laid?.error ?? "That sheet can't move yet.";
  const measured = measureSheet(board, ctx, 0);
  if (!("tops" in measured)) return measured.error || "That sheet can't move yet.";
  for (const top of measured.tops) {
    const rel = sub(top, laid.origin);
    if (Math.abs(dot(rel, laid.long)) > laid.length / 2 + 0.3) return "That would slide the sheet off a board.";
    if (Math.abs(dot(rel, laid.side)) > laid.across / 2 + 0.3) return "That would slide the sheet off a board.";
  }
  return null;
}

/**
 * Slide a board along its length. Room on the other end is used first.
 * At a clamp, the next step lets this end hang farther past the frame.
 * A sheet on boards slides in its own plane instead, and will not uncover a board it sits on.
 */
export function nudgeBoardSlide(
  board: Board,
  dir: 1 | -1,
  ctx: LayoutContext,
  axis: SlideAxis = "along",
): { board: Board; error: string | null } {
  if (!canPlaceLumber(board)) return { board, error: "Click the lumber this sits on, or two clamps." };
  const stock = STOCK_MAP[board.kind];
  if (stock.sheet && board.anchors.some((anchor) => anchor.ref.startsWith("board:"))) {
    const next: Board = {
      ...board,
      along: (board.along ?? 0) + (axis === "along" ? dir : 0),
      cross: (board.cross ?? 0) + (axis === "cross" ? dir : 0),
    };
    const error = sheetStillCovers(next, ctx);
    if (error) return { board, error };
    return { board: next, error: null };
  }
  const probe = layoutBoard({ ...board, length: null, along: 0 }, ctx);
  if (!probe || probe.error) return { board, error: probe?.error ?? "That board can't move yet." };
  const span = probe.length;
  const cur = boardHang(board, span);
  let start = cur.start;
  let end = cur.end;
  const step = 1;
  if (dir > 0) {
    const steal = Math.min(start, step);
    start -= steal;
    end += steal + (step - steal);
  } else {
    const steal = Math.min(end, step);
    end -= steal;
    start += steal + (step - steal);
  }
  const cap = stock.maxLength;
  if (span + start + end > cap + 0.01) {
    const limit = stock.sheet ? "8 ft" : `${Math.round(cap / 12)} ft`;
    return { board, error: `That's as long as this piece goes (${limit}). The board was not moved.` };
  }
  const next: Board = { ...board, length: span + start + end, along: (end - start) / 2 };
  const laid = layoutBoard(next, ctx);
  if (!laid || laid.error) return { board, error: laid?.error ?? "That board can't move that way. The board was not moved." };
  return { board: next, error: null };
}

export function boardLook(kind: StockId): { color: string; opacity: number; metalness: number; roughness: number } {
  if (kind === "plastic") return { color: "#d7f4ee", opacity: 0.4, metalness: 0.04, roughness: 0.08 };
  if (kind === "shingle") return { color: "#3e3a36", opacity: 1, metalness: 0.04, roughness: 0.88 };
  if (kind === "metal") return { color: "#c5ccd2", opacity: 1, metalness: 0.74, roughness: 0.3 };
  if (kind === "osb") return { color: "#d4b483", opacity: 1, metalness: 0, roughness: 0.88 };
  return { color: "#c4a06a", opacity: 1, metalness: 0.02, roughness: 0.78 };
}

export function lumberSlideSelfCheck(): void {
  const ctx: LayoutContext = {
    fittings: [
      { id: "fit:a:0", sku: "flange", position: [0, 0, 0] },
      { id: "fit:b:0", sku: "flange", position: [48, 0, 0] },
    ],
    members: [
      { id: "post:a", a: [0, 0, 0], b: [0, 72, 0] },
      { id: "post:b", a: [48, 0, 0], b: [48, 72, 0] },
    ],
    boards: [],
    straps: [],
    pipeRadius: 0.5,
  };
  const board: Board = {
    id: "board",
    kind: "2x4",
    face: "flat",
    run: "horizontal",
    anchors: [
      { ref: "fit:a:0", at: [0, 0, 0] },
      { ref: "fit:b:0", at: [48, 0, 0] },
    ],
    length: null,
    along: 0,
    sheetWidth: 3.5,
    thickness: 1.5,
  };
  const fit = layoutBoard(board, ctx);
  if (!fit || fit.error || Math.abs(fit.length - 48) > 1e-6) throw new Error(`fit to clamps ${fit?.error ?? fit?.length}`);
  const grown = nudgeBoardSlide(board, 1, ctx);
  if (grown.error || Math.abs((grown.board.length ?? 0) - 49) > 1e-6 || Math.abs((grown.board.along ?? 0) - 0.5) > 1e-6) {
    throw new Error(`extend ${grown.error} len ${grown.board.length} along ${grown.board.along}`);
  }
  const hung = layoutBoard(grown.board, ctx);
  if (!hung || hung.error || Math.abs(hung.origin[0] - 24.5) > 0.2) throw new Error(`hung origin ${hung?.error ?? hung?.origin}`);
  const back = nudgeBoardSlide(grown.board, -1, ctx);
  if (back.error || Math.abs((back.board.length ?? 0) - 49) > 1e-6 || Math.abs((back.board.along ?? 0) + 0.5) > 1e-6) {
    throw new Error(`slide back ${back.error} len ${back.board.length} along ${back.board.along}`);
  }
  const sloped = layoutBoard(
    {
      ...board,
      anchors: [
        { ref: "fit:a:0", at: [0, 12, 0] },
        { ref: "fit:b:0", at: [36, 48, 0] },
      ],
    },
    {
      ...ctx,
      fittings: [
        { id: "fit:a:0", sku: "flange", position: [0, 12, 0] },
        { id: "fit:b:0", sku: "flange", position: [36, 48, 0] },
      ],
    },
  );
  if (!sloped || sloped.error || sloped.long[1] < 0.6) throw new Error(`sloped board ${sloped?.error ?? sloped?.long}`);
  const roof = layoutBoard(
    {
      ...board,
      kind: "osb",
      sheetWidth: 24,
      thickness: 0.5,
      anchors: [
        { ref: "strap:s1", at: [24, 24, 0] },
        { ref: "strap:s2", at: [24, 24, 24] },
      ],
    },
    {
      fittings: [],
      members: [
        { id: "r1", a: [0, 0, 0], b: [48, 48, 0] },
        { id: "r2", a: [0, 0, 24], b: [48, 48, 24] },
      ],
      boards: [],
      straps: [
        { id: "s1", position: [24, 24, 0] },
        { id: "s2", position: [24, 24, 24] },
      ],
      pipeRadius: 0.5,
    },
  );
  if (!roof || roof.error || roof.up[1] < 0.6 || Math.abs(roof.up[0]) < 0.4) {
    throw new Error(`roof tilt ${roof?.error ?? roof?.up}`);
  }
  const tooBig = layoutBoard({ ...board, kind: "osb", length: 120, sheetWidth: 48, thickness: 0.5 }, ctx);
  if (!tooBig?.error?.includes("8 ft")) throw new Error(`sheet cap ${tooBig?.error}`);

  const slopedBoards: Board[] = [
    {
      id: "ra",
      kind: "2x4",
      face: "flat",
      run: "horizontal",
      anchors: [
        { ref: "fit:a:0", at: [0, 0, 0] },
        { ref: "fit:b:0", at: [48, 48, 0] },
      ],
      length: null,
      along: 0,
      sheetWidth: 3.5,
      thickness: 1.5,
    },
    {
      id: "rb",
      kind: "2x4",
      face: "flat",
      run: "horizontal",
      anchors: [
        { ref: "fit:c:0", at: [0, 0, 16] },
        { ref: "fit:d:0", at: [48, 48, 16] },
      ],
      length: null,
      along: 0,
      sheetWidth: 3.5,
      thickness: 1.5,
    },
    {
      id: "rc",
      kind: "2x4",
      face: "flat",
      run: "horizontal",
      anchors: [
        { ref: "fit:e:0", at: [0, 0, 32] },
        { ref: "fit:f:0", at: [48, 48, 32] },
      ],
      length: null,
      along: 0,
      sheetWidth: 3.5,
      thickness: 1.5,
    },
  ];
  const slopeCtx: LayoutContext = {
    fittings: [
      { id: "fit:a:0", sku: "flange", position: [0, 0, 0] },
      { id: "fit:b:0", sku: "flange", position: [48, 48, 0] },
      { id: "fit:c:0", sku: "flange", position: [0, 0, 16] },
      { id: "fit:d:0", sku: "flange", position: [48, 48, 16] },
      { id: "fit:e:0", sku: "flange", position: [0, 0, 32] },
      { id: "fit:f:0", sku: "flange", position: [48, 48, 32] },
    ],
    members: [],
    boards: slopedBoards,
    straps: [],
    pipeRadius: 0.5,
  };
  const osb: Board = {
    id: "osb",
    kind: "osb",
    face: "flat",
    run: "horizontal",
    anchors: [
      { ref: "board:ra", at: [24, 24, 0] },
      { ref: "board:rb", at: [24, 24, 16] },
      { ref: "board:rc", at: [24, 24, 32] },
    ],
    length: null,
    along: 0,
    cross: 0,
    sheetWidth: 48,
    thickness: 0.5,
  };
  const deck = layoutBoard(osb, slopeCtx);
  const rafter = layoutBoard(slopedBoards[0], slopeCtx);
  if (!deck || deck.error || !rafter || rafter.error) throw new Error(`deck ${deck?.error ?? "missing"} / ${rafter?.error ?? ""}`);
  const tilt = Math.abs(dot(deck.up, rafter.up));
  if (tilt < 0.98 || deck.up[1] < 0.6) throw new Error(`deck should match the 2x4 slope ${deck.up} tilt ${tilt}`);
  const bottom = sub(deck.origin, scale(deck.up, deck.rise / 2));
  const top = add(rafter.origin, scale(rafter.up, rafter.rise / 2));
  const gap = Math.abs(dot(sub(bottom, top), deck.up));
  if (gap > 0.2) throw new Error(`sheet should sit on the 2x4s, gap ${gap}`);
  const cover = sheetCoverWidth(osb, slopeCtx);
  if (cover == null || cover < 32 || cover > 40) throw new Error(`cover width ${cover}`);
  const slid = nudgeBoardSlide(osb, 1, slopeCtx, "along");
  if (slid.error || Math.abs((slid.board.along ?? 0) - 1) > 1e-6) throw new Error(`sheet slide ${slid.error} along ${slid.board.along}`);
  const off = nudgeBoardSlide({ ...osb, along: 50 }, 1, slopeCtx, "along");
  if (!off.error?.includes("slide")) throw new Error(`sheet should stop at the board ${off.error}`);
  const held = layoutBoard(
    { ...osb, anchors: [...osb.anchors, { ref: "fit:h:0", at: [24, 40, 16] }] },
    {
      ...slopeCtx,
      fittings: [...slopeCtx.fittings, { id: "fit:h:0", sku: "flange", position: [24, 40, 16] }],
    },
  );
  if (!held || held.error) throw new Error(`held sheet ${held?.error}`);
  const heldTilt = Math.abs(dot(held.up, rafter.up));
  if (heldTilt > 0.98) throw new Error(`a higher clamp should lift the sheet ${held.up} tilt ${heldTilt}`);
  const roofCtx: LayoutContext = { ...slopeCtx, boards: [...slopeCtx.boards, osb] };
  for (const kind of ["shingle", "metal"] as const) {
    const cap = layoutBoard(
      {
        id: kind,
        kind,
        face: "flat",
        run: "horizontal",
        anchors: [{ ref: "board:osb", at: [24, 30, 16] }],
        length: null,
        along: 0,
        cross: 0,
        sheetWidth: 48,
        thickness: kind === "shingle" ? 0.25 : 0.05,
      },
      roofCtx,
    );
    if (!cap || cap.error) throw new Error(`${kind} on osb ${cap?.error ?? "missing"}`);
    const match = Math.abs(dot(cap.up, deck.up));
    if (match < 0.98) throw new Error(`${kind} should follow the osb ${cap.up} match ${match}`);
    const capBottom = sub(cap.origin, scale(cap.up, cap.rise / 2));
    const osbTop = add(deck.origin, scale(deck.up, deck.rise / 2));
    const lift = Math.abs(dot(sub(capBottom, osbTop), cap.up));
    if (lift > 0.2) throw new Error(`${kind} should sit on the osb, gap ${lift}`);
  }
  const stick = layoutBoard({ ...board, anchors: [{ ref: "board:osb", at: [24, 24, 16] }] }, roofCtx);
  if (stick) throw new Error("a 2x4 still needs two mounts");
}
