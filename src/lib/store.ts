import { create } from "zustand";
import { persist } from "zustand/middleware";
import { endHeights, explodeGrid, fortyFiveLayout, hingeOpenMax, hostOffsetT, moveClamp, normalizeProject, nudgeFortyFive, railRunError, reseatHosts, snapSketch, squareFrom, buildProject, doorFrame, type FortyDir, type FullProject, type HingeKind, type MeasureRef, type Project, type SketchLink, type SketchNode, type TradeId } from "./build";
import { tradeById } from "./catalog";
import { canPlaceLumber, clampAnchor, layoutBoard, nudgeBoardSlide, pruneBoards, sheetCoverWidth, strapPoints, STOCK_MAP, WOOD_SKUS, type Board, type BoardAnchor, type BoardFace, type BoardRun, type LayoutContext, type SlideAxis, type StockId } from "./lumber";
import type { ShopLoad } from "./load";
import { addAxis, projectWithDelta, type MoveAxis, type MoveDelta, type MoveTarget } from "./move";

const base = {
  stick: 120 as const,
  kerf: 0.125,
  flanges: false,
  braces: false,
  showFigure: true,
  finish: "zinc" as const,
  stickPrice: 0,
  mode: "grid" as const,
  nodes: [] as SketchNode[],
  links: [] as SketchLink[],
  railHeight: 34,
};

export type Tool = "select" | "post" | "rail" | "hinge" | "door" | "erase" | "measure" | "lumber";

export type Template = {
  id: string;
  name: string;
  detail: string;
  project: Omit<Project, "id">;
};

export const TEMPLATES: Template[] = [
  {
    id: "workbench",
    name: "Workbench",
    detail: "60 × 24 outside, lower shelf",
    project: {
      ...base,
      name: "Workbench",
      trade: "three-quarter",
      baysX: [58.875],
      baysZ: [22.875],
      postHeight: 36,
      levels: [8, 35],
    },
  },
  {
    id: "shelf",
    name: "3-tier shelf",
    detail: "6 ft wide outside, 6 ft tall",
    project: {
      ...base,
      name: "3-tier shelf",
      trade: "three-quarter",
      baysX: [35.4375, 35.4375],
      baysZ: [14.875],
      postHeight: 72,
      levels: [8, 32, 56, 71],
    },
  },
  {
    id: "table",
    name: "Table frame",
    detail: "48 × 24 outside, top only",
    project: {
      ...base,
      name: "Table frame",
      trade: "three-quarter",
      baysX: [46.875],
      baysZ: [22.875],
      postHeight: 30,
      levels: [29],
    },
  },
  {
    id: "rack",
    name: "Clothing rack",
    detail: "48 outside, one top rail",
    project: {
      ...base,
      name: "Clothing rack",
      trade: "half",
      baysX: [46.75],
      baysZ: [],
      postHeight: 66,
      levels: [64],
    },
  },
  {
    id: "bench",
    name: "Potting bench",
    detail: "6 ft outside, with braces",
    project: {
      ...base,
      name: "Potting bench",
      trade: "three-quarter",
      baysX: [70.875],
      baysZ: [22.875],
      postHeight: 36,
      levels: [8, 35],
      braces: true,
    },
  },
  {
    id: "cube",
    name: "1\" cube",
    detail: "36 outside, 1 inch tube",
    project: {
      ...base,
      name: "1\" cube",
      trade: "one",
      baysX: [34.5],
      baysZ: [34.5],
      postHeight: 36,
      levels: [35],
    },
  },
];

function uid(): string {
  return crypto.randomUUID();
}

function drawingBody(raw: unknown): Project | null {
  if (!raw || typeof raw !== "object") return null;
  const wrapped = raw as { project?: unknown };
  const body = wrapped.project && typeof wrapped.project === "object" ? (wrapped.project as Partial<Project>) : (raw as Partial<Project>);
  if (body.trade !== "half" && body.trade !== "three-quarter" && body.trade !== "one") return null;
  return body as Project;
}

function rSign(sign: 1 | -1, inches: number): number {
  return sign * Math.abs(inches);
}

export type MoveSession = {
  target: MoveTarget;
  base: Project;
  delta: MoveDelta;
  axis: "x" | "y" | "z" | null;
  sign: 1 | -1;
};

export type DraftStop = {
  nodeId: string;
  railId: string | null;
  y: number;
};

export type PipeLean = { flip: boolean; shift: number } | null;

export type Draft = {
  kind: "rail";
  stops: DraftStop[];
  /** When set, one height applies to every post on the run. */
  sameHeight: boolean;
  /** One entry per pipe. null is a square pipe. Otherwise which way the 45° leans, and how far it has slid. */
  leans: PipeLean[];
  fortyFiveError: string | null;
};

export type LumberDraft = {
  run: BoardRun;
  kind: StockId;
  face: BoardFace;
  sheetWidth: number;
  thickness: number;
  /** Null means cut it to the distance between the clamps. Longer than that hangs past them. */
  length: number | null;
  /** Inches slid along the board from center. Positive moves toward the last clamp. */
  along: number;
  /** Inches a sheet has slid across the boards it sits on. */
  cross: number;
  anchors: BoardAnchor[];
  error: string | null;
};

function freshLumber(): LumberDraft {
  return { run: "horizontal", kind: "2x4", face: "flat", sheetWidth: 24, thickness: 1.5, length: null, along: 0, cross: 0, anchors: [], error: null };
}

function lumberContext(project: FullProject): LayoutContext {
  const built = buildProject(project);
  const members = built.members.map((item) => ({ id: item.id, a: item.a, b: item.b }));
  return {
    fittings: built.fittings.map((item) => ({ id: item.id, sku: item.sku, position: item.position })),
    members,
    boards: project.boards,
    straps: strapPoints(project.straps, members),
    pipeRadius: tradeById(project.trade).od / 2,
  };
}

function draftBoard(draft: LumberDraft, id: string): Board {
  const stock = STOCK_MAP[draft.kind];
  return {
    id,
    kind: draft.kind,
    face: stock.sheet ? "flat" : draft.face,
    run: draft.run,
    anchors: draft.anchors,
    length: draft.length,
    along: draft.along,
    cross: draft.cross,
    sheetWidth: Math.min(stock.maxWidth, Math.max(6, draft.sheetWidth)),
    thickness: stock.sheet ? (draft.kind === "osb" ? draft.thickness : stock.thick) : stock.thick,
  };
}

function lumberMessage(draft: LumberDraft, project: FullProject): string | null {
  if (!canPlaceLumber(draft)) return null;
  return layoutBoard(draftBoard(draft, "preview"), lumberContext(project))?.error ?? null;
}

function leanProblem(project: Project, stops: DraftStop[], leans: PipeLean[]): string | null {
  for (let index = 0; index < stops.length - 1; index += 1) {
    const lean = leans[index];
    if (!lean) continue;
    const layout = fortyFiveLayout(project, stops, lean.flip, index, lean.shift);
    if (layout.error) return layout.error;
  }
  return null;
}

type State = {
  projects: Project[];
  activeId: string;
  unit: "in" | "ft";
  selectedId: string | null;
  tab: "cuts" | "parts" | "sizes";
  tool: Tool;
  anchor: string | null;
  anchorRail: string | null;
  draft: Draft | null;
  lumber: LumberDraft | null;
  move: MoveSession | null;
  showMeasures: boolean;
  showLabels: boolean;
  showLumber: boolean;
  /** Pale hinge gate. Off hides it except while the Hinge tool is open. */
  showHingePreview: boolean;
  doorNote: string | null;
  /** Load-test screen. Weights are not saved with the drawing. */
  loadMode: boolean;
  loadTool: "weight" | "push";
  shopLoads: ShopLoad[];
  /** Why the last sheet slide was refused, if it was. */
  slideNote: string | null;
  update: (patch: Partial<Project>) => void;
  setUnit: (unit: "in" | "ft") => void;
  setTab: (tab: State["tab"]) => void;
  select: (id: string | null) => void;
  setTool: (tool: Tool) => void;
  setShowMeasures: (show: boolean) => void;
  setShowLabels: (show: boolean) => void;
  setShowLumber: (show: boolean) => void;
  setShowHingePreview: (show: boolean) => void;
  placeDoor: (memberId: string, width: number) => void;
  setDoorWidth: (id: string, width: number) => void;
  removeDoor: (id: string) => void;
  setLoadMode: (on: boolean) => void;
  setLoadTool: (tool: "weight" | "push") => void;
  addShopLoad: (target: string, t: number) => string;
  setShopLoad: (id: string, patch: Partial<Pick<ShopLoad, "pounds" | "dir">>) => void;
  removeShopLoad: (id: string) => void;
  importDrawing: (raw: unknown) => boolean;
  setRunHeight: (y: number) => void;
  setStopHeight: (nodeId: string, y: number) => void;
  popStop: () => void;
  placeHost: (id: string, inches: number | "center") => void;
  setPipeLean: (index: number, flip: boolean | null | "auto") => void;
  nudgePipe: (index: number, end: 0 | 1, dir: FortyDir) => void;
  commitDraft: () => void;
  cancelDraft: () => void;
  beginMove: (target: MoveTarget) => void;
  stepMove: (axis: MoveAxis) => void;
  setMoveDistance: (inches: number) => void;
  clearMove: () => void;
  applyTemplate: (templateId: string) => void;
  startBlank: () => void;
  startSketch: () => void;
  unlockFrame: () => void;
  placePost: (x: number, z: number) => void;
  placeTip: (x: number, z: number) => void;
  setMemberTrade: (kind: "node" | "link", id: string, trade: TradeId | null) => void;
  setStrapCount: (memberId: string, count: number, lo: number, hi: number) => void;
  moveStrap: (id: string, at: number, lo: number, hi: number) => void;
  setHingeCount: (memberId: string, count: number, lo: number, hi: number, kind: HingeKind, side: 1 | -1) => void;
  moveHinge: (id: string, at: number, lo: number, hi: number) => void;
  setHingeKind: (memberId: string, kind: HingeKind, lo: number, hi: number) => void;
  setHingeSide: (memberId: string, side: 1 | -1) => void;
  setHingeSwing: (memberId: string, deg: number) => void;
  rotateBar: (id: string, degrees: number) => void;
  placeShape: (spec: { width: number; depth: number; across: number; deep: number; height: number; rail: boolean; railAt: number }) => void;
  patchNode: (id: string, patch: Partial<SketchNode>) => void;
  patchLink: (id: string, patch: Partial<SketchLink>) => void;
  movePost: (id: string, x: number, z: number) => void;
  movePostHeight: (id: string, height: number) => void;
  moveLink: (id: string, y: number, yB: number | null) => void;
  setEveryPost: (height: number) => void;
  setEveryRail: (y: number) => void;
  activate: (id: string, point?: [number, number, number]) => void;
  removeNode: (id: string) => void;
  removeLink: (id: string) => void;
  addLumberAnchor: (ref: string, at: [number, number, number], sku: string) => void;
  setLumber: (patch: Partial<LumberDraft>) => void;
  popLumberAnchor: () => void;
  commitLumber: () => void;
  nudgeLumber: (dir: 1 | -1, axis?: SlideAxis) => void;
  nudgeBoard: (id: string, dir: 1 | -1, axis?: SlideAxis) => void;
  patchBoard: (id: string, patch: { length?: number | null; sheetWidth?: number; thickness?: number }) => void;
  removeBoard: (id: string) => void;
  addReference: (preset: { name: string; w: number; d: number; h: number }) => void;
  patchReference: (id: string, patch: Partial<MeasureRef>) => void;
  removeReference: (id: string) => void;
  clearFrame: () => void;
  setClampHeight: (id: string, height: number, currentY: number, otherY?: number) => void;
  resizeBar: (id: string, length: number) => void;
  repositionBar: (id: string, x: number, z: number, y: number, snap?: boolean) => void;
  setBay: (axis: "x" | "z", index: number, length: number) => void;
  beginEdit: () => void;
  endEdit: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  duplicate: () => void;
  remove: () => void;
  open: (id: string) => void;
};

