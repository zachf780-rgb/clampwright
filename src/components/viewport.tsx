import { Grid, Html, Line, OrbitControls } from "@react-three/drei";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import type { Branch, Build, Fitting, FullProject, MeasureRef, Member, Project, Segment, Strap, Vec3 } from "@/lib/build";
import { endHeights, fortyFiveButtons, normalizeProject, sheetIndex, snapSketch } from "@/lib/build";
import { tradeById } from "@/lib/catalog";
import { formatLen } from "@/lib/format";
import { boardLook, canPlaceLumber, layoutBoard, strapPoints, STOCK_MAP, WOOD_SKUS, type Board, type LayoutContext, type SlideAxis } from "@/lib/lumber";
import { axisAllowed, MOVE_AXES, type MoveAxis, type MoveTarget } from "@/lib/move";
import { useShop, type Tool } from "@/lib/store";

const UP = new THREE.Vector3(0, 1, 0);

function gizmoPoint(project: FullProject, target: MoveTarget): Vec3 | null {
  if (target.kind === "post") {
    const node = project.nodes.find((item) => item.id === target.id);
    return node ? [node.x, node.height * 0.55, node.z] : null;
  }
  if (target.kind === "bar") {
    const link = project.links.find((item) => item.id === target.id);
    const a = project.nodes.find((node) => node.id === link?.a);
    const b = project.nodes.find((node) => node.id === link?.b);
    if (!link || !a || !b) return null;
    const [ya, yb] = endHeights(link);
    return [(a.x + b.x) / 2, (ya + yb) / 2, (a.z + b.z) / 2];
  }
  if (target.kind === "end") {
    const node = project.nodes.find((item) => item.id === target.nodeId);
    if (!node) return null;
    return [node.x, target.flange ? 2 : (target.y ?? node.height * 0.55), node.z];
  }
  if (target.kind === "grid-post") return [0, project.postHeight * 0.6, 0];
  if (target.kind === "grid-level") return [0, target.y, 0];
  if (target.kind === "grid-rail") return [0, project.levels[target.level] ?? 0, 0];
  return null;
}

const ARROW_ROT: Record<MoveAxis, [number, number, number]> = {
  "+y": [0, 0, 0],
  "-y": [Math.PI, 0, 0],
  "+x": [0, 0, -Math.PI / 2],
  "-x": [0, 0, Math.PI / 2],
  "+z": [Math.PI / 2, 0, 0],
  "-z": [-Math.PI / 2, 0, 0],
};

