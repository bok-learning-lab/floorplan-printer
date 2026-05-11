"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Calibration,
  FloorPlanImage,
  Point,
  Shape,
  ToolMode,
} from "@/lib/studio/types";
import {
  edgeSnap,
  pointInPolygon,
  shapeBounds,
  shapeWorldVertices,
} from "@/lib/studio/geometry";
import { formatFeetInches, parseFeetInches } from "@/lib/studio/units";

const HANDLE_PX = 12;
const ROTATE_HANDLE_OFFSET = 32;
const SNAP_THRESHOLD_IN = 3;

type Viewport = { zoom: number; pan: Point };

type DragState =
  | { kind: "pan"; startClient: Point; startPan: Point }
  | { kind: "move"; id: string; startImg: Point; orig: Shape["transform"] }
  | { kind: "rotate"; id: string }
  | null;

type CalibState =
  | null
  | { stage: "p2"; p1: Point; p2: null }
  | { stage: "distance"; p1: Point; p2: Point };

type PendingShape = { type: "polygon"; name: string; color: string } | null;

type Props = {
  shapes: Shape[];
  setShapes: React.Dispatch<React.SetStateAction<Shape[]>>;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  calibration: Calibration | null;
  setCalibration: (c: Calibration | null) => void;
  floorPlan: FloorPlanImage;
  gridOn: boolean;
  snapOn: boolean;
  tool: ToolMode;
  setTool: (t: ToolMode) => void;
  pendingShape: PendingShape;
  setPendingShape: (s: PendingShape) => void;
  onCommitPending: (args: { vertices: Point[]; transform: Shape["transform"] }) => void;
  viewport: Viewport;
  setViewport: React.Dispatch<React.SetStateAction<Viewport>>;
};

