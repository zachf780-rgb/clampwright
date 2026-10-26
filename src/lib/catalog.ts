/** EMT (ANSI C80.3 / UL 797) and MakerPipe fitting data.
 *
 * Cut setbacks match MakerPipe's public conduit length calculator
 * (pipe-calculator.js): outside / center / inside adjustments for T, 90°,
 * 180°, 4-way, 5-way, and couplings. 1/2" and 3/4" share a row there because
 * 1/2" EMT uses the 3/4" clamp plus adapter shims.
 *
 * Prices are MakerPipe "from" prices for planning, not a quote.
 */

export type TradeId = "half" | "three-quarter" | "one";
export type FamilyId = "3/4" | "1";
export type Sku =
  | "T"
  | "90"
  | "180"
  | "4way"
  | "5way"
  | "45"
  | "hinge"
  | "flange"
  | "coupling"
  | "cross";

export type Finish = "zinc" | "black";

export type Trade = {
  id: TradeId;
  family: FamilyId;
  label: string;
  short: string;
  od: number;
  wall: number;
  id_in: number;
  lbPerFt: number;
  shims: boolean;
  summary: string;
};

export const TRADES: Trade[] = [
  {
    id: "half",
    family: "3/4",
    label: '1/2"',
    short: "1/2",
    od: 0.706,
    wall: 0.042,
    id_in: 0.622,
    lbPerFt: 0.3,
    shims: true,
    summary:
      "Lightest stick. MakerPipe doesn't make a native 1/2\" clamp — you use the 3/4\" fitting with a 3/4\" to 1/2\" adapter shim on every pipe the clamp grabs.",
  },
  {
    id: "three-quarter",
    family: "3/4",
    label: '3/4"',
    short: "3/4",
    od: 0.922,
    wall: 0.049,
    id_in: 0.824,
    lbPerFt: 0.46,
    shims: false,
    summary:
      "The size the system was built around. Most clamps, flanges, and bundles are native 3/4\" EMT. Best default for furniture and shop racks.",
  },
  {
    id: "one",
    family: "1",
    label: '1"',
    short: "1",
    od: 1.163,
    wall: 0.057,
    id_in: 1.049,
    lbPerFt: 0.67,
    shims: false,
    summary:
      "Stiffer, heavier, and its own fitting family. T, 90°, 180°, 4-way, 5-way, 45°, hinge, coupling, and flange are all sold for 1\" EMT. The 1\" clamps cost more than the 3/4\" ones and will not grab 3/4\" tube.",
  },
];

export const TRADE_MAP: Record<TradeId, Trade> = Object.fromEntries(
  TRADES.map((t) => [t.id, t]),
) as Record<TradeId, Trade>;

export type ArmSpec = { setback: number; outer: number; inner: number };

export type FamilySpec = {
  id: FamilyId;
  T: ArmSpec;
  corner: ArmSpec;
  inline: ArmSpec;
  coupleGap: number;
  /** Approximate terminating-arm setback for 45° and adjustable hinges.
   * MakerPipe's calculator does not publish these. */
  braceSetback: number;
};

/** Inches from the post centerline. */
export const FAMILIES: Record<FamilyId, FamilySpec> = {
  "3/4": {
    id: "3/4",
    T: { setback: 1.25, outer: 0.625, inner: 0.4375 },
    corner: { setback: 1.3125, outer: 0.5625, inner: 0.5625 },
    inline: { setback: 1.28125, outer: 0.5625, inner: 0.5625 },
    coupleGap: 0.75,
    braceSetback: 1.25,
  },
  "1": {
    id: "1",
    T: { setback: 1.75, outer: 0.625, inner: 0.625 },
    corner: { setback: 1.625, outer: 0.75, inner: 0.5 },
    inline: { setback: 1.6875, outer: 0.75, inner: 0.75 },
    coupleGap: 0,
    braceSetback: 1.75,
  },
};

export type ConnectorInfo = {
  sku: Sku;
  name: string;
  price: number;
  shims: number;
  trades: TradeId[];
  joint: string;
  detail: string;
  /** Silver 1" EMT variant. 3/4" and 1/2" keep `price` (1/2" shims are counted separately). */
  onePrice?: number;
};