function MoveGizmo({ project }: { project: Project }) {
  const move = useShop((s) => s.move);
  const stepMove = useShop((s) => s.stepMove);
  if (!move) return null;
  const full = normalizeProject(project);
  const point = gizmoPoint(full, move.target);
  if (!point) return null;
  return (
    <group position={point}>
      {MOVE_AXES.map((axis) => {
        const allowed = axisAllowed(move.base, move.target, move.delta, axis);
        return (
          <group
            key={axis}
            rotation={ARROW_ROT[axis]}
            onPointerDown={(event) => {
              event.stopPropagation();
              event.nativeEvent.stopImmediatePropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
              if (allowed) stepMove(axis);
            }}
          >
            <mesh position={[0, 8, 0]}>
              <cylinderGeometry args={[0.45, 0.45, 10, 8]} />
              <meshStandardMaterial color={allowed ? "#e2a322" : "#5c6560"} />
            </mesh>
            <mesh position={[0, 14.5, 0]}>
              <coneGeometry args={[1.5, 3.2, 10]} />
              <meshStandardMaterial color={allowed ? "#e2a322" : "#5c6560"} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function ReferenceBox({ item, selected, onPick }: { item: MeasureRef; selected: boolean; onPick: () => void }) {
  const h = Math.max(item.h, 0.4);
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(item.w, h, item.d)), [item.w, h, item.d]);
  return (
    <group
      position={[item.x + item.w / 2, h / 2, item.z + item.d / 2]}
      onClick={(e) => {
        e.stopPropagation();
        onPick();
      }}
    >
      <mesh>
        <boxGeometry args={[item.w, h, item.d]} />
        <meshStandardMaterial color={selected ? "#e2a322" : "#8ec8e6"} transparent opacity={0.32} depthWrite={false} />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={selected ? "#e2a322" : "#e7f4fb"} />
      </lineSegments>
      <DimTag position={[0, h / 2 + 2.2, 0]} text={item.name} />
    </group>
  );
}

function measureLabel(a: Vec3, b: Vec3, unit: "in" | "ft"): string {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const dist = Math.hypot(dx, dy, dz);
  if (Math.hypot(dx, dz) < 0.5) return `${formatLen(Math.abs(dy), unit)} · plumb`;
  if (Math.abs(dy) < 1 / 16) return `${formatLen(dist, unit)} · level`;
  return `${formatLen(dist, unit)} · ${formatLen(Math.abs(dy), unit)} rise`;
}
function orient(a: Vec3, b: Vec3) {
  const av = new THREE.Vector3(...a);
  const bv = new THREE.Vector3(...b);
  const delta = bv.clone().sub(av);
  const length = delta.length();
  const quaternion = new THREE.Quaternion();
  if (length > 1e-4) quaternion.setFromUnitVectors(UP, delta.normalize());
  const position = av.add(bv).multiplyScalar(0.5);
  return { position, quaternion, length };
}

function Tube({
  a,
  b,
  radius,
  color,
  dim,
  glow,
  present,
  black,
  onPick,
}: {
  a: Vec3;
  b: Vec3;
  radius: number;
  color: string;
  dim?: boolean;
  glow?: boolean;
  present?: boolean;
  black?: boolean;
  onPick?: (e: { stopPropagation: () => void; point: THREE.Vector3 }) => void;
}) {
  const { position, quaternion, length } = useMemo(() => orient(a, b), [a, b]);
  if (length < 0.04) return null;
  return (
    <mesh
      position={position}
      quaternion={quaternion}
      castShadow
      receiveShadow={Boolean(present)}
      onClick={(e) => {
        e.stopPropagation();
        onPick?.(e);
      }}
    >
      <cylinderGeometry args={[radius, radius, length, 14]} />
      <meshStandardMaterial
        color={color}
        emissive={glow ? "#e2a322" : "#000000"}
        emissiveIntensity={glow ? 0.65 : 0}
        metalness={0.78}
        roughness={dim ? 0.55 : 0.34}
        transparent={dim}
        opacity={dim ? 0.35 : 1}
      />
    </mesh>
  );
}

function quatFrom(dir: Vec3) {
  const v = new THREE.Vector3(dir[0], dir[1], dir[2]);
  if (v.lengthSq() < 1e-8) v.set(0, 1, 0);
  return new THREE.Quaternion().setFromUnitVectors(UP, v.normalize());
}

function along(dir: Vec3, distance: number): [number, number, number] {
  const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  return [(dir[0] / len) * distance, (dir[1] / len) * distance, (dir[2] / len) * distance];
}

function sideOf(through: Vec3, branch: Vec3): Vec3 {
  const a = new THREE.Vector3(...through);
  const b = new THREE.Vector3(...branch);
  if (a.lengthSq() < 1e-8) a.set(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(a, b);
  if (side.lengthSq() < 1e-6) side.crossVectors(a.normalize(), new THREE.Vector3(1, 0, 0));
  if (side.lengthSq() < 1e-6) side.set(0, 0, 1);
  side.normalize();
  if (side.y < 0) side.negate();
  return [side.x, side.y, side.z];
}

function throughVec(fitting: Fitting): Vec3 {
  const axis = fitting.axis;
  if (axis && Math.hypot(axis[0], axis[1], axis[2]) > 1e-6) {
    const len = Math.hypot(axis[0], axis[1], axis[2]);
    return [axis[0] / len, axis[1] / len, axis[2] / len];
  }
  return [0, 1, 0];
}

function crossAxes(branches: Branch[]): Vec3[] {
  const axes: Vec3[] = [];
  for (const branch of branches) {
    const len = Math.hypot(branch.dir[0], branch.dir[1], branch.dir[2]);
    if (len < 1e-6) continue;
    const u: Vec3 = [branch.dir[0] / len, branch.dir[1] / len, branch.dir[2] / len];
    if (axes.some((a) => Math.abs(a[0] * u[0] + a[1] * u[1] + a[2] * u[2]) > 0.92)) continue;
    axes.push(u);
    if (axes.length === 2) break;
  }
  return axes.length ? axes : [[0, 1, 0]];
}

function ClampMat({ color, glow, purchasable }: { color: string; glow: boolean; purchasable: boolean; present?: boolean; black?: boolean }) {
  return (
    <meshStandardMaterial
      color={color}
      emissive={glow ? "#e2a322" : "#000000"}
      emissiveIntensity={glow ? 0.85 : 0}
      metalness={0.8}
      roughness={0.34}
      transparent={!purchasable}
      opacity={purchasable ? 1 : 0.32}
    />
  );
}

type ClampLook = { color: string; glow: boolean; purchasable: boolean };

function Band({ axis, radius, length, look }: { axis: Vec3; radius: number; length: number; look: ClampLook }) {
  if (length < 0.08) return null;
  return (
    <mesh quaternion={quatFrom(axis)} castShadow>
      <cylinderGeometry args={[radius, radius, length, 20]} />
      <ClampMat {...look} />
    </mesh>
  );
}

function Saddle({
  branch,
  through,
  radius,
  collar,
  bolt,
  look,
}: {
  branch: Branch;
  through: Vec3;
  radius: number;
  collar: number;
  bolt: string;
  look: ClampLook;
}) {
  const start = Math.max(0.28, collar - 0.04);
  const end = Math.max(start + 0.62, branch.setback + 0.22);
  const length = end - start;
  const mid = (start + end) / 2;
  const side = sideOf(through, branch.dir);
  const at = along(branch.dir, mid);
  const boltAt: [number, number, number] = [at[0] + side[0] * (radius + 0.02), at[1] + side[1] * (radius + 0.02), at[2] + side[2] * (radius + 0.02)];
  return (
    <group>
      <mesh position={at} quaternion={quatFrom(branch.dir)} castShadow>
        <cylinderGeometry args={[radius, radius, length, 18]} />
        <ClampMat {...look} />
      </mesh>
      <mesh position={along(branch.dir, end - 0.04)} quaternion={quatFrom(branch.dir)} castShadow>
        <cylinderGeometry args={[radius + 0.045, radius + 0.01, 0.08, 18]} />
        <ClampMat {...look} />
      </mesh>
      <mesh position={boltAt} quaternion={quatFrom(side)} castShadow>
        <cylinderGeometry args={[0.1, 0.1, 0.14, 6]} />
        <meshStandardMaterial color={bolt} metalness={0.9} roughness={0.28} />
      </mesh>
    </group>
  );
}

function FittingMesh({
  fitting,
  od,
  colors,
  selected,
  glow,
  present,
  onPick,
}: {
  fitting: Fitting;
  od: number;
  colors: { pipe: string; fitting: string; bolt: string; hot: string };
  selected: boolean;
  glow: boolean;
  present?: boolean;
  black?: boolean;
  onPick: () => void;
}) {
  const color = selected ? colors.hot : glow ? "#f0d48a" : colors.fitting;
  const r = od / 2;
  const mat = { color, glow, purchasable: fitting.purchasable };
  if (fitting.sku === "flange") {
    return (
      <group position={fitting.position} onClick={(e) => { e.stopPropagation(); onPick(); }}>
        {glow ? (
          <mesh>
            <sphereGeometry args={[r * 4.2, 16, 12]} />
            <meshBasicMaterial color="#e2a322" transparent opacity={0.22} depthWrite={false} />
          </mesh>
        ) : null}
        <mesh position={[0, 0.08, 0]} castShadow receiveShadow={Boolean(present)}>
          <cylinderGeometry args={[r * 3.1, r * 3.1, 0.14, 24]} />
          <ClampMat {...mat} />
        </mesh>
        <mesh position={[0, 0.42, 0]} castShadow receiveShadow={Boolean(present)}>
          <cylinderGeometry args={[r + 0.1, r + 0.14, 0.62, 16]} />
          <ClampMat {...mat} />
        </mesh>
      </group>
    );
  }
  const through = throughVec(fitting);
  const angled = fitting.sku === "45" || fitting.sku === "hinge";
  const collarR = angled ? r + 0.14 : r + 0.2;
  const socket = r + 0.16;
  const collarH =
    fitting.sku === "hinge" ? Math.max(0.68, socket * 1.2)
    : fitting.sku === "45" ? Math.max(0.74, socket * 1.25)
    : fitting.sku === "T" ? Math.max(0.92, socket * 1.6)
    : fitting.sku === "4way" || fitting.sku === "5way" ? Math.max(1.2, socket * 2.05)
    : Math.max(1.06, socket * 1.85);
  const branch = fitting.branches[0];
  return (
    <group position={fitting.position} onClick={(e) => { e.stopPropagation(); onPick(); }}>
      {glow ? (
        <mesh>
          <sphereGeometry args={[r * 3.4, 16, 12]} />
          <meshBasicMaterial color="#e2a322" transparent opacity={0.28} depthWrite={false} />
        </mesh>
      ) : null}
      {fitting.sku === "cross" ? (
        crossAxes(fitting.branches).map((axis, i) => (
          <Band key={i} axis={axis} radius={r + 0.18} length={Math.max(1.15, od + 0.35)} look={mat} />
        ))
      ) : fitting.sku === "hinge" && branch ? (
        <Hinge through={through} branch={branch} collarR={collarR} collarH={collarH} socket={socket} bolt={colors.bolt} look={mat} />
      ) : (
        <>
          <Band axis={through} radius={collarR} length={collarH} look={mat} />
          {fitting.branches.map((item, i) => (
            <Saddle key={i} branch={item} through={through} radius={socket} collar={collarR} bolt={colors.bolt} look={mat} />
          ))}
        </>
      )}
    </group>
  );
}

function Hinge({
  through,
  branch,
  collarR,
  collarH,
  socket,
  bolt,
  look,
}: {
  through: Vec3;
  branch: Branch;
  collarR: number;
  collarH: number;
  socket: number;
  bolt: string;
  look: ClampLook;
}) {
  const side = sideOf(through, branch.dir);
  const pivot = Math.max(collarR + 0.16, 0.7);
  const cupStart = pivot + 0.22;
  const cupEnd = Math.max(cupStart + 0.7, branch.setback + 0.2);
  const cupMid = (cupStart + cupEnd) / 2;
  const cupAt = along(branch.dir, cupMid);
  return (
    <group>
      <Band axis={through} radius={collarR} length={collarH} look={look} />
      <mesh position={along(branch.dir, pivot)} quaternion={quatFrom(side)} castShadow>
        <cylinderGeometry args={[0.2, 0.2, 0.42, 12]} />
        <ClampMat {...look} />
      </mesh>
      <mesh position={along(branch.dir, pivot)} quaternion={quatFrom(side)} castShadow>
        <cylinderGeometry args={[0.09, 0.09, 0.56, 8]} />
        <meshStandardMaterial color={bolt} metalness={0.9} roughness={0.28} />
      </mesh>
      <mesh position={cupAt} quaternion={quatFrom(branch.dir)} castShadow>
        <cylinderGeometry args={[socket, socket, cupEnd - cupStart, 18]} />
        <ClampMat {...look} />
      </mesh>
      <mesh position={along(branch.dir, cupEnd - 0.04)} quaternion={quatFrom(branch.dir)} castShadow>
        <cylinderGeometry args={[socket + 0.045, socket + 0.01, 0.08, 18]} />
        <ClampMat {...look} />
      </mesh>
      <mesh
        position={[cupAt[0] + side[0] * (socket + 0.02), cupAt[1] + side[1] * (socket + 0.02), cupAt[2] + side[2] * (socket + 0.02)]}
        quaternion={quatFrom(side)}
        castShadow
      >
        <cylinderGeometry args={[0.09, 0.09, 0.12, 6]} />
        <meshStandardMaterial color={bolt} metalness={0.9} roughness={0.28} />
      </mesh>
    </group>
  );
}

function StrapRing({
  member,
  strapId,
  at,
  radius,
  glow,
  onPick,
}: {
  member: Member;
  strapId: string;
  at: number;
  radius: number;
  glow: boolean;
  onPick: (id: string, point: Vec3) => void;
}) {
  const placed = useMemo(() => {
    const av = new THREE.Vector3(...member.a);
    const bv = new THREE.Vector3(...member.b);
    const length = av.distanceTo(bv) || 1;
    const t = Math.min(1, Math.max(0, at / length));
    const position = av.clone().lerp(bv, t);
    const quaternion = new THREE.Quaternion();
    const dir = bv.clone().sub(av);
    if (dir.length() > 1e-4) quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize());
    return { position, quaternion, point: [position.x, position.y, position.z] as Vec3 };
  }, [member.a, member.b, at]);
  return (
    <group
      position={placed.position}
      quaternion={placed.quaternion}
      onClick={(e) => {
        e.stopPropagation();
        onPick(strapId, placed.point);
      }}
    >
      {glow ? (
        <mesh>
          <sphereGeometry args={[radius * 3.2, 14, 10]} />
          <meshBasicMaterial color="#e2a322" transparent opacity={0.35} depthWrite={false} />
        </mesh>
      ) : null}
      <mesh>
        <torusGeometry args={[radius + 0.12, 0.05, 6, 16]} />
        <meshStandardMaterial color={glow ? "#f0d48a" : "#c5bfb2"} emissive={glow ? "#e2a322" : "#000000"} emissiveIntensity={glow ? 0.85 : 0} metalness={0.58} roughness={0.36} />
      </mesh>
      <mesh position={[radius + 0.3, 0, 0]}>
        <boxGeometry args={[0.36, 0.28, 0.07]} />
        <meshStandardMaterial color="#c5bfb2" metalness={0.58} roughness={0.36} />
      </mesh>
      <mesh position={[radius + 0.38, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.055, 0.055, 0.09, 8]} />
        <meshStandardMaterial color="#2c2824" />
      </mesh>
    </group>
  );
}

function MemberMesh({
  member,
  radius,
  colors,
  selected,
  hinted,
  glow,
  dragEnabled,
  straps,
  strapGlow,
  present,
  black,
  onPick,
  onStrap,
  onDragStart,
}: {
  member: Member;
  radius: number;
  colors: { pipe: string; hot: string; hint: string };
  selected: boolean;
  hinted: boolean;
  glow: boolean;
  strapGlow: boolean;
  dragEnabled: boolean;
  straps: Strap[];
  present?: boolean;
  black?: boolean;
  onPick: (point: Vec3) => void;
  onStrap: (id: string, point: Vec3) => void;
  onDragStart: (kind: "post" | "post-h" | "link", point: Vec3) => void;
}) {
  const color = selected ? colors.hot : glow || hinted ? colors.hint : colors.pipe;
  const { position, quaternion, length } = useMemo(() => orient(member.a, member.b), [member.a, member.b]);
  const down = (e: ThreeEvent<PointerEvent>) => {
    if (!dragEnabled) return;
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    const span = member.b[1] - member.a[1];
    const top = member.kind === "post" && e.point.y > member.a[1] + span * 0.72;
    onDragStart(member.kind === "post" ? (top ? "post-h" : "post") : "link", [e.point.x, e.point.y, e.point.z]);
  };
  return (
    <group onPointerDown={down}>
      {member.segments.map((seg: Segment, i) => (
        <Tube key={i} a={seg.a} b={seg.b} radius={radius} color={color} glow={glow && !selected} present={present} black={black} onPick={(e) => onPick([e.point.x, e.point.y, e.point.z])} />
      ))}
      {member.couplings.map((seg, i) => (
        <Tube key={`c${i}`} a={seg.a} b={seg.b} radius={radius + 0.14} color={selected ? colors.hot : "#8e948e"} onPick={(e) => onPick([e.point.x, e.point.y, e.point.z])} />
      ))}
      {length > 0.2 ? (
        <mesh
          position={position}
          quaternion={quaternion}
          onPointerDown={down}
          onClick={(e) => {
            e.stopPropagation();
            onPick([e.point.x, e.point.y, e.point.z]);
          }}
        >
          <cylinderGeometry args={[radius + (member.kind === "post" ? 0.85 : 0.7), radius + (member.kind === "post" ? 0.85 : 0.7), length, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ) : null}
      {straps.map((strap) => (
        <StrapRing key={strap.id} member={member} strapId={strap.id} at={strap.at} radius={radius} glow={strapGlow} onPick={onStrap} />
      ))}
    </group>
  );
}

function Figure() {
  const color = "#8d9a86";
  return (
    <group position={[-14, 0, 6]}>
      <mesh position={[0, 16, 0]}>
        <cylinderGeometry args={[1.6, 1.8, 32, 10]} />
        <meshStandardMaterial color={color} roughness={0.72} />
      </mesh>
      <mesh position={[0, 38, 0]}>
        <cylinderGeometry args={[3.4, 2.8, 22, 12]} />
        <meshStandardMaterial color={color} roughness={0.72} />
      </mesh>
      <mesh position={[0, 65.8, 0]}>
        <sphereGeometry args={[3.3, 16, 12]} />
        <meshStandardMaterial color={color} roughness={0.68} />
      </mesh>
    </group>
  );
}

function FitView({ focus, distance, nonce }: { focus: Vec3; distance: number; nonce: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3; update: () => void } | null;
  useEffect(() => {
    camera.position.set(focus[0] + distance * 0.82, focus[1] + distance * 0.48, focus[2] + distance * 0.82);
    if (controls) {
      controls.target.set(focus[0], focus[1], focus[2]);
      controls.update();
    }
  }, [focus[0], focus[1], focus[2], distance, nonce, camera, controls]);
  return null;
}

type DragSpec = {
  kind: "post" | "post-h" | "link" | "link-len" | "link-move";
  id: string;
  point: Vec3;
  y: number;
  yB: number | null;
  originX?: number;
  originZ?: number;
  axisX?: number;
  axisZ?: number;
  ax?: number;
  az?: number;
  length?: number;
  grabAlong?: number;
};

function DragBridge({
  enabled,
  dragged,
  onPost,
  onHeight,
  onLink,
  onResize,
  onReposition,
  onEnd,
  bind,
}: {
  enabled: boolean;
  dragged: MutableRefObject<boolean>;
  onPost: (id: string, x: number, z: number) => void;
  onHeight: (id: string, height: number) => void;
  onLink: (id: string, y: number, yB: number | null) => void;
  onResize: (id: string, length: number) => void;
  onReposition: (id: string, x: number, z: number, y: number) => void;
  onEnd: () => void;
  bind: (start: (spec: DragSpec) => void) => void;
}) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null;
  const drag = useRef<DragSpec | null>(null);
  const live = useRef({ onPost, onHeight, onLink, onResize, onReposition, onEnd, controls, enabled });
  live.current = { onPost, onHeight, onLink, onResize, onReposition, onEnd, controls, enabled };
  const bindRef = useRef(bind);
  bindRef.current = bind;

  useEffect(() => {
    bindRef.current((spec) => {
      if (!live.current.enabled) return;
      drag.current = spec;
      if (live.current.controls) live.current.controls.enabled = false;
    });
    const el = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const move = (ev: PointerEvent) => {
      const spec = drag.current;
      if (!spec) return;
      dragged.current = true;
      const rect = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      if (spec.kind === "post") {
        const hit = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(floor, hit)) return;
        live.current.onPost(spec.id, hit.x, hit.z);
        return;
      }
      if (spec.kind === "link-len" || spec.kind === "link-move") {
        const hit = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(floor, hit)) return;
        if (spec.kind === "link-len") {
          const along = (hit.x - (spec.originX ?? 0)) * (spec.axisX ?? 1) + (hit.z - (spec.originZ ?? 0)) * (spec.axisZ ?? 0);
          if (spec.grabAlong == null) {
            spec.grabAlong = along;
            return;
          }
          live.current.onResize(spec.id, (spec.length ?? 0) + along - spec.grabAlong);
          return;
        }
        if (spec.grabAlong == null) {
          spec.point = [hit.x, 0, hit.z];
          spec.grabAlong = 0;
          return;
        }
        live.current.onReposition(spec.id, (spec.ax ?? 0) + hit.x - spec.point[0], (spec.az ?? 0) + hit.z - spec.point[2], spec.y);
        return;
      }
      const normal = new THREE.Vector3();
      camera.getWorldDirection(normal);
      normal.y = 0;
      if (normal.lengthSq() < 1e-4) normal.set(0, 0, 1);
      normal.normalize();
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, new THREE.Vector3(...spec.point));
      const hit = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(plane, hit)) return;
      const delta = hit.y - spec.point[1];
      if (spec.kind === "post-h") live.current.onHeight(spec.id, spec.y + delta);
      else live.current.onLink(spec.id, spec.y + delta, spec.yB == null ? null : spec.yB + delta);
    };
    const up = () => {
      const was = drag.current;
      drag.current = null;
      if (live.current.controls) live.current.controls.enabled = true;
      if (was) live.current.onEnd();
      window.setTimeout(() => {
        dragged.current = false;
      }, 0);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
  }, [camera, dragged, gl]);
  return null;
}

function DimTag({ position, text }: { position: Vec3; text: string }) {
  return (
    <Html position={position} center sprite distanceFactor={110} zIndexRange={[20, 0]}>
      <div className="dim-tag">{text}</div>
    </Html>
  );
}

function calledName(label: string): string {
  const named = /^(?:45° brace|Adjustable brace|Brace)\s+(.+)$/.exec(label);
  if (named) {
    const rest = named[1].replace(/,\s*bay.*$/, "").trim();
    if (rest && rest !== ",") return rest.length > 36 ? "Brace" : rest;
    const bay = /bay\s+(\d+)/.exec(label);
    return bay ? `Bay ${bay[1]}` : "Brace";
  }
  const post = /^Post\s+(\S+)/.exec(label);
  if (post) return post[1];
  const rail = /^(?:Width rail|Depth rail|Rail)\s+(\S+)/.exec(label);
  if (rail) return rail[1];
  return label.slice(0, 22);
}

function NameTags({ project, build, show }: { project: Project; build: Build; show: boolean }) {
  const tags = useMemo(() => {
    if (!show) return [];
    const marks = sheetIndex(project, build).marks;
    const out: { key: string; at: Vec3; text: string }[] = [];
    for (const member of build.members) {
      const mark = marks.get(member.id) ?? "";
      const text = mark ? `${calledName(member.label)} · ${mark}` : calledName(member.label);
      if (member.kind === "post") {
        out.push({
          key: member.id,
          at: [member.a[0] + 3.2, Math.max(2, member.b[1] * 0.42), member.a[2]],
          text,
        });
        continue;
      }
      const mid: Vec3 = [(member.a[0] + member.b[0]) / 2, (member.a[1] + member.b[1]) / 2, (member.a[2] + member.b[2]) / 2];
      const dx = member.b[0] - member.a[0];
      const dz = member.b[2] - member.a[2];
      const len = Math.hypot(dx, dz) || 1;
      const level = Math.abs(member.a[1] - member.b[1]) < 1 / 16;
      out.push({
        key: member.id,
        at: [mid[0] + (-dz / len) * 3.4, Math.max(1.2, mid[1] + (level ? -2.6 : 0)), mid[2] + (dx / len) * 3.4],
        text,
      });
    }
    return out;
  }, [project, build, show]);
  if (!show || !tags.length) return null;
  return (
    <group>
      {tags.map((tag) => (
        <Html key={tag.key} position={tag.at} center sprite distanceFactor={110} zIndexRange={[12, 0]} pointerEvents="none">
          <div className="name-tag">{tag.text}</div>
        </Html>
      ))}
    </group>
  );
}

function Measures({ members, show, unit }: { members: Member[]; show: boolean; unit: "in" | "ft" }) {
  const tags = useMemo(() => {
    if (!show) return [];
    const posts = members.filter((m) => m.kind === "post");
    const out: { key: string; at: Vec3; text: string }[] = [];
    if (posts.length <= 16) {
      for (const post of posts) {
        out.push({ key: `h-${post.id}`, at: [post.a[0], post.b[1] + 2.2, post.a[2]], text: formatLen(post.b[1], unit) });
      }
    }
    const neighbor = (axis: 0 | 2) => {
      const groups = new Map<number, Member[]>();
      for (const post of posts) {
        const key = Math.round(post.a[axis === 0 ? 2 : 0] * 8) / 8;
        const list = groups.get(key) ?? [];
        list.push(post);
        groups.set(key, list);
      }
      for (const list of groups.values()) {
        const sorted = [...list].sort((a, b) => a.a[axis] - b.a[axis]);
        for (let i = 1; i < sorted.length; i += 1) {
          const gap = sorted[i].a[axis] - sorted[i - 1].a[axis];
          if (gap < 4) continue;
          const at: Vec3 = [
            axis === 0 ? (sorted[i - 1].a[0] + sorted[i].a[0]) / 2 : sorted[i].a[0],
            1.4,
            axis === 2 ? (sorted[i - 1].a[2] + sorted[i].a[2]) / 2 : sorted[i].a[2],
          ];
          out.push({ key: `s-${sorted[i - 1].id}-${sorted[i].id}`, at, text: formatLen(gap, unit) });
        }
      }
    };
    neighbor(0);
    neighbor(2);
    const seen = new Set<number>();
    for (const rail of members) {
      if (rail.kind !== "rail") continue;
      if (Math.abs(rail.a[1] - rail.b[1]) > 1 / 16) {
        const mid: Vec3 = [(rail.a[0] + rail.b[0]) / 2, (rail.a[1] + rail.b[1]) / 2 + 1.6, (rail.a[2] + rail.b[2]) / 2];
        out.push({
          key: `sl-${rail.id}`,
          at: mid,
          text: `${formatLen(rail.span, unit)} · ${Math.abs(rail.angle ?? 0).toFixed(0)}°`,
        });
        continue;
      }
      const y = Math.round(rail.a[1] * 8) / 8;
      if (seen.has(y)) continue;
      seen.add(y);
      out.push({
        key: `ry-${y}`,
        at: [(rail.a[0] + rail.b[0]) / 2, rail.a[1] + 1.8, (rail.a[2] + rail.b[2]) / 2],
        text: `${formatLen(rail.a[1], unit)} high`,
      });
    }
    return out;
  }, [members, show, unit]);
  if (!show) return null;
  return (
    <group>
      {tags.map((tag) => (
        <DimTag key={tag.key} position={tag.at} text={tag.text} />
      ))}
    </group>
  );
}
function moved(event: ThreeEvent<MouseEvent>, down: { x: number; y: number } | null) {
  if (!down) return false;
  return Math.hypot(event.nativeEvent.clientX - down.x, event.nativeEvent.clientY - down.y) > 6;
}

function Floor({
  tool,
  onPlace,
  onClear,
  onHover,
  onPoint,
}: {
  tool: Tool;
  onPlace: (x: number, z: number) => void;
  onClear: () => void;
  onHover: (point: { x: number; z: number } | null) => void;
  onPoint: (point: Vec3) => void;
}) {
  const down = useRef<{ x: number; y: number } | null>(null);
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0, 0]}
      onPointerDown={(e) => {
        down.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
      }}
      onPointerMove={(e) => {
        if (tool !== "post") return;
        onHover({ x: e.point.x, z: e.point.z });
      }}
      onPointerOut={() => onHover(null)}
      onClick={(e) => {
        if (moved(e, down.current)) return;
        e.stopPropagation();
        if (tool === "post") onPlace(e.point.x, e.point.z);
        else if (tool === "measure") onPoint([e.point.x, e.point.y, e.point.z]);
        else onClear();
      }}
    >
      <planeGeometry args={[900, 900]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

const SURFACE = new Map<string, THREE.CanvasTexture>();

function paintSurface(kind: string): THREE.CanvasTexture {
  const cached = SURFACE.get(kind);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext("2d");
  if (!g) {
    const empty = new THREE.CanvasTexture(canvas);
    SURFACE.set(kind, empty);
    return empty;
  }
  const rand = (x: number, y: number) => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  if (kind === "osb") {
    g.fillStyle = "#c4a36a";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 700; i += 1) {
      const x = rand(i, 2) * 256;
      const y = rand(i, 5) * 256;
      const w = 6 + rand(i, 9) * 22;
      g.strokeStyle = rand(i, 3) > 0.5 ? "#a88448" : "#ddc08a";
      g.globalAlpha = 0.55;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + w, y + (rand(i, 7) - 0.5) * 6);
      g.stroke();
    }
    g.globalAlpha = 1;
  } else {
    g.fillStyle = "#b89060";
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 1) {
      const n = rand(0, y);
      g.fillStyle = n > 0.55 ? "rgba(90,60,30,0.18)" : "rgba(255,230,190,0.08)";
      g.fillRect(0, y, 256, 1);
    }
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  SURFACE.set(kind, map);
  return map;
}