export function Canvas(props: Props) {
  const {
    shapes, setShapes,
    selectedId, setSelectedId,
    calibration, setCalibration,
    floorPlan,
    gridOn, snapOn,
    tool, setTool,
    pendingShape, setPendingShape,
    onCommitPending,
    viewport, setViewport,
  } = props;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const [calibState, setCalibState] = useState<CalibState>(null);
  const [polyPoints, setPolyPoints] = useState<Point[]>([]);
  const [hoverImg, setHoverImg] = useState<Point | null>(null);

  const ppi = calibration ? calibration.pxPerInch : null;
  const pxToInch = useCallback((v: number) => v / (ppi || 1), [ppi]);
  const inchToPx = useCallback((v: number) => v * (ppi || 0), [ppi]);

  const svgPointFromEvent = useCallback((e: { clientX: number; clientY: number }): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);

  const imgToInch = useCallback((p: Point) => ({ x: pxToInch(p.x), y: pxToInch(p.y) }), [pxToInch]);

  // viewport / viewBox
  const vbWidth = floorPlan.width / viewport.zoom;
  const vbHeight = floorPlan.height / viewport.zoom;
  const vbX = -viewport.pan.x / viewport.zoom;
  const vbY = -viewport.pan.y / viewport.zoom;
  const viewBox = `${vbX} ${vbY} ${vbWidth} ${vbHeight}`;

  // wheel-zoom — bind via DOM ref to get a non-passive listener
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const p = svgPointFromEvent(e);
      const dz = Math.exp(-e.deltaY * 0.0015);
      setViewport((v) => {
        const newZoom = Math.max(0.3, Math.min(8, v.zoom * dz));
        const factor = newZoom / v.zoom;
        const oldVbX = -v.pan.x / v.zoom;
        const oldVbY = -v.pan.y / v.zoom;
        const newPanX = p.x - (p.x - -oldVbX) * factor;
        const newPanY = p.y - (p.y - -oldVbY) * factor;
        return { zoom: newZoom, pan: { x: -newPanX, y: -newPanY } };
      });
    }
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [svgPointFromEvent, setViewport]);

  // pointer down
  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const target = e.target as Element;
    if ((target as HTMLElement).dataset?.role === "handle") return;
    const p = svgPointFromEvent(e);

    if (tool === "pan" || e.button === 1 || e.shiftKey) {
      setDrag({ kind: "pan", startClient: { x: e.clientX, y: e.clientY }, startPan: { ...viewport.pan } });
      return;
    }

    if (tool === "calibrate") {
      if (!calibState || calibState.stage === "distance") {
        setCalibState({ stage: "p2", p1: p, p2: null });
      } else if (calibState.stage === "p2") {
        setCalibState({ stage: "distance", p1: calibState.p1, p2: p });
      }
      return;
    }

    if (tool === "polygon-draw" && pendingShape?.type === "polygon") {
      setPolyPoints((prev) => [...prev, imgToInch(p)]);
      return;
    }

    if (tool === "select" && ppi) {
      let hit: Shape | null = null;
      for (let i = shapes.length - 1; i >= 0; i--) {
        const s = shapes[i];
        const worldVerts = shapeWorldVertices(s).map((v) => ({ x: inchToPx(v.x), y: inchToPx(v.y) }));
        if (pointInPolygon(p, worldVerts)) {
          hit = s;
          break;
        }
      }
      if (hit) {
        setSelectedId(hit.id);
        setDrag({ kind: "move", id: hit.id, startImg: p, orig: { ...hit.transform } });
      } else {
        setSelectedId(null);
      }
    }
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const p = svgPointFromEvent(e);
    setHoverImg(p);
    if (!drag) return;

    if (drag.kind === "pan") {
      const dx = e.clientX - drag.startClient.x;
      const dy = e.clientY - drag.startClient.y;
      setViewport((v) => ({ ...v, pan: { x: drag.startPan.x + dx, y: drag.startPan.y + dy } }));
      return;
    }

    if (drag.kind === "move") {
      const dxIn = pxToInch(p.x - drag.startImg.x);
      const dyIn = pxToInch(p.y - drag.startImg.y);
      setShapes((prev) =>
        prev.map((s) => {
          if (s.id !== drag.id) return s;
          let nx = drag.orig.x + dxIn;
          let ny = drag.orig.y + dyIn;
          const candidate: Shape = { ...s, transform: { ...s.transform, x: nx, y: ny } };
          if (snapOn) {
            const snap = edgeSnap(candidate, prev, SNAP_THRESHOLD_IN);
            nx += snap.dx;
            ny += snap.dy;
          }
          return { ...s, transform: { ...s.transform, x: nx, y: ny } };
        })
      );
      return;
    }

    if (drag.kind === "rotate") {
      const shape = shapes.find((s) => s.id === drag.id);
      if (!shape || !ppi) return;
      const center = { x: inchToPx(shape.transform.x), y: inchToPx(shape.transform.y) };
      const a = Math.atan2(p.y - center.y, p.x - center.x);
      let deg = (a * 180) / Math.PI + 90;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      setShapes((prev) =>
        prev.map((s) => (s.id === drag.id ? { ...s, transform: { ...s.transform, rotation: deg } } : s))
      );
    }
  }

  function handlePointerUp() {
    setDrag(null);
  }

  // polygon keys
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (tool === "polygon-draw" && pendingShape?.type === "polygon") {
        if (e.key === "Enter") {
          finishPolygon();
        } else if (e.key === "Escape") {
          setPolyPoints([]);
          setPendingShape(null);
          setTool("select");
        } else if (e.key === "Backspace") {
          setPolyPoints((prev) => prev.slice(0, -1));
        }
      }
      if (tool === "calibrate" && e.key === "Escape") {
        setCalibState(null);
        setTool("select");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, pendingShape, polyPoints]);

  function finishPolygon() {
    if (polyPoints.length < 3) return;
    let cx = 0, cy = 0;
    for (const p of polyPoints) {
      cx += p.x;
      cy += p.y;
    }
    cx /= polyPoints.length;
    cy /= polyPoints.length;
    const verts = polyPoints.map((p) => ({ x: p.x - cx, y: p.y - cy }));
    onCommitPending({
      vertices: verts,
      transform: { x: cx, y: cy, rotation: 0, flipX: false, flipY: false },
    });
    setPolyPoints([]);
  }

  // grid
  const gridEls = useMemo(() => {
    if (!gridOn || !ppi) return null;
    const stepPx = 12 * ppi; // 1 ft
    const major = 5;
    const W = floorPlan.width;
    const H = floorPlan.height;
    const lines: React.ReactElement[] = [];
    for (let x = 0; x <= W; x += stepPx) {
      const isMajor = Math.round(x / stepPx) % major === 0;
      lines.push(
        <line
          key={`vx${x}`}
          x1={x}
          y1={0}
          x2={x}
          y2={H}
          stroke="rgba(255,255,255,0.10)"
          strokeWidth={isMajor ? 0.6 : 0.3}
        />
      );
    }
    for (let y = 0; y <= H; y += stepPx) {
      const isMajor = Math.round(y / stepPx) % major === 0;
      lines.push(
        <line
          key={`hy${y}`}
          x1={0}
          y1={y}
          x2={W}
          y2={y}
          stroke="rgba(255,255,255,0.10)"
          strokeWidth={isMajor ? 0.6 : 0.3}
        />
      );
    }
    return <g pointerEvents="none">{lines}</g>;
  }, [gridOn, ppi, floorPlan.width, floorPlan.height]);

  return (
    <div
      className="canvas-wrap"
      style={{ cursor: tool === "pan" ? "grab" : drag?.kind === "pan" ? "grabbing" : "crosshair" }}
    >
      <svg
        ref={svgRef}
        className="canvas-svg"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <defs>
          <filter id="sketch" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.025" numOctaves={2} seed={3} />
            <feDisplacementMap in="SourceGraphic" scale={1.1} />
          </filter>
          <filter id="paper" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves={2} seed={7} />
            <feColorMatrix values="0 0 0 0 1   0 0 0 0 1   0 0 0 0 1   0 0 0 0.06 0" />
            <feComposite in2="SourceGraphic" operator="in" />
          </filter>
        </defs>

        {/* blueprint background */}
        <rect x={vbX} y={vbY} width={vbWidth} height={vbHeight} fill="url(#blueprintBg)" />

        {/* faint noise overlay */}
        <rect x={0} y={0} width={floorPlan.width} height={floorPlan.height} filter="url(#paper)" pointerEvents="none" />

        {/* grid (under the floor plan) */}
        {gridEls}

        {/* floor plan image */}
        <image
          href={floorPlan.src}
          x={0}
          y={0}
          width={floorPlan.width}
          height={floorPlan.height}
          opacity={0.92}
          pointerEvents="none"
        />

        {/* shapes */}
        {shapes.map((s) => (
          <ShapeView
            key={s.id}
            shape={s}
            ppi={ppi}
            selected={s.id === selectedId}
            zoom={viewport.zoom}
            onStartRotate={(e) => {
              e.stopPropagation();
              setDrag({ kind: "rotate", id: s.id });
            }}
          />
        ))}

        {/* polygon preview */}
        {tool === "polygon-draw" && polyPoints.length > 0 && ppi && (
          <PolygonPreview points={polyPoints} ppi={ppi} hover={hoverImg ? imgToInch(hoverImg) : null} />
        )}

        {/* calibration overlay */}
        {tool === "calibrate" && <CalibrationOverlay state={calibState} hover={hoverImg} />}
      </svg>

      {/* defs for the bg gradient (kept separate so the main SVG inherits a clean tree) */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
        <defs>
          <linearGradient id="blueprintBg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0a2a47" />
            <stop offset="100%" stopColor="#0e3a63" />
          </linearGradient>
        </defs>
      </svg>

      {/* HUD */}
      <div className="canvas-hud">
        <div className="hud-chip">
          {ppi ? (
            <>
              scale&nbsp;·&nbsp;<b>{(ppi * 12).toFixed(2)} px/ft</b>
            </>
          ) : (
            <>not calibrated</>
          )}
          &nbsp;·&nbsp;zoom <b>{(viewport.zoom * 100).toFixed(0)}%</b>
        </div>
        {tool === "calibrate" && (
          <CalibrationPrompt
            state={calibState}
            onConfirm={(distInches) => {
              if (!calibState || calibState.stage !== "distance") return;
              const dx = calibState.p2.x - calibState.p1.x;
              const dy = calibState.p2.y - calibState.p1.y;
              const distPx = Math.sqrt(dx * dx + dy * dy);
              const pp = distPx / distInches;
              setCalibration({
                pxPerInch: pp,
                p1: calibState.p1,
                p2: calibState.p2,
                refInches: distInches,
              });
              setCalibState(null);
              setTool("select");
            }}
            onCancel={() => {
              setCalibState(null);
              setTool("select");
            }}
          />
        )}
        {tool === "polygon-draw" && (
          <div className="hud-chip hud-chip--accent">
            click to add vertex&nbsp;·&nbsp;<b>Enter</b> finish&nbsp;·&nbsp;<b>⌫</b> undo&nbsp;·&nbsp;<b>Esc</b> cancel
          </div>
        )}
      </div>
    </div>
  );
}