const emptyFrame: Project = {
  ...base,
  id: "frame",
  name: "Frame",
  trade: "three-quarter",
  baysX: [],
  baysZ: [],
  postHeight: 36,
  levels: [],
  mode: "sketch",
  nodes: [],
  links: [],
  references: [],
  railHeight: 34,
};

const first = emptyFrame;

const MAX_POSTS = 24;
const MAX_LINKS = 64;

function current(get: () => State): Project | undefined {
  return get().projects.find((p) => p.id === get().activeId);
}

function shiftDoor(project: FullProject, memberId: string, vertical: boolean): FullProject {
  const door = project.doors.find((item) => item.memberId === memberId);
  if (!door) return project;
  const member = buildProject(project).members.find((item) => item.id === memberId);
  const hinges = project.hinges.filter((hinge) => hinge.memberId === memberId);
  if (!member) return project;
  const frame = doorFrame(member, hinges, door.width);
  if (!frame) return project;
  const hostId = memberId.startsWith("post:") ? memberId.slice(5).replace(/:hi$/, "") : "";
  const blocked = (x: number, z: number, near: number) =>
    project.nodes.some(
      (node) =>
        node.id !== hostId &&
        node.id !== door.hingeNode &&
        node.id !== door.latchNode &&
        !node.host &&
        Math.hypot(node.x - x, node.z - z) < near,
    );
  if (blocked(frame.hinge.x, frame.hinge.z, 3) || blocked(frame.latch.x, frame.latch.z, 4)) return project;
  const nodes = project.nodes.map((node) => {
    if (node.id === door.hingeNode) {
      return vertical
        ? { ...node, x: frame.hinge.x, z: frame.hinge.z, base: frame.hinge.base, height: frame.hinge.height }
        : { ...node, x: frame.hinge.x, z: frame.hinge.z };
    }
    if (node.id === door.latchNode) {
      return vertical
        ? { ...node, x: frame.latch.x, z: frame.latch.z, base: frame.latch.base, height: frame.latch.height }
        : { ...node, x: frame.latch.x, z: frame.latch.z };
    }
    return node;
  });
  const links = vertical
    ? project.links.map((link) => {
        if (link.id === door.bottomRail) return { ...link, y: frame.bottom };
        if (link.id === door.topRail) return { ...link, y: frame.top };
        return link;
      })
    : project.links;
  return {
    ...project,
    nodes,
    links,
    doors: project.doors.map((item) =>
      item.id === door.id ? { ...item, width: frame.width, dirX: frame.dirX, dirZ: frame.dirZ } : item,
    ),
  };
}

function write(set: (partial: Partial<State> | ((s: State) => Partial<State>)) => void, id: string, next: Project, extra?: Partial<State>) {
  set((s) => {
    const flags = remember(s);
    return {
      projects: s.projects.map((p) => (p.id === id ? next : p)),
      ...flags,
      ...extra,
    };
  });
}

type Snap = { projects: Project[]; activeId: string; selectedId: string | null };
const past: Snap[] = [];
const future: Snap[] = [];
let gesturing = false;

function shot(s: State): Snap {
  return { projects: s.projects, activeId: s.activeId, selectedId: s.selectedId };
}

function remember(s: State): { canUndo: boolean; canRedo: boolean } {
  if (!gesturing) {
    past.push(shot(s));
    if (past.length > 40) past.shift();
    future.length = 0;
  }
  return { canUndo: past.length > 0, canRedo: future.length > 0 };
}

function restore(snap: Snap): Partial<State> {
  return {
    projects: snap.projects,
    activeId: snap.activeId,
    selectedId: snap.selectedId,
    anchor: null,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    move: null,
  };
}