function BoardMesh({
  board,
  ctx,
  selected,
  glow,
  ghost,
  present,
  onPick,
}: {
  board: Board;
  ctx: LayoutContext;
  selected: boolean;
  glow: boolean;
  ghost?: boolean;
  present?: boolean;
  onPick: (point: Vec3) => void;
}) {
  const laid = layoutBoard(board, ctx);
  const pose = useMemo(() => {
    if (!laid || laid.error) return null;
    const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(...laid.side), new THREE.Vector3(...laid.up), new THREE.Vector3(...laid.long));
    return new THREE.Quaternion().setFromRotationMatrix(basis);
  }, [laid]);
  const grain = present && !ghost && board.kind !== "plastic" && board.kind !== "metal" ? paintSurface(board.kind === "osb" ? "osb" : "wood") : null;
  if (!laid || laid.error || !pose) return null;
  const look = boardLook(board.kind);
  return (
    <mesh
      position={laid.origin}
      quaternion={pose}
      castShadow={Boolean(present)}
      receiveShadow={Boolean(present)}
      onClick={(event) => {
        event.stopPropagation();
        onPick([event.point.x, event.point.y, event.point.z]);
      }}
    >
      <boxGeometry args={[Math.max(0.05, laid.across), Math.max(0.04, laid.rise), Math.max(0.5, laid.length)]} />
      <meshStandardMaterial
        color={selected && !present ? "#e2a322" : look.color}
        map={grain}
        emissive={glow || ghost ? "#e2a322" : "#000000"}
        emissiveIntensity={glow ? 0.28 : ghost ? 0.12 : 0}
        metalness={look.metalness}
        roughness={present ? Math.min(0.92, look.roughness + 0.05) : look.roughness}
        transparent={ghost || look.opacity < 0.98}
        opacity={ghost ? Math.min(0.55, look.opacity) : look.opacity}
        depthWrite={!ghost && look.opacity > 0.9}
      />
    </mesh>
  );
}

