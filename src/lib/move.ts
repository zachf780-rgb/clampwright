import { endHeights, normalizeProject, reseatHosts, type FullProject, type Project, type SketchLink, type SketchNode } from "./build";
import { formatLen } from "./format";

export type MoveTarget =
  | { kind: "post"; id: string }
  | { kind: "bar"; id: string }
  | { kind: "end"; nodeId: string; linkId: string | null; end: "a" | "b" | null; flange: boolean; y: number | null }
  | { kind: "grid-post" }
  | { kind: "grid-rail"; axis: "x" | "z"; level: number; bay: number }
  | { kind: "grid-level"; y: number };

export type MoveAxis = "+x" | "-x" | "+z" | "-z" | "+y" | "-y";

export type MoveDelta = { x: number; y: number; z: number };

const STEP: Record<MoveAxis, MoveDelta> = {
  "+x": { x: 1, y: 0, z: 0 },
  "-x": { x: -1, y: 0, z: 0 },
  "+z": { x: 0, y: 0, z: 1 },
  "-z": { x: 0, y: 0, z: -1 },
  "+y": { x: 0, y: 1, z: 0 },
  "-y": { x: 0, y: -1, z: 0 },
};

export const MOVE_AXES: MoveAxis[] = ["+y", "-x", "-y", "+x", "-z", "+z"];

export function axisStep(axis: MoveAxis): MoveDelta {
  return STEP[axis];
}

export function axisName(axis: MoveAxis): string {
  if (axis === "+x") return "right";
  if (axis === "-x") return "left";
  if (axis === "+z") return "back";
  if (axis === "-z") return "forward";
  if (axis === "+y") return "up";
  return "down";
}

function r32(n: number): number {
  return Math.round(n * 32) / 32;
}

function addDelta(a: MoveDelta, b: MoveDelta): MoveDelta {
  return { x: r32(a.x + b.x), y: r32(a.y + b.y), z: r32(a.z + b.z) };
}

export function addAxis(delta: MoveDelta, axis: MoveAxis): MoveDelta {
  return addDelta(delta, STEP[axis]);
}

function cloneNodes(nodes: SketchNode[]): SketchNode[] {
  return nodes.map((node) => ({ ...node }));
}

function shiftEnd(link: SketchLink, end: "a" | "b", dy: number): SketchLink {
  const [ya, yb] = endHeights(link);
  if (end === "b") {
    const next = r32(yb + dy);
    return { ...link, yB: Math.abs(next - ya) < 1 / 16 ? undefined : next };
  }
  const next = r32(ya + dy);
  return { ...link, y: next, yB: Math.abs(yb - next) < 1 / 16 ? undefined : yb };
}

function shiftBoth(link: SketchLink, dy: number): SketchLink {
  const [ya, yb] = endHeights(link);
  const na = r32(ya + dy);
  const nb = r32(yb + dy);
  return { ...link, y: na, yB: Math.abs(nb - na) < 1 / 16 ? undefined : nb };
}

function lift(node: SketchNode, y: number): boolean {
  if (node.height >= y + 1) return true;
  const next = r32(y + 1);
  if (next > 240 || next < 12) return false;
  node.height = next;
  return true;
}

function crowded(nodes: SketchNode[]): boolean {
  const posts = nodes.filter((node) => !node.host);
  for (let i = 0; i < posts.length; i++) {
    for (let j = i + 1; j < posts.length; j++) {
      if (Math.hypot(posts[i].x - posts[j].x, posts[i].z - posts[j].z) < 4) return true;
    }
  }
  return false;
}

function linksFit(nodes: SketchNode[], links: SketchLink[]): boolean {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const link of links) {
    const a = byId.get(link.a);
    const b = byId.get(link.b);
    if (!a || !b) return false;
    const span = Math.hypot(a.x - b.x, a.z - b.z);
    if (span < (a.host || b.host ? 3 : 6)) return false;
    const [ya, yb] = endHeights(link);
    if (ya < 1 || yb < 1 || ya > 240 || yb > 240) return false;
    if ((!a.host && ya > a.height + 0.05) || (!b.host && yb > b.height + 0.05)) return false;
  }
  for (const node of nodes) {
    if (node.host) {
      if (node.height < 1 || node.height > 240) return false;
      continue;
    }
    if (node.height < 12 || node.height > 240) return false;
  }
  return !crowded(nodes);
}

function commitSketch(project: FullProject, nodes: SketchNode[], links: SketchLink[]): FullProject | null {
  const seated = reseatHosts(nodes, links);
  if (!linksFit(seated.nodes, seated.links)) return null;
  return normalizeProject({ ...project, nodes: seated.nodes, links: seated.links });
}