export const useShop = create<State>()(
  persist(
    (set, get) => ({
      projects: [first],
      activeId: first.id,
      unit: "in",
      selectedId: null,
      tab: "cuts",
      tool: "select",
      anchor: null,
      anchorRail: null,
      draft: null,
      lumber: null,
      move: null,
      showMeasures: true,
      showLabels: true,
      showLumber: true,
      showHingePreview: false,
      doorNote: null,
      loadMode: false,
      loadTool: "weight",
      shopLoads: [],
      slideNote: null,
      canUndo: false,
      canRedo: false,
      update: (patch) =>
        set((s) => ({
          ...remember(s),
          projects: s.projects.map((p) => (p.id === s.activeId ? { ...p, ...patch } : p)),
          selectedId: patch.mode && patch.mode !== "sketch" ? null : s.selectedId,
          anchor: patch.mode && patch.mode !== "sketch" ? null : s.anchor,
        })),
      setUnit: (unit) => set({ unit }),
      setTab: (tab) => set({ tab }),
      select: (selectedId) => set({ selectedId, anchor: null, anchorRail: null, draft: null, move: null, slideNote: null }),
      setTool: (tool) => {
        const project = normalizeProject(current(get) ?? get().projects[0]);
        const cleaned = dropOrphanHosts(project);
        const lumber = tool === "lumber" ? (get().lumber ?? freshLumber()) : null;
        if (cleaned.nodes.length !== project.nodes.length) {
          write(set, project.id, cleaned, { tool, anchor: null, anchorRail: null, draft: null, move: null, lumber, doorNote: null });
          return;
        }
        set({ tool, anchor: null, anchorRail: null, draft: null, move: null, lumber, doorNote: null });
      },
      setShowMeasures: (showMeasures) => set({ showMeasures }),
      setShowLabels: (showLabels) => set({ showLabels }),
      setShowLumber: (showLumber) => set({ showLumber }),
      setShowHingePreview: (showHingePreview) => set({ showHingePreview }),
      setLoadMode: (loadMode) =>
        set({
          loadMode,
          anchor: null,
          draft: null,
          move: null,
          shopLoads: loadMode ? get().shopLoads : [],
        }),
      setLoadTool: (loadTool) => set({ loadTool }),
      addShopLoad: (target, t) => {
        const loads = get().shopLoads;
        if (loads.length >= 24) return "";
        const kind = get().loadTool;
        const load: ShopLoad = {
          id: uid(),
          kind,
          target,
          t: Math.min(0.92, Math.max(0.08, t)),
          pounds: kind === "weight" ? 50 : 25,
          dir: "+x",
        };
        set({ shopLoads: [...loads, load] });
        return load.id;
      },
      setShopLoad: (id, patch) => {
        set({
          shopLoads: get().shopLoads.map((item) => {
            if (item.id !== id) return item;
            const pounds = patch.pounds == null ? item.pounds : Math.min(5000, Math.max(1, Math.round(patch.pounds)));
            return { ...item, ...patch, pounds };
          }),
        });
      },
      removeShopLoad: (id) => set({ shopLoads: get().shopLoads.filter((item) => item.id !== id) }),
      applyTemplate: (templateId: string) => {
        const template = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0];
        set((s) => ({
          ...remember(s),
          projects: s.projects.map((p) =>
            p.id === s.activeId ? { ...template.project, id: p.id, mode: "grid", nodes: [], links: [] } : p,
          ),
          selectedId: null,
          anchor: null,
          tool: "select",
        }));
      },
      startBlank: () => {
        const existing = get().projects.filter((p) => p.name === "Custom frame" || p.name.startsWith("Custom frame ")).length;
        const project: Project = {
          ...base,
          id: uid(),
          name: existing === 0 ? "Custom frame" : `Custom frame ${existing + 1}`,
          trade: "three-quarter",
          baysX: [46.875],
          baysZ: [22.875],
          postHeight: 36,
          levels: [35],
          mode: "grid",
        };
        set((s) => ({
          ...remember(s),
          projects: [...s.projects, project].slice(-16),
          activeId: project.id,
          selectedId: null,
          anchor: null,
          tool: "select",
          shopLoads: [],
        }));
      },
      startSketch: () => {
        const existing = get().projects.filter((p) => p.name === "Free build" || p.name.startsWith("Free build ")).length;
        const project: Project = {
          ...base,
          id: uid(),
          name: existing === 0 ? "Free build" : `Free build ${existing + 1}`,
          trade: "three-quarter",
          baysX: [],
          baysZ: [],
          postHeight: 36,
          levels: [],
          mode: "sketch",
          nodes: [],
          links: [],
          railHeight: 34,
        };
        set((s) => ({
          ...remember(s),
          projects: [...s.projects, project].slice(-16),
          activeId: project.id,
          selectedId: null,
          anchor: null,
          tool: "post",
          shopLoads: [],
        }));
      },
      unlockFrame: () => {
        const project = current(get);
        if (!project || project.mode === "sketch") return;
        const exploded = explodeGrid(project);
        write(set, project.id, { ...project, mode: "sketch", ...exploded, straps: [], hinges: [], hingeSwing: [], doors: [] }, { tool: "select", anchor: null, selectedId: null, doorNote: null });
      },
      placePost: (x, z) => {
        const project = normalizeProject(current(get) ?? get().projects[0]);
        if (project.mode !== "sketch" || project.nodes.filter((node) => !node.host && !node.tip).length >= MAX_POSTS) return;
        const posts = project.nodes.filter((node) => !node.host && !node.tip);
        const snapped = snapSketch(x, z, posts);
        if (posts.some((n) => Math.hypot(n.x - snapped.x, n.z - snapped.z) < 4)) return;
        const node: SketchNode = {
          id: uid(),
          x: snapped.x,
          z: snapped.z,
          height: project.postHeight,
          flange: false,
        };
        write(set, project.id, { ...project, nodes: [...project.nodes, node] }, { selectedId: `post:${node.id}` });
      },
      placeTip: (x, z) => {
        const draft = get().draft;
        const project = normalizeProject(current(get) ?? get().projects[0]);
        if (project.mode !== "sketch" || !draft || draft.stops.length < 1 || draft.stops.length >= 24) return;
        if (project.nodes.length >= 48) return;
        const last = draft.stops[draft.stops.length - 1];
        const y = Math.min(240, Math.max(1, last.y));
        const posts = project.nodes.filter((node) => !node.host && !node.tip);
        const snapped = snapSketch(x, z, posts);
        if (posts.some((node) => Math.hypot(node.x - snapped.x, node.z - snapped.z) < 6)) return;
        const lastNode = project.nodes.find((node) => node.id === last.nodeId);
        if (!lastNode || lastNode.tip) return;
        const squared = squareFrom(lastNode, snapped.x, snapped.z);
        if (Math.hypot(lastNode.x - squared.x, lastNode.z - squared.z) < 6) {
          const dx = x - lastNode.x;
          const dz = z - lastNode.z;
          if (Math.abs(dx) >= Math.abs(dz)) squared.x = Math.round((lastNode.x + (dx >= 0 ? 12 : -12)) * 32) / 32;
          else squared.z = Math.round((lastNode.z + (dz >= 0 ? 12 : -12)) * 32) / 32;
        }
        if (posts.some((node) => Math.hypot(node.x - squared.x, node.z - squared.z) < 6)) return;
        if (Math.hypot(lastNode.x - squared.x, lastNode.z - squared.z) < 6) return;
        const node: SketchNode = { id: uid(), x: squared.x, z: squared.z, height: y, flange: false, tip: true };
        const stops = [...draft.stops, { nodeId: node.id, railId: null, y }];
        const leans = [...(draft.leans ?? [])];
        while (leans.length < stops.length - 1) leans.push(null);
        leans.length = Math.max(0, stops.length - 1);
        write(
          set,
          project.id,
          { ...project, nodes: [...project.nodes, node] },
          { draft: { ...draft, stops, leans, fortyFiveError: null }, anchor: null, anchorRail: null, selectedId: null },
        );
      },
      setMemberTrade: (kind, id, trade) => {
        const project = normalizeProject(current(get) ?? get().projects[0]);
        if (kind === "node") {
          write(set, project.id, {
            ...project,
            nodes: project.nodes.map((node) => (node.id === id ? { ...node, trade: trade ?? undefined } : node)),
          });
          return;
        }
        write(set, project.id, {
          ...project,
          links: project.links.map((link) => (link.id === id ? { ...link, trade: trade ?? undefined } : link)),
        });
      },
      setStrapCount: (memberId, count, lo, hi) => {
        const project = normalizeProject(current(get) ?? get().projects[0]);
        const n = Math.max(0, Math.min(12, Math.round(count)));
        const others = project.straps.filter((strap) => strap.memberId !== memberId);
        let mine = project.straps
          .filter((strap) => strap.memberId === memberId)
          .map((strap) => ({ ...strap, at: clampStrap(strap.at, lo, hi) }))
          .sort((a, b) => a.at - b.at);
        while (mine.length < n) {
          const marks = [lo, ...mine.map((strap) => strap.at), hi].sort((a, b) => a - b);
          let gap = -1;
          let at = (lo + hi) / 2;
          for (let i = 0; i < marks.length - 1; i += 1) {
            const room = marks[i + 1] - marks[i];
            if (room > gap + 1e-6) {
              gap = room;
              at = (marks[i] + marks[i + 1]) / 2;
            }
          }
          mine.push({ id: uid(), memberId, at: clampStrap(at, lo, hi) });
          mine.sort((a, b) => a.at - b.at);
        }
        if (mine.length > n) mine = mine.slice(0, n);
        const straps = [...others, ...mine];
        const kept = new Set(straps.map((strap) => strap.id));
        write(set, project.id, {
          ...project,
          straps,
          boards: pruneBoards(project.boards, (ref) => ref.startsWith("strap:") && !kept.has(ref.slice(6))),
        });
      },
      moveStrap: (id, at, lo, hi) => {
        const project = normalizeProject(current(get) ?? get().projects[0]);
        write(set, project.id, {
          ...project,
          straps: project.straps.map((strap) => (strap.id === id ? { ...strap, at: clampStrap(at, lo, hi) } : strap)),
        });
      },
      setHingeCount: (memberId, count, lo, hi, kind, side) => {
        const project = normalizeProject(current(get) ?? get().projects[0]);
        const n = Math.max(0, Math.min(6, Math.round(count)));
        const others = project.hinges.filter((hinge) => hinge.memberId !== memberId);
        let mine = project.hinges
          .filter((hinge) => hinge.memberId === memberId)
          .map((hinge) => ({ ...hinge, kind, side, at: clampStrap(hinge.at, lo, hi) }))
          .sort((a, b) => a.at - b.at);
        while (mine.length < n) {
          const marks = [lo, ...mine.map((hinge) => hinge.at), hi].sort((a, b) => a - b);
          let gap = -1;
          let at = (lo + hi) / 2;
          for (let i = 0; i < marks.length - 1; i += 1) {
            const room = marks[i + 1] - marks[i];
            if (room > gap + 1e-6) {
              gap = room;
              at = (marks[i] + marks[i + 1]) / 2;
            }
          }
          mine.push({ id: uid(), memberId, kind, side, at: clampStrap(at, lo, hi) });
          mine.sort((a, b) => a.at - b.at);
        }
        if (mine.length > n) mine = mine.slice(0, n);
        const hinges = [...others, ...mine];
        const swing = n === 0 ? project.hingeSwing.filter((item) => item.memberId !== memberId) : project.hingeSwing;
        write(set, project.id, shiftDoor({ ...project, hinges, hingeSwing: swing }, memberId, true));
      },
      moveHinge: (id, at, lo, hi) => {
        const project = normalizeProject(current(get) ?? get().projects[0]);
        const hinges = project.hinges.map((hinge) => (hinge.id === id ? { ...hinge, at: clampStrap(at, lo, hi) } : hinge));
        const memberId = hinges.find((hinge) => hinge.id === id)?.memberId;
        write(set, project.id, memberId ? shiftDoor({ ...project, hinges }, memberId, true) : { ...project, hinges });
      },
      setHingeKind: (memberId, kind, lo, hi) => {
        const project = normalizeProject(current(get) ?? get().projects[0]);
        const hinges = project.hinges.map((hinge) =>
          hinge.memberId === memberId ? { ...hinge, kind, at: clampStrap(hinge.at, lo, hi) } : hinge,
        );
        const max = hingeOpenMax(kind);
        const next = shiftDoor({ ...project, hinges }, memberId, true);
        write(set, project.id, {
          ...next,
          hingeSwing: next.hingeSwing.map((item) => (item.memberId === memberId ? { ...item, deg: Math.min(item.deg, max) } : item)),
        });
      },
      setHingeSide: (memberId, side) => {
        const project = normalizeProject(current(get) ?? get().projects[0]);
        const hinges = project.hinges.map((hinge) => (hinge.memberId === memberId ? { ...hinge, side } : hinge));
        write(set, project.id, shiftDoor({ ...project, hinges }, memberId, false));
      },
      setHingeSwing: (memberId, deg) => {
        const project = normalizeProject(current(get) ?? get().projects[0]);
        const kind = project.hinges.find((hinge) => hinge.memberId === memberId)?.kind ?? "leaf";
        const next = Math.round(Math.min(hingeOpenMax(kind), Math.max(0, deg)));
        const rest = project.hingeSwing.filter((item) => item.memberId !== memberId);
        write(set, project.id, {
          ...project,
          hingeSwing: next <= 0 ? rest : [...rest, { memberId, deg: next }],
        });
      },
      placeDoor: (memberId, width) => {
        const project = normalizeProject(current(get) ?? get().projects[0]);
        if (project.mode !== "sketch") {
          set({ doorNote: "Choose Edit these posts freely before hanging a door." });
          return;
        }
        if (project.doors.some((door) => door.memberId === memberId)) {
          set({ doorNote: null });
          return;
        }
        if (project.nodes.filter((node) => !node.host && !node.tip).length + 2 > MAX_POSTS) {
          set({ doorNote: "This drawing is full. Remove a post before adding a door." });
          return;
        }
        if (project.links.length + 2 > MAX_LINKS) {
          set({ doorNote: "This drawing is full. Remove a rail before adding a door." });
          return;
        }
        const built = buildProject(project);
        const member = built.members.find((item) => item.id === memberId);
        const hinges = project.hinges.filter((hinge) => hinge.memberId === memberId);
        if (!member || hinges.some((hinge) => hinge.kind === "angle") || !hinges.length) {
          set({ doorNote: hinges.some((hinge) => hinge.kind === "angle") ? "An angle hinge folds a pipe. A door needs offset or barrel hinges." : "Add offset or barrel hinges on an upright post first." });
          return;
        }
        const frame = doorFrame(member, hinges, width);
        if (!frame) {
          set({ doorNote: "A door hangs on hinges on an upright post." });
          return;
        }
        const hostId = memberId.startsWith("post:") ? memberId.slice(5).replace(/:hi$/, "") : "";
        const blocked = (x: number, z: number, near: number) =>
          project.nodes.some((node) => node.id !== hostId && !node.host && Math.hypot(node.x - x, node.z - z) < near);
        if (blocked(frame.hinge.x, frame.hinge.z, 3) || blocked(frame.latch.x, frame.latch.z, 4)) {
          set({ doorNote: "That width lands on another post. Try a different width." });
          return;
        }
        const doorId = uid();
        const hingeId = uid();
        const latchId = uid();
        const bottomId = uid();
        const topId = uid();
        const stile = (id: string, at: { x: number; z: number; base: number; height: number }): SketchNode => ({
          id,
          x: at.x,
          z: at.z,
          height: at.height,
          base: at.base,
          flange: false,
          door: doorId,
        });
        write(
          set,
          project.id,
          {
            ...project,
            nodes: [...project.nodes, stile(hingeId, frame.hinge), stile(latchId, frame.latch)],
            links: [
              ...project.links,
              { id: bottomId, a: hingeId, b: latchId, y: frame.bottom, kind: "rail" },
              { id: topId, a: hingeId, b: latchId, y: frame.top, kind: "rail" },
            ],
            doors: [
              ...project.doors,
              {
                id: doorId,
                memberId,
                width: frame.width,
                hingeNode: hingeId,
                latchNode: latchId,
                bottomRail: bottomId,
                topRail: topId,
                dirX: frame.dirX,
                dirZ: frame.dirZ,
              },
            ],
          },
          { doorNote: null, selectedId: `post:${latchId}` },
        );
      },
      setDoorWidth: (id, width) => {
        const project = normalizeProject(current(get) ?? get().projects[0]);
        const door = project.doors.find((item) => item.id === id);
        if (!door) return;
        const next = Math.round(Math.min(96, Math.max(8, width)) * 32) / 32;
        const hinge = project.nodes.find((node) => node.id === door.hingeNode);
        if (!hinge) return;
        const x = Math.round((hinge.x + door.dirX * next) * 32) / 32;
        const z = Math.round((hinge.z + door.dirZ * next) * 32) / 32;
        const blocked = project.nodes.some(
          (node) => node.id !== door.latchNode && node.id !== door.hingeNode && !node.host && Math.hypot(node.x - x, node.z - z) < 4,
        );
        if (blocked) {
          set({ doorNote: "That width lands on another post." });
          return;
        }
        write(set, project.id, {
          ...project,
          nodes: project.nodes.map((node) => (node.id === door.latchNode ? { ...node, x, z } : node)),
          doors: project.doors.map((item) => (item.id === id ? { ...item, width: Math.hypot(x - hinge.x, z - hinge.z) } : item)),
        }, { doorNote: null });
      },
      removeDoor: (id) => {
        const project = normalizeProject(current(get) ?? get().projects[0]);
        const door = project.doors.find((item) => item.id === id);
        if (!door) return;
        const dropped = new Set(project.nodes.filter((node) => node.door === id).map((node) => node.id));
        const links = project.links.filter((link) => !dropped.has(link.a) && !dropped.has(link.b));
        const gone = [...dropped];
        const straps = project.straps.filter((strap) => !gone.some((nodeId) => strap.memberId.includes(nodeId)));
        write(
          set,
          project.id,
          {
            ...project,
            nodes: project.nodes.filter((node) => !dropped.has(node.id)),
            links,
            doors: project.doors.filter((item) => item.id !== id),
            straps,
            boards: pruneBoards(
              project.boards,
              (ref) => ref.startsWith("strap:") ? !straps.some((strap) => strap.id === ref.slice(6)) : gone.some((nodeId) => ref.includes(nodeId)),
            ),
          },
          { selectedId: null, doorNote: null },
        );
      },
      rotateBar: (id, degrees) => {
        const project = normalizeProject(current(get) ?? get().projects[0]);
        const link = project.links.find((item) => item.id === id);
        if (!link) return;
        const a = project.nodes.find((node) => node.id === link.a);
        const b = project.nodes.find((node) => node.id === link.b);
        if (!a || !b || a.host || b.host) return;
        const moveA = a.tip && !b.tip;
        const pivot = moveA ? b : a;
        const moving = moveA ? a : b;
        const span = Math.hypot(b.x - a.x, b.z - a.z);
        if (span < 1) return;
        const rad = (degrees * Math.PI) / 180;
        const dir = moveA ? -1 : 1;
        const x = Math.round((pivot.x + dir * Math.cos(rad) * span) * 32) / 32;
        const z = Math.round((pivot.z + dir * Math.sin(rad) * span) * 32) / 32;
        const blocked = project.nodes.some((node) => node.id !== moving.id && !node.host && Math.hypot(node.x - x, node.z - z) < 4);
        if (blocked) return;
        const nodes = project.nodes.map((node) => (node.id === moving.id ? { ...node, x, z } : node));
        const seated = reseatHosts(nodes, project.links);
        write(set, project.id, { ...project, nodes: seated.nodes, links: seated.links });
      },
      placeShape: (spec) => {
        const project = normalizeProject(current(get) ?? get().projects[0]);
        const across = Math.min(6, Math.max(1, Math.round(spec.across)));
        const deep = Math.min(6, Math.max(1, Math.round(spec.deep)));
        if (project.nodes.length + across * deep > MAX_POSTS) return;
        const width = Math.max(8, spec.width);
        const depth = deep === 1 ? 0 : Math.max(8, spec.depth);
        const height = Math.min(240, Math.max(12, spec.height));
        const originX = project.nodes.length ? Math.max(...project.nodes.map((n) => n.x)) + 24 : 0;
        const originZ = 0;
        const ids: string[][] = [];
        const nodes: SketchNode[] = [];
        for (let iz = 0; iz < deep; iz += 1) {
          ids[iz] = [];
          for (let ix = 0; ix < across; ix += 1) {
            const id = uid();
            ids[iz][ix] = id;
            nodes.push({
              id,
              x: roundQuarter(originX + (across === 1 ? 0 : (width * ix) / (across - 1))),
              z: roundQuarter(originZ + (deep === 1 ? 0 : (depth * iz) / (deep - 1))),
              height,
              flange: false,
            });
          }
        }
        const links: SketchLink[] = [];
        if (spec.rail) {
          const y = Math.min(height - 1, Math.max(2, spec.railAt));
          const join = (a: string, b: string) => {
            links.push({ id: uid(), a, b, y, kind: "rail" });
          };
          for (let iz = 0; iz < deep; iz += 1) {
            const edge = deep === 1 || iz === 0 || iz === deep - 1;
            if (!edge) continue;
            for (let ix = 0; ix < across - 1; ix += 1) join(ids[iz][ix], ids[iz][ix + 1]);
          }
          for (let ix = 0; ix < across; ix += 1) {
            const edge = across === 1 || ix === 0 || ix === across - 1;
            if (!edge) continue;
            for (let iz = 0; iz < deep - 1; iz += 1) join(ids[iz][ix], ids[iz + 1][ix]);
          }
        }
        write(
          set,
          project.id,
          {
            ...project,
            mode: "sketch",
            postHeight: height,
            railHeight: spec.rail ? Math.min(height - 1, Math.max(2, spec.railAt)) : project.railHeight,
            nodes: [...project.nodes, ...nodes],
            links: [...project.links, ...links],
          },
          { tool: "select", anchor: null, selectedId: null },
        );
      },
      patchNode: (id, patch) => {
        const project = normalizeProject(current(get) ?? get().projects[0]);
        write(set, project.id, {
          ...project,
          nodes: project.nodes.map((n) => (n.id === id ? { ...n, ...patch, id: n.id } : n)),
        });
      },
      patchLink: (id, patch) => {
        const project = normalizeProject(current(get) ?? get().projects[0]);
        write(set, project.id, {
          ...project,
          links: project.links.map((l) => (l.id === id ? { ...l, ...patch, id: l.id } : l)),
        });
      },
      movePost: (id, x, z) => {
        const project = normalizeProject(current(get) ?? get().projects[0]);
        if (project.mode !== "sketch") return;
        const others = project.nodes.filter((n) => n.id !== id);
        const snapped = snapSketch(x, z, others);
        if (others.some((n) => Math.hypot(n.x - snapped.x, n.z - snapped.z) < 4)) return;
        const nodes = project.nodes.map((n) => (n.id === id ? { ...n, x: snapped.x, z: snapped.z } : n));
        const movedDoor = project.doors.find((door) => door.hingeNode === id || door.latchNode === id);
        const doors = movedDoor
          ? project.doors.map((door) => {
              if (door.id !== movedDoor.id) return door;
              const hinge = nodes.find((node) => node.id === door.hingeNode);
              const latch = nodes.find((node) => node.id === door.latchNode);
              if (!hinge || !latch) return door;
              return { ...door, width: Math.round(Math.hypot(latch.x - hinge.x, latch.z - hinge.z) * 32) / 32 };
            })
          : project.doors;
        write(set, project.id, {
          ...project,
          nodes,
          doors,
        });
      },
      movePostHeight: (id, height) => {
        const project = normalizeProject(current(get) ?? get().projects[0]);
        if (project.mode !== "sketch") return;
        const samples = project.nodes.filter((n) => n.id !== id).map((n) => n.height);
        const next = Math.min(240, Math.max(12, magnetY(height, samples)));
        write(set, project.id, {
          ...project,
          nodes: project.nodes.map((n) => (n.id === id ? { ...n, height: next } : n)),
        });
      },
      moveLink: (id, y, yB) => {
        const project = normalizeProject(current(get) ?? get().projects[0]);
        if (project.mode !== "sketch") return;
        const samples: number[] = [];
        for (const link of project.links) {
          if (link.id === id) continue;
          samples.push(link.y);
          if (link.yB != null) samples.push(link.yB);
        }
        const snapped = Math.min(240, Math.max(1, magnetY(y, samples)));
        const shift = snapped - y;
        const nextB = yB == null ? undefined : Math.min(240, Math.max(1, Math.round((yB + shift) * 32) / 32));
        write(set, project.id, {
          ...project,
          links: project.links.map((l) => (l.id === id ? { ...l, y: snapped, yB: nextB } : l)),
        });
      },
      setEveryPost: (height) => {
        const project = normalizeProject(current(get) ?? get().projects[0]);
        write(set, project.id, {
          ...project,
          postHeight: height,
          nodes: project.nodes.map((n) => (n.host ? n : { ...n, height })),
          links: project.links.map((l) => (l.kind === "rail" && l.y > height - 0.5 ? { ...l, y: Math.max(1.5, height - 1) } : l)),
        });
      },
      setEveryRail: (y) => {
        const project = normalizeProject(current(get) ?? get().projects[0]);
        write(set, project.id, {
          ...project,
          railHeight: y,
          links: project.links.map((l) => (l.kind === "rail" ? { ...l, y } : l)),
        });
      },
      removeNode: (id) => {
        const project = normalizeProject(current(get) ?? get().projects[0]);
        const dropped = new Set<string>([id]);
        let links = project.links;
        let guard = 0;
        while (guard < 8) {
          guard += 1;
          const before = dropped.size;
          for (const node of project.nodes) {
            if (dropped.has(node.id) && node.door) {
              for (const mate of project.nodes) if (mate.door === node.door) dropped.add(mate.id);
            }
          }
          for (const door of project.doors) {
            const hostId = door.memberId.startsWith("post:") ? door.memberId.slice(5).replace(/:hi$/, "") : "";
            if ((hostId && dropped.has(hostId)) || dropped.has(door.hingeNode) || dropped.has(door.latchNode)) {
              for (const mate of project.nodes) if (mate.door === door.id) dropped.add(mate.id);
            }
          }
          for (const link of links) {
            if (dropped.has(link.a) || dropped.has(link.b)) {
              for (const node of project.nodes) if (node.host === link.id) dropped.add(node.id);
            }
          }
          links = links.filter((link) => !dropped.has(link.a) && !dropped.has(link.b));
          for (const node of project.nodes) if (node.host && !links.some((link) => link.id === node.host)) dropped.add(node.id);
          for (const node of project.nodes) {
            if (node.tip && !links.some((link) => link.a === node.id || link.b === node.id)) dropped.add(node.id);
          }
          if (dropped.size === before) break;
        }
        const deadLinks = project.links.filter((link) => !links.some((item) => item.id === link.id)).map((link) => link.id);
        const gone = [...dropped, ...deadLinks];
        const dead = deadMembers(dropped, project.links, links);
        const straps = project.straps.filter((strap) => !dead.has(strap.memberId));
        write(
          set,
          project.id,
          {
            ...project,
            nodes: project.nodes.filter((node) => !dropped.has(node.id)),
            links,
            doors: project.doors.filter((door) => !dropped.has(door.hingeNode) && !dropped.has(door.latchNode)),
            straps,
            hinges: project.hinges.filter((hinge) => !hingeGone(hinge.memberId, dead)),
            hingeSwing: project.hingeSwing.filter((item) => !hingeGone(item.memberId, dead)),
            boards: pruneBoards(project.boards, (ref) =>
              ref.startsWith("strap:") ? !straps.some((strap) => strap.id === ref.slice(6)) : gone.some((goneId) => ref.includes(goneId)),
            ),
          },
          { selectedId: null, anchor: get().anchor === id ? null : get().anchor, doorNote: null },
        );
      },
      removeLink: (id) => {
        const project = normalizeProject(current(get) ?? get().projects[0]);
        const hosts = new Set(project.nodes.filter((node) => node.host === id).map((node) => node.id));
        const links = project.links.filter((link) => link.id !== id && !hosts.has(link.a) && !hosts.has(link.b));
        const orphanTips = new Set(
          project.nodes.filter((node) => node.tip && !links.some((link) => link.a === node.id || link.b === node.id)).map((node) => node.id),
        );
        const dead = deadMembers(hosts, project.links, links);
        dead.add(`rail:${id}`);
        dead.add(`brace:${id}`);
        const gone = [id, ...hosts];
        const straps = project.straps.filter((strap) => !dead.has(strap.memberId));
        write(
          set,
          project.id,
          {
            ...project,
            nodes: project.nodes.filter((node) => !hosts.has(node.id) && !orphanTips.has(node.id)),
            links,
            straps,
            hinges: project.hinges.filter((hinge) => !hingeGone(hinge.memberId, dead)),
            hingeSwing: project.hingeSwing.filter((item) => !hingeGone(item.memberId, dead)),
            boards: pruneBoards(project.boards, (ref) =>
              ref.startsWith("strap:") ? !straps.some((strap) => strap.id === ref.slice(6)) : gone.some((goneId) => ref.includes(goneId)),
            ),
          },
          { selectedId: null },
        );
      },
      addLumberAnchor: (ref, at, sku) => {
        const project = normalizeProject(current(get) ?? get().projects[0]);
        const draft = get().lumber ?? freshLumber();
        if (sku !== "board" && sku !== "strap" && !WOOD_SKUS.has(sku)) {
          const name =
            sku === "90" || sku === "180" || sku === "4way" || sku === "5way"
              ? "corner"
              : sku === "45"
                ? "45°"
                : sku === "T"
                  ? "tee"
                  : sku === "hinge"
                    ? "hinge"
                    : sku === "coupling"
                      ? "coupling"
                      : sku === "cross"
                        ? "cross"
                        : "clamp";
          set({
            lumber: { ...draft, error: `A ${name} can't hold a board. Screw lumber to a flange or a one-hole strap, or to another board.` },
            tool: "lumber",
          });
          return;
        }
        const anchor = sku === "board" || sku === "strap" ? { ref, at } : clampAnchor(ref, at);
        const sameSpot = draft.anchors.some((item) => {
          if (item.ref !== anchor.ref) return false;
          return Math.hypot(item.at[0] - anchor.at[0], item.at[1] - anchor.at[1], item.at[2] - anchor.at[2]) < 2;
        });
        if (sameSpot || draft.anchors.length >= 8) return;
        const next: LumberDraft = { ...draft, anchors: [...draft.anchors, anchor], along: 0, cross: 0 };
        const stock = STOCK_MAP[next.kind];
        if (stock.sheet && next.anchors.some((item) => item.ref.startsWith("board:"))) {
          const cover = sheetCoverWidth(draftBoard(next, "preview"), lumberContext(project));
          if (cover != null) next.sheetWidth = Math.min(stock.maxWidth, Math.max(next.sheetWidth, Math.ceil(cover - 1e-6)));
        }
        next.error = lumberMessage(next, project);
        set({ lumber: next, tool: "lumber" });
      },
      setLumber: (patch) => {
        const draft = get().lumber;
        if (!draft) return;
        const project = normalizeProject(current(get) ?? get().projects[0]);
        const next: LumberDraft = { ...draft, ...patch };
        if (patch.length === null || (patch.run && patch.run !== draft.run)) {
          next.along = 0;
          next.cross = 0;
        }
        const stock = STOCK_MAP[next.kind];
        if (stock.sheet) next.sheetWidth = Math.min(stock.maxWidth, Math.max(6, next.sheetWidth || stock.wide));
        if (!stock.sheet) next.thickness = stock.thick;
        else if (next.kind === "osb") {
          const choices = [0.4375, 0.5, 0.625, 0.75];
          if (!choices.some((n) => Math.abs(n - next.thickness) < 0.02)) next.thickness = 0.4375;
        } else next.thickness = stock.thick;
        next.face = stock.sheet ? "flat" : next.face;
        if (next.length != null) next.length = Math.min(stock.maxLength, Math.max(1, next.length));
        next.error = lumberMessage(next, project);
        set({ lumber: next });
      },
      popLumberAnchor: () => {
        const draft = get().lumber;
        if (!draft) return;
        const project = normalizeProject(current(get) ?? get().projects[0]);
        const next: LumberDraft = { ...draft, anchors: draft.anchors.slice(0, -1), along: 0, cross: 0 };
        next.error = lumberMessage(next, project);
        set({ lumber: next });
      },
      commitLumber: () => {
        const draft = get().lumber;
        const project = normalizeProject(current(get) ?? get().projects[0]);
        if (!draft || !canPlaceLumber(draft)) return;
        const board = draftBoard(draft, uid());
        const error = layoutBoard(board, lumberContext(project))?.error ?? null;
        if (error) {
          set({ lumber: { ...draft, error } });
          return;
        }
        write(set, project.id, { ...project, boards: [...project.boards, board].slice(0, 80) }, {
          lumber: { ...draft, anchors: [], along: 0, cross: 0, length: null, error: null },
          selectedId: `board:${board.id}`,
        });
      },
      nudgeLumber: (dir, axis) => {
        const draft = get().lumber;
        if (!draft || !canPlaceLumber(draft)) return;
        const project = normalizeProject(current(get) ?? get().projects[0]);
        const result = nudgeBoardSlide(draftBoard(draft, "preview"), dir, lumberContext(project), axis ?? "along");
        if (result.error) {
          set({ lumber: { ...draft, error: result.error }, slideNote: result.error });
          return;
        }
        set({
          lumber: {
            ...draft,
            length: result.board.length,
            along: result.board.along ?? 0,
            cross: result.board.cross ?? 0,
            error: null,
          },
          slideNote: null,
        });
      },
      nudgeBoard: (id, dir, axis) => {
        const project = normalizeProject(current(get) ?? get().projects[0]);
        const board = project.boards.find((item) => item.id === id);
        if (!board) return;
        const result = nudgeBoardSlide(board, dir, lumberContext(project), axis ?? "along");
        if (result.error) {
          set({ slideNote: result.error });
          return;
        }
        write(
          set,
          project.id,
          { ...project, boards: project.boards.map((item) => (item.id === id ? result.board : item)) },
          { slideNote: null },
        );
      },
      patchBoard: (id, patch) => {
        const project = normalizeProject(current(get) ?? get().projects[0]);
        const board = project.boards.find((item) => item.id === id);
        if (!board) return;
        const stock = STOCK_MAP[board.kind];
        const next: Board = { ...board };
        if ("length" in patch) next.length = patch.length == null ? null : Math.min(stock.maxLength, Math.max(1, patch.length));
        if (patch.sheetWidth != null) next.sheetWidth = Math.min(stock.maxWidth, Math.max(6, patch.sheetWidth));
        if (patch.thickness != null) next.thickness = Math.max(0.03, patch.thickness);
        const laid = layoutBoard(next, lumberContext(project));
        if (!laid || laid.error) return;
        write(set, project.id, { ...project, boards: project.boards.map((item) => (item.id === id ? next : item)) }, {});
      },
      removeBoard: (id) => {
        const project = normalizeProject(current(get) ?? get().projects[0]);
        const boards = pruneBoards(
          project.boards.filter((board) => board.id !== id),
          () => false,
        );
        write(set, project.id, { ...project, boards }, { selectedId: get().selectedId === `board:${id}` ? null : get().selectedId });
      },
      addReference: (preset) => {
        const project = normalizeProject(current(get) ?? get().projects[0]);
        const x = project.references.reduce((max, ref) => Math.max(max, ref.x + ref.w), 0);
        const ref: MeasureRef = {
          id: uid(),
          name: preset.name,
          w: preset.w,
          d: preset.d,
          h: preset.h,
          x: project.references.length ? x + 6 : 0,
          z: 0,
        };
        write(set, project.id, { ...project, references: [...project.references, ref] }, { selectedId: `ref:${ref.id}`, tool: "select", anchor: null, draft: null });
      },
      patchReference: (id, patch) => {
        const project = normalizeProject(current(get) ?? get().projects[0]);
        write(set, project.id, {
          ...project,
          references: project.references.map((ref) => (ref.id === id ? { ...ref, ...patch, id: ref.id } : ref)),
        });
      },
      removeReference: (id) => {
        const project = normalizeProject(current(get) ?? get().projects[0]);
        write(set, project.id, { ...project, references: project.references.filter((ref) => ref.id !== id) }, { selectedId: null });
      },
      clearFrame: () => {
        const project = current(get);
        if (!project) return;
        const full = normalizeProject(project);
        write(
          set,
          project.id,
          {
            ...full,
            mode: "sketch",
            nodes: [],
            links: [],
            baysX: [],
            baysZ: [],
            levels: [],
            braces: false,
            flanges: false,
            railHeight: 34,
            references: [],
            straps: [],
            hinges: [],
            hingeSwing: [],
            doors: [],
            boards: [],
          },
          { tool: "select", anchor: null, anchorRail: null, draft: null, lumber: null, selectedId: null, shopLoads: [] },
        );
      },
      setClampHeight: (id, height, currentY, otherY) => {
        const project = normalizeProject(current(get) ?? get().projects[0]);
        if (project.mode !== "sketch") {
          const next = Math.min(240, Math.max(1, height));
          write(set, project.id, {
            ...project,
            levels: project.levels.map((level) => (Math.abs(level - currentY) < 0.05 ? next : level)),
          });
          return;
        }
        const moved = moveClamp(project.links, id, height, currentY, otherY);
        const h = Math.min(240, Math.max(1, height));
        const parts = id.split(":");
        let postId: string | null = null;
        if (id.startsWith("fit:")) postId = id.slice(4, id.lastIndexOf(":"));
        else if (id.startsWith("flange:")) postId = id.slice(7);
        else if (id.startsWith("hinge:") || id.startsWith("bfit:")) {
          const link = moved.links.find((item) => item.id === parts[1]);
          postId = parts[2] === "b" ? (link?.b ?? null) : (link?.a ?? null);
        }
        write(
          set,
          project.id,
          {
            ...project,
            links: moved.links,
            nodes: project.nodes.map((node) => {
              if (node.id !== postId || node.tip) return node;
              const tracking = typeof node.split === "number" && Math.abs(node.split - currentY) <= 0.75;
              const need = tracking ? h + 2 : h + 1;
              const grow = node.height < need ? Math.min(240, Math.max(12, need)) : node.height;
              if (tracking) {
                const split = Math.min(grow - 1.05, Math.max(1.05, Math.round(h * 32) / 32));
                return { ...node, height: grow, split };
              }
              return grow === node.height ? node : { ...node, height: grow };
            }),
          },
          { selectedId: moved.selectedId },
        );
      },
      activate: (id, point) => {
        if (id.startsWith("board:")) {
          const tool = get().tool;
          if (tool === "erase") {
            get().removeBoard(id.slice(6));
            return;
          }
          if (tool === "lumber" && point) {
            get().addLumberAnchor(id, point, "board");
            return;
          }
          set({ selectedId: id, anchor: null, anchorRail: null, draft: null, move: null });
          return;
        }
        if (id.startsWith("ref:")) {
          set({ selectedId: id, anchor: null, anchorRail: null, draft: null, tool: "select" });
          return;
        }
        const { tool, draft } = get();
        const project = normalizeProject(current(get) ?? get().projects[0]);
        if (tool === "lumber") return;
        if (tool === "erase" && id.startsWith("flange:")) {
          get().patchNode(id.slice(7), { flange: false });
          set({ selectedId: null });
          return;
        }
        const nodeId = nodeFromHit(id);
        if (tool === "erase") {
          if (nodeId) {
            get().removeNode(nodeId);
            return;
          }
          const linkId = linkFromHit(id);
          if (linkId) get().removeLink(linkId);
          return;
        }
        if (tool === "rail") {
          const target = pickTarget(project, id, point);
          if (!target) return;
          const node = target.fresh ?? project.nodes.find((item) => item.id === target.nodeId);
          let y = node?.host ? node.height : Math.min(240, Math.max(1, project.railHeight));
          const prev = draft?.stops ?? [];
          if (prev.length >= 24) return;
          if (prev.length && prev[prev.length - 1].nodeId === target.nodeId) return;
          if ((draft?.sameHeight ?? true) && !node?.host) {
            const shared = prev.find((stop) => !project.nodes.find((item) => item.id === stop.nodeId)?.host);
            if (shared) y = shared.y;
          }
          const stops = [...prev, { nodeId: target.nodeId, railId: target.railId, y }];
          const leans = [...(draft?.leans ?? [])];
          while (leans.length < stops.length - 1) leans.push(null);
          leans.length = Math.max(0, stops.length - 1);
          const next: Draft = {
            kind: "rail",
            sameHeight: draft?.sameHeight ?? true,
            leans,
            fortyFiveError: null,
            stops,
          };
          const base = target.fresh ? { ...project, nodes: [...project.nodes, target.fresh] } : project;
          if (target.fresh) write(set, project.id, base, { draft: next, anchor: null, anchorRail: null, selectedId: null });
          else set({ draft: next, anchor: null, anchorRail: null, selectedId: null });
          return;
        }
        set({ selectedId: id, anchor: null, anchorRail: null, draft: null });
      },
      setRunHeight: (y) => {
        const draft = get().draft;
        const project = normalizeProject(current(get) ?? get().projects[0]);
        if (!draft) return;
        const height = Math.min(240, Math.max(1, y));
        set({
          draft: {
            ...draft,
            sameHeight: true,
            leans: draft.leans.map(() => null),
            fortyFiveError: null,
            stops: draft.stops.map((stop) => {
              const node = project.nodes.find((item) => item.id === stop.nodeId);
              return node?.host ? stop : { ...stop, y: height };
            }),
          },
        });
      },
      setStopHeight: (nodeId, y) => {
        const draft = get().draft;
        const project = normalizeProject(current(get) ?? get().projects[0]);
        if (!draft) return;
        const height = Math.min(240, Math.max(1, y));
        set({
          draft: {
            ...draft,
            sameHeight: false,
            leans: draft.leans.map(() => null),
            fortyFiveError: null,
            stops: draft.stops.map((stop) => {
              const node = project.nodes.find((item) => item.id === stop.nodeId);
              if (node?.host || stop.nodeId !== nodeId) return stop;
              return { ...stop, y: height };
            }),
          },
        });
      },
      popStop: () => {
        const draft = get().draft;
        const project = normalizeProject(current(get) ?? get().projects[0]);
        if (!draft) return;
        const stops = draft.stops.slice(0, -1);
        const keep = new Set(stops.map((stop) => stop.nodeId));
        for (const link of project.links) {
          keep.add(link.a);
          keep.add(link.b);
        }
        const nodes = project.nodes.filter((node) => (!node.host && !node.tip) || keep.has(node.id));
        const leans = (draft.leans ?? []).slice(0, Math.max(0, stops.length - 1));
        const next = stops.length ? { ...draft, stops, leans, fortyFiveError: null } : null;
        if (nodes.length !== project.nodes.length) write(set, project.id, { ...project, nodes }, { draft: next, anchor: null, anchorRail: null });
        else set({ draft: next, anchor: null, anchorRail: null });
      },
      placeHost: (id, inches) => {
        const project = normalizeProject(current(get) ?? get().projects[0]);
        const node = project.nodes.find((item) => item.id === id);
        if (!node?.host) return;
        const link = project.links.find((item) => item.id === node.host);
        const a = link ? project.nodes.find((item) => item.id === link.a) : undefined;
        const b = link ? project.nodes.find((item) => item.id === link.b) : undefined;
        if (!link || !a || !b) return;
        const span = Math.hypot(b.x - a.x, b.z - a.z);
        const hostT = hostOffsetT(span, inches);
        const draft = get().draft;
        write(
          set,
          project.id,
          {
            ...project,
            nodes: project.nodes.map((item) => (item.id === id ? { ...item, hostT } : item)),
          },
          { draft: draft ? { ...draft, leans: draft.leans.map(() => null), fortyFiveError: null } : null },
        );
      },
      setPipeLean: (index, flip) => {
        const draft = get().draft;
        const project = normalizeProject(current(get) ?? get().projects[0]);
        if (!draft || index < 0 || index >= draft.stops.length - 1) return;
        const leans = (draft.leans ?? []).slice();
        while (leans.length < draft.stops.length - 1) leans.push(null);
        if (flip == null) {
          leans[index] = null;
          set({ draft: { ...draft, leans, fortyFiveError: leanProblem(project, draft.stops, leans) } });
          return;
        }
        let chosen: boolean = flip === "auto" ? false : flip;
        let layout = fortyFiveLayout(project, draft.stops, chosen, index, 0);
        if (flip === "auto" && layout.error) {
          const other = fortyFiveLayout(project, draft.stops, true, index, 0);
          if (!other.error) {
            chosen = true;
            layout = other;
          }
        }
        leans[index] = { flip: chosen, shift: 0 };
        if (layout.error) {
          set({ draft: { ...draft, leans, fortyFiveError: layout.error } });
          return;
        }
        const stops = draft.stops.map((stop, stopIndex) => {
          if (stopIndex === index) return { ...stop, y: layout.y[0] };
          if (stopIndex === index + 1) return { ...stop, y: layout.y[1] };
          return stop;
        });
        const hosts = new Map(layout.hosts.map((item) => [item.id, item.hostT]));
        const nextProject = hosts.size
          ? {
              ...project,
              nodes: project.nodes.map((node) => {
                const hostT = hosts.get(node.id);
                return hostT == null ? node : { ...node, hostT };
              }),
            }
          : project;
        const nextDraft: Draft = {
          ...draft,
          stops,
          leans,
          sameHeight: false,
          fortyFiveError: leanProblem(nextProject, stops, leans),
        };
        if (hosts.size) write(set, project.id, nextProject, { draft: nextDraft });
        else set({ draft: nextDraft });
      },
      nudgePipe: (index, end, dir) => {
        const draft = get().draft;
        const project = normalizeProject(current(get) ?? get().projects[0]);
        const lean = draft?.leans[index];
        if (!draft || !lean || index < 0 || index >= draft.stops.length - 1) return;
        const result = nudgeFortyFive(project, draft.stops, index, lean, end, dir);
        if (result.layout.error) {
          set({ draft: { ...draft, fortyFiveError: result.layout.error } });
          return;
        }
        const leans = draft.leans.slice();
        leans[index] = result.lean;
        const stops = draft.stops.map((stop, stopIndex) => {
          if (stopIndex === index) return { ...stop, y: result.layout.y[0] };
          if (stopIndex === index + 1) return { ...stop, y: result.layout.y[1] };
          return stop;
        });
        const hosts = new Map(result.layout.hosts.map((item) => [item.id, item.hostT]));
        const nextProject = hosts.size
          ? {
              ...project,
              nodes: project.nodes.map((node) => {
                const hostT = hosts.get(node.id);
                return hostT == null ? node : { ...node, hostT };
              }),
            }
          : project;
        const nextDraft: Draft = {
          ...draft,
          stops,
          leans,
          sameHeight: false,
          fortyFiveError: leanProblem(nextProject, stops, leans),
        };
        if (hosts.size) write(set, project.id, nextProject, { draft: nextDraft });
        else set({ draft: nextDraft });
      },
      commitDraft: () => {
        const draft = get().draft;
        const project = normalizeProject(current(get) ?? get().projects[0]);
        if (!draft || draft.stops.length < 2) return;
        if (leanProblem(project, draft.stops, draft.leans ?? []) || railRunError(project, draft.stops)) return;
        const yAt = (id: string, fallback: number) => {
          const node = project.nodes.find((item) => item.id === id);
          if (node?.host) return node.height;
          return Math.min(240, Math.max(1, fallback));
        };
        const links = [...project.links];
        const grown = new Map<string, number>();
        for (let i = 0; i < draft.stops.length - 1 && links.length < MAX_LINKS; i += 1) {
          const from = draft.stops[i];
          const to = draft.stops[i + 1];
          const y = yAt(from.nodeId, from.y);
          const yB = yAt(to.nodeId, to.y);
          const level = Math.abs(y - yB) < 1 / 16;
          links.push({ id: uid(), a: from.nodeId, b: to.nodeId, y, yB: level ? undefined : yB, kind: "rail" });
          grown.set(from.nodeId, Math.max(grown.get(from.nodeId) ?? 0, y));
          grown.set(to.nodeId, Math.max(grown.get(to.nodeId) ?? 0, yB));
        }
        const nodes = project.nodes.map((node) => {
          if (node.tip) {
            const need = grown.get(node.id);
            return need == null ? node : { ...node, height: need, flange: false, bury: 0 };
          }
          if (node.host) return node;
          const need = grown.get(node.id) ?? 0;
          return need > node.height - 1 ? { ...node, height: Math.min(240, Math.max(12, need + 1)) } : node;
        });
        const railHeight = draft.stops.find((stop) => !project.nodes.find((node) => node.id === stop.nodeId)?.host)?.y ?? project.railHeight;
        write(
          set,
          project.id,
          { ...project, nodes, links, railHeight },
          { draft: null, anchor: null, anchorRail: null, selectedId: null },
        );
      },
      cancelDraft: () => {
        const project = normalizeProject(current(get) ?? get().projects[0]);
        const cleaned = dropOrphanHosts(project);
        if (cleaned.nodes.length !== project.nodes.length) write(set, project.id, cleaned, { draft: null, anchor: null, anchorRail: null });
        else set({ draft: null, anchor: null, anchorRail: null });
      },
      beginMove: (target) => {
        const project = normalizeProject(current(get) ?? get().projects[0]);
        set({ move: { target, base: project, delta: { x: 0, y: 0, z: 0 }, axis: null, sign: 1 } });
      },
      stepMove: (axis) => {
        const session = get().move;
        if (!session) return;
        const delta = addAxis(session.delta, axis);
        const next = projectWithDelta(session.base, session.target, delta);
        if (!next) return;
        const sign: 1 | -1 = axis.startsWith("-") ? -1 : 1;
        const name = axis.endsWith("x") ? "x" : axis.endsWith("y") ? "y" : "z";
        write(set, next.id, next, { move: { ...session, delta, axis: name, sign } });
      },
      setMoveDistance: (inches) => {
        const session = get().move;
        if (!session?.axis) return;
        const delta = { ...session.delta, [session.axis]: rSign(session.sign, inches) };
        const next = projectWithDelta(session.base, session.target, delta);
        if (!next) return;
        write(set, next.id, next, { move: { ...session, delta } });
      },
      clearMove: () => set({ move: null }),
      beginEdit: () => {
        if (gesturing) return;
        const s = get();
        past.push(shot(s));
        if (past.length > 40) past.shift();
        future.length = 0;
        gesturing = true;
        set({ canUndo: true, canRedo: false });
      },
      endEdit: () => {
        if (!gesturing) return;
        gesturing = false;
        const last = past[past.length - 1];
        const now = get();
        if (last && last.projects === now.projects && last.selectedId === now.selectedId && last.activeId === now.activeId) {
          past.pop();
          set({ canUndo: past.length > 0, canRedo: future.length > 0 });
        }
      },
      undo: () => {
        if (gesturing) return;
        const prev = past.pop();
        if (!prev) return;
        future.push(shot(get()));
        set(restore(prev));
      },
      redo: () => {
        if (gesturing) return;
        const next = future.pop();
        if (!next) return;
        past.push(shot(get()));
        set(restore(next));
      },
      resizeBar: (id, length) => {
        const project = normalizeProject(current(get) ?? get().projects[0]);
        const link = project.links.find((item) => item.id === id);
        if (!link) return;
        const a = project.nodes.find((node) => node.id === link.a);
        const b = project.nodes.find((node) => node.id === link.b);
        if (!a || !b) return;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const span = Math.hypot(dx, dz);
        const dirX = span < 0.5 ? 1 : dx / span;
        const dirZ = span < 0.5 ? 0 : dz / span;
        const next = Math.min(360, Math.max(6, length));
        const x = Math.round((a.x + dirX * next) * 32) / 32;
        const z = Math.round((a.z + dirZ * next) * 32) / 32;
        const blocked = project.nodes.some((node) => node.id !== b.id && Math.hypot(node.x - x, node.z - z) < 4);
        if (blocked) return;
        write(set, project.id, {
          ...project,
          nodes: project.nodes.map((node) => (node.id === b.id ? { ...node, x, z } : node)),
        });
      },
      repositionBar: (id, x, z, y, snap) => {
        const project = normalizeProject(current(get) ?? get().projects[0]);
        const link = project.links.find((item) => item.id === id);
        if (!link) return;
        const a = project.nodes.find((node) => node.id === link.a);
        const b = project.nodes.find((node) => node.id === link.b);
        if (!a || !b) return;
        const others = project.nodes.filter((node) => node.id !== a.id && node.id !== b.id);
        const placed = snap ? snapSketch(x, z, others) : { x: Math.round(x * 32) / 32, z: Math.round(z * 32) / 32 };
        const dx = placed.x - a.x;
        const dz = placed.z - a.z;
        const bx = Math.round((b.x + dx) * 32) / 32;
        const bz = Math.round((b.z + dz) * 32) / 32;
        const blocked = others.some((node) => Math.hypot(node.x - placed.x, node.z - placed.z) < 4 || Math.hypot(node.x - bx, node.z - bz) < 4);
        const rise = endHeights(link)[1] - endHeights(link)[0];
        const nextY = Math.min(240, Math.max(1, Math.round(y * 32) / 32));
        const yB = Math.abs(rise) < 1 / 16 ? undefined : Math.min(240, Math.max(1, Math.round((nextY + rise) * 32) / 32));
        if (blocked && (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01)) {
          write(set, project.id, {
            ...project,
            links: project.links.map((item) => (item.id === link.id ? { ...item, y: nextY, yB } : item)),
          });
          return;
        }
        write(set, project.id, {
          ...project,
          nodes: project.nodes.map((node) => {
            if (node.id === a.id) return { ...node, x: placed.x, z: placed.z };
            if (node.id === b.id) return { ...node, x: bx, z: bz };
            return node;
          }),
          links: project.links.map((item) => (item.id === link.id ? { ...item, y: nextY, yB } : item)),
        });
      },
      setBay: (axis, index, length) => {
        const project = normalizeProject(current(get) ?? get().projects[0]);
        const key = axis === "x" ? "baysX" : "baysZ";
        const bays = project[key];
        if (!bays[index] && bays[index] !== 0) return;
        const next = Math.min(360, Math.max(4, length));
        write(set, project.id, { ...project, [key]: bays.map((bay, i) => (i === index ? next : bay)) });
      },
      duplicate: () => {
        const currentProject = get().projects.find((p) => p.id === get().activeId);
        if (!currentProject) return;
        const project: Project = { ...currentProject, id: uid(), name: `${currentProject.name} copy`, loads: [] };
        set((s) => ({
          ...remember(s),
          projects: [...s.projects, project].slice(-16),
          activeId: project.id,
          selectedId: null,
          anchor: null,
          shopLoads: [],
        }));
      },
      remove: () => {
        const { projects, activeId } = get();
        if (projects.length < 2) return;
        const next = projects.filter((p) => p.id !== activeId);
        set((s) => ({
          ...remember(s),
          projects: next,
          activeId: next[0].id,
          selectedId: null,
          anchor: null,
          tool: "select",
          shopLoads: [],
        }));
      },
      open: (id) => set({ activeId: id, selectedId: null, anchor: null, tool: "select", shopLoads: [], loadMode: false }),
      importDrawing: (raw) => {
        const body = drawingBody(raw);
        if (!body) return false;
        const named = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 48) : "Opened drawing";
        const project = normalizeProject({ ...body, id: uid(), name: named, loads: [] });
        set((s) => ({
          ...remember(s),
          projects: [...s.projects, project].slice(-16),
          activeId: project.id,
          selectedId: null,
          anchor: null,
          tool: "select",
          shopLoads: [],
          loadMode: false,
          draft: null,
          move: null,
        }));
        return true;
      },
    }),
    {
      name: "clampwright-v1",
      version: 4,
      migrate: (persisted, version) => {
        const state = persisted as {
          projects?: Project[];
          activeId?: string;
          unit?: "in" | "ft";
          showMeasures?: boolean;
          showLabels?: boolean;
          showLumber?: boolean;
          showHingePreview?: boolean;
        };
        let projects: Project[] = (state.projects ?? []).map((p) => normalizeProject(p));
        const stock =
          version < 3 &&
          projects.length === 1 &&
          projects[0].mode !== "sketch" &&
          (projects[0].nodes ?? []).length === 0 &&
          (projects[0].links ?? []).length === 0;
        if (stock || projects.length === 0) projects = [emptyFrame];
        const activeId = projects.some((p) => p.id === state.activeId) ? (state.activeId ?? projects[0].id) : projects[0].id;
        return {
          projects,
          activeId,
          unit: state.unit ?? "in",
          showMeasures: state.showMeasures ?? true,
          showLabels: state.showLabels ?? true,
          showLumber: state.showLumber ?? true,
          showHingePreview: state.showHingePreview ?? false,
        };
      },
      partialize: (s) => ({
        projects: s.projects,
        activeId: s.activeId,
        unit: s.unit,
        showMeasures: s.showMeasures,
        showLabels: s.showLabels,
        showLumber: s.showLumber,
        showHingePreview: s.showHingePreview,
      }),
    },
  ),
);