function ShapeView({
  shape,
  ppi,
  selected,
  zoom,
  onStartRotate,
}: {
  shape: Shape;
  ppi: number | null;
  selected: boolean;
  zoom: number;
  onStartRotate: (e: React.PointerEvent) => void;
}) {
  if (!ppi) return null;
  const verts = shapeWorldVertices(shape);
  const ptsStr = verts.map((v) => `${v.x * ppi},${v.y * ppi}`).join(" ");
  const b = shapeBounds(shape);
  const bx = b.minX * ppi;
  const by = b.minY * ppi;
  const bw = (b.maxX - b.minX) * ppi;
  const bh = (b.maxY - b.minY) * ppi;
  const cx = b.cx * ppi;
  const cy = b.cy * ppi;
  const widthIn = b.maxX - b.minX;
  const heightIn = b.maxY - b.minY;
  const handleR = HANDLE_PX / zoom / 2;
  const stroke = 2 / zoom;

  return (
    <g className="shape">
      <polygon
        points={ptsStr}
        fill={shape.color}
        fillOpacity={0.32}
        stroke={shape.color}
        strokeOpacity={0.95}
        strokeWidth={stroke * 1.2}
        filter="url(#sketch)"
      />
      <polygon
        points={ptsStr}
        fill="none"
        stroke="white"
        strokeOpacity={0.55}
        strokeWidth={stroke * 0.6}
      />
      <g transform={`translate(${cx} ${cy})`} pointerEvents="none">
        <text
          textAnchor="middle"
          dominantBaseline="central"
          className="shape-letter"
          style={{ fontSize: 24 / zoom }}
          fill="white"
        >
          {shape.letter}
        </text>
        {shape.name && (
          <text
            textAnchor="middle"
            dominantBaseline="central"
            className="shape-name"
            y={20 / zoom}
            style={{ fontSize: 11 / zoom }}
            fill="white"
            opacity={0.85}
          >
            {shape.name}
          </text>
        )}
        <text
          textAnchor="middle"
          dominantBaseline="central"
          y={36 / zoom}
          style={{ fontSize: 9 / zoom, fontFamily: "JetBrains Mono, monospace" }}
          fill="white"
          opacity={0.55}
        >
          {formatFeetInches(widthIn, { compact: true })} × {formatFeetInches(heightIn, { compact: true })}
        </text>
      </g>

      {selected && (
        <g pointerEvents="none">
          <rect
            x={bx - 6 / zoom}
            y={by - 6 / zoom}
            width={bw + 12 / zoom}
            height={bh + 12 / zoom}
            fill="none"
            stroke="#7ad7ff"
            strokeWidth={1 / zoom}
            strokeDasharray={`${4 / zoom} ${3 / zoom}`}
          />
          <line
            x1={cx}
            y1={by - 6 / zoom}
            x2={cx}
            y2={by - ROTATE_HANDLE_OFFSET / zoom}
            stroke="#7ad7ff"
            strokeWidth={1 / zoom}
          />
          <circle
            cx={cx}
            cy={by - ROTATE_HANDLE_OFFSET / zoom}
            r={handleR * 0.9}
            fill="#7ad7ff"
            data-role="handle"
            onPointerDown={onStartRotate}
            pointerEvents="all"
            style={{ cursor: "grab" }}
          />
        </g>
      )}
    </g>
  );
}

