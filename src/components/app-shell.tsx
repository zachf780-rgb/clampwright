import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Copy,
  Info,
  Minus,
  Plus,
  RotateCcw,
  Trash2,
  Undo2,
  Redo2,
  Check,
  X,
} from "lucide-react";
import { Viewport } from "@/components/viewport";
import { DesignPacket } from "@/components/packet";
import { alignmentNotes, baysMatchingOutside, buildProject, colName, endHeights, fortyFiveButtons, MEASURE_REFERENCES, normalizeProject, previewRailRun, railRunError, stickName, strapWindow, withAxisCount, type Fitting, type MeasureRef, type Member, type PlannedClamp, type Project, type SketchLink, type SketchNode, type Strap } from "@/lib/build";
import { CONNECTORS, STRAP_PACK_PRICE, TRADES, connectorPrice, tradeById } from "@/lib/catalog";
import { formatDecimal, formatLen, money, parseLength } from "@/lib/format";
import { OSB_THICKNESS, STOCKS, STOCK_MAP, boardHang, boardTitle, canPlaceLumber, layoutBoard, strapPoints, type Board, type SlideAxis } from "@/lib/lumber";
import { axisAllowed, axisName, MOVE_AXES, movedText, sameTarget, targetFromSelection, totalText, type MoveAxis, type MoveTarget } from "@/lib/move";
import { useShop, type Tool } from "@/lib/store";

function LenField({
  label,
  inches,
  unit,
  min,
  max,
  onCommit,
  testId,
}: {
  label: string;
  inches: number;
  unit: "in" | "ft";
  min: number;
  max: number;
  onCommit: (n: number) => void;
  testId?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (Number.isFinite(inches) ? formatLen(inches, unit) : "");
  return (
    <label className="field">
      <span>{label}</span>
      <input
        data-testid={testId}
        inputMode="decimal"
        aria-label={label}
        value={shown}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => {
          const raw = e.currentTarget.value;
          setText(null);
          const n = parseLength(raw);
          if (n == null) return;
          const clamped = Math.min(max, Math.max(min, n));
          if (Math.abs(clamped - inches) < 1 / 64) return;
          onCommit(clamped);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </label>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="stepper">
      <button type="button" className="icon-btn" aria-label={`Fewer ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}>
        <Minus size={16} />
      </button>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
      <button type="button" className="icon-btn" aria-label={`More ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
        <Plus size={16} />
      </button>
    </div>
  );
}

function Num({
  label,
  value,
  min,
  max,
  step = 0.5,
  onChange,
  testId,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
  testId?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        data-testid={testId}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isFinite(n)) return;
          onChange(Math.min(max, Math.max(min, n)));
        }}
      />
    </label>
  );
}

const TOOLS: { id: Tool; label: string }[] = [
  { id: "select", label: "Select" },
  { id: "post", label: "Post" },
  { id: "rail", label: "Rail" },
  { id: "lumber", label: "Lumber" },
  { id: "erase", label: "Erase" },
  { id: "measure", label: "Measure" },
];

function postNames(nodes: SketchNode[], links: SketchLink[] = []) {
  const ordered = [...nodes].filter((node) => !node.host).sort((a, b) => a.z - b.z || a.x - b.x);
  const names = new Map(ordered.map((node, i) => [node.id, colName(i)]));
  for (const node of nodes) {
    if (!node.host) continue;
    const link = links.find((item) => item.id === node.host);
    const a = link ? names.get(link.a) : undefined;
    const b = link ? names.get(link.b) : undefined;
    names.set(node.id, a && b ? `${a}–${b} @ ${formatDecimal(node.height)}` : "rail");
  }
  return names;
}

function pipeTitle(link: SketchLink, nodes: SketchNode[], names: Map<string, string>) {
  const a = nodes.find((node) => node.id === link.a);
  const b = nodes.find((node) => node.id === link.b);
  const left = names.get(link.a) ?? "?";
  const right = names.get(link.b) ?? "?";
  if (a?.host || b?.host) return `Brace ${left} to ${right}`;
  return `${link.kind === "brace" ? "Brace" : "Rail"} ${left}–${right}`;
}