export const CONNECTORS: ConnectorInfo[] = [
  {
    sku: "T",
    name: "T Connector",
    price: 3.74,
    shims: 2,
    trades: ["half", "three-quarter", "one"],
    joint: "Through pipe + one pipe at 90°",
    onePrice: 4.95,
    detail:
      "The everyday clamp. One pipe runs straight through; the other ends against the saddle. Also used as an elbow when the through pipe stops at the top of a post.",
  },
  {
    sku: "90",
    name: "90° Connector",
    price: 5.95,
    shims: 3,
    trades: ["half", "three-quarter", "one"],
    joint: "Through pipe + two pipes at 90°",
    onePrice: 8.79,
    detail:
      "Cube corner. The vertical post passes through and two rails end at a right angle to each other.",
  },
  {
    sku: "180",
    name: "180° Connector",
    price: 5.45,
    shims: 3,
    trades: ["half", "three-quarter", "one"],
    joint: "Through pipe + two pipes in a straight line",
    onePrice: 7.95,
    detail:
      "Keeps a long side straight. The post passes through; the rails on either side end opposite each other instead of stacking two T's.",
  },
  {
    sku: "4way",
    name: "4-Way Connector",
    price: 7.49,
    shims: 4,
    trades: ["half", "three-quarter", "one"],
    joint: "Through pipe + three pipes",
    onePrice: 10.95,
    detail:
      "Edge of a grid: a straight pair of rails plus one stem, with the post running through.",
  },
  {
    sku: "5way",
    name: "5-Way Connector",
    price: 8.49,
    shims: 5,
    trades: ["half", "three-quarter", "one"],
    joint: "Through pipe + four pipes",
    onePrice: 12.45,
    detail: "Interior post. Four rails end, one in each direction, around a continuous post.",
  },
  {
    sku: "45",
    name: "45° Connector",
    price: 5.45,
    shims: 2,
    trades: ["half", "three-quarter", "one"],
    joint: "Through pipe + one pipe at 45°",
    onePrice: 7.95,
    detail: "Fixed brace. Stronger than a hinge when the bay is square enough for a true 45°.",
  },
  {
    sku: "hinge",
    name: "Adjustable Angle Hinge",
    price: 3.24,
    shims: 2,
    trades: ["half", "three-quarter", "one"],
    joint: "Through pipe + one pipe at any angle to 90°",
    onePrice: 9.49,
    detail:
      "Locks at the angle you need, or stays loose as a hinge. Used here when a bay is too long for a 45° inside the post height.",
  },
  {
    sku: "flange",
    name: "Flange",
    price: 5.45,
    shims: 1,
    trades: ["half", "three-quarter", "one"],
    joint: "Pipe end to a flat surface",
    onePrice: 5.95,
    detail:
      "Bolts a post to the floor, a wall, or a board. Native for 3/4\" and 1\". The 1\" flange includes the longer bolts. 1/2\" uses the 3/4\" flange plus one shim.",
  },
  {
    sku: "coupling",
    name: "Structural Coupling",
    price: 5.45,
    shims: 2,
    trades: ["half", "three-quarter", "one"],
    joint: "Two pipes end to end",
    onePrice: 7.95,
    detail:
      "Splices a member longer than one stick. On 3/4\" and 1/2\" the fitting adds 3/4\" between pipe ends. A coupling is not a substitute for bracing.",
  },
  {
    sku: "cross",
    name: "Cross-over clamp",
    price: 4.95,
    shims: 2,
    trades: ["half", "three-quarter", "one"],
    joint: "Two pipes cross",
    onePrice: 6.95,
    detail:
      "Grabs two pipes where they cross. The cut list splits each pipe into the pieces on either side of the clamp.",
  },
];

export const CONNECTOR_MAP: Record<Sku, ConnectorInfo> = Object.fromEntries(
  CONNECTORS.map((c) => [c.sku, c]),
) as Record<Sku, ConnectorInfo>;

/** 3/4" clamp onto 1/2" EMT. */
export const SHIM_PRICE = 0.1;

/** 1" clamp onto 3/4" EMT. MakerPipe sells this shim; 1/2" into a 1" clamp is not a published fit. */
export const ONE_SHIM_PRICE = 0.15;

/** One-hole strap. A pack of 4 is $1.95. It snaps onto 1/2", 3/4", or 1" EMT and screws to wood. It does not shorten the pipe. */
export const STRAP_PACK = 4;
export const STRAP_PACK_PRICE = 1.95;
export const STRAP_PRICE = STRAP_PACK_PRICE / STRAP_PACK;

const SKU_SHORT: Record<Sku, string> = {
  T: "T",
  "90": "90°",
  "180": "180°",
  "4way": "4-way",
  "5way": "5-way",
  "45": "45°",
  hinge: "hinge",
  flange: "flange",
  coupling: "coupling",
  cross: "cross",
};

export function skuShort(sku: Sku | null | undefined): string {
  return sku ? SKU_SHORT[sku] : "clamp";
}

export const ALSO_SOLD: { name: string; note: string }[] = [
  {
    name: "Adjustable 180°",
    note: "Three pipes. The two end clamps swing up to 90° each way so a brace can land without stacking fittings. 3/4\" native, 1/2\" with shims.",
  },
  {
    name: "Adjustable angle flange",
    note: "Mounts a pipe to a board or wall at an angle. 3/4\" and shimmed 1/2\" only.",
  },
  {
    name: "135° connector",
    note: "Fixed obtuse corner when 90° is too sharp and a hinge is too loose.",
  },
  {
    name: "Cross-over clamp",
    note: "Two pipes cross. This builder cuts each one and counts a cross clamp. MakerPipe also sells a clamp that can grab uncut pipes.",
  },
  {
    name: "Top rail T",
    note: "Sized for chain-link top rail rather than a full structural T.",
  },
  {
    name: "Telescoping clamp",
    note: "Lets one size slide inside another — 3/4\" EMT fits inside 1\" EMT with room to spare.",
  },
];

export function connectorPrice(info: ConnectorInfo, trade: TradeId): number {
  if (trade === "one" && info.onePrice != null) return info.onePrice;
  return info.price;
}

export function tradeById(id: TradeId): Trade {
  return TRADE_MAP[id];
}