function PolygonPreview({ points, ppi, hover }: { points: Point[]; ppi: number; hover: Point | null }) {
  const all = hover ? [...points, hover] : points;
  const pts = all.map((p) => `${p.x * ppi},${p.y * ppi}`).join(" ");
  return (
    <g pointerEvents="none">
      <polyline
        points={pts}
        fill="rgba(255,255,255,0.08)"
        stroke="#7ad7ff"
        strokeWidth={1.2}
        strokeDasharray="3 3"
      />
      {points.map((p, i) => (
        <circle key={i} cx={p.x * ppi} cy={p.y * ppi} r={3} fill="#7ad7ff" />
      ))}
      {points.length > 1 &&
        all.slice(0, -1).map((p, i) => {
          const q = all[i + 1];
          const mx = ((p.x + q.x) / 2) * ppi;
          const my = ((p.y + q.y) / 2) * ppi;
          const dx = q.x - p.x;
          const dy = q.y - p.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          return (
            <text
              key={`l${i}`}
              x={mx}
              y={my - 6}
              textAnchor="middle"
              fill="#7ad7ff"
              fontSize={10}
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              {formatFeetInches(len)}
            </text>
          );
        })}
    </g>
  );
}

function CalibrationOverlay({ state, hover }: { state: CalibState; hover: Point | null }) {
  if (!state) return null;
  if (state.stage === "p2" && state.p1) {
    return (
      <g pointerEvents="none">
        <circle cx={state.p1.x} cy={state.p1.y} r={5} fill="#ffcc66" />
        {hover && (
          <>
            <line
              x1={state.p1.x}
              y1={state.p1.y}
              x2={hover.x}
              y2={hover.y}
              stroke="#ffcc66"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
            <circle cx={hover.x} cy={hover.y} r={4} fill="none" stroke="#ffcc66" strokeWidth={1.5} />
          </>
        )}
      </g>
    );
  }
  if (state.stage === "distance" && state.p1 && state.p2) {
    return (
      <g pointerEvents="none">
        <line x1={state.p1.x} y1={state.p1.y} x2={state.p2.x} y2={state.p2.y} stroke="#ffcc66" strokeWidth={1.8} />
        <circle cx={state.p1.x} cy={state.p1.y} r={5} fill="#ffcc66" />
        <circle cx={state.p2.x} cy={state.p2.y} r={5} fill="#ffcc66" />
      </g>
    );
  }
  return null;
}

function CalibrationPrompt({
  state,
  onConfirm,
  onCancel,
}: {
  state: CalibState;
  onConfirm: (inches: number) => void;
  onCancel: () => void;
}) {
  const [val, setVal] = useState("16'");
  if (!state) {
    return <div className="hud-chip hud-chip--accent">click the first point of a known distance</div>;
  }
  if (state.stage === "p2") {
    return <div className="hud-chip hud-chip--accent">click the second point</div>;
  }
  if (state.stage === "distance") {
    return (
      <div className="hud-chip hud-chip--input">
        <span>real distance between points</span>
        <input
          type="text"
          value={val}
          autoFocus
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const inches = parseFeetInches(val);
              if (inches && inches > 0) onConfirm(inches);
            } else if (e.key === "Escape") onCancel();
          }}
          placeholder={`16' or 192" or 16ft`}
        />
        <button
          onClick={() => {
            const inches = parseFeetInches(val);
            if (inches && inches > 0) onConfirm(inches);
          }}
        >
          set
        </button>
        <button onClick={onCancel}>cancel</button>
      </div>
    );
  }
  return null;
}