function LumberGhost({ project, build, tool }: { project: Project; build: Build; tool: Tool }) {
  const lumber = useShop((s) => s.lumber);
  if (tool !== "lumber" || !lumber || !canPlaceLumber(lumber)) return null;
  const stock = STOCK_MAP[lumber.kind];
  const board: Board = {
    id: "ghost",
    kind: lumber.kind,
    face: stock.sheet ? "flat" : lumber.face,
    run: lumber.run,
    anchors: lumber.anchors,
    length: lumber.length,
    along: lumber.along,
    cross: lumber.cross,
    sheetWidth: lumber.sheetWidth,
    thickness: lumber.kind === "osb" ? lumber.thickness : stock.thick,
  };
  const ctx: LayoutContext = {
    fittings: build.fittings.map((item) => ({ id: item.id, sku: item.sku, position: item.position })),
    members: build.members.map((item) => ({ id: item.id, a: item.a, b: item.b })),
    boards: project.boards ?? [],
    straps: strapPoints(build.straps, build.members),
    pipeRadius: tradeById(project.trade).od / 2,
  };
  return <BoardMesh board={board} ctx={ctx} selected={false} glow={false} ghost onPick={() => undefined} />;
}

function BoardSlideArrows({ board, ctx, onNudge }: { board: Board; ctx: LayoutContext; onNudge: (dir: 1 | -1, axis?: SlideAxis) => void }) {
  const laid = layoutBoard(board, ctx);
  if (!laid || laid.error) return null;
  const long = new THREE.Vector3(...laid.long);
  const side = new THREE.Vector3(...laid.side);
  if (long.lengthSq() < 1e-6) return null;
  long.normalize();
  side.normalize();
  const origin = new THREE.Vector3(...laid.origin);
  const sheet = STOCK_MAP[board.kind].sheet && board.anchors.some((anchor) => anchor.ref.startsWith("board:"));
  const axes: { axis: SlideAxis; dir: 1 | -1; at: THREE.Vector3; arrow: THREE.Vector3 }[] = [
    { axis: "along", dir: -1, at: origin.clone().addScaledVector(long, -(laid.length / 2 + 5)), arrow: long.clone().multiplyScalar(-1) },
    { axis: "along", dir: 1, at: origin.clone().addScaledVector(long, laid.length / 2 + 5), arrow: long.clone() },
  ];
  if (sheet && side.lengthSq() > 1e-6) {
    axes.push(
      { axis: "cross", dir: -1, at: origin.clone().addScaledVector(side, -(laid.across / 2 + 5)), arrow: side.clone().multiplyScalar(-1) },
      { axis: "cross", dir: 1, at: origin.clone().addScaledVector(side, laid.across / 2 + 5), arrow: side.clone() },
    );
  }
  return (
    <group>
      {axes.map((end) => {
        const quat = new THREE.Quaternion().setFromUnitVectors(UP, end.arrow.clone().normalize());
        const label =
          end.axis === "cross" ? (end.dir === 1 ? "↓" : "↑") : Math.abs(end.arrow.y) > 0.7 ? (end.arrow.y > 0 ? "↑" : "↓") : end.dir === 1 ? "→" : "←";
        return (
          <group key={`${end.axis}-${end.dir}`} position={end.at} quaternion={quat}>
            <mesh
              onClick={(event) => {
                event.stopPropagation();
                onNudge(end.dir, end.axis);
              }}
            >
              <coneGeometry args={[1.05, 2.8, 12]} />
              <meshStandardMaterial color="#e2a322" emissive="#e2a322" emissiveIntensity={0.45} />
            </mesh>
            <Html position={[0, 2.2, 0]} center sprite distanceFactor={70} zIndexRange={[40, 0]}>
              <button type="button" className="arrow-tag" aria-label={end.axis === "cross" ? "Slide the sheet across" : "Slide the board"} onClick={() => onNudge(end.dir, end.axis)}>
                {label}
              </button>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

function LumberArrows({ project, build, tool, selected }: { project: Project; build: Build; tool: Tool; selected: string | null }) {
  const lumber = useShop((s) => s.lumber);
  const nudgeLumber = useShop((s) => s.nudgeLumber);
  const nudgeBoard = useShop((s) => s.nudgeBoard);
  const ctx: LayoutContext = {
    fittings: build.fittings.map((item) => ({ id: item.id, sku: item.sku, position: item.position })),
    members: build.members.map((item) => ({ id: item.id, a: item.a, b: item.b })),
    boards: project.boards ?? [],
    straps: strapPoints(build.straps, build.members),
    pipeRadius: tradeById(project.trade).od / 2,
  };
  if (tool === "lumber" && lumber && canPlaceLumber(lumber)) {
    const stock = STOCK_MAP[lumber.kind];
    const board: Board = {
      id: "ghost",
      kind: lumber.kind,
      face: stock.sheet ? "flat" : lumber.face,
      run: lumber.run,
      anchors: lumber.anchors,
      length: lumber.length,
      along: lumber.along,
      cross: lumber.cross,
      sheetWidth: lumber.sheetWidth,
      thickness: lumber.kind === "osb" ? lumber.thickness : stock.thick,
    };
    return <BoardSlideArrows board={board} ctx={ctx} onNudge={nudgeLumber} />;
  }
  const placed = selected?.startsWith("board:") ? (project.boards ?? []).find((item) => selected === `board:${item.id}`) : undefined;
  if (!placed) return null;
  return <BoardSlideArrows board={placed} ctx={ctx} onNudge={(dir, axis) => nudgeBoard(placed.id, dir, axis)} />;
}

function LeanArrows() {
  const draft = useShop((s) => s.draft);
  const nudgePipe = useShop((s) => s.nudgePipe);
  const projects = useShop((s) => s.projects);
  const activeId = useShop((s) => s.activeId);
  const project = normalizeProject(projects.find((item) => item.id === activeId) ?? projects[0]);
  if (!draft) return null;
  const arrows = (draft.leans ?? []).flatMap((lean, index) =>
    lean == null ? [] : fortyFiveButtons(project, draft.stops, index, lean).map((arrow) => ({ ...arrow, index })),
  );
  if (!arrows.length) return null;
  return (
    <group>
      {arrows.map((arrow) => {
        const dir = new THREE.Vector3(...arrow.arrow);
        if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0);
        dir.normalize();
        const quat = new THREE.Quaternion().setFromUnitVectors(UP, dir);
        const pos = new THREE.Vector3(...arrow.at).add(dir.clone().multiplyScalar(arrow.active ? 8 : 5.5));
        return (
          <group key={`${arrow.index}-${arrow.end}-${arrow.dir}`} position={pos} quaternion={quat}>
            <mesh
              onClick={(event) => {
                event.stopPropagation();
                nudgePipe(arrow.index, arrow.end, arrow.dir);
              }}
            >
              <coneGeometry args={[arrow.active ? 1.2 : 0.85, arrow.active ? 3.4 : 2.4, 12]} />
              <meshStandardMaterial color={arrow.active ? "#e2a322" : "#f4e2a8"} emissive="#e2a322" emissiveIntensity={arrow.active ? 0.9 : 0.2} />
            </mesh>
            <Html position={[0, 2.2, 0]} center sprite distanceFactor={70} zIndexRange={[40, 0]}>
              <button
                type="button"
                className={arrow.active ? "arrow-tag on" : "arrow-tag"}
                aria-label={arrow.title}
                title={arrow.title}
                onClick={() => nudgePipe(arrow.index, arrow.end, arrow.dir)}
              >
                {arrow.label}
              </button>
            </Html>
          </group>
        );
      })}
    </group>
  );
}


export function Viewport({
  project,
  build,
  selected,
  tool,
  anchor,
  unit,
  showMeasures,
  showLabels,
  showLumber,
  measure,
  onActivate,
  onPlace,
  onClear,
  onMeasure,
  onMovePost,
  onMovePostHeight,
  onMoveLink,
  onResizeLink,
  onRepositionLink,
  onBeginEdit,
  onEndEdit,
  barEdit,
  picking,
  viewNonce,
  draftLine,
}: {
  project: Project;
  build: Build;
  selected: string | null;
  tool: Tool;
  anchor: string | null;
  unit: "in" | "ft";
  showMeasures: boolean;
  showLabels: boolean;
  showLumber: boolean;
  measure: { a: Vec3 | null; b: Vec3 | null };
  onActivate: (id: string, point?: [number, number, number]) => void;
  onPlace: (x: number, z: number) => void;
  onClear: () => void;
  onMeasure: (point: Vec3) => void;
  onMovePost: (id: string, x: number, z: number) => void;
  onMovePostHeight: (id: string, height: number) => void;
  onMoveLink: (id: string, y: number, yB: number | null) => void;
  onResizeLink: (id: string, length: number) => void;
  onRepositionLink: (id: string, x: number, z: number, y: number) => void;
  onBeginEdit: () => void;
  onEndEdit: () => void;
  barEdit: "resize" | "move";
  picking: boolean;
  viewNonce: number;
  draftLine?: Vec3[] | null;
}) {
  const present = false;
  const trade = tradeById(project.trade);
  const colors =
    project.finish === "black"
      ? { pipe: "#3a3e3b", fitting: "#4e534f", bolt: "#d5d8dc", hot: "#e2a322", hint: "#f0d48a" }
      : { pipe: "#c9cdc6", fitting: "#d7dbd6", bolt: "#2c2e2c", hot: "#e2a322", hint: "#f0d48a" };
  const nodes = project.mode === "sketch" ? (project.nodes ?? []) : [];
  const focus: Vec3 =
    project.mode === "sketch"
      ? nodes.length
        ? [
            (Math.min(...nodes.map((n) => n.x)) + Math.max(...nodes.map((n) => n.x))) / 2,
            Math.max(18, ...nodes.map((n) => n.height)) / 2,
            (Math.min(...nodes.map((n) => n.z)) + Math.max(...nodes.map((n) => n.z))) / 2,
          ]
        : [0, 18, 0]
      : [build.width.centers / 2, Math.max(18, project.postHeight) / 2, build.depth.centers / 2];
  const span = Math.max(build.width.centers + (project.showFigure ? 30 : 10), build.depth.centers + 12, build.postHeight, 36);
  const distance = span * 0.78 + 26;
  const grid = Math.max(168, Math.ceil((span + 48) / 12) * 12);
  const [hover, setHover] = useState<{ x: number; z: number } | null>(null);
  const ghost = hover && tool === "post" && project.mode === "sketch" ? snapSketch(hover.x, hover.z, nodes.filter((node) => !node.host)) : null;
  const dragged = useRef(false);
  const beginDrag = useRef<(spec: DragSpec) => void>(() => {});
  const dragEnabled = false;
  const hinted = useMemo(() => {
    const ids = new Set<string>();
    const sel = build.members.find((m) => m.id === selected);
    if (!sel) return ids;
    for (const member of build.members) {
      if (member.id === sel.id) continue;
      if (sel.kind === "post" && member.kind === "post") {
        if (
          Math.abs(member.a[0] - sel.a[0]) < 0.35 ||
          Math.abs(member.a[2] - sel.a[2]) < 0.35 ||
          Math.abs(member.b[1] - sel.b[1]) < 1 / 16
        ) {
          ids.add(member.id);
        }
      }
      if ((sel.kind === "rail" || sel.kind === "brace") && (member.kind === "rail" || member.kind === "brace")) {
        const level =
          Math.abs(sel.a[1] - sel.b[1]) < 1 / 16 &&
          Math.abs(member.a[1] - member.b[1]) < 1 / 16 &&
          Math.abs(member.a[1] - sel.a[1]) < 1 / 16;
        const d1 = new THREE.Vector3(sel.b[0] - sel.a[0], sel.b[1] - sel.a[1], sel.b[2] - sel.a[2]);
        const d2 = new THREE.Vector3(member.b[0] - member.a[0], member.b[1] - member.a[1], member.b[2] - member.a[2]);
        if (d1.length() > 0.2 && d2.length() > 0.2 && Math.abs(d1.normalize().dot(d2.normalize())) > 0.985) ids.add(member.id);
        if (level) ids.add(member.id);
      }
    }
    return ids;
  }, [build.members, selected]);
  const guides = useMemo(() => {
    const sel = build.members.find((m) => m.id === selected && m.kind === "post");
    if (!sel) return [] as { key: string; points: [Vec3, Vec3] }[];
    const lines: { key: string; points: [Vec3, Vec3] }[] = [];
    for (const member of build.members) {
      if (member.kind !== "post" || member.id === sel.id) continue;
      if (Math.abs(member.a[0] - sel.a[0]) > 0.35 && Math.abs(member.a[2] - sel.a[2]) > 0.35) continue;
      lines.push({
        key: member.id,
        points: [
          [sel.a[0], 0.08, sel.a[2]],
          [member.a[0], 0.08, member.a[2]],
        ],
      });
    }
    return lines;
  }, [build.members, selected]);
  return (
    <Canvas
      className="scene"
      dpr={[1, 1.75]}
      camera={{ position: [80, 50, 80], fov: 38, near: 0.1, far: 4000 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.08, preserveDrawingBuffer: true }}
      onPointerMissed={() => {
        if (!present) onClear();
      }}
    >
      <color attach="background" args={["#101311"]} />
      <hemisphereLight args={["#f4f1e8", "#1c241c", 0.92]} />
      <directionalLight position={[70, 110, 46]} intensity={1.7} />
      <directionalLight position={[-48, 36, -30]} intensity={0.4} />
      <Grid
        position={[focus[0], -0.02, focus[2]]}
        args={[grid, grid]}
        cellSize={6}
        cellThickness={0.7}
        cellColor="#314034"
        sectionSize={12}
        sectionThickness={1.35}
        sectionColor="#a68445"
        fadeDistance={grid * 0.7}
        fadeStrength={1.5}
        infiniteGrid={false}
      />
      {!present && (project.mode === "sketch" || tool === "measure") ? (
        <Floor tool={tool} onPlace={onPlace} onClear={onClear} onHover={setHover} onPoint={onMeasure} />
      ) : null}
      {!present && ghost ? (
        <mesh position={[ghost.x, 0.06, ghost.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.1, 1.55, 28]} />
          <meshBasicMaterial color="#e2a322" />
        </mesh>
      ) : null}
      {!present && draftLine?.map((point, index) => (
        <mesh key={`draft-${index}`} position={point}>
          <sphereGeometry args={[0.85, 14, 14]} />
          <meshBasicMaterial color="#e2a322" />
        </mesh>
      ))}
      {!present && draftLine && draftLine.length >= 2 ? <Line points={draftLine} color="#e2a322" lineWidth={2} /> : null}
      {!present && ghost?.lockX ? <Line points={[[ghost.x, 0.1, ghost.z - 48], [ghost.x, 0.1, ghost.z + 48]]} color="#e2a322" lineWidth={1.5} /> : null}
      {!present && ghost?.lockZ ? <Line points={[[ghost.x - 48, 0.1, ghost.z], [ghost.x + 48, 0.1, ghost.z]]} color="#e2a322" lineWidth={1.5} /> : null}
      {!present ? guides.map((guide) => (
        <Line key={guide.key} points={guide.points} color="#e2a322" lineWidth={1.25} transparent opacity={0.85} />
      )) : null}
      <DragBridge
        enabled={dragEnabled}
        dragged={dragged}
        onPost={onMovePost}
        onHeight={onMovePostHeight}
        onLink={onMoveLink}
        onResize={onResizeLink}
        onReposition={(id, x, z, y) => onRepositionLink(id, x, z, y)}
        onEnd={onEndEdit}
        bind={(start) => {
          beginDrag.current = start;
        }}
      />
      {build.members.map((member) => (
        <MemberMesh
          key={member.id}
          member={member}
          radius={tradeById(member.trade ?? project.trade).od / 2}
          colors={colors}
          selected={!present && (selected === member.id || (anchor != null && member.id === `post:${anchor}`))}
          hinted={!present && hinted.has(member.id)}
          glow={!present && picking && (member.kind === "post" || member.kind === "rail")}
          dragEnabled={!present && dragEnabled && member.id.includes(":") && !picking}
          straps={build.straps.filter((strap) => strap.memberId === member.id)}
          strapGlow={!present && tool === "lumber"}
          present={present}
          black={project.finish === "black"}
          onPick={(point) => {
            if (dragged.current) return;
            if (tool === "measure") onMeasure(point);
            else onActivate(member.id, point);
          }}
          onStrap={(id, point) => {
            if (dragged.current) return;
            if (tool === "lumber") {
              useShop.getState().addLumberAnchor(`strap:${id}`, point, "strap");
              return;
            }
            onActivate(member.id, point);
          }}
          onDragStart={(kind, point) => {
            if (barEdit === "resize" && kind === "post") return;
            if (barEdit === "move" && kind === "post-h") return;
            const cut = member.id.indexOf(":");
            if (cut < 0) return;
            const id = member.id.slice(cut + 1);
            onBeginEdit();
            if (kind === "link" && (barEdit === "resize" || barEdit === "move")) {
              const link = (project.links ?? []).find((item) => item.id === id);
              const a = nodes.find((node) => node.id === link?.a);
              const b = nodes.find((node) => node.id === link?.b);
              if (link && a && b) {
                const dx = b.x - a.x;
                const dz = b.z - a.z;
                const span = Math.hypot(dx, dz) || 1;
                beginDrag.current({
                  kind: barEdit === "resize" ? "link-len" : "link-move",
                  id,
                  point,
                  y: member.a[1],
                  yB: null,
                  originX: a.x,
                  originZ: a.z,
                  axisX: dx / span,
                  axisZ: dz / span,
                  ax: a.x,
                  az: a.z,
                  length: span,
                });
                return;
              }
            }
            const level = Math.abs(member.a[1] - member.b[1]) < 1 / 16;
            beginDrag.current({
              kind,
              id,
              point,
              y: kind === "post-h" ? member.b[1] : member.a[1],
              yB: kind === "link" && !level ? member.b[1] : null,
            });
          }}
        />
      ))}
      <Measures members={build.members} show={showMeasures} unit={unit} />
      {!present ? <NameTags project={project} build={build} show={showLabels} /> : null}
      {!present ? <LeanArrows /> : null}
      {!present ? <LumberArrows project={project} build={build} tool={tool} selected={selected} /> : null}
      {(showLumber ? (project.boards ?? []) : []).map((board) => (
        <BoardMesh
          key={board.id}
          board={board}
          ctx={{
            fittings: build.fittings.map((item) => ({ id: item.id, sku: item.sku, position: item.position })),
            members: build.members.map((item) => ({ id: item.id, a: item.a, b: item.b })),
            boards: project.boards ?? [],
            straps: strapPoints(build.straps, build.members),
            pipeRadius: trade.od / 2,
          }}
          selected={!present && selected === `board:${board.id}`}
          glow={!present && tool === "lumber"}
          present={present}
          onPick={(point) => onActivate(`board:${board.id}`, point)}
        />
      ))}
      {!present ? <LumberGhost project={project} build={build} tool={tool} /> : null}
      {!present && showMeasures && measure.a && measure.b ? (
        <group>
          <Line points={[measure.a, measure.b]} color="#e2a322" lineWidth={2} />
          <DimTag
            position={[(measure.a[0] + measure.b[0]) / 2, (measure.a[1] + measure.b[1]) / 2 + 2, (measure.a[2] + measure.b[2]) / 2]}
            text={measureLabel(measure.a, measure.b, unit)}
          />
        </group>
      ) : null}
      {!present
        ? nodes
            .filter((node) => !node.host && (node.bury ?? 0) > 0.25)
            .map((node) => (
          <group key={`bury-${node.id}`}>
            <mesh position={[node.x, -((node.bury ?? 0) / 2), node.z]}>
              <cylinderGeometry args={[tradeById(node.trade ?? project.trade).od / 2, tradeById(node.trade ?? project.trade).od / 2, node.bury ?? 0, 12]} />
              <meshStandardMaterial color={colors.pipe} transparent opacity={0.28} depthWrite={false} />
            </mesh>
            <mesh position={[node.x, 0.05, node.z]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[tradeById(node.trade ?? project.trade).od / 2 + 0.15, tradeById(node.trade ?? project.trade).od / 2 + 0.55, 24]} />
              <meshBasicMaterial color="#9bb0a0" transparent opacity={0.7} />
            </mesh>
          </group>
        ))
        : null}
      {build.fittings.map((fitting) => (
        <FittingMesh
          key={fitting.id}
          fitting={fitting}
          od={tradeById(fitting.trade ?? project.trade).od}
          colors={colors}
          selected={!present && selected === fitting.id}
          glow={!present && tool === "lumber" && WOOD_SKUS.has(fitting.sku)}
          present={present}
          black={project.finish === "black"}
          onPick={() => {
            if (tool === "lumber") {
              useShop.getState().addLumberAnchor(fitting.id, [...fitting.position], fitting.sku);
              return;
            }
            onActivate(fitting.id);
          }}
        />
      ))}
      {!present && project.showFigure ? <Figure /> : null}
      {(present ? [] : project.references ?? []).map((item) => (
        <ReferenceBox key={item.id} item={item} selected={selected === `ref:${item.id}`} onPick={() => onActivate(`ref:${item.id}`)} />
      ))}
      {!present ? <MoveGizmo project={project} /> : null}
      <FitView focus={focus} distance={distance} nonce={viewNonce} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.12} maxPolarAngle={Math.PI / 2.05} />
    </Canvas>
  );
}