export function projectWithDelta(base: Project, target: MoveTarget, delta: MoveDelta): FullProject | null {
  const project = normalizeProject(base);
  if (Math.abs(delta.x) < 0.001 && Math.abs(delta.y) < 0.001 && Math.abs(delta.z) < 0.001) return project;

  if (target.kind === "grid-post") {
    if (delta.x || delta.z) return null;
    const postHeight = r32(project.postHeight + delta.y);
    if (postHeight < 12 || postHeight > 240) return null;
    return normalizeProject({
      ...project,
      postHeight,
      levels: project.levels.map((level) => Math.min(level, postHeight - 0.5)),
    });
  }

  if (target.kind === "grid-level") {
    if (delta.x || delta.z) return null;
    const next = r32(target.y + delta.y);
    if (next < 1 || next > project.postHeight - 0.5) return null;
    return normalizeProject({
      ...project,
      levels: project.levels.map((level) => (Math.abs(level - target.y) < 0.05 ? next : level)),
    });
  }

  if (target.kind === "grid-rail") {
    const along = target.axis === "x" ? delta.x : delta.z;
    const cross = target.axis === "x" ? delta.z : delta.x;
    if (cross) return null;
    const key = target.axis === "x" ? "baysX" : "baysZ";
    const bays = project[key];
    if (bays[target.bay] == null) return null;
    const nextBay = r32(bays[target.bay] + along);
    if (nextBay < 4 || nextBay > 360) return null;
    const level = project.levels[target.level];
    if (level == null) return null;
    const nextLevel = r32(level + delta.y);
    if (nextLevel < 1 || nextLevel > project.postHeight - 0.5) return null;
    return normalizeProject({
      ...project,
      [key]: bays.map((bay, index) => (index === target.bay ? nextBay : bay)),
      levels: project.levels.map((item, index) => (index === target.level ? nextLevel : item)),
    });
  }

  if (project.mode !== "sketch") return null;
  const nodes = cloneNodes(project.nodes);
  let links = project.links.map((link) => ({ ...link }));

  if (target.kind === "post") {
    const node = nodes.find((item) => item.id === target.id);
    if (!node) return null;
    node.x = r32(node.x + delta.x);
    node.z = r32(node.z + delta.z);
    node.height = r32(node.height + delta.y);
    if (!linksFit(nodes, links)) return null;
    return normalizeProject({ ...project, nodes, links });
  }

  if (target.kind === "bar") {
    const link = links.find((item) => item.id === target.id);
    if (!link) return null;
    const a = nodes.find((node) => node.id === link.a);
    const b = nodes.find((node) => node.id === link.b);
    if (!a || !b) return null;
    a.x = r32(a.x + delta.x);
    a.z = r32(a.z + delta.z);
    b.x = r32(b.x + delta.x);
    b.z = r32(b.z + delta.z);
    links = links.map((item) => (item.id === link.id ? shiftBoth(item, delta.y) : item));
    const moved = links.find((item) => item.id === link.id)!;
    const [ya, yb] = endHeights(moved);
    if (!a.host && !lift(a, ya)) return null;
    if (!b.host && !lift(b, yb)) return null;
    return commitSketch(project, nodes, links);
  }

  const node = nodes.find((item) => item.id === target.nodeId);
  if (!node) return null;
  if (target.flange && delta.y) return null;
  node.x = r32(node.x + delta.x);
  node.z = r32(node.z + delta.z);
  if (delta.y) {
    links = links.map((link) => {
      const onA = link.a === node.id;
      const onB = link.b === node.id;
      if (!onA && !onB) return link;
      if (target.linkId && link.id !== target.linkId) return link;
      if (target.linkId && target.end) return shiftEnd(link, target.end, delta.y);
      const [ya, yb] = endHeights(link);
      let next = link;
      if (onA && (target.y == null || Math.abs(ya - target.y) < 0.08)) next = shiftEnd(next, "a", delta.y);
      if (onB && (target.y == null || Math.abs(yb - target.y) < 0.08)) next = shiftEnd(next, "b", delta.y);
      return next;
    });
    const high = links.reduce((max, link) => {
      const [ya, yb] = endHeights(link);
      return Math.max(max, link.a === node.id ? ya : 0, link.b === node.id ? yb : 0);
    }, 0);
    if (!node.host && !lift(node, high)) return null;
  }
  return commitSketch(project, nodes, links);
}

export function axisAllowed(base: Project, target: MoveTarget, delta: MoveDelta, axis: MoveAxis): boolean {
  return projectWithDelta(base, target, addAxis(delta, axis)) != null;
}

