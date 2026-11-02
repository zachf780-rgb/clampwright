import { sheetIndex, stickName, type Build, type Fitting, type Member, type Project, type SheetIndex, type Strap, type Vec3 } from "@/lib/build";
import { tradeById, type Sku } from "@/lib/catalog";
import { formatLen, money } from "@/lib/format";
import { boardTitle, layoutBoard, strapPoints } from "@/lib/lumber";

type SideId = "front" | "right" | "back" | "left";

const SIDES: { id: SideId; title: string; axis: (p: Vec3) => number }[] = [
  { id: "front", title: "Front", axis: (p) => p[0] },
  { id: "right", title: "Right side", axis: (p) => p[2] },
  { id: "back", title: "Back", axis: (p) => -p[0] },
  { id: "left", title: "Left side", axis: (p) => -p[2] },
];

function PartIcon({ kind }: { kind: Sku }) {
  const stroke = "#243028";
  const common = { fill: "none", stroke, strokeWidth: 3, strokeLinecap: "round" as const };
  return (
    <svg viewBox="0 0 64 64" aria-hidden>
      <rect x="1" y="1" width="62" height="62" rx="8" fill="#f4f1ea" stroke="#d9d3c7" />
      {kind === "T" ? (
        <>
          <path {...common} d="M32 10v44M32 32h22" />
        </>
      ) : null}
      {kind === "90" ? <path {...common} d="M18 14v22h28" /> : null}
      {kind === "180" ? <path {...common} d="M10 32h44M32 32v16" /> : null}
      {kind === "4way" ? <path {...common} d="M32 8v48M32 32h22M32 40h16" /> : null}
      {kind === "5way" ? <path {...common} d="M32 8v48M14 32h36M18 44h28" /> : null}
      {kind === "45" ? <path {...common} d="M32 10v44M32 36l20-16" /> : null}
      {kind === "hinge" ? <path {...common} d="M32 12v40M32 36c14-2 18-16 18-16" /> : null}
      {kind === "flange" ? (
        <>
          <circle cx="32" cy="40" r="14" fill="none" stroke={stroke} strokeWidth="3" />
          <path {...common} d="M32 10v18" />
        </>
      ) : null}
      {kind === "coupling" ? <path {...common} d="M14 32h36M24 22v20M40 22v20" /> : null}
      {kind === "cross" ? <path {...common} d="M12 32h40M32 12v40" /> : null}
    </svg>
  );
}