function clampStrap(at: number, lo: number, hi: number): number {
  const spanLo = Math.min(lo, hi);
  const spanHi = Math.max(lo, hi);
  return Math.round(Math.min(spanHi, Math.max(spanLo, at)) * 32) / 32;
}

function deadMembers(dropped: Set<string>, before: { id: string }[], after: { id: string }[]): Set<string> {
  const live = new Set(after.map((link) => link.id));
  const dead = new Set<string>();
  for (const id of dropped) dead.add(`post:${id}`);
  for (const link of before) {
    if (!live.has(link.id)) {
      dead.add(`rail:${link.id}`);
      dead.add(`brace:${link.id}`);
    }
  }
  return dead;
}

function hingeGone(memberId: string, dead: Set<string>): boolean {
  if (dead.has(memberId)) return true;
  const upper = memberId.endsWith(":hi") ? memberId.slice(0, -3) : "";
  return upper.length > 0 && dead.has(upper);
}

function roundQuarter(n: number): number {
  return Math.round(n * 4) / 4;
}

function magnetY(y: number, samples: number[]): number {
  let best = 0.6;
  let snapped = y;
  for (const sample of samples) {
    const d = Math.abs(sample - y);
    if (d < best) {
      best = d;
      snapped = sample;
    }
  }
  if (best < 0.6) return Math.round(snapped * 32) / 32;
  return roundQuarter(y);
}