export function movedText(delta: MoveDelta, unit: "in" | "ft"): string {
  const parts: string[] = [];
  if (Math.abs(delta.x) >= 0.01) parts.push(`${formatLen(Math.abs(delta.x), unit)} ${delta.x > 0 ? "right" : "left"}`);
  if (Math.abs(delta.z) >= 0.01) parts.push(`${formatLen(Math.abs(delta.z), unit)} ${delta.z > 0 ? "back" : "forward"}`);
  if (Math.abs(delta.y) >= 0.01) parts.push(`${formatLen(Math.abs(delta.y), unit)} ${delta.y > 0 ? "up" : "down"}`);
  return parts.length ? parts.join(" · ") : "Pick an arrow";
}

export function targetFromSelection(project: Project, selectedId: string | null, pointY?: number): MoveTarget | null {
  const full = normalizeProject(project);
  if (!selectedId) return null;
    if (full.mode !== "sketch") {
    if (selectedId.startsWith("post")) return { kind: "grid-post" };
    if (selectedId.startsWith("rail-x-") || selectedId.startsWith("rail-z-")) {
      const parts = selectedId.split("-");
      const axis = parts[1] === "z" ? "z" : "x";
      const level = Number(parts[2]);
      const bay = Number(parts[parts.length - 1]);
      if (!Number.isFinite(level) || !Number.isFinite(bay)) return null;
      return { kind: "grid-rail", axis, level, bay };
    }
    if (pointY != null && (selectedId.startsWith("fit:") || selectedId.startsWith("hinge:") || selectedId.startsWith("bfit:"))) {
      return { kind: "grid-level", y: pointY };
    }
    return null;
  }
  if (selectedId.startsWith("post:")) return { kind: "post", id: selectedId.slice(5) };
  if (selectedId.startsWith("rail:") || selectedId.startsWith("brace:")) return { kind: "bar", id: selectedId.split(":")[1] ?? "" };
  if (selectedId.startsWith("flange:")) return { kind: "end", nodeId: selectedId.slice(7), linkId: null, end: null, flange: true, y: null };
  if (selectedId.startsWith("hinge:") || selectedId.startsWith("bfit:")) {
    const parts = selectedId.split(":");
    const link = full.links.find((item) => item.id === parts[1]);
    if (!link) return null;
    const end = parts[2] === "b" ? "b" : "a";
    return { kind: "end", nodeId: end === "b" ? link.b : link.a, linkId: link.id, end, flange: false, y: null };
  }
  if (selectedId.startsWith("fit:")) {
    const rest = selectedId.slice(4);
    const cut = rest.lastIndexOf(":");
    if (cut < 0) return null;
    return { kind: "end", nodeId: rest.slice(0, cut), linkId: null, end: null, flange: false, y: Number(rest.slice(cut + 1)) / 32 };
  }
  return null;
}

export function sameTarget(a: MoveTarget, b: MoveTarget): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function totalText(project: FullProject, target: MoveTarget, unit: "in" | "ft"): string {
  const L = (n: number) => formatLen(n, unit);
  if (target.kind === "grid-post") return `Height ${L(project.postHeight)}`;
  if (target.kind === "grid-level") {
    const level = project.levels.find((item) => Math.abs(item - (target.y + 0)) < 1) ?? project.levels[0];
    return `Height ${L(level ?? target.y)}`;
  }
  if (target.kind === "grid-rail") {
    const bays = target.axis === "x" ? project.baysX : project.baysZ;
    const bay = bays[target.bay] ?? 0;
    const level = project.levels[target.level] ?? 0;
    return `This bay ${L(bay)} · height ${L(level)}`;
  }
  if (target.kind === "post") {
    const node = project.nodes.find((item) => item.id === target.id);
    if (!node) return "";
    return `Height ${L(node.height)} · X ${L(node.x)} · Z ${L(node.z)}`;
  }
  if (target.kind === "bar") {
    const link = project.links.find((item) => item.id === target.id);
    const a = project.nodes.find((node) => node.id === link?.a);
    const b = project.nodes.find((node) => node.id === link?.b);
    if (!link || !a || !b) return "";
    const span = Math.hypot(b.x - a.x, b.z - a.z);
    const [ya, yb] = endHeights(link);
    return Math.abs(ya - yb) < 1 / 16 ? `Span ${L(span)} · height ${L(ya)}` : `Span ${L(span)} · ${L(ya)} to ${L(yb)}`;
  }
  const node = project.nodes.find((item) => item.id === target.nodeId);
  const link = target.linkId ? project.links.find((item) => item.id === target.linkId) : null;
  if (link && node) {
    const other = project.nodes.find((item) => item.id === (link.a === node.id ? link.b : link.a));
    const span = other ? Math.hypot(other.x - node.x, other.z - node.z) : 0;
    const [ya, yb] = endHeights(link);
    const here = link.a === node.id ? ya : yb;
    return `This side ${L(here)} · span ${L(span)}`;
  }
  if (!node) return "";
  return `X ${L(node.x)} · Z ${L(node.z)}`;
}