function TubeIcon() {
  const stroke = "#243028";
  return (
    <svg viewBox="0 0 64 64" aria-hidden>
      <rect x="1" y="1" width="62" height="62" rx="8" fill="#f4f1ea" stroke="#d9d3c7" />
      <path d="M12 32h40" fill="none" stroke={stroke} strokeWidth="8" strokeLinecap="round" />
      <path d="M12 32h6M46 32h6" fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function StrapIcon() {
  const stroke = "#243028";
  return (
    <svg viewBox="0 0 64 64" aria-hidden>
      <rect x="1" y="1" width="62" height="62" rx="8" fill="#f4f1ea" stroke="#d9d3c7" />
      <path d="M18 40c0-12 6-20 14-20s14 8 14 20" fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" />
      <path d="M40 28h12v10H40" fill="none" stroke={stroke} strokeWidth="3" strokeLinejoin="round" />
      <circle cx="47" cy="33" r="2.2" fill="none" stroke={stroke} strokeWidth="2" />
    </svg>
  );
}

function pointAt(member: Member, dist: number): Vec3 {
  const dx = member.b[0] - member.a[0];
  const dy = member.b[1] - member.a[1];
  const dz = member.b[2] - member.a[2];
  const span = Math.hypot(dx, dy, dz) || 1;
  const t = dist / span;
  return [member.a[0] + dx * t, member.a[1] + dy * t, member.a[2] + dz * t];
}

function apart(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Posts and pipes that lie on this outside face. A pipe running toward the viewer belongs on the side view, not here. */
function membersOnFace(members: Member[], side: SideId): Member[] {
  const axis = side === "front" || side === "back" ? 2 : 0;
  const wantMax = side === "back" || side === "right";
  const posts = members.filter((member) => member.kind === "post");
  const sample = posts.length ? posts : members;
  if (!sample.length) return [];
  const face = wantMax
    ? Math.max(...sample.map((member) => (member.a[axis] + member.b[axis]) / 2))
    : Math.min(...sample.map((member) => (member.a[axis] + member.b[axis]) / 2));
  const tol = 2;
  return members.filter((member) => {
    if (Math.abs(member.a[axis] - member.b[axis]) > tol) return false;
    return Math.abs((member.a[axis] + member.b[axis]) / 2 - face) <= tol;
  });
}

function closeToMember(point: Vec3, member: Member): boolean {
  const abx = member.b[0] - member.a[0];
  const aby = member.b[1] - member.a[1];
  const abz = member.b[2] - member.a[2];
  const ab2 = abx * abx + aby * aby + abz * abz || 1;
  const t = Math.min(1, Math.max(0, ((point[0] - member.a[0]) * abx + (point[1] - member.a[1]) * aby + (point[2] - member.a[2]) * abz) / ab2));
  const qx = member.a[0] + abx * t;
  const qy = member.a[1] + aby * t;
  const qz = member.a[2] + abz * t;
  return Math.hypot(point[0] - qx, point[1] - qy, point[2] - qz) < 2.5;
}

function samePlan(a: Member, b: Member): boolean {
  const near = (p: Vec3, q: Vec3) => Math.hypot(p[0] - q[0], p[2] - q[2]) < 2;
  return (near(a.a, b.a) && near(a.b, b.b)) || (near(a.a, b.b) && near(a.b, b.a));
}

/** Looking down: every post, and the highest pipe on each line. Lower pipes that share that line are on the side views. */
function membersOnTop(members: Member[]): Member[] {
  const posts: Member[] = [];
  const bars: Member[] = [];
  for (const member of members) {
    const flat = Math.hypot(member.a[0] - member.b[0], member.a[2] - member.b[2]) < 1.5;
    if (member.kind === "post" || flat) posts.push(member);
    else bars.push(member);
  }
  const kept: Member[] = [];
  for (const post of posts) {
    const hit = kept.find((other) => Math.hypot(other.a[0] - post.a[0], other.a[2] - post.a[2]) < 2);
    if (!hit) kept.push(post);
  }
  const byHeight = [...bars].sort((a, b) => (b.a[1] + b.b[1]) / 2 - (a.a[1] + a.b[1]) / 2);
  for (const bar of byHeight) {
    if (kept.some((other) => other.kind !== "post" && samePlan(other, bar))) continue;
    kept.push(bar);
  }
  return kept;
}

function Elevation({
  title,
  members,
  fittings,
  straps,
  project,
  axis,
  index,
  side,
  plan = false,
}: {
  title: string;
  members: Member[];
  fittings: Fitting[];
  straps: Strap[];
  project: Project;
  axis: (p: Vec3) => number;
  index: SheetIndex;
  side?: SideId;
  plan?: boolean;
}) {
  const shown = plan ? membersOnTop(members) : membersOnFace(members, side ?? "front");
  if (!shown.length) return null;
  const shownFit = fittings.filter((fitting) =>
    shown.some((member) => {
      if (!plan || member.kind !== "post") return closeToMember(fitting.position, member);
      const top = member.a[1] >= member.b[1] ? member.a : member.b;
      return Math.hypot(fitting.position[0] - top[0], fitting.position[1] - top[1], fitting.position[2] - top[2]) < 3;
    }),
  );
  const shownStraps = straps.filter((strap) => shown.some((member) => member.id === strap.memberId));
  const plot = (p: Vec3) => (plan ? { x: p[0], y: p[2] } : { x: axis(p), y: p[1] });
  const pts: { x: number; y: number }[] = [];
  for (const member of shown) {
    pts.push(plot(member.a), plot(member.b));
  }
  if (!pts.length) pts.push({ x: 0, y: 0 }, { x: 48, y: 36 });
  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = plan ? Math.min(...pts.map((p) => p.y)) : Math.min(0, ...pts.map((p) => p.y));
  const maxY = plan ? Math.max(...pts.map((p) => p.y), minY + 12) : Math.max(12, ...pts.map((p) => p.y));
  const w = 680;
  const h = 440;
  const pad = 58;
  const spanX = Math.max(12, maxX - minX);
  const spanY = Math.max(12, maxY - minY);
  const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY);
  const mapX = (x: number) => pad + (x - minX) * scale;
  const mapY = (y: number) => h - pad - (y - minY) * scale;
  type Tag = { x: number; y: number; ax: number; ay: number; text: string; shape: "mark" | "item"; lead: boolean };
  const tags: Tag[] = [];
  type Raw = { ax: number; ay: number; text: string; shape: "mark" | "item"; side: boolean };
  const raw: Raw[] = [];
  const add = (ax: number, ay: number, text: string, shape: "mark" | "item", side: boolean) => {
    if (raw.some((item) => item.shape === shape && item.text === text && Math.hypot(item.ax - ax, item.ay - ay) < 10)) return;
    raw.push({ ax, ay, text, shape, side });
  };
  for (const member of shown) {
    const mark = index.marks.get(member.id);
    if (!mark) continue;
    const mid = plot([(member.a[0] + member.b[0]) / 2, (member.a[1] + member.b[1]) / 2, (member.a[2] + member.b[2]) / 2]);
    const pa = plot(member.a);
    const pb = plot(member.b);
    const vertical = Math.hypot(pa.x - pb.x, pa.y - pb.y) < 1 || Math.abs(pa.y - pb.y) > Math.abs(pa.x - pb.x) + 0.5;
    add(mapX(mid.x), mapY(mid.y), mark, "mark", vertical);
    if (index.couplingNo != null) {
      member.couplings.forEach((coupling) => {
        const c = plot([(coupling.a[0] + coupling.b[0]) / 2, (coupling.a[1] + coupling.b[1]) / 2, (coupling.a[2] + coupling.b[2]) / 2]);
        add(mapX(c.x), mapY(c.y), String(index.couplingNo), "item", false);
      });
    }
  }
  for (const fitting of shownFit) {
    if (fitting.sku === "coupling") continue;
    const no = index.fittingItem.get(fitting.id);
    if (no == null) continue;
    const p = plot(fitting.position);
    add(mapX(p.x), mapY(p.y), String(no), "item", false);
  }
  if (index.strapNo != null) {
    for (const strap of shownStraps) {
      const member = shown.find((item) => item.id === strap.memberId);
      if (!member) continue;
      const p = plot(pointAt(member, strap.at));
      add(mapX(p.x), mapY(p.y), String(index.strapNo), "item", false);
    }
  }
  const clusters: Raw[][] = [];
  for (const item of raw) {
    const group = clusters.find((entry) => entry[0].shape === item.shape && Math.hypot(entry[0].ax - item.ax, entry[0].ay - item.ay) < 14);
    if (group) group.push(item);
    else clusters.push([item]);
  }
  const clampN = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
  const taken: { x: number; y: number; hw: number; hh: number }[] = [];
  for (const group of clusters) {
    const ax = group[0].ax;
    const ay = group[0].ay;
    const side = group.some((item) => item.side);
    const texts = group.map((item) => item.text);
    const gap = 22;
    const hw = Math.max(14, ...texts.map((text) => text.length * 4.2 + 8));
    const hh = 10;
    const rise = -((texts.length - 1) * gap) / 2;
    const offsets: [number, number][] = side
      ? [
          [28, rise],
          [-28, rise],
          [52, rise],
          [-52, rise],
          [28, rise + 44],
          [28, rise - 44],
        ]
      : [
          [0, -28 + rise],
          [40, -22 + rise],
          [-40, -22 + rise],
          [0, -50 + rise],
          [40, 18 + rise],
          [-40, 18 + rise],
        ];
    let chosen: { x: number; y: number }[] | null = null;
    for (const [dx, dy] of offsets) {
      const spots = texts.map((_, i) => ({
        x: clampN(ax + dx, hw + 4, w - hw - 4),
        y: clampN(ay + dy + i * gap, hh + 4, h - hh - 4),
      }));
      const blocked = spots.some((spot, i) =>
        spots.some((other, j) => j < i && Math.abs(other.x - spot.x) < 4 && Math.abs(other.y - spot.y) < gap - 2)
        || taken.some((box) => Math.abs(box.x - spot.x) < box.hw + hw + 2 && Math.abs(box.y - spot.y) < box.hh + hh + 2),
      );
      if (!blocked) {
        chosen = spots;
        break;
      }
    }
    if (!chosen) {
      chosen = texts.map((_, i) => ({
        x: clampN(ax + (side ? 26 : 0), hw + 4, w - hw - 4),
        y: clampN(ay - ((texts.length - 1) * gap) / 2 + i * gap, hh + 4, h - hh - 4),
      }));
    }
    const leadAt = Math.floor((chosen.length - 1) / 2);
    chosen.forEach((spot, i) => {
      taken.push({ x: spot.x, y: spot.y, hw, hh });
      tags.push({
        x: spot.x,
        y: spot.y,
        ax,
        ay,
        text: texts[i],
        shape: group[0].shape,
        lead: i === leadAt && Math.hypot(spot.x - ax, spot.y - ay) > 12,
      });
    });
  }
  return (
    <section className="packet-page">
      <header>
        <p>Clampwright · {project.name}</p>
        <h2>{title}</h2>
      </header>
      <svg viewBox={`0 0 ${w} ${h}`} className="elevation" role="img" aria-label={`${title} profile`}>
        {plan ? null : <line x1={pad - 8} y1={mapY(0)} x2={w - 16} y2={mapY(0)} stroke="#c8b48a" strokeWidth="2" />}
        {shown.map((member) => {
          const stroke = member.kind === "post" ? "#5c6560" : "#2c3330";
          const width = member.kind === "post" ? 7 : 5;
          const draw = (a: Vec3, b: Vec3, dashed: boolean, key: string) => {
            const pa = plot(a);
            const pb = plot(b);
            if (plan && Math.hypot(pa.x - pb.x, pa.y - pb.y) < 0.75) {
              return <circle key={key} cx={mapX(pa.x)} cy={mapY(pa.y)} r={7} fill={stroke} />;
            }
            return (
              <line
                key={key}
                x1={mapX(pa.x)}
                y1={mapY(pa.y)}
                x2={mapX(pb.x)}
                y2={mapY(pb.y)}
                stroke={dashed ? "#b0893e" : stroke}
                strokeWidth={dashed ? 3 : width}
                strokeDasharray={dashed ? "5 4" : undefined}
                strokeLinecap="round"
              />
            );
          };
          const segs = member.segments;
          if (!segs.length) return <g key={member.id}>{draw(member.a, member.b, false, "full")}</g>;
          const first = segs[0].a;
          const last = segs[segs.length - 1].b;
          return (
            <g key={member.id}>
              {apart(member.a, first) > 0.2 ? draw(member.a, first, true, "seat-a") : null}
              {segs.map((seg, index) => draw(seg.a, seg.b, false, `seg-${index}`))}
              {apart(last, member.b) > 0.2 ? draw(last, member.b, true, "seat-b") : null}
            </g>
          );
        })}
        {shownStraps.map((strap) => {
          const member = shown.find((item) => item.id === strap.memberId);
          if (!member) return null;
          const p = pointAt(member, strap.at);
          const x = mapX(plot(p).x);
          const y = mapY(plot(p).y);
          return <rect key={strap.id} x={x - 3} y={y - 9} width="6" height="18" rx="1" fill="#8a6232" />;
        })}
        {tags.map((tag) => {
          const key = `${tag.shape}-${tag.text}-${tag.ax}-${tag.ay}`;
          return (
            <g key={key}>
              {tag.lead ? <line x1={tag.ax} y1={tag.ay} x2={tag.x} y2={tag.y} stroke="#8d8478" strokeWidth="1" /> : null}
              {tag.shape === "item" ? (
                <>
                  <circle cx={tag.x} cy={tag.y} r={tag.text.length > 2 ? 12 : 10} fill="#fff8e8" stroke="#243028" strokeWidth="1.4" />
                  <text x={tag.x} y={tag.y + 4} textAnchor="middle" fill="#243028" fontSize="11" fontFamily="ui-sans-serif, sans-serif" fontWeight="700">
                    {tag.text}
                  </text>
                </>
              ) : (
                <>
                  <rect x={tag.x - tag.text.length * 3.6 - 6} y={tag.y - 9} width={tag.text.length * 7.2 + 12} height="18" rx="3" fill="#ffffff" stroke="#243028" />
                  <text x={tag.x} y={tag.y + 4} textAnchor="middle" fill="#243028" fontSize="11" fontFamily="ui-sans-serif, sans-serif" fontWeight="700">
                    {tag.text}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
      <p className="packet-note">
        {plan
          ? "Looking down. Where several pipes share a line, only the top one is marked. Boxed marks match the cut sheets. Circled numbers match the parts list."
          : "This face only. Boxed marks match the cut sheets. Circled numbers match the parts list. A dashed stub sits inside the clamp and is not extra EMT."}
        {shownStraps.length ? " Brown ticks are wood straps." : ""}
      </p>
    </section>
  );
}

function partName(no: number | null, seat: string): string {
  if (no == null) return seat || "the clamp";
  return seat ? `part ${no} (${seat})` : `part ${no}`;
}

function cutNote(member: Member, straps: Strap[], unit: "in" | "ft", ends: { a: number | null; b: number | null }): string {
  const L = (n: number) => formatLen(n, unit);
  const mine = straps.filter((strap) => strap.memberId === member.id);
  const strapNote = mine.length
    ? ` Wood strap${mine.length === 1 ? "" : "s"} at ${mine.map((strap) => L(strap.at)).join(", ")} from ${member.kind === "post" ? "the floor" : "the start"}. They snap on and do not change this cut.`
    : "";
  if (member.kind === "post") {
    const under = member.buried && member.buried > 0.05 ? `, plus ${L(member.buried)} underground` : "";
    const lengths = member.pieces.length ? member.pieces.map(L).join(" + ") : L(member.metal);
    return `Cut ${lengths}. That is ${L(member.span)} above the floor${under}. The post runs through the clamps, so the fittings do not shorten it.${strapNote}`;
  }
  const start = member.setbackA > 0.05 ? `ends ${L(member.setbackA)} inside ${partName(ends.a, member.seatA)}` : "is open at the start";
  const end = member.setbackB > 0.05 ? `${L(member.setbackB)} inside ${partName(ends.b, member.seatB)}` : "open at the other end";
  let lengths = ` Cut ${L(member.pieces[0] ?? member.metal)}.`;
  if (member.pieces.length > 1 && member.couplingCount === 0) {
    lengths = ` Cut ${member.pieces.map(L).join(" and ")}. Those pieces meet in the cross clamp and add up to the metal between the end clamps.`;
  } else if (member.couplingCount > 0) {
    lengths = ` Cut ${member.pieces.map(L).join(" and ")}. Spliced with ${member.couplingCount} coupling${member.couplingCount === 1 ? "" : "s"}. The gap inside each coupling is left out of these lengths.`;
  }
  const approx = member.approx ? " This seat is an estimate — rough-cut, then slide the clamp." : "";
  return `The pipe ${start} and ${end}. Center to center is ${L(member.span)}.${lengths}${approx}${strapNote}`;
}

function CutFigure({ member, straps, unit }: { member: Member; straps: Strap[]; unit: "in" | "ft" }) {
  const w = 640;
  const h = 78;
  const span = Math.max(member.span, 0.01);
  const x0 = 28;
  const x1 = w - 28;
  const leftIn = Math.max(0, member.setbackA);
  const rightIn = Math.max(0, member.setbackB);
  const metalStart = leftIn;
  const metalEnd = Math.max(metalStart, span - rightIn);
  const leftPx = leftIn > 0.12 ? 48 : 0;
  const rightPx = rightIn > 0.12 ? 48 : 0;
  const inner = Math.max(24, x1 - x0 - leftPx - rightPx);
  const map = (d: number) => {
    const dist = Math.min(span, Math.max(0, d));
    if (dist <= metalStart) return x0 + (leftIn > 0 ? (dist / leftIn) * leftPx : 0);
    if (dist >= metalEnd) return x0 + leftPx + inner + (rightIn > 0 ? ((dist - metalEnd) / rightIn) * rightPx : 0);
    return x0 + leftPx + ((dist - metalStart) / Math.max(0.01, metalEnd - metalStart)) * inner;
  };
  const y = 30;
  const seatA = map(metalStart);
  const seatB = map(metalEnd);
  const coupled = member.couplingCount > 0;
  let cursor = member.setbackA;
  const cuts = (member.pieces.length ? member.pieces : [Math.max(0, member.metal)]).map((len) => {
    const cut = { a: cursor, b: cursor + len };
    cursor += len;
    return cut;
  });
  const mine = straps.filter((strap) => strap.memberId === member.id);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="cut-diagram" role="img" aria-label={`Cut for ${member.label}`}>
      {member.setbackA > 0.15 ? <line x1={map(0)} y1={y} x2={seatA} y2={y} stroke="#b0893e" strokeWidth="7" strokeDasharray="5 4" /> : null}
      {coupled ? (
        <line x1={seatA} y1={y} x2={seatB} y2={y} stroke="#243028" strokeWidth="8" strokeLinecap="round" />
      ) : (
        cuts.map((cut, index) => (
          <line key={index} x1={map(cut.a)} y1={y} x2={map(Math.min(span, cut.b))} y2={y} stroke="#243028" strokeWidth="8" />
        ))
      )}
      {member.setbackB > 0.15 ? <line x1={seatB} y1={y} x2={map(span)} y2={y} stroke="#b0893e" strokeWidth="7" strokeDasharray="5 4" /> : null}
      {!coupled && cuts.length > 1
        ? cuts.slice(1).map((cut, index) => (
            <line key={`split-${index}`} x1={map(cut.a)} y1={y - 11} x2={map(cut.a)} y2={y + 11} stroke="#b0893e" strokeWidth="2" />
          ))
        : null}
      {mine.map((strap) => (
        <line key={strap.id} x1={map(strap.at)} y1={y - 12} x2={map(strap.at)} y2={y + 12} stroke="#8a6232" strokeWidth="3" />
      ))}
      <text x={map(0)} y={64} fontSize="11" fill="#5e675f" fontFamily="ui-sans-serif, sans-serif">
        {member.kind === "post" ? "floor" : member.seatA || "end"}
      </text>
      <text x={map(span)} y={64} textAnchor="end" fontSize="11" fill="#5e675f" fontFamily="ui-sans-serif, sans-serif">
        {member.kind === "post" ? "top" : member.seatB || "end"}
      </text>
      <text x={(seatA + seatB) / 2} y={16} textAnchor="middle" fontSize="12" fill="#243028" fontFamily="ui-sans-serif, sans-serif">
        {member.pieces.length ? member.pieces.map((piece) => formatLen(piece, unit)).join(" + ") : formatLen(member.metal, unit)} cut
      </text>
    </svg>
  );
}

export function DesignPacket({
  project,
  build,
  image,
  unit,
  onClose,
}: {
  project: Project;
  build: Build;
  image: string | null;
  unit: "in" | "ft";
  onClose: () => void;
}) {
  const L = (n: number) => formatLen(n, unit);
  const index = sheetIndex(project, build, unit);
  const near = (point: Vec3) => {
    let best: Fitting | null = null;
    let dist = 2.2;
    for (const fitting of build.fittings) {
      const d = Math.hypot(fitting.position[0] - point[0], fitting.position[1] - point[1], fitting.position[2] - point[2]);
      if (d < dist) {
        dist = d;
        best = fitting;
      }
    }
    return best ? (index.fittingItem.get(best.id) ?? null) : null;
  };
  const marksFor = (kind: Member["kind"], length: number, approx: boolean) =>
    build.members
      .filter((member) => member.kind === kind && member.approx === approx && member.pieces.some((piece) => Math.abs(Math.round(piece * 32) / 32 - length) < 1 / 64))
      .map((member) => index.marks.get(member.id))
      .filter((mark): mark is string => Boolean(mark));
  const ext = (value: number | null) => (value == null ? "—" : money(value));
  return (
    <div className="packet">
      <div className="packet-bar no-print">
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
        <button type="button" className="btn primary" onClick={() => window.print()}>
          Print or save PDF
        </button>
      </div>
      <section className="packet-page">
        <header>
          <p>Clampwright</p>
          <h2>{project.name}</h2>
        </header>
        {image ? <img src={image} alt="The frame" className="packet-hero" /> : <p className="packet-note">No picture could be captured from this view.</p>}
        <dl className="packet-facts">
          <div>
            <dt>Width</dt>
            <dd>{L(build.width.fittingOutside)}</dd>
          </div>
          <div>
            <dt>Depth</dt>
            <dd>{L(build.depth.fittingOutside)}</dd>
          </div>
          <div>
            <dt>Posts</dt>
            <dd>
              {L(build.postHeight)} · {build.postCount}
            </dd>
          </div>
          <div>
            <dt>EMT</dt>
            <dd>
              {build.tradeLabel} · {stickName(project.stick)}
            </dd>
          </div>
        </dl>
        <div className="job-box">
          <div>
            <span>Fittings and hardware</span>
            <b>{money(index.partsTotal)}</b>
          </div>
          <div>
            <span>Conduit</span>
            <b>{index.conduitPriced ? money(index.conduitTotal) : "Not priced"}</b>
          </div>
          <div className="sum">
            <span>Job total</span>
            <b>{money(index.jobTotal)}</b>
          </div>
        </div>
        <p className="packet-note">
          Outside sizes are above the floor. Post cuts include anything set underground.
          {index.conduitPriced ? "" : " Enter a price per stick on the cut list to put tube into the job total."}
        </p>
      </section>
      {SIDES.map((side) => (
        <Elevation
          key={side.id}
          side={side.id}
          title={side.title}
          members={build.members}
          fittings={build.fittings}
          straps={build.straps}
          project={project}
          axis={side.axis}
          index={index}
        />
      ))}
      <Elevation
        title="Top"
        plan
        members={build.members}
        fittings={build.fittings}
        straps={build.straps}
        project={project}
        axis={(p) => p[0]}
        index={index}
      />
      <section className="packet-page">
        <header>
          <p>Clampwright · {project.name}</p>
          <h2>Parts to buy</h2>
        </header>
        <p className="packet-note">Circled numbers are the same ones on the side views. Boxed P, R, and B marks are the cut sheets.</p>
        {index.items.length === 0 ? <p className="packet-note">Nothing to buy yet.</p> : null}
        <ul className="packet-parts">
          {index.items.map((item) => (
            <li key={item.no}>
              <span className="callout">{item.no}</span>
              {item.kind === "strap" ? <StrapIcon /> : item.kind === "hinge" ? <PartIcon kind="hinge" /> : item.kind === "emt" || item.kind === "shim" || item.kind === "cap" ? <TubeIcon /> : <PartIcon kind={item.fittingSku ?? "T"} />}
              <span>
                <strong>{item.name}</strong>
                <em>
                  {item.qty} × {item.detail}
                </em>
              </span>
              <b>{ext(item.extension)}</b>
            </li>
          ))}
        </ul>
        {(project.boards ?? []).length ? (
          <>
            <h3>Lumber and panels</h3>
            <ul className="packet-cuts">
              {(project.boards ?? []).map((board) => {
                const laid = layoutBoard(board, {
                  fittings: build.fittings.map((item) => ({ id: item.id, sku: item.sku, position: item.position })),
                  members: build.members.map((item) => ({ id: item.id, a: item.a, b: item.b })),
                  boards: project.boards ?? [],
                  straps: strapPoints(build.straps, build.members),
                  pipeRadius: tradeById(project.trade).od / 2,
                });
                const wide = board.kind === "osb" || board.kind === "plastic" || board.kind === "shingle" || board.kind === "metal";
                return (
                  <li key={board.id}>
                    {boardTitle(board)}
                    {wide
                      ? ` · ${Math.round(board.sheetWidth)}" × ${laid && !laid.error ? L(laid.length) : "check the clamps"}`
                      : laid && !laid.error
                        ? ` · ${L(laid.length)}`
                        : " · won’t fit, check the clamps"}
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}
        <div className="job-box">
          <div>
            <span>Fittings and hardware</span>
            <b>{money(index.partsTotal)}</b>
          </div>
          <div>
            <span>Conduit{index.conduitPriced ? "" : " (add a stick price)"}</span>
            <b>{index.conduitPriced ? money(index.conduitTotal) : "—"}</b>
          </div>
          <div className="sum">
            <span>Job total</span>
            <b>{money(index.jobTotal)}</b>
          </div>
        </div>
        <p className="packet-note">
          {build.sticks} stick{build.sticks === 1 ? "" : "s"} at {stickName(project.stick)}, {build.weightLb.toFixed(1)} lb of tube. MakerPipe “from” prices, not a quote. The next pages are where to cut each marked pipe.
        </p>
      </section>
      <section className="packet-page">
        <header>
          <p>Clampwright · {project.name}</p>
          <h2>Where to cut</h2>
        </header>
        <p className="packet-note">
          Each mark matches the side views. The dashed gold is pipe that sits inside the clamp. Do not add it to the cut. A brown tick is a wood strap.
        </p>
        {build.members.length === 0 ? <p className="packet-note">Nothing to cut yet.</p> : null}
        {build.members.map((member) => (
          <article key={member.id} className="cut-sheet">
            <h3>
              <span className="piece-mark">{index.marks.get(member.id)}</span>
              {member.label}
              {member.approx ? " (approx)" : ""}
            </h3>
            <CutFigure member={member} straps={build.straps} unit={unit} />
            <p>{cutNote(member, build.straps, unit, { a: near(member.a), b: near(member.b) })}</p>
          </article>
        ))}
        <h3>Cut tally</h3>
        <ul className="packet-cuts">
          {build.cuts.map((row) => {
            const marks = marksFor(row.kind, row.length, row.approx);
            return (
              <li key={row.key}>
                {row.qty} × {L(row.length)} {row.label}
                {marks.length ? ` · ${marks.join(", ")}` : ""}
                {row.approx ? " (approx)" : ""}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