function pickTarget(
  project: { nodes: SketchNode[]; links: SketchLink[] },
  id: string,
  point?: [number, number, number],
): { nodeId: string; railId: string | null; fresh?: SketchNode } | null {
  const direct = nodeFromHit(id);
  if (direct && project.nodes.some((node) => node.id === direct)) {
    const node = project.nodes.find((item) => item.id === direct);
    return { nodeId: direct, railId: node?.host ?? null };
  }
  const linkId = linkFromHit(id);
  if (!linkId) return null;
  const link = project.links.find((item) => item.id === linkId);
  if (!link) return null;
  const a = project.nodes.find((node) => node.id === link.a);
  const b = project.nodes.find((node) => node.id === link.b);
  if (!a || !b) return null;
  if (point) {
    const along = projectOnLink(a, b, link, point);
    if (along && along.dist < 3.5 && along.t > 0.12 && along.t < 0.88) {
      const existing = project.nodes.find((node) => node.host === link.id && Math.hypot(node.x - along.x, node.z - along.z) < 2.5);
      if (existing) return { nodeId: existing.id, railId: link.id };
      const fresh: SketchNode = {
        id: uid(),
        x: Math.round(along.x * 32) / 32,
        z: Math.round(along.z * 32) / 32,
        height: Math.round(along.y * 32) / 32,
        flange: false,
        bury: 0,
        host: link.id,
        hostT: along.t,
      };
      return { nodeId: fresh.id, railId: link.id, fresh };
    }
    const da = Math.hypot(a.x - point[0], a.z - point[2]);
    const db = Math.hypot(b.x - point[0], b.z - point[2]);
    return { nodeId: da <= db ? a.id : b.id, railId: link.id };
  }
  const midT = 0.5;
  const existing = project.nodes.find((node) => node.host === link.id && Math.abs((node.hostT ?? 0.5) - midT) < 0.02);
  if (existing) return { nodeId: existing.id, railId: link.id };
  const [ya, yb] = endHeights(link);
  const fresh: SketchNode = {
    id: uid(),
    x: Math.round(((a.x + b.x) / 2) * 32) / 32,
    z: Math.round(((a.z + b.z) / 2) * 32) / 32,
    height: Math.round(((ya + yb) / 2) * 32) / 32,
    flange: false,
    bury: 0,
    host: link.id,
    hostT: midT,
  };
  return { nodeId: fresh.id, railId: link.id, fresh };
}