function FreeBuild({ unit }: { unit: "in" | "ft" }) {
  const selectedId = useShop((s) => s.selectedId);
  const tool = useShop((s) => s.tool);
  const anchor = useShop((s) => s.anchor);
  const setTool = useShop((s) => s.setTool);
  const update = useShop((s) => s.update);
  const patchNode = useShop((s) => s.patchNode);
  const setEveryPost = useShop((s) => s.setEveryPost);
  const setEveryRail = useShop((s) => s.setEveryRail);
  const removeNode = useShop((s) => s.removeNode);
  const removeLink = useShop((s) => s.removeLink);
  const select = useShop((s) => s.select);
  const activate = useShop((s) => s.activate);
  const placePost = useShop((s) => s.placePost);
  const projects = useShop((s) => s.projects);
  const activeId = useShop((s) => s.activeId);
  const project = normalizeProject(projects.find((p) => p.id === activeId) ?? projects[0]);
  const names = postNames(project.nodes, project.links);
  const node = project.nodes.find((n) => selectedId === `post:${n.id}`) ?? project.nodes.find((n) => n.id === anchor) ?? null;
  const link = project.links.find((l) => selectedId === `rail:${l.id}` || selectedId === `brace:${l.id}`) ?? null;
  const hint =
    tool === "post"
      ? "Click the floor. Posts snap to the inch, and onto another post’s line when you’re close."
      : tool === "rail"
        ? "Click posts or the middle of a rail, in order. A run can visit as many as you need, then close back on the first post."
        : tool === "erase"
          ? "Click a post to remove it and its pipes, or a rail to delete just that pipe."
          : tool === "measure"
            ? "Click two points. The line stays until you start another one."
            : "Select a post or rail. Move and resize happen on its card, not on the click.";

  return (
    <section className="measure-card">
      <h2>Free build</h2>
      <p className="fine">{hint}</p>
      <div className="tool-row" role="group" aria-label="Build tools">
        {TOOLS.map((item) => (
          <button key={item.id} type="button" className={tool === item.id ? "on" : ""} onClick={() => setTool(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      <LenField
        label="Rail height"
        testId="rail-height"
        inches={project.railHeight}
        unit={unit}
        min={1}
        max={240}
        onCommit={(railHeight) => update({ railHeight })}
      />
      <button type="button" className="btn" disabled={!project.links.some((l) => l.kind === "rail")} onClick={() => setEveryRail(project.railHeight)}>
        Move every rail to this height
      </button>
      <LenField
        label="New post height"
        testId="new-post-height"
        inches={project.postHeight}
        unit={unit}
        min={12}
        max={240}
        onCommit={(postHeight) => update({ postHeight })}
      />
      <button type="button" className="btn" disabled={project.nodes.length === 0} onClick={() => setEveryPost(project.postHeight)}>
        Match every post to this
      </button>
      {node ? (
        <div className="pick">
          <h3>Post {names.get(node.id)}</h3>
          <div className="bay-row">
            <LenField
              label="Center X"
              inches={node.x}
              unit={unit}
              min={-240}
              max={240}
              onCommit={(x) => patchNode(node.id, { x })}
            />
            <LenField
              label="Center Z"
              inches={node.z}
              unit={unit}
              min={-240}
              max={240}
              onCommit={(z) => patchNode(node.id, { z })}
            />
          </div>
          <LenField
            label="This post only"
            inches={node.height}
            unit={unit}
            min={12}
            max={240}
            onCommit={(height) => patchNode(node.id, { height })}
          />
          <label className="check">
            <input type="checkbox" checked={node.flange} onChange={(e) => patchNode(node.id, { flange: e.target.checked })} />
            Floor flange on this post
          </label>
          <DeleteButton name="post" onDelete={() => removeNode(node.id)} />
        </div>
      ) : null}
      {link ? (
        <div className="pick">
          <h3>
            {pipeTitle(link, project.nodes, names)}
          </h3>
          {link.kind === "rail" ? (
            <>
              <LenField
                label={`At ${names.get(link.a)}`}
                inches={endHeights(link)[0]}
                unit={unit}
                min={1}
                max={240}
                onCommit={(y) => update({ links: project.links.map((item) => (item.id === link.id ? { ...item, y } : item)) })}
              />
              <LenField
                label={`At ${names.get(link.b)}`}
                inches={endHeights(link)[1]}
                unit={unit}
                min={1}
                max={240}
                onCommit={(yB) => update({ links: project.links.map((item) => (item.id === link.id ? { ...item, yB } : item)) })}
              />
              <p className="fine">
                {Math.abs(endHeights(link)[0] - endHeights(link)[1]) > 1 / 16
                  ? "These ends differ, so the joint is an adjustable hinge (a 45° connector when the slope is 45°)."
                  : "Level rail. Change one end to pivot it."}
              </p>
            </>
          ) : link.yB == null ? (
            <p className="fine">This brace picks its own slope. Select it and set each end on the card, or drag it.</p>
          ) : (
            <>
              <LenField
                label={`At ${names.get(link.a)}`}
                inches={link.y}
                unit={unit}
                min={1}
                max={240}
                onCommit={(y) => update({ links: project.links.map((item) => (item.id === link.id ? { ...item, y } : item)) })}
              />
              <LenField
                label={`At ${names.get(link.b)}`}
                inches={link.yB}
                unit={unit}
                min={1}
                max={240}
                onCommit={(yB) => update({ links: project.links.map((item) => (item.id === link.id ? { ...item, yB } : item)) })}
              />
            </>
          )}
          <DeleteButton name={link.kind === "brace" ? "brace" : "rail"} onDelete={() => removeLink(link.id)} />
        </div>
      ) : null}
      <h3>Posts</h3>
      <button
        type="button"
        className="btn"
        data-testid="add-post"
        disabled={project.nodes.length >= 24}
        onClick={() => {
          const last = project.nodes[project.nodes.length - 1];
          if (!last) placePost(0, 0);
          else placePost(last.x + 24, last.z);
        }}
      >
        <Plus size={16} /> Add a post
      </button>
      {project.nodes.length === 0 ? <p className="fine">None yet.</p> : null}
      <ul className="member-list">
        {project.nodes
          .slice()
          .sort((a, b) => (names.get(a.id) ?? "").localeCompare(names.get(b.id) ?? ""))
          .map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={node?.id === item.id ? "on" : ""}
                onClick={() => (tool === "select" ? select(`post:${item.id}`) : activate(`post:${item.id}`))}
              >
                <strong>{names.get(item.id)}</strong>
                <span>
                  {formatLen(item.height, unit)} · {formatLen(item.x, unit)}, {formatLen(item.z, unit)}
                </span>
              </button>
            </li>
          ))}
      </ul>
      <h3>Connections</h3>
      {project.links.length === 0 ? <p className="fine">Rails and braces show up here.</p> : null}
      <ul className="member-list">
        {project.links.map((item) => (
          <li key={item.id}>
            <button type="button" className={link?.id === item.id ? "on" : ""} onClick={() => (tool === "select" ? select(`${item.kind === "brace" ? "brace" : "rail"}:${item.id}`) : activate(`${item.kind === "brace" ? "brace" : "rail"}:${item.id}`))}>
              <strong>{pipeTitle(item, project.nodes, names)}</strong>
              <span>{item.kind === "rail" ? formatLen(item.y, unit) : "fitted between posts"}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ShapeCard({ unit, onPlaced }: { unit: "in" | "ft"; onPlaced: () => void }) {
  const placeShape = useShop((s) => s.placeShape);
  const nodes = useShop((s) => normalizeProject(s.projects.find((p) => p.id === s.activeId) ?? s.projects[0]).nodes.length);
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState(48);
  const [depth, setDepth] = useState(48);
  const [across, setAcross] = useState(2);
  const [deep, setDeep] = useState(2);
  const [height, setHeight] = useState(36);
  const [rail, setRail] = useState(false);
  const [railAt, setRailAt] = useState(34);
  return (
    <div className="float-card">
      <button type="button" className="btn" onClick={() => setOpen((v) => !v)}>
        {open ? "Hide shape" : "Square of posts"}
      </button>
      {open ? (
        <div className="float-body">
          <p className="fine">2 by 2 is a square of verticals. Check the rail to tie the top.</p>
          <LenField label="Width" inches={width} unit={unit} min={8} max={360} onCommit={setWidth} />
          <LenField label="Depth" inches={depth} unit={unit} min={8} max={360} onCommit={setDepth} />
          <div className="count-row">
            <span>Across</span>
            <button type="button" className="icon-btn" onClick={() => setAcross((n) => Math.max(1, n - 1))} aria-label="Fewer posts across">
              <Minus size={16} />
            </button>
            <strong>{across}</strong>
            <button type="button" className="icon-btn" onClick={() => setAcross((n) => Math.min(6, n + 1))} aria-label="More posts across">
              <Plus size={16} />
            </button>
          </div>
          <div className="count-row">
            <span>Deep</span>
            <button type="button" className="icon-btn" onClick={() => setDeep((n) => Math.max(1, n - 1))} aria-label="Fewer posts deep">
              <Minus size={16} />
            </button>
            <strong>{deep}</strong>
            <button type="button" className="icon-btn" onClick={() => setDeep((n) => Math.min(6, n + 1))} aria-label="More posts deep">
              <Plus size={16} />
            </button>
          </div>
          <LenField label="Post height" inches={height} unit={unit} min={12} max={240} onCommit={setHeight} />
          <label className="check">
            <input type="checkbox" checked={rail} onChange={(e) => setRail(e.target.checked)} />
            Rail around the top
          </label>
          {rail ? <LenField label="Rail height" inches={railAt} unit={unit} min={2} max={240} onCommit={setRailAt} /> : null}
          <button
            type="button"
            className="btn primary"
            disabled={nodes + across * deep > 24}
            onClick={() => {
              placeShape({ width, depth, across, deep, height, rail, railAt });
              onPlaced();
              setOpen(false);
            }}
          >
            Place posts
          </button>
        </div>
      ) : null}
    </div>
  );
}

function MoveControl({ target, unit }: { target: MoveTarget; unit: "in" | "ft" }) {
  const move = useShop((s) => s.move);
  const beginMove = useShop((s) => s.beginMove);
  const stepMove = useShop((s) => s.stepMove);
  const setMoveDistance = useShop((s) => s.setMoveDistance);
  const clearMove = useShop((s) => s.clearMove);
  const projects = useShop((s) => s.projects);
  const activeId = useShop((s) => s.activeId);
  const key = JSON.stringify(target);
  useEffect(() => {
    beginMove(target);
    return () => clearMove();
    // Restart only when the selected point changes, not on every move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const project = normalizeProject(projects.find((item) => item.id === activeId) ?? projects[0]);
  const session = move && sameTarget(move.target, target) ? move : null;
  if (!session) return <p className="fine">Move is ready.</p>;
  const allowed = new Map(MOVE_AXES.map((axis) => [axis, axisAllowed(session.base, session.target, session.delta, axis)]));
  const last = session.axis ? (`${session.sign < 0 ? "-" : "+"}${session.axis}` as MoveAxis) : null;
  const order: MoveAxis[] = ["+y", "-x", "-y", "+x", "-z", "+z"];
  return (
    <div className="move-box">
      <div className="move-pad" role="group" aria-label="Directions">
        <span />
        {order.slice(0, 1).map((axis) => (
          <MoveArrow key={axis} axis={axis} on={last === axis} disabled={!allowed.get(axis)} onStep={() => stepMove(axis)} />
        ))}
        <span />
        {order.slice(1, 4).map((axis) => (
          <MoveArrow key={axis} axis={axis} on={last === axis} disabled={!allowed.get(axis)} onStep={() => stepMove(axis)} />
        ))}
        <MoveArrow axis="-z" on={last === "-z"} disabled={!allowed.get("-z")} onStep={() => stepMove("-z")} />
        <span />
        <MoveArrow axis="+z" on={last === "+z"} disabled={!allowed.get("+z")} onStep={() => stepMove("+z")} />
      </div>
      <p className="move-readout">{movedText(session.delta, unit)}</p>
      <p className="move-readout">Total {totalText(project, session.target, unit)}</p>
      {session.axis && last ? (
        <LenField
          label="Distance"
          inches={Math.abs(session.delta[session.axis])}
          unit={unit}
          min={0}
          max={360}
          onCommit={setMoveDistance}
        />
      ) : (
        <p className="fine">Each arrow is 1 inch. Type a distance to override the last arrow. Gray arrows cannot move that way.</p>
      )}
      <p className="fine">
        {target.kind === "bar" || target.kind === "grid-rail"
          ? "This moves both ends together."
          : "This moves only this side."}
      </p>
    </div>
  );
}

function MoveArrow({ axis, on, disabled, onStep }: { axis: MoveAxis; on: boolean; disabled: boolean; onStep: () => void }) {
  return (
    <button type="button" className={on ? "on" : ""} disabled={disabled} aria-label={`Move ${axisName(axis)}`} onClick={onStep}>
      {axis === "+y" ? "↑" : axis === "-y" ? "↓" : axis === "-x" ? "←" : axis === "+x" ? "→" : axis === "-z" ? "↖" : "↘"}
    </button>
  );
}

function BarEditor({
  unit,
  mode,
  onMode,
  link,
  member,
  names,
  nodes,
  onResize,
  onMove,
  onEnds,
}: {
  unit: "in" | "ft";
  mode: "resize" | "move";
  onMode: (mode: "resize" | "move") => void;
  link: SketchLink;
  member: Member;
  names: Map<string, string>;
  nodes: SketchNode[];
  onResize: (length: number) => void;
  onMove: (x: number, z: number, y: number) => void;
  onEnds: (y: number, yB: number) => void;
}) {
  const a = nodes.find((node) => node.id === link.a);
  const b = nodes.find((node) => node.id === link.b);
  if (!a || !b || !link) return null;
  const span = Math.hypot(b.x - a.x, b.z - a.z);
  const y = member.kind === "brace" && link.yB == null ? member.a[1] : endHeights(link)[0];
  const nameA = names.get(link.a) ?? "A";
  const nameB = names.get(link.b) ?? "B";
  return (
    <>
      <BarModes mode={mode} onChange={onMode} />
      {mode === "resize" ? (
        <>
          <LenField label="Center to center" inches={span} unit={unit} min={6} max={360} onCommit={onResize} />
          <div className="bay-row">
            {a.host ? (
              <HostOffset nodeId={a.id} unit={unit} />
            ) : (
              <LenField
                label={`At ${nameA}`}
                inches={y}
                unit={unit}
                min={1}
                max={240}
                onCommit={(next) => onEnds(next, member.kind === "brace" && link.yB == null ? member.b[1] : endHeights(link)[1])}
              />
            )}
            {b.host ? (
              <HostOffset nodeId={b.id} unit={unit} />
            ) : (
              <LenField
                label={`At ${nameB}`}
                inches={member.kind === "brace" && link.yB == null ? member.b[1] : endHeights(link)[1]}
                unit={unit}
                min={1}
                max={240}
                onCommit={(next) => onEnds(y, next)}
              />
            )}
          </div>
          <p className="fine">
            Length slides post {nameB}. Different end heights pivot the bar on a hinge. Drag the bar to change the length.
          </p>
        </>
      ) : (
        <MoveControl target={{ kind: "bar", id: link.id }} unit={unit} />
      )}
    </>
  );
}

function GridRailEditor({
  unit,
  mode,
  onMode,
  member,
  project,
  onBay,
  onShelf,
}: {
  unit: "in" | "ft";
  mode: "resize" | "move";
  onMode: (mode: "resize" | "move") => void;
  member: Member;
  project: Project;
  onBay: (axis: "x" | "z", index: number, length: number) => void;
  onShelf: (y: number) => void;
}) {
  const axis = member.id.startsWith("rail-z") ? "z" : "x";
  const index = Number(member.id.split("-").pop());
  const bays = axis === "x" ? project.baysX : project.baysZ;
  const bay = Number.isFinite(index) ? bays[index] : undefined;
  return (
    <>
      <BarModes mode={mode} onChange={onMode} />
      {mode === "resize" ? (
        <>
          <LenField label="This bay" inches={bay ?? member.span} unit={unit} min={4} max={360} onCommit={(length) => onBay(axis, index, length)} />
          <p className="fine">Changes the center-to-center length of this bay. The other bays stay.</p>
        </>
      ) : (
        <>
          {(() => {
            const target = targetFromSelection(project, member.id);
            return target ? <MoveControl target={target} unit={unit} /> : null;
          })()}
        </>
      )}
    </>
  );
}

function StartCard({ name, onConfirm }: { name: string; onConfirm: () => void }) {
  return (
    <div className="float-card">
      <div className="card-head">
        <h2>Start at {name}</h2>
        <Confirm onConfirm={onConfirm} />
      </div>
      <p className="fine">Check to use this post or rail, then pick the other end.</p>
    </div>
  );
}

function RefCard({ unit, item, onDone }: { unit: "in" | "ft"; item: MeasureRef; onDone: () => void }) {
  const patchReference = useShop((s) => s.patchReference);
  const removeReference = useShop((s) => s.removeReference);
  const [w, setW] = useState(item.w);
  const [d, setD] = useState(item.d);
  const [h, setH] = useState(item.h);
  useEffect(() => {
    setW(item.w);
    setD(item.d);
    setH(item.h);
  }, [item.id, item.w, item.d, item.h]);
  return (
    <div className="float-card">
      <div className="card-head">
        <h2>{item.name}</h2>
        <Confirm
          onConfirm={() => {
            patchReference(item.id, { w, d, h });
            onDone();
          }}
        />
      </div>
      <p className="fine">A measuring reference only. It is not pipe and it is not on the cut list.</p>
      <LenField label="Width" inches={w} unit={unit} min={1} max={240} onCommit={setW} />
      <LenField label="Depth" inches={d} unit={unit} min={1} max={240} onCommit={setD} />
      <LenField label="Height" inches={h} unit={unit} min={0.25} max={240} onCommit={setH} />
      <DeleteButton
        name="reference"
        onDelete={() => {
          removeReference(item.id);
          onDone();
        }}
      />
    </div>
  );
}

function DeleteButton({ name, onDelete }: { name: string; onDelete: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    setArmed(false);
  }, [name]);
  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(timer);
  }, [armed]);
  if (!armed) {
    return (
      <button type="button" className="btn danger" onClick={() => setArmed(true)}>
        <Trash2 size={16} /> Delete {name}
      </button>
    );
  }
  return (
    <div className="confirm-row">
      <p className="fine">Delete this {name}?</p>
      <button type="button" className="btn danger" onClick={onDelete}>
        Delete
      </button>
      <button type="button" className="btn" onClick={() => setArmed(false)}>
        Cancel
      </button>
    </div>
  );
}

function Confirm({ onConfirm, disabled }: { onConfirm: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="icon-btn confirm" aria-label="Confirm" disabled={disabled} onClick={onConfirm}>
      <Check size={16} />
    </button>
  );
}

function HostOffset({ nodeId, unit }: { nodeId: string; unit: "in" | "ft" }) {
  const projects = useShop((s) => s.projects);
  const activeId = useShop((s) => s.activeId);
  const placeHost = useShop((s) => s.placeHost);
  const project = normalizeProject(projects.find((item) => item.id === activeId) ?? projects[0]);
  const node = project.nodes.find((item) => item.id === nodeId);
  if (!node?.host) return null;
  const link = project.links.find((item) => item.id === node.host);
  const a = link ? project.nodes.find((item) => item.id === link.a) : undefined;
  const b = link ? project.nodes.find((item) => item.id === link.b) : undefined;
  if (!link || !a || !b) return null;
  const span = Math.hypot(b.x - a.x, b.z - a.z);
  const inches = (node.hostT ?? 0.5) * span;
  const names = postNames(project.nodes, project.links);
  const centered = Math.abs((node.hostT ?? 0.5) - 0.5) < 0.02;
  return (
    <div>
      <LenField
        label={`From ${names.get(a.id) ?? "the end"}`}
        inches={inches}
        unit={unit}
        min={Math.max(1, span * 0.08)}
        max={Math.max(2, span * 0.92)}
        onCommit={(next) => placeHost(nodeId, next)}
      />
      <button type="button" className={centered ? "btn on" : "btn"} onClick={() => placeHost(nodeId, "center")}>
        Center
      </button>
      <p className="fine">Inches from the {names.get(a.id) ?? "start"} end of that pipe. Center is halfway.</p>
    </div>
  );
}

function clampLines(clamps: PlannedClamp[]): string[] {
  const groups = new Map<string, PlannedClamp[]>();
  for (const clamp of clamps) {
    const list = groups.get(clamp.name) ?? [];
    list.push(clamp);
    groups.set(clamp.name, list);
  }
  return [...groups.values()].map((list) => {
    const places = [...new Set(list.map((clamp) => clamp.where))];
    return `${list.length} × ${list[0].name} — ${places.join(", ")}`;
  });
}

function DraftCard({ unit, names }: { unit: "in" | "ft"; names: Map<string, string> }) {
  const draft = useShop((s) => s.draft);
  const projects = useShop((s) => s.projects);
  const activeId = useShop((s) => s.activeId);
  const setRunHeight = useShop((s) => s.setRunHeight);
  const setStopHeight = useShop((s) => s.setStopHeight);
  const popStop = useShop((s) => s.popStop);
  const setPipeLean = useShop((s) => s.setPipeLean);
  const nudgePipe = useShop((s) => s.nudgePipe);
  const commitDraft = useShop((s) => s.commitDraft);
  const cancelDraft = useShop((s) => s.cancelDraft);
  const project = normalizeProject(projects.find((item) => item.id === activeId) ?? projects[0]);
  if (!draft) return null;
  const ready = draft.stops.length >= 2;
  const error = ready ? railRunError(project, draft.stops) : null;
  const clamps = ready && !error ? previewRailRun(project, draft.stops).clamps : [];
  const seen = new Set<string>();
  const postStops = draft.stops.filter((stop) => {
    const node = project.nodes.find((item) => item.id === stop.nodeId);
    if (!node || node.host || seen.has(stop.nodeId)) return false;
    seen.add(stop.nodeId);
    return true;
  });
  const hostStops = draft.stops.filter((stop, index) => {
    const node = project.nodes.find((item) => item.id === stop.nodeId);
    return Boolean(node?.host) && draft.stops.findIndex((item) => item.nodeId === stop.nodeId) === index;
  });
  const height = postStops[0]?.y ?? project.railHeight;
  const shortest = postStops.reduce((min, stop) => {
    const node = project.nodes.find((item) => item.id === stop.nodeId);
    return Math.min(min, node?.height ?? min);
  }, 240);
  const fromTop = Math.max(0, shortest - height);
  const centered = Math.abs(height - shortest / 2) < 0.2;
  const pipes = Math.max(0, draft.stops.length - 1);
  const route = draft.stops.map((stop) => names.get(stop.nodeId) ?? "joint").join(" → ");
  return (
    <div className="float-card">
      <div className="card-head">
        <h2>{ready ? "Where should it sit?" : "New run"}</h2>
        <button type="button" className="icon-btn" aria-label="Cancel" onClick={cancelDraft}>
          <X size={16} />
        </button>
      </div>
      <p className="fine">
        {pipes === 0 ? "Pick the next post, or the middle of a rail." : `${pipes} ${pipes === 1 ? "pipe" : "pipes"} · ${route}`}
      </p>
      {postStops.length ? (
        draft.sameHeight ? (
          <>
            <LenField label="From the floor" inches={height} unit={unit} min={1} max={240} onCommit={setRunHeight} />
            <LenField
              label="From the top"
              inches={fromTop}
              unit={unit}
              min={1}
              max={Math.max(1, shortest - 1)}
              onCommit={(next) => setRunHeight(shortest - next)}
            />
            <button type="button" className={centered ? "btn on" : "btn"} onClick={() => setRunHeight(Math.max(1, shortest / 2))}>
              Center
            </button>
            <p className="fine">Height on every post in this run. From the top and center use the shortest post. Keep clicking to add another pipe.</p>
          </>
        ) : (
          postStops.map((stop) => {
            const node = project.nodes.find((item) => item.id === stop.nodeId);
            const postH = node?.height ?? shortest;
            const down = Math.max(0, postH - stop.y);
            const mid = Math.abs(stop.y - postH / 2) < 0.2;
            return (
              <div key={stop.nodeId}>
                <h3>Post {names.get(stop.nodeId) ?? ""}</h3>
                <LenField
                  label="From the floor"
                  inches={stop.y}
                  unit={unit}
                  min={1}
                  max={240}
                  onCommit={(next) => setStopHeight(stop.nodeId, next)}
                />
                <LenField
                  label="From the top"
                  inches={down}
                  unit={unit}
                  min={1}
                  max={Math.max(1, postH - 1)}
                  onCommit={(next) => setStopHeight(stop.nodeId, postH - next)}
                />
                <button type="button" className={mid ? "btn on" : "btn"} onClick={() => setStopHeight(stop.nodeId, Math.max(1, postH / 2))}>
                  Center
                </button>
              </div>
            );
          })
        )
      ) : null}
      {postStops.length > 1 ? (
        <button
          type="button"
          className="btn"
          onClick={() => (draft.sameHeight ? setStopHeight(postStops[0].nodeId, postStops[0].y) : setRunHeight(height))}
        >
          {draft.sameHeight ? "Different height at each post" : "Same height"}
        </button>
      ) : null}
      {hostStops.map((stop) => (
        <div key={stop.nodeId}>
          <h3>On the rail</h3>
          <HostOffset nodeId={stop.nodeId} unit={unit} />
        </div>
      ))}
      {ready ? (
        <>
          {draft.stops.slice(0, -1).map((stop, index) => {
            const next = draft.stops[index + 1];
            const lean = draft.leans?.[index] ?? null;
            const arrows = lean == null ? [] : fortyFiveButtons(project, draft.stops, index, lean);
            const ends = [0, 1] as const;
            return (
              <div key={`${stop.nodeId}-${index}`}>
                <button
                  type="button"
                  className={lean != null ? "btn on" : "btn"}
                  aria-pressed={lean != null}
                  onClick={() => setPipeLean(index, lean == null ? "auto" : null)}
                >
                  45° · {names.get(stop.nodeId) ?? "end"} → {names.get(next.nodeId) ?? "end"}
                </button>
                {lean != null ? (
                  <div className="lean-row">
                    {ends.map((end) => {
                      const mine = arrows.filter((arrow) => arrow.end === end);
                      const title = mine[0]?.title.replace(/^(Up|Down|Toward) (on )?/, "") ?? (end === 0 ? "start" : "end");
                      return (
                        <div key={end} className="lean-end">
                          <span>{title}</span>
                          {mine.map((arrow) => (
                            <button
                              key={arrow.dir}
                              type="button"
                              className={arrow.active ? "btn on" : "btn"}
                              aria-pressed={arrow.active}
                              aria-label={arrow.title}
                              title={arrow.title}
                              onClick={() => nudgePipe(index, arrow.end, arrow.dir)}
                            >
                              {arrow.label}
                            </button>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
          <p className="fine">
            The gold arrow slides that clamp, and the other clamp moves with it so the pipe stays at 45°. The other arrow turns the pipe to lean the other way. If the other end would run off its pipe, nothing moves.
          </p>
        </>
      ) : null}
      {draft.fortyFiveError ? <p className="run-error">{draft.fortyFiveError}</p> : null}
      {clamps.length ? (
        <>
          <h3>Clamps</h3>
          <ul className="clamp-plan">
            {clampLines(clamps).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      ) : null}
      {error ? <p className="run-error">{error}</p> : ready ? (
        <p className="fine">A loop around four posts lands a 90° at each corner. A straight run through a post lands a 180°. Five pipes on one post is the limit — the post plus four.</p>
      ) : (
        <p className="fine">Add as many as you need. Click the first post again to close a loop.</p>
      )}
      {draft.stops.length >= 24 ? <p className="fine">That’s as many as one run holds. Place these, then start another.</p> : null}
      {draft.stops.length > 1 ? (
        <button type="button" className="btn" onClick={popStop}>
          Remove last
        </button>
      ) : null}
      {ready ? (
        <button type="button" className="btn primary" disabled={Boolean(error || draft.fortyFiveError)} onClick={commitDraft}>
          Place {pipes === 1 ? "pipe" : "pipes"}
        </button>
      ) : null}
    </div>
  );
}

function BarModes({ mode, onChange }: { mode: "resize" | "move"; onChange: (mode: "resize" | "move") => void }) {
  return (
    <div className="seg bar-modes" role="group" aria-label="What to change on this bar">
      <button type="button" className={mode === "resize" ? "on" : ""} aria-pressed={mode === "resize"} onClick={() => onChange("resize")}>
        Resize
      </button>
      <button type="button" className={mode === "move" ? "on" : ""} aria-pressed={mode === "move"} onClick={() => onChange("move")}>
        Move
      </button>
    </div>
  );
}

function ClampMove({ fittingId, pointY, unit }: { fittingId: string; pointY: number; unit: "in" | "ft" }) {
  const [open, setOpen] = useState(false);
  const projects = useShop((s) => s.projects);
  const activeId = useShop((s) => s.activeId);
  const project = normalizeProject(projects.find((item) => item.id === activeId) ?? projects[0]);
  const target = targetFromSelection(project, fittingId, pointY);
  useEffect(() => setOpen(false), [fittingId]);
  if (!target) return null;
  return (
    <>
      <button type="button" className={open ? "btn on" : "btn"} aria-pressed={open} onClick={() => setOpen((value) => !value)}>
        Move
      </button>
      {open ? <MoveControl target={target} unit={unit} /> : null}
    </>
  );
}

function PieceSize({
  value,
  overridden,
  onPick,
}: {
  value: Project["trade"];
  overridden: boolean;
  onPick: (trade: Project["trade"] | null) => void;
}) {
  return (
    <div>
      <p className="fine">{overridden ? "This piece only" : "This piece follows the frame"}</p>
      <div className="seg" role="group" aria-label="This piece EMT size">
        {TRADES.map((t) => (
          <button key={t.id} type="button" className={value === t.id ? "on" : ""} onClick={() => onPick(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {overridden ? (
        <button type="button" className="btn" onClick={() => onPick(null)}>
          Use frame size
        </button>
      ) : (
        <p className="fine">The size buttons on the bar change the whole drawing and clear these.</p>
      )}
    </div>
  );
}

function WoodStraps({ member, straps, unit }: { member: Member; straps: Strap[]; unit: "in" | "ft" }) {
  const setStrapCount = useShop((s) => s.setStrapCount);
  const moveStrap = useShop((s) => s.moveStrap);
  const mine = straps.filter((strap) => strap.memberId === member.id).sort((a, b) => a.at - b.at);
  const [lo, hi] = strapWindow(member);
  const from = member.kind === "post" ? "the floor" : "the start of this pipe";
  return (
    <div>
      <p className="fine">Wood straps</p>
      <div className="count-row">
        <button
          type="button"
          className="icon-btn"
          aria-label="Fewer wood straps"
          disabled={mine.length === 0}
          onClick={() => setStrapCount(member.id, mine.length - 1, lo, hi)}
        >
          <Minus size={16} />
        </button>
        <strong>{mine.length}</strong>
        <span>on this pipe</span>
        <button
          type="button"
          className="icon-btn"
          data-testid="strap-add"
          aria-label="More wood straps"
          disabled={mine.length >= 12}
          onClick={() => setStrapCount(member.id, mine.length + 1, lo, hi)}
        >
          <Plus size={16} />
        </button>
      </div>
      <p className="fine">One-hole straps snap onto the pipe and screw to a board. They do not change the cut.</p>
      {mine.map((strap, index) => (
        <LenField
          key={strap.id}
          label={`Strap ${index + 1} from ${from}`}
          inches={strap.at}
          unit={unit}
          min={lo}
          max={Math.max(lo, hi)}
          onCommit={(at) => moveStrap(strap.id, at, lo, hi)}
        />
      ))}
    </div>
  );
}

function SelectionCard({
  unit,
  member,
  fitting,
  buildMembers,
  straps,
  barEdit,
  setBarEdit,
  onDone,
}: {
  unit: "in" | "ft";
  member: Member | null;
  fitting: Fitting | null;
  buildMembers: Member[];
  straps: Strap[];
  barEdit: "resize" | "move";
  setBarEdit: (mode: "resize" | "move") => void;
  onDone: () => void;
}) {
  const projects = useShop((s) => s.projects);
  const activeId = useShop((s) => s.activeId);
  const update = useShop((s) => s.update);
  const patchNode = useShop((s) => s.patchNode);
  const setMemberTrade = useShop((s) => s.setMemberTrade);
  const setClampHeight = useShop((s) => s.setClampHeight);
  const patchLink = useShop((s) => s.patchLink);
  const removeNode = useShop((s) => s.removeNode);
  const removeLink = useShop((s) => s.removeLink);
  const resizeBar = useShop((s) => s.resizeBar);
  const repositionBar = useShop((s) => s.repositionBar);
  const setBay = useShop((s) => s.setBay);
  const project = normalizeProject(projects.find((p) => p.id === activeId) ?? projects[0]);
  const names = postNames(project.nodes, project.links);
  if (fitting && fitting.sku !== "coupling") {
    const parts = fitting.id.split(":");
    const link = project.links.find((item) => item.id === parts[1]);
    const end = parts[2] === "b" ? "b" : "a";
    let postId: string | null = null;
    if (fitting.id.startsWith("fit:")) postId = fitting.id.slice(4, fitting.id.lastIndexOf(":"));
    else if (fitting.id.startsWith("flange:")) postId = fitting.id.slice(7);
    else if (link) postId = end === "b" ? link.b : link.a;
    const node = postId ? project.nodes.find((item) => item.id === postId) : null;
    const brace = link ? buildMembers.find((item) => item.id === `brace:${link.id}`) : null;
    const otherY = brace ? (end === "a" ? brace.b[1] : brace.a[1]) : undefined;
    const name = CONNECTORS.find((item) => item.sku === fitting.sku)?.name ?? "Clamp";
    return (
      <div className="float-card">
      <div className="card-head">
        <h2>{name}</h2>
        <Confirm onConfirm={onDone} />
      </div>
        <p className="fine">{node ? `On post ${names.get(node.id)}` : "On this post"}</p>
        {project.mode === "sketch" && node ? (
          <LenField label="This post only" inches={node.height} unit={unit} min={12} max={240} onCommit={(height) => patchNode(node.id, { height })} />
        ) : null}
        {fitting.sku === "flange" ? (
          <p className="fine">This plate is on the floor. The post height is the pipe above it.</p>
        ) : (
          <LenField
            label="Attachment height"
            inches={fitting.position[1]}
            unit={unit}
            min={1}
            max={240}
            onCommit={(height) => setClampHeight(fitting.id, height, fitting.position[1], otherY)}
          />
        )}
        {fitting.sku !== "flange" ? (
          <p className="fine">
            {project.mode === "sketch"
              ? "Only this clamp moves. The other end of the pipe stays, and a hinge joins them if the heights differ."
              : "Every clamp on this shelf moves together."}
          </p>
        ) : null}
        <ClampMove fittingId={fitting.id} pointY={fitting.position[1]} unit={unit} />
        {fitting.sku === "flange" && node ? (
          <DeleteButton name="flange" onDelete={() => { patchNode(node.id, { flange: false }); onDone(); }} />
        ) : link ? (
          <DeleteButton name={link.kind === "brace" ? "brace" : "rail"} onDelete={() => { removeLink(link.id); onDone(); }} />
        ) : node ? (
          <DeleteButton name="post" onDelete={() => { removeNode(node.id); onDone(); }} />
        ) : null}
      </div>
    );
  }
  if (!member || (member.kind !== "post" && member.kind !== "rail" && member.kind !== "brace")) return null;
  const notes = alignmentNotes(buildMembers, member.id);
  const sketchId = member.id.includes(":") ? member.id.slice(member.id.indexOf(":") + 1) : null;
  const node = sketchId ? project.nodes.find((n) => n.id === sketchId) : null;
  const link = sketchId ? project.links.find((l) => l.id === sketchId) : null;
  return (
    <div className="float-card">
      <div className="card-head">
        <h2>{member.kind === "post" ? `Post ${node ? names.get(node.id) : ""}` : member.kind === "rail" ? "Rail" : "Brace"}</h2>
        <Confirm onConfirm={onDone} />
      </div>
      {project.mode === "sketch" && member.kind === "post" && node ? (
        <>
          <BarModes mode={barEdit} onChange={setBarEdit} />
          {barEdit === "resize" ? (
            <>
              <LenField label="Height" inches={node.height} unit={unit} min={12} max={240} onCommit={(height) => patchNode(node.id, { height })} />
              <LenField label="Underground" inches={node.bury ?? 0} unit={unit} min={0} max={96} testId="bury" onCommit={(bury) => patchNode(node.id, { bury })} />
              <p className="fine">Height is what you see above the floor. Underground is added to this post’s cut only.</p>
              <PieceSize
                value={node.trade ?? project.trade}
                overridden={node.trade != null}
                onPick={(trade) => setMemberTrade("node", node.id, trade)}
              />
            </>
          ) : (
            <MoveControl target={{ kind: "post", id: node.id }} unit={unit} />
          )}
        </>
      ) : null}
      {project.mode !== "sketch" && member.kind === "post" ? (
        <LenField
          label="All posts"
          inches={project.postHeight}
          unit={unit}
          min={12}
          max={240}
          onCommit={(postHeight) => update({ postHeight, levels: project.levels.map((y) => Math.min(y, postHeight - 0.5)) })}
        />
      ) : null}
      {project.mode !== "sketch" && member.kind === "post" ? (
        <p className="fine">Rectangle posts share a height. Start over to set each one.</p>
      ) : null}
      {project.mode === "sketch" && link && (member.kind === "rail" || member.kind === "brace") ? (
        <>
        <BarEditor
          unit={unit}
          mode={barEdit}
          onMode={setBarEdit}
          link={link}
          member={member}
          names={names}
          nodes={project.nodes}
          onResize={(length) => resizeBar(link.id, length)}
          onMove={(x, z, y) => repositionBar(link.id, x, z, y, false)}
          onEnds={(y, yB) => patchLink(link.id, { y, yB })}
        />
        <PieceSize
          value={link.trade ?? project.trade}
          overridden={link.trade != null}
          onPick={(trade) => setMemberTrade("link", link.id, trade)}
        />
        </>
      ) : null}
      {project.mode !== "sketch" && member.kind === "rail" ? (
        <GridRailEditor unit={unit} mode={barEdit} onMode={setBarEdit} member={member} project={project} onBay={setBay} onShelf={(y) => update({ levels: project.levels.map((level) => (Math.abs(level - member.a[1]) < 0.05 ? y : level)) })} />
      ) : null}
      {project.mode !== "sketch" && member.kind === "brace" ? (
        <p className="fine">This brace follows the shelves. Use free build to set each end.</p>
      ) : null}
      {notes.map((note) => (
        <p key={note} className="fine align-note">
          {note}
        </p>
      ))}
      {member.kind === "post" || member.kind === "rail" ? <WoodStraps member={member} straps={straps} unit={unit} /> : null}
      {project.mode === "sketch" && node ? <DeleteButton name="post" onDelete={() => { removeNode(node.id); onDone(); }} /> : null}
      {project.mode === "sketch" && link ? (
        <DeleteButton name={member.kind === "brace" ? "brace" : "rail"} onDelete={() => { removeLink(link.id); onDone(); }} />
      ) : null}
    </div>
  );
}

function dressed(n: number): string {
  if (Math.abs(n - 0.4375) < 0.02) return "7/16\"";
  if (Math.abs(n - 0.5) < 0.02) return "1/2\"";
  if (Math.abs(n - 0.625) < 0.02) return "5/8\"";
  if (Math.abs(n - 0.75) < 0.02) return "3/4\"";
  if (Math.abs(n - 1.5) < 0.02) return "1 1/2\"";
  if (Math.abs(n - 3.5) < 0.02) return "3 1/2\"";
  if (Math.abs(n - 5.5) < 0.02) return "5 1/2\"";
  if (Math.abs(n - 7.25) < 0.02) return "7 1/4\"";
  if (Math.abs(n - 11.25) < 0.02) return "11 1/4\"";
  return formatDecimal(n);
}

function BoardArrows({
  sheet,
  vertical,
  longY,
  onNudge,
}: {
  sheet: boolean;
  vertical: boolean;
  longY: number;
  onNudge: (dir: 1 | -1, axis?: SlideAxis) => void;
}) {
  if (sheet) {
    return (
      <div className="sheet-moves">
        <div className="lean-end" role="group" aria-label="Slide the sheet along the boards">
          <button type="button" className="btn" aria-label="Slide the sheet back along the boards" onClick={() => onNudge(-1, "along")}>
            ←
          </button>
          <button type="button" className="btn" aria-label="Slide the sheet ahead along the boards" onClick={() => onNudge(1, "along")}>
            →
          </button>
        </div>
        <div className="lean-end" role="group" aria-label="Slide the sheet across the boards">
          <button type="button" className="btn" aria-label="Slide the sheet across one way" onClick={() => onNudge(-1, "cross")}>
            ↑
          </button>
          <button type="button" className="btn" aria-label="Slide the sheet across the other way" onClick={() => onNudge(1, "cross")}>
            ↓
          </button>
        </div>
      </div>
    );
  }
  if (vertical) {
    const up: 1 | -1 = longY >= 0 ? 1 : -1;
    return (
      <div className="lean-end" role="group" aria-label="Slide the board">
        <button type="button" className="btn" aria-label="Slide the board up" title="Slide up" onClick={() => onNudge(up)}>
          ↑
        </button>
        <button type="button" className="btn" aria-label="Slide the board down" title="Slide down" onClick={() => onNudge((up === 1 ? -1 : 1) as 1 | -1)}>
          ↓
        </button>
      </div>
    );
  }
  return (
    <div className="lean-end" role="group" aria-label="Slide the board">
      <button type="button" className="btn" aria-label="Slide toward the first clamp" title="Slide toward the first clamp" onClick={() => onNudge(-1)}>
        ←
      </button>
      <button type="button" className="btn" aria-label="Slide toward the last clamp" title="Slide toward the last clamp" onClick={() => onNudge(1)}>
        →
      </button>
    </div>
  );
}

function LumberCard({ unit, project, build }: { unit: "in" | "ft"; project: ReturnType<typeof normalizeProject>; build: NonNullable<ReturnType<typeof buildProject>> }) {
  const lumber = useShop((s) => s.lumber);
  const setLumber = useShop((s) => s.setLumber);
  const popLumberAnchor = useShop((s) => s.popLumberAnchor);
  const commitLumber = useShop((s) => s.commitLumber);
  const nudgeLumber = useShop((s) => s.nudgeLumber);
  const setTool = useShop((s) => s.setTool);
  if (!lumber) return null;
  const stock = STOCK_MAP[lumber.kind];
  const ctx = {
    fittings: build.fittings.map((item) => ({ id: item.id, sku: item.sku, position: item.position })),
    members: build.members.map((item) => ({ id: item.id, a: item.a, b: item.b })),
    boards: project.boards,
    straps: strapPoints(build.straps, build.members),
    pipeRadius: tradeById(project.trade).od / 2,
  };
  const placeable = canPlaceLumber(lumber);
  const opening = placeable
    ? layoutBoard(
        {
          id: "preview",
          kind: lumber.kind,
          face: stock.sheet ? "flat" : lumber.face,
          run: lumber.run,
          anchors: lumber.anchors,
          length: null,
          along: 0,
          cross: 0,
          sheetWidth: lumber.sheetWidth,
          thickness: lumber.kind === "osb" ? lumber.thickness : stock.thick,
        },
        ctx,
      )
    : null;
  const onBoards = stock.sheet && lumber.anchors.some((anchor) => anchor.ref.startsWith("board:"));
  const ready = placeable && !lumber.error && !opening?.error;
  const hang = opening && !opening.error ? boardHang(lumber, opening.length) : null;
  return (
    <div className="float-card">
      <div className="card-head">
        <h2>Lumber</h2>
        <button type="button" className="icon-btn" aria-label="Close lumber" onClick={() => setTool("select")}>
          <X size={16} />
        </button>
      </div>
      <p className="fine">
        Any piece can mount to a flange, a one-hole strap, or another board. Shingles and metal roof sit on OSB — click that sheet once and they follow its slope. A higher clamp or board holds that side up.
      </p>
      <div className="stock-grid">
        {STOCKS.filter((item) => !item.sheet).map((item) => (
          <button key={item.id} type="button" className={lumber.kind === item.id ? "btn on" : "btn"} onClick={() => setLumber({ kind: item.id })}>
            {item.label}
          </button>
        ))}
      </div>
      <p className="fine">Panels and roof</p>
      <div className="stock-grid">
        {STOCKS.filter((item) => item.sheet).map((item) => (
          <button key={item.id} type="button" className={lumber.kind === item.id ? "btn on" : "btn"} onClick={() => setLumber({ kind: item.id })}>
            {item.label}
          </button>
        ))}
      </div>
      <p className="fine">
        {stock.sheet
          ? `${stock.label} sits on the lumber you click. One OSB sheet is enough. Arrows slide it. Width and length both adjust, up to 4×8.`
          : `True size ${dressed(stock.thick)} × ${dressed(stock.wide)}, not the stamp. Length slides too.`}
      </p>
      {stock.sheet ? (
        <label className="field">
          <span>Width {Math.round(lumber.sheetWidth)}"</span>
          <input
            className="width-range"
            type="range"
            min={6}
            max={stock.maxWidth}
            step={1}
            value={Math.min(stock.maxWidth, Math.max(6, lumber.sheetWidth))}
            aria-label="Sheet width"
            onChange={(event) => setLumber({ sheetWidth: Number(event.target.value) })}
          />
        </label>
      ) : (
        <div className="seg" role="group" aria-label="How the board sits">
          <button type="button" className={lumber.face === "flat" ? "on" : ""} onClick={() => setLumber({ face: "flat" })}>
            Flat
          </button>
          <button type="button" className={lumber.face === "edge" ? "on" : ""} onClick={() => setLumber({ face: "edge" })}>
            On end
          </button>
        </div>
      )}
      {lumber.kind === "osb" ? (
        <div className="seg" role="group" aria-label="OSB thickness">
          {OSB_THICKNESS.map((n) => (
            <button key={n} type="button" className={Math.abs(lumber.thickness - n) < 0.02 ? "on" : ""} onClick={() => setLumber({ thickness: n })}>
              {dressed(n)}
            </button>
          ))}
        </div>
      ) : null}
      <LenField
        label="Length"
        inches={lumber.length ?? opening?.length ?? 12}
        unit={unit}
        min={6}
        max={stock.maxLength}
        onCommit={(length) => setLumber({ length })}
      />
      <label className="field">
        <span>
          Length {formatLen(lumber.length ?? opening?.length ?? 12, unit)}
          {stock.sheet ? " · 8 ft max" : ""}
        </span>
        <input
          className="width-range"
          type="range"
          min={6}
          max={stock.maxLength}
          step={1}
          value={Math.min(stock.maxLength, Math.max(6, lumber.length ?? opening?.length ?? 12))}
          aria-label="Board length"
          onChange={(event) => setLumber({ length: Number(event.target.value) })}
        />
      </label>
      <button type="button" className={lumber.length == null ? "btn on" : "btn"} onClick={() => setLumber({ length: null })}>
        {onBoards ? "Cover the boards" : "Length of the clamps"}
      </button>
      {opening && !opening.error ? (
        <BoardArrows sheet={onBoards} vertical={Math.abs(opening.long[1]) > 0.75} longY={opening.long[1]} onNudge={nudgeLumber} />
      ) : null}
      <p className="fine">
        {lumber.anchors.length < 1 || !placeable
          ? stock.sheet
            ? "Click the OSB, or each board the sheet sits on. One OSB is enough for shingles or metal roof. A flange or strap can hold one side up."
            : "Click two flanges, straps, or boards. Lumber can mount to clamps or to other lumber."
          : onBoards && opening && !opening.error
            ? `${formatLen(lumber.length ?? opening.length, unit)} on the lumber, ${Math.round(lumber.sheetWidth)}" across.${opening.up[1] < 0.92 ? " It follows that slope." : ""} Arrows slide it. It stops before a board you clicked slides out from under it.`
            : opening && !opening.error && hang
            ? hang.start < 0.05 && hang.end < 0.05
              ? `${formatLen(opening.length, unit)} between the clamps.${Math.abs(opening.long[1]) > 0.15 || opening.up[1] < 0.92 ? " The board follows that angle." : ""} Arrows slide it. At a clamp, the next arrow lets that end hang past the frame.`
              : `${formatLen(hang.length, unit)} long. Hangs ${formatLen(hang.start, unit)} past the first clamp and ${formatLen(hang.end, unit)} past the last.${Math.abs(opening.long[1]) > 0.15 || opening.up[1] < 0.92 ? " Angled with the clamps." : ""}`
            : "Pick two that line up."}
      </p>
      {lumber.error || opening?.error ? <p className="run-error">{lumber.error || opening?.error}</p> : null}
      {lumber.anchors.length > 0 ? (
        <button type="button" className="btn" onClick={popLumberAnchor}>
          Remove last pick
        </button>
      ) : null}
      <button type="button" className="btn primary" disabled={!ready} onClick={commitLumber}>
        Place {stock.label}
      </button>
    </div>
  );
}

function BoardCard({ board, project, build, unit }: { board: Board; project: ReturnType<typeof normalizeProject>; build: NonNullable<ReturnType<typeof buildProject>>; unit: "in" | "ft" }) {
  const removeBoard = useShop((s) => s.removeBoard);
  const nudgeBoard = useShop((s) => s.nudgeBoard);
  const patchBoard = useShop((s) => s.patchBoard);
  const slideNote = useShop((s) => s.slideNote);
  const select = useShop((s) => s.select);
  const ctx = {
    fittings: build.fittings.map((item) => ({ id: item.id, sku: item.sku, position: item.position })),
    members: build.members.map((item) => ({ id: item.id, a: item.a, b: item.b })),
    boards: project.boards,
    straps: strapPoints(build.straps, build.members),
    pipeRadius: tradeById(project.trade).od / 2,
  };
  const laid = layoutBoard(board, ctx);
  const spanLay = layoutBoard({ ...board, length: null, along: 0 }, ctx);
  const hang = spanLay && !spanLay.error ? boardHang(board, spanLay.length) : null;
  const stock = STOCK_MAP[board.kind];
  const onBoards = stock.sheet && board.anchors.some((anchor) => anchor.ref.startsWith("board:"));
  const span = spanLay && !spanLay.error ? spanLay.length : 6;
  const angled = laid && !laid.error && (Math.abs(laid.long[1]) > 0.15 || laid.up[1] < 0.92);
  return (
    <div className="float-card">
      <div className="card-head">
        <h2>{boardTitle(board)}</h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={() => select(null)}>
          <X size={16} />
        </button>
      </div>
      {laid?.error ? <p className="run-error">{laid.error}</p> : onBoards && laid && !laid.error ? (
        <p className="fine">
          {formatLen(laid.length, unit)} by {Math.round(board.sheetWidth)}" on the boards.
          {angled ? " Sloped with them." : " Sitting flat on them."}
          {" "}Arrows slide it without uncovering a board you clicked.
        </p>
      ) : hang ? (
        <p className="fine">
          {formatLen(hang.length, unit)} long.
          {angled ? " Angled with the clamps." : ""}
          {hang.start < 0.05 && hang.end < 0.05
            ? ` Screwed to ${board.anchors.length} clamps.`
            : ` Hangs ${formatLen(hang.start, unit)} past the first and ${formatLen(hang.end, unit)} past the last.`}
        </p>
      ) : (
        <p className="fine">{formatLen(laid?.length ?? 0, unit)} long. Screwed to {board.anchors.length} clamps.</p>
      )}
      {stock.sheet ? (
        <label className="field">
          <span>Width {Math.round(board.sheetWidth)}"</span>
          <input
            className="width-range"
            type="range"
            min={6}
            max={stock.maxWidth}
            step={1}
            value={Math.min(stock.maxWidth, Math.max(6, board.sheetWidth))}
            aria-label="Sheet width"
            onChange={(event) => patchBoard(board.id, { sheetWidth: Number(event.target.value) })}
          />
        </label>
      ) : null}
      <LenField
        label="Length"
        inches={board.length ?? span}
        unit={unit}
        min={6}
        max={stock.maxLength}
        onCommit={(length) => patchBoard(board.id, { length })}
      />
      <label className="field">
        <span>Length {formatLen(board.length ?? span, unit)}{stock.sheet ? " · 8 ft max" : ""}</span>
        <input
          className="width-range"
          type="range"
          min={6}
          max={stock.maxLength}
          step={1}
          value={Math.min(stock.maxLength, Math.max(6, board.length ?? span))}
          aria-label="Board length"
          onChange={(event) => patchBoard(board.id, { length: Number(event.target.value) })}
        />
      </label>
      <button type="button" className={board.length == null ? "btn on" : "btn"} onClick={() => patchBoard(board.id, { length: null })}>
        {onBoards ? "Cover the boards" : "Length of the clamps"}
      </button>
      {spanLay && !spanLay.error ? (
        <BoardArrows sheet={onBoards} vertical={Math.abs(spanLay.long[1]) > 0.75} longY={spanLay.long[1]} onNudge={(dir, axis) => nudgeBoard(board.id, dir, axis)} />
      ) : null}
      {slideNote ? <p className="run-error">{slideNote}</p> : null}
      <p className="fine">
        {onBoards
          ? "← → slides along the boards. ↑ ↓ slides across them. Widen or lengthen the sheet (up to 4×8) when you need more room to move it."
          : "Arrows slide the board along its length. Once it is flush with a clamp, the next arrow lets that end stick out."}
      </p>
      <DeleteButton name="lumber" onDelete={() => { removeBoard(board.id); select(null); }} />
    </div>
  );
}

export function AppShell() {
  const projects = useShop((s) => s.projects);
  const activeId = useShop((s) => s.activeId);
  const unit = useShop((s) => s.unit);
  const tab = useShop((s) => s.tab);
  const selectedId = useShop((s) => s.selectedId);
  const update = useShop((s) => s.update);
  const setUnit = useShop((s) => s.setUnit);
  const setTab = useShop((s) => s.setTab);
  const select = useShop((s) => s.select);
  const startBlank = useShop((s) => s.startBlank);
  const startSketch = useShop((s) => s.startSketch);
  const unlockFrame = useShop((s) => s.unlockFrame);
  const placePost = useShop((s) => s.placePost);
  const movePost = useShop((s) => s.movePost);
  const movePostHeight = useShop((s) => s.movePostHeight);
  const moveLink = useShop((s) => s.moveLink);
  const showMeasures = useShop((s) => s.showMeasures);
  const setShowMeasures = useShop((s) => s.setShowMeasures);
  const showLabels = useShop((s) => s.showLabels);
  const setShowLabels = useShop((s) => s.setShowLabels);
  const showLumber = useShop((s) => s.showLumber);
  const setShowLumber = useShop((s) => s.setShowLumber);
  const activate = useShop((s) => s.activate);
  const setTool = useShop((s) => s.setTool);
  const tool = useShop((s) => s.tool);
  const anchor = useShop((s) => s.anchor);
  const draft = useShop((s) => s.draft);
  const duplicate = useShop((s) => s.duplicate);
  const remove = useShop((s) => s.remove);
  const clearFrame = useShop((s) => s.clearFrame);
  const open = useShop((s) => s.open);
  const [nonce, setNonce] = useState(0);
  const [buildOpen, setBuildOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [measure, setMeasure] = useState<{ a: [number, number, number] | null; b: [number, number, number] | null }>({ a: null, b: null });
  const [armClear, setArmClear] = useState(false);
  const [barEdit, setBarEdit] = useState<"resize" | "move">("resize");
  useEffect(() => {
    setBarEdit("resize");
  }, [selectedId]);
  const [refsOpen, setRefsOpen] = useState(false);
  const [startReady, setStartReady] = useState(false);
  const [packetOn, setPacketOn] = useState(false);
  const [packetImage, setPacketImage] = useState<string | null>(null);
  const addReference = useShop((s) => s.addReference);
  const undo = useShop((s) => s.undo);
  const redo = useShop((s) => s.redo);
  const canUndo = useShop((s) => s.canUndo);
  const canRedo = useShop((s) => s.canRedo);
  const resizeBar = useShop((s) => s.resizeBar);
  const repositionBar = useShop((s) => s.repositionBar);
  const beginEdit = useShop((s) => s.beginEdit);
  const endEdit = useShop((s) => s.endEdit);
  useEffect(() => {
    if (!armClear) return;
    const timer = window.setTimeout(() => setArmClear(false), 4000);
    return () => window.clearTimeout(timer);
  }, [armClear]);
  useEffect(() => {
    setStartReady(false);
  }, [anchor]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [redo, undo]);

  const project = normalizeProject(projects.find((p) => p.id === activeId) ?? projects[0]);
  const build = useMemo(() => (project ? buildProject(project) : null), [project]);
  const compare = useMemo(() => {
    if (!project) return [];
    return TRADES.map((t) => ({
      trade: t,
      build: buildProject({
        ...project,
        trade: t.id,
        nodes: (project.nodes ?? []).map((node) => ({ ...node, trade: undefined })),
        links: (project.links ?? []).map((link) => ({ ...link, trade: undefined })),
      }),
    }));
  }, [project]);

  if (!project || !build) {
    return (
      <main className="boot">
        <p className="brand">Clampwright</p>
      </main>
    );
  }

  const L = (n: number) => formatLen(n, unit);
  const selectedMember = build.members.find((m) => m.id === selectedId) ?? null;
  const selectedFit = build.fittings.find((f) => f.id === selectedId) ?? null;
  const trade = tradeById(project.trade);
  const savePacket = () => {
    const canvas = document.querySelector(".scene canvas") as HTMLCanvasElement | null;
    if (!canvas || canvas.width <= 0 || canvas.height <= 0) {
      setPacketImage(null);
      setPacketOn(true);
      return;
    }
    const maxW = 1400;
    const maxH = 788;
    const scale = Math.min(maxW / canvas.width, maxH / canvas.height, 1);
    const shot = document.createElement("canvas");
    shot.width = Math.max(1, Math.round(canvas.width * scale));
    shot.height = Math.max(1, Math.round(canvas.height * scale));
    const ctx = shot.getContext("2d");
    if (!ctx) {
      setPacketImage(null);
      setPacketOn(true);
      return;
    }
    ctx.drawImage(canvas, 0, 0, shot.width, shot.height);
    setPacketImage(shot.toDataURL("image/jpeg", 0.86));
    setPacketOn(true);
  };

  const canDropBay = (axis: "x" | "z") => {
    const mine = axis === "x" ? project.baysX : project.baysZ;
    const other = axis === "x" ? project.baysZ : project.baysX;
    return mine.length > 1 || (mine.length === 1 && other.length > 0);
  };

  const setBays = (axis: "x" | "z", next: number[]) => {
    update(axis === "x" ? { baysX: next } : { baysZ: next });
  };

  const kept = { x: build.width.fittingOutside, z: build.depth.fittingOutside };

  const changeTrade = (trade: Project["trade"]) => {
    const nodes = (project.nodes ?? []).map((node) => ({ ...node, trade: undefined }));
    const links = (project.links ?? []).map((link) => ({ ...link, trade: undefined }));
    if (trade === project.trade) {
      update({ nodes, links });
      return;
    }
    if (project.mode === "sketch") {
      update({ trade, nodes, links });
      return;
    }
    let draft: Project = { ...project, trade, nodes, links };
    if (project.baysX.length) draft = { ...draft, ...baysMatchingOutside(draft, "x", kept.x) };
    if (project.baysZ.length) draft = { ...draft, ...baysMatchingOutside(draft, "z", kept.z) };
    update({ trade, nodes, links, baysX: draft.baysX, baysZ: draft.baysZ });
  };

  const commitSpan = (axis: "x" | "z", raw: number) => {
    const other = axis === "x" ? project.baysZ : project.baysX;
    const key = axis === "x" ? "baysX" : "baysZ";
    if (raw <= 0.5) {
      if (other.length === 0) return;
      const cleared: Project = { ...project, [key]: [] };
      const refit = other.length ? baysMatchingOutside(cleared, axis === "x" ? "z" : "x", axis === "x" ? kept.z : kept.x) : {};
      update({ ...refit, [key]: [] });
      return;
    }
    const wasEmpty = project[key].length === 0;
    let draft: Project = wasEmpty ? { ...project, [key]: [24] } : project;
    draft = { ...draft, ...baysMatchingOutside(draft, axis, raw) };
    if (wasEmpty && other.length) {
      draft = { ...draft, ...baysMatchingOutside(draft, axis === "x" ? "z" : "x", axis === "x" ? kept.z : kept.x) };
    }
    update({ baysX: draft.baysX, baysZ: draft.baysZ });
  };

  const spaceShelves = (count: number) => {
    const n = Math.min(8, Math.max(1, Math.round(count)));
    const top = Math.max(6, project.postHeight - 1);
    const bottom = Math.min(8, top * 0.25);
    const levels =
      n === 1
        ? [Math.round(top * 32) / 32]
        : Array.from({ length: n }, (_, i) => Math.round((bottom + ((top - bottom) * i) / (n - 1)) * 32) / 32);
    update({ levels });
  };

  return (
    <div className="app">
      <header className="topbar no-print">
        <div className="brand-lockup">
          <img src="/favicon.svg" alt="" width={28} height={28} />
          <p className="brand">Clampwright</p>
        </div>
        <input
          className="name-input"
          aria-label="Project name"
          value={project.name}
          onChange={(e) => update({ name: e.target.value.slice(0, 48) })}
        />
        <select
          className="project-select"
          aria-label="Open a saved frame"
          value={project.id}
          onChange={(e) => open(e.target.value)}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div className="top-actions">
          <button type="button" className="icon-btn" aria-label="Undo" title="Undo" disabled={!canUndo} onClick={undo}>
            <Undo2 size={16} />
          </button>
          <button type="button" className="icon-btn" aria-label="Redo" title="Redo" disabled={!canRedo} onClick={redo}>
            <Redo2 size={16} />
          </button>
          <button
            type="button"
            className="btn primary"
            data-testid="free-build"
            onClick={() => {
              startSketch();
              setNonce((n) => n + 1);
              setBuildOpen(true);
              setListOpen(false);
            }}
          >
            <Plus size={16} /> Free build
          </button>
          <button
            type="button"
            className={buildOpen ? "btn on" : "btn"}
            aria-expanded={buildOpen}
            onClick={() => {
              setBuildOpen((open) => !open);
              setListOpen(false);
            }}
          >
            Build
          </button>
          <button
            type="button"
            className={listOpen ? "btn on" : "btn"}
            aria-expanded={listOpen}
            onClick={() => {
              setListOpen((open) => !open);
              setBuildOpen(false);
            }}
          >
            Cuts
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className={`rail drawer left${buildOpen ? " open" : ""}`}>
          <div className="drawer-head no-print">
            <h2>Build</h2>
            <button type="button" className="icon-btn" aria-label="Close build panel" onClick={() => setBuildOpen(false)}>
              <X size={16} />
            </button>
          </div>
          <div className="drawer-actions no-print">
            <div className="seg" role="group" aria-label="EMT trade size">
              {TRADES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  data-testid={`trade-${t.short}`}
                  aria-pressed={project.trade === t.id}
                  className={project.trade === t.id ? "on" : ""}
                  onClick={() => changeTrade(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="seg" role="group" aria-label="Display units">
              <button type="button" className={unit === "in" ? "on" : ""} onClick={() => setUnit("in")}>
                in
              </button>
              <button type="button" className={unit === "ft" ? "on" : ""} onClick={() => setUnit("ft")}>
                ft
              </button>
            </div>
            <button
              type="button"
              className={armClear ? "btn danger" : "btn"}
              data-testid="start-over"
              disabled={project.mode === "sketch" && project.nodes.length === 0 && project.links.length === 0}
              onClick={() => {
                if (!armClear) {
                  setArmClear(true);
                  return;
                }
                clearFrame();
                setArmClear(false);
                setMeasure({ a: null, b: null });
                setNonce((n) => n + 1);
              }}
            >
              <Trash2 size={16} /> {armClear ? "Clear it?" : "Start over"}
            </button>
            <button type="button" className="btn" data-testid="new-frame" onClick={startBlank}>
              New rectangle
            </button>
            <button type="button" className="btn" onClick={duplicate}>
              <Copy size={16} /> Duplicate
            </button>
            <button type="button" className="btn" onClick={remove} disabled={projects.length < 2}>
              <Trash2 size={16} /> Delete
            </button>
          </div>
          {project.mode === "sketch" ? (
            <FreeBuild unit={unit} />
          ) : (
          <section className="measure-card">
            <h2>Rectangle</h2>
            <p className="fine">
              Type the finished size, clamps included. Width, depth, height, and every bay stay editable after a template loads. Use 0 on an axis for a single line, like a clothing rack.
            </p>
            <LenField
              label="Width outside"
              testId="outside-width"
              inches={project.baysX.length ? build.width.fittingOutside : 0}
              unit={unit}
              min={0}
              max={360}
              onCommit={(n) => commitSpan("x", n)}
            />
            <LenField
              label="Depth outside"
              testId="outside-depth"
              inches={project.baysZ.length ? build.depth.fittingOutside : 0}
              unit={unit}
              min={0}
              max={360}
              onCommit={(n) => commitSpan("z", n)}
            />
            <LenField
              label="Post height"
              testId="post-height"
              inches={project.postHeight}
              unit={unit}
              min={12}
              max={240}
              onCommit={(postHeight) =>
                update({
                  postHeight,
                  levels: project.levels.map((y) => Math.min(y, postHeight - 0.5)),
                })
              }
            />
            <div className="step-row">
              <Stepper
                label="across"
                value={project.baysX.length}
                min={project.baysZ.length ? 0 : 1}
                max={12}
                onChange={(n) =>
                  update(withAxisCount(project, "x", n, { x: build.width.fittingOutside, z: build.depth.fittingOutside }))
                }
              />
              <Stepper
                label="deep"
                value={project.baysZ.length}
                min={project.baysX.length ? 0 : 1}
                max={12}
                onChange={(n) =>
                  update(withAxisCount(project, "z", n, { x: build.width.fittingOutside, z: build.depth.fittingOutside }))
                }
              />
            </div>
            <p className="fine">
              {project.baysX.length
                ? `Pipe outside ${L(build.width.pipeOutside)}${build.depth.centers > 0 ? ` × ${L(build.depth.pipeOutside)}` : ""} · clear ${L(build.width.pipeClear)}${build.depth.centers > 0 ? ` × ${L(build.depth.pipeClear)}` : ""}`
                : "No width yet — this is a single line of posts front to back."}
              {" · "}
              {build.weightLb.toFixed(1)} lb · {build.sticks} stick{build.sticks === 1 ? "" : "s"}
            </p>
            <button type="button" className="btn" data-testid="unlock-frame" onClick={() => { unlockFrame(); setNonce((n) => n + 1); }}>
              Edit these posts freely
            </button>
            <p className="fine">Keeps this size, then lets you move a post, delete one rail, or add a return that isn’t a rectangle.</p>
          </section>
          )}

          {project.mode === "sketch" ? null : (
          <>
          <BayEditor
            title="Width bays"
            hint="Uneven bays, left to right. Editing one changes the outside width."
            bays={project.baysX}
            unit={unit}
            canRemove={canDropBay("x")}
            onChange={(baysX) => setBays("x", baysX)}
          />
          <BayEditor
            title="Depth bays"
            hint="Front to back. Clear them for a single rail."
            bays={project.baysZ}
            unit={unit}
            canRemove={canDropBay("z")}
            onChange={(baysZ) => setBays("z", baysZ)}
          />

          <section>
            <h2>Shelves</h2>
            <div className="inline-actions">
              <button type="button" className="btn" onClick={() => spaceShelves(1)}>
                Top only
              </button>
              <button type="button" className="btn" onClick={() => spaceShelves(2)}>
                2 shelves
              </button>
              <button type="button" className="btn" onClick={() => spaceShelves(3)}>
                3 shelves
              </button>
              <button type="button" className="btn" onClick={() => spaceShelves(4)}>
                4 shelves
              </button>
            </div>
            {project.levels.map((level, i) => (
              <div className="bay-row" key={`shelf-${i}`}>
                <LenField
                  label={`Shelf ${i + 1}`}
                  inches={level}
                  unit={unit}
                  min={0.5}
                  max={240}
                  onCommit={(n) => {
                    const levels = [...project.levels];
                    levels[i] = n;
                    update({ levels });
                  }}
                />
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remove shelf ${i + 1}`}
                  onClick={() => update({ levels: project.levels.filter((_, j) => j !== i) })}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn"
              disabled={project.levels.length >= 8}
              onClick={() => update({ levels: [...project.levels, Math.min(project.postHeight - 1, (project.levels.at(-1) ?? 0) + 16)] })}
            >
              <Plus size={16} /> Add shelf
            </button>
          </section>
          </>
          )}

          <section>
            <h2>Options</h2>
            {project.mode === "sketch" ? (
              <p className="fine">A flange is per post. A rail can land on a post or in the middle of another rail.</p>
            ) : (
              <>
            <label className="check">
              <input type="checkbox" checked={project.flanges} onChange={(e) => update({ flanges: e.target.checked })} />
              Floor flange on every post
            </label>
              </>
            )}
            <label className="check">
              <input type="checkbox" checked={project.showFigure} onChange={(e) => update({ showFigure: e.target.checked })} />
              5'9" figure for scale
            </label>
            <div className="seg" role="group" aria-label="Finish">
              <button type="button" className={project.finish === "zinc" ? "on" : ""} onClick={() => update({ finish: "zinc" })}>
                Zinc
              </button>
              <button type="button" className={project.finish === "black" ? "on" : ""} onClick={() => update({ finish: "black" })}>
                Black
              </button>
            </div>
            <p className="fine">Black and zinc are both real MakerPipe finishes. The model is the same fitting either way.</p>
          </section>

          <section>
            <h2>Checks</h2>
            {build.issues.length === 0 ? (
              <p className="fine">Clamps clear each other, and every cut is long enough to exist.</p>
            ) : (
              <ul className="issues">
                {build.issues.map((issue) => (
                  <li key={issue.text} className={issue.severity}>
                    {issue.severity === "warn" ? <AlertTriangle size={16} /> : <Info size={16} />}
                    <span>{issue.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>

        <div className={`view no-print${project.mode === "sketch" || tool === "measure" || tool === "lumber" ? ` tool-${tool}` : ""}`}>
          <Viewport
            project={project}
            build={build}
            selected={selectedId}
            tool={project.mode === "sketch" || tool === "measure" || tool === "lumber" ? tool : "select"}
            anchor={anchor}
            unit={unit}
            showMeasures={showMeasures}
            showLabels={showLabels}
            showLumber={showLumber}
            measure={measure}
            onActivate={activate}
            onPlace={(x, z) => {
              const empty = project.nodes.length === 0;
              placePost(x, z);
              if (empty) setNonce((n) => n + 1);
            }}
            onClear={() => {
              if (tool === "rail" && draft) return;
              select(null);
            }}
            onMeasure={(point) => {
              setShowMeasures(true);
              setMeasure((current) => (!current.a || current.b ? { a: point, b: null } : { a: current.a, b: point }));
            }}
            onMovePost={movePost}
            onMovePostHeight={movePostHeight}
            onMoveLink={moveLink}
            onResizeLink={resizeBar}
            onRepositionLink={(id, x, z, y) => repositionBar(id, x, z, y, true)}
            onBeginEdit={beginEdit}
            onEndEdit={endEdit}
            barEdit={barEdit}
            picking={project.mode === "sketch" && tool === "rail"}
            viewNonce={nonce}
            draftLine={
              draft
                ? draft.stops.flatMap((stop) => {
                    const node = project.nodes.find((item) => item.id === stop.nodeId);
                    if (!node) return [];
                    const y = node.host ? node.height : stop.y;
                    return [[node.x, y, node.z] as [number, number, number]];
                  })
                : null
            }
          />
          <div className="toolbelt no-print" role="group" aria-label="Build tools">
            {project.mode === "sketch"
              ? TOOLS.map((item) => (
                  <button key={item.id} type="button" className={tool === item.id ? "btn on" : "btn"} onClick={() => setTool(item.id)}>
                    {item.label}
                  </button>
                ))
              : (
                <>
                  <button type="button" className={tool === "lumber" ? "btn on" : "btn"} onClick={() => setTool(tool === "lumber" ? "select" : "lumber")}>
                    Lumber
                  </button>
                  <button type="button" className={tool === "measure" ? "btn on" : "btn"} onClick={() => setTool(tool === "measure" ? "select" : "measure")}>
                    Measure
                  </button>
                </>
              )}
            <button
              type="button"
              className={refsOpen ? "btn on" : "btn"}
              aria-pressed={refsOpen}
              onClick={() => setRefsOpen((open) => !open)}
            >
              Refs
            </button>
            <button
              type="button"
              className={showLabels ? "btn on" : "btn"}
              aria-pressed={showLabels}
              onClick={() => setShowLabels(!showLabels)}
            >
              Labels
            </button>
            <button
              type="button"
              className={showMeasures ? "btn on" : "btn"}
              aria-pressed={showMeasures}
              onClick={() => setShowMeasures(!showMeasures)}
            >
              Sizes
            </button>
            <button
              type="button"
              className={showLumber ? "btn on" : "btn"}
              aria-pressed={showLumber}
              onClick={() => setShowLumber(!showLumber)}
            >
              Wood
            </button>
            <div className="seg" role="group" aria-label="EMT size for the whole drawing" title="Changes every pipe, and clears per-piece sizes">
              {TRADES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  data-testid={`size-${t.short}`}
                  aria-pressed={project.trade === t.id}
                  className={project.trade === t.id ? "on" : ""}
                  onClick={() => changeTrade(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn"
              data-testid="save-packet"
              onClick={savePacket}
            >
              Save
            </button>
          </div>
          <div className="canvas-side no-print">
            {project.mode === "sketch" && !draft && !refsOpen && tool !== "lumber" ? <ShapeCard unit={unit} onPlaced={() => setNonce((n) => n + 1)} /> : null}
            {refsOpen ? (
              <div className="float-card">
                <div className="card-head">
                  <h2>References</h2>
                  <Confirm onConfirm={() => setRefsOpen(false)} />
                </div>
                <p className="fine">Known sizes to measure against. They are not pipe.</p>
                {MEASURE_REFERENCES.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    className="btn"
                    onClick={() => {
                      addReference(preset);
                      setRefsOpen(false);
                      setNonce((n) => n + 1);
                    }}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            ) : null}
            {draft ? <DraftCard unit={unit} names={postNames(project.nodes, project.links)} /> : null}
            {tool === "lumber" && !refsOpen ? <LumberCard unit={unit} project={project} build={build} /> : null}
            {tool !== "lumber" && project.boards.find((item) => selectedId === `board:${item.id}`) ? (
              <BoardCard
                board={project.boards.find((item) => selectedId === `board:${item.id}`)!}
                project={project}
                build={build}
                unit={unit}
              />
            ) : null}
            {!draft && !refsOpen && anchor && (tool === "rail") && !startReady ? (
              <StartCard name={postNames(project.nodes, project.links).get(anchor) ?? "A"} onConfirm={() => setStartReady(true)} />
            ) : null}
            {!draft && !refsOpen && project.references.find((item) => selectedId === `ref:${item.id}`) ? (
              <RefCard unit={unit} item={project.references.find((item) => selectedId === `ref:${item.id}`)!} onDone={() => select(null)} />
            ) : null}
            {!draft && !refsOpen && tool !== "lumber" && !selectedId?.startsWith("board:") && !selectedId?.startsWith("ref:") && !(anchor && (tool === "rail") && !startReady) ? (
              <SelectionCard
                unit={unit}
                member={selectedMember}
                fitting={selectedFit}
                buildMembers={build.members}
                straps={build.straps}
                barEdit={barEdit}
                setBarEdit={setBarEdit}
                onDone={() => select(null)}
              />
            ) : null}
          </div>
          {project.mode === "sketch" && tool === "rail" ? (
            <p className="pick-hint">
              {draft
                ? draft.stops.length < 2
                  ? "Now the next post, or the middle of a rail. Add as many as you need."
                  : "Set the height, or turn a pipe to 45° and use the arrows."
                : "Click a glowing post or the middle of a rail. A run can visit as many posts as you need."}
            </p>
          ) : null}
          {tool === "lumber" ? <p className="pick-hint">Shingles and metal roof: click the OSB. Other lumber: click two clamps or boards. A sheet follows that slope unless something higher holds it up.</p> : null}
          <div className="hud">
            <p className="hud-hero">
              {project.mode === "sketch" && project.nodes.length === 0 ? "Empty floor" : `${L(build.width.fittingOutside)} wide`}
              {build.depth.centers > 0 ? ` · ${L(build.depth.fittingOutside)}` : ""}
            </p>
            <button type="button" className="icon-btn hud-btn" aria-label="Reframe" onClick={() => setNonce((n) => n + 1)}>
              <RotateCcw size={16} />
            </button>
          </div>
        </div>

        <aside className={`bom drawer right${listOpen ? " open" : ""}`}>
          <div className="drawer-head no-print">
            <h2>Shop list</h2>
            <button type="button" className="icon-btn" aria-label="Close shop list" onClick={() => setListOpen(false)}>
              <X size={16} />
            </button>
          </div>
          <div className="tabs no-print" role="tablist">
            {(
              [
                ["cuts", "Cut list"],
                ["parts", "Fittings"],
                ["sizes", "Sizes"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>

          {tab === "cuts" ? (
            <div data-testid="cut-list">
              <div className="panel-head">
                <h2>Conduit cuts</h2>
              </div>
              <ul className="cut-rows">
                {build.cuts.length === 0 ? <li className="empty">Nothing to cut yet.</li> : null}
                {build.cuts.map((row) => (
                  <li key={row.key}>
                    <span className="qty">{row.qty}×</span>
                    <span>
                      <strong>{L(row.length)}</strong>
                      <em>
                        {row.label}
                        {row.approx ? " · approx" : ""} · {formatDecimal(row.length)}
                      </em>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="stick-box">
                <div>
                  <span>Sticks</span>
                  <strong>
                    {build.sticks} × {stickName(project.stick)}
                  </strong>
                </div>
                <div>
                  <span>Offcut</span>
                  <strong>{L(build.wasteInches)}</strong>
                </div>
                <div>
                  <span>Weight</span>
                  <strong>{build.weightLb.toFixed(1)} lb</strong>
                </div>
              </div>
              <div className="seg stick-seg" role="group" aria-label="Stick length">
                <button type="button" className={project.stick === 96 ? "on" : ""} onClick={() => update({ stick: 96 })}>
                  8 ft
                </button>
                <button type="button" className={project.stick === 120 ? "on" : ""} onClick={() => update({ stick: 120 })}>
                  10 ft
                </button>
                <button type="button" className={project.stick === 240 ? "on" : ""} onClick={() => update({ stick: 240 })}>
                  20 ft
                </button>
              </div>
              <Num
                label="Your price per stick ($)"
                min={0}
                max={500}
                step={1}
                value={project.stickPrice}
                onChange={(stickPrice) => update({ stickPrice })}
              />
              <p className="fine">
                {build.conduitCost > 0
                  ? `Conduit about ${money(build.conduitCost)} at your price. `
                  : "Enter what the yard charges and the stick cost shows up here. "}
                Packing allows 1/8" kerf between pieces from the same stick. Posts run continuous through the clamps. Underground length is in the cut, not in the size on screen.
              </p>
            </div>
          ) : null}

          {tab === "parts" ? (
            <div>
              <div className="panel-head">
                <h2>Buy list</h2>
                <p className="price">{money(build.connectorCost)}</p>
              </div>
              <ul className="part-rows">
                {build.bom.map((line) => (
                  <li key={`${line.sku}-${line.name}`}>
                    <span className="qty">{line.qty}×</span>
                    <span>
                      <strong>{line.name}</strong>
                      <em>
                        {line.purchasable ? `${money(line.unitPrice)} from` : "Not sold for this size"}
                        {line.shimsEach ? ` · ${line.shimsEach} shim${line.shimsEach === 1 ? "" : "s"} each` : ""}
                      </em>
                    </span>
                    <b>{line.purchasable ? money(line.qty * line.unitPrice) : "—"}</b>
                  </li>
                ))}
              </ul>
              {build.oneShimCount > 0 ? (
                <p className="fine">Plus {build.oneShimCount} of the 1" to 3/4" shims so a 1" clamp can grab smaller tube.</p>
              ) : null}
              {build.shimCount > 0 ? (
                <p className="fine">
                  Plus {build.shimCount} adapter shims ({money(build.shimCount * 0.1)}). A 1/2" pipe in a 3/4" clamp needs one. The 1" shim is listed separately.
                </p>
              ) : null}
              {build.straps.length > 0 ? (
                <p className="fine">
                  {build.straps.length} one-hole strap{build.straps.length === 1 ? "" : "s"} ({money(build.strapCost)}). They snap on and screw to wood. A pack of 4 is {money(STRAP_PACK_PRICE)}. They do not change the cut.
                </p>
              ) : null}
              <p className="fine">
                Prices are MakerPipe’s published starting prices, hardware included, and they move. This is a planning aid, not a cart and not affiliated with MakerPipe.
              </p>
              <p className="fine">
                <a href="https://makerpipe.com/collections/structural-pipe-connectors" target="_blank" rel="noreferrer">
                  MakerPipe structural connectors
                </a>
              </p>
            </div>
          ) : null}

          {tab === "sizes" ? (
            <div className="sizes">
              <h2>Same frame, three tubes</h2>
              <div className="size-grid">
                {compare.map(({ trade: t, build: b }) => (
                  <button
                    key={t.id}
                    type="button"
                    className={t.id === project.trade ? "size-card on" : "size-card"}
                    onClick={() => changeTrade(t.id)}
                  >
                    <strong>{t.label} EMT</strong>
                    <span>{b.weightLb.toFixed(1)} lb</span>
                    <span>
                      {b.sticks} stick{b.sticks === 1 ? "" : "s"}
                    </span>
                    <span>{money(b.connectorCost)} fittings</span>
                  </button>
                ))}
              </div>
              <article className="size-blurb">
                <h3>
                  {trade.label} · OD {trade.od}" · ID {trade.id_in}" · wall {trade.wall}"
                </h3>
                <p>{trade.summary}</p>
                <p className="fine">{trade.lbPerFt} lb/ft. Sticks are 8 ft, 10 ft, or 20 ft. Outside diameters are ANSI C80.3 nominals.</p>
              </article>
              <table className="spec">
                <thead>
                  <tr>
                    <th>Fitting</th>
                    <th>Fits</th>
                    <th>{project.trade === "one" ? '1" price' : "From"}</th>
                  </tr>
                </thead>
                <tbody>
                  {CONNECTORS.map((c) => {
                    const fits = c.trades.includes(project.trade);
                    return (
                      <tr key={c.sku} className={fits ? "" : "dim"}>
                        <td>
                          {c.name}
                          <small>{c.joint}</small>
                        </td>
                        <td>{fits ? (trade.shims ? `${c.shims} shim${c.shims === 1 ? "" : "s"}` : "Native") : "No"}</td>
                        <td>{fits ? money(connectorPrice(c, project.trade)) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <h3>Also in the system</h3>
              <ul className="also">
                {build.alsoSold.map((item) => (
                  <li key={item.name}>
                    <strong>{item.name}.</strong> {item.note}
                  </li>
                ))}
              </ul>
              <p className="fine">
                You can’t mix fitting families on one tube. A 1" clamp will not grab 3/4" EMT unless you add MakerPipe’s 1" to 3/4" shim. 1/2" only works because the shim fills the 3/4" bore. The 1" flange is a separate part and includes longer bolts.
              </p>
            </div>
          ) : null}
        </aside>
      </div>
      {packetOn ? (
        <DesignPacket project={project} build={build} image={packetImage} unit={unit} onClose={() => setPacketOn(false)} />
      ) : null}
    </div>
  );
}

function BayEditor({
  title,
  hint,
  bays,
  unit,
  canRemove,
  onChange,
}: {
  title: string;
  hint: string;
  bays: number[];
  unit: "in" | "ft";
  canRemove: boolean;
  onChange: (bays: number[]) => void;
}) {
  return (
    <section>
      <h2>{title}</h2>
      <p className="fine">{hint}</p>
      {bays.length === 0 ? <p className="fine">No bays — posts sit on one line.</p> : null}
      {bays.map((bay, i) => (
        <div className="bay-row" key={`${title}-${i}`}>
          <LenField
            label={`Bay ${i + 1} center`}
            inches={bay}
            unit={unit}
            min={4}
            max={240}
            onCommit={(n) => {
              const next = [...bays];
              next[i] = n;
              onChange(next);
            }}
          />
          <button
            type="button"
            className="icon-btn"
            aria-label={`Remove ${title} bay ${i + 1}`}
            disabled={!canRemove}
            onClick={() => onChange(bays.filter((_, j) => j !== i))}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn"
        disabled={bays.length >= 12}
        onClick={() => onChange([...bays, bays.at(-1) ?? 24])}
      >
        <Plus size={16} /> Add bay
      </button>
    </section>
  );
}