function projectOnLink(a: SketchNode, b: SketchNode, link: SketchLink, point: [number, number, number]) {
  const [ya, yb] = endHeights(link);
  const ax = a.x;
  const ay = a.host ? a.height : ya;
  const az = a.z;
  const bx = b.x;
  const by = b.host ? b.height : yb;
  const bz = b.z;
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len2 = dx * dx + dy * dy + dz * dz;
  if (len2 < 1) return null;
  const raw = ((point[0] - ax) * dx + (point[1] - ay) * dy + (point[2] - az) * dz) / len2;
  const t = Math.max(0, Math.min(1, raw));
  const x = ax + dx * t;
  const y = ay + dy * t;
  const z = az + dz * t;
  return { t, x, y, z, dist: Math.hypot(point[0] - x, point[1] - y, point[2] - z) };
}

function dropOrphanHosts<T extends { nodes: SketchNode[]; links: SketchLink[] }>(project: T): T {
  const used = new Set<string>();
  for (const link of project.links) {
    used.add(link.a);
    used.add(link.b);
  }
  const nodes = project.nodes.filter((node) => (!node.host && !node.tip) || used.has(node.id));
  if (nodes.length === project.nodes.length) return project;
  return { ...project, nodes };
}

function nodeFromHit(id: string): string | null {
  if (id.startsWith("post:")) {
    const rest = id.slice(5);
    return rest.endsWith(":hi") ? rest.slice(0, -3) : rest;
  }
  if (id.startsWith("flange:")) return id.slice(7);
  if (id.startsWith("fit:")) return id.slice(4).split(":")[0] ?? null;
  return null;
}

function linkFromHit(id: string): string | null {
  if (id.startsWith("rail:") || id.startsWith("brace:")) return id.slice(id.indexOf(":") + 1).replace(/:stub[AB]$/, "");
  if (id.startsWith("hinge:") || id.startsWith("bfit:")) return id.slice(id.indexOf(":") + 1).split(":")[0] ?? null;
  return null;
}

export function activeProject(s: State): Project {
  return s.projects.find((p) => p.id === s.activeId) ?? s.projects[0];
}

export type { TradeId };
