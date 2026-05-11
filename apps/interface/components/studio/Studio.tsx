"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "./Canvas";
import { Sidebar, describeShape, PALETTE, type AddShapeSpec } from "./Sidebar";
import type {
  Calibration,
  FloorPlanImage,
  Shape,
  ToolMode,
} from "@/lib/studio/types";
import { letterLabel, shapeBounds, shapeWorldVertices, uid } from "@/lib/studio/geometry";

const STORAGE_KEY = "footprint-studio-v1";

// Default plan: the inverted "blueprint" version of the 50 Church 3F screenshot.
const DEFAULT_PLAN: FloorPlanImage = {
  src: "/floorplan/floorplan-blueprint.png",
  width: 894,
  height: 800,
  label: "50 CHURCH · 3F · RM 308",
};

type PendingShape = { type: "polygon"; name: string; color: string } | null;

type Viewport = { zoom: number; pan: { x: number; y: number } };

export default function Studio() {
  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<ToolMode>("select");
  const [pendingShape, setPendingShape] = useState<PendingShape>(null);
  const [gridOn, setGridOn] = useState(true);
  const [snapOn, setSnapOn] = useState(true);
  const [viewport, setViewport] = useState<Viewport>({ zoom: 1, pan: { x: 0, y: 0 } });
  const [printing, setPrinting] = useState(false);
  const [floorPlan, setFloorPlan] = useState<FloorPlanImage>(DEFAULT_PLAN);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const planInputRef = useRef<HTMLInputElement | null>(null);

  // load from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const j = JSON.parse(raw);
      if (j.calibration) setCalibration(j.calibration);
      if (Array.isArray(j.shapes)) setShapes(j.shapes);
      if (j.floorPlan && typeof j.floorPlan.src === "string") {
        setFloorPlan(j.floorPlan);
      }
    } catch (err) {
      console.warn("load failed", err);
    }
  }, []);

  // persist
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ calibration, shapes, floorPlan })
      );
    } catch {}
  }, [calibration, shapes, floorPlan]);

  function nextLetter() {
    const used = new Set(shapes.map((s) => s.letter));
    let i = 0;
    while (used.has(letterLabel(i))) i++;
    return letterLabel(i);
  }

  const addShape = useCallback(
    (spec: AddShapeSpec) => {
      if (spec.type === "polygon" && "polyDraw" in spec && spec.polyDraw) {
        setPendingShape({ type: "polygon", name: spec.name, color: spec.color });
        setTool("polygon-draw");
        return;
      }
      // narrow to non-polyDraw specs
      const concrete = spec as Exclude<AddShapeSpec, { type: "polygon" }>;
      const id = uid();
      const letter = nextLetter();
      const ppi = calibration?.pxPerInch;
      const startX = ppi ? (floorPlan.width * 0.55) / ppi : 0;
      const startY = ppi ? (floorPlan.height * 0.55) / ppi : 0;
      const newShape: Shape = {
        id,
        letter,
        type: concrete.type,
        vertices: concrete.vertices,
        meta: concrete.meta,
        name: concrete.name,
        color: concrete.color,
        transform: { x: startX, y: startY, rotation: 0, flipX: false, flipY: false },
      };
      setShapes((prev) => [...prev, newShape]);
      setSelectedId(id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [calibration, floorPlan, shapes]
  );

  function commitPendingPolygon({
    vertices,
    transform,
  }: {
    vertices: { x: number; y: number }[];
    transform: Shape["transform"];
  }) {
    const id = uid();
    const letter = nextLetter();
    setShapes((prev) => [
      ...prev,
      {
        id,
        letter,
        type: "polygon",
        vertices,
        transform: { ...transform, flipX: false, flipY: false },
        name: pendingShape?.name || "",
        color: pendingShape?.color || PALETTE[2],
        meta: null,
      },
    ]);
    setPendingShape(null);
    setTool("select");
    setSelectedId(id);
  }

  function updateShape(id: string, patch: Partial<Shape>) {
    setShapes((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function deleteShape(id: string) {
    setShapes((prev) => prev.filter((s) => s.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function duplicateShape(id: string) {
    const s = shapes.find((x) => x.id === id);
    if (!s) return;
    const newId = uid();
    const letter = nextLetter();
    const offsetIn = 6;
    setShapes((prev) => [
      ...prev,
      {
        ...s,
        id: newId,
        letter,
        transform: { ...s.transform, x: s.transform.x + offsetIn, y: s.transform.y + offsetIn },
      },
    ]);
    setSelectedId(newId);
  }

  function flipX(id: string) {
    const s = shapes.find((x) => x.id === id);
    if (!s) return;
    updateShape(id, { transform: { ...s.transform, flipX: !s.transform.flipX } });
  }
  function flipY(id: string) {
    const s = shapes.find((x) => x.id === id);
    if (!s) return;
    updateShape(id, { transform: { ...s.transform, flipY: !s.transform.flipY } });
  }
  function rotate90(id: string) {
    const s = shapes.find((x) => x.id === id);
    if (!s) return;
    const r = (s.transform.rotation || 0) + 90;
    updateShape(id, { transform: { ...s.transform, rotation: r % 360 } });
  }
  function sendBack(id: string) {
    setShapes((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx <= 0) return prev;
      const arr = [...prev];
      [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
      return arr;
    });
  }
  function bringForward(id: string) {
    setShapes((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const arr = [...prev];
      [arr[idx + 1], arr[idx]] = [arr[idx], arr[idx + 1]];
      return arr;
    });
  }

  // global keys
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (printing) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        deleteShape(selectedId);
      } else if (e.key === "d" && (e.metaKey || e.ctrlKey) && selectedId) {
        e.preventDefault();
        duplicateShape(selectedId);
      } else if (e.key === "r" && selectedId) {
        rotate90(selectedId);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, shapes, printing]);

  function onExport() {
    const data = { calibration, shapes, floorPlan, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `footprint-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function onImport() {
    fileInputRef.current?.click();
  }
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const j = JSON.parse(String(reader.result));
        if (j.calibration) setCalibration(j.calibration);
        if (Array.isArray(j.shapes)) setShapes(j.shapes);
        if (j.floorPlan) setFloorPlan(j.floorPlan);
        setSelectedId(null);
      } catch (err) {
        alert("couldn't read file: " + (err as Error).message);
      }
    };
    reader.readAsText(f);
    e.target.value = "";
  }

  function onReset() {
    if (!confirm("clear all shapes and calibration?")) return;
    setShapes([]);
    setCalibration(null);
    setSelectedId(null);
  }

  // floor plan upload: read file → data URL → measure natural size → set state
  function onUploadFloorPlan() {
    planInputRef.current?.click();
  }
  function onPlanFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const img = new Image();
      img.onload = () => {
        setFloorPlan({
          src: dataUrl,
          width: img.naturalWidth,
          height: img.naturalHeight,
          label: f.name.replace(/\.[^.]+$/, "").toUpperCase().slice(0, 32),
        });
        // changing the plan invalidates the previous calibration
        setCalibration(null);
        setShapes([]);
        setSelectedId(null);
        setViewport({ zoom: 1, pan: { x: 0, y: 0 } });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(f);
    e.target.value = "";
  }

  function onPrint() {
    setPrinting(true);
    setTimeout(() => {
      window.print();
      setTimeout(() => setPrinting(false), 800);
    }, 200);
  }

  return (
    <div className={`studio ${printing ? "is-printing" : ""}`}>
      <Sidebar
        shapes={shapes}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        onAddShape={addShape}
        onUpdateShape={updateShape}
        onDeleteShape={deleteShape}
        onDuplicateShape={duplicateShape}
        onFlipX={flipX}
        onFlipY={flipY}
        onRotate90={rotate90}
        onSendBack={sendBack}
        onBringForward={bringForward}
        tool={tool}
        setTool={setTool}
        calibration={calibration}
        gridOn={gridOn}
        setGridOn={setGridOn}
        snapOn={snapOn}
        setSnapOn={setSnapOn}
        onExport={onExport}
        onImport={onImport}
        onPrint={onPrint}
        onReset={onReset}
        onUploadFloorPlan={onUploadFloorPlan}
        floorPlanLabel={floorPlan.label || "—"}
      />

      <main className="main">
        <Canvas
          shapes={shapes}
          setShapes={setShapes}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          calibration={calibration}
          setCalibration={setCalibration}
          floorPlan={floorPlan}
          gridOn={gridOn}
          snapOn={snapOn}
          tool={tool}
          setTool={setTool}
          pendingShape={pendingShape}
          setPendingShape={setPendingShape}
          onCommitPending={commitPendingPolygon}
          viewport={viewport}
          setViewport={setViewport}
        />
      </main>

      {printing && <PrintView shapes={shapes} calibration={calibration} floorPlan={floorPlan} />}

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: "none" }}
        onChange={onFile}
      />
      <input
        ref={planInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={onPlanFile}
      />
    </div>
  );
}

function PrintView({
  shapes,
  calibration,
  floorPlan,
}: {
  shapes: Shape[];
  calibration: Calibration | null;
  floorPlan: FloorPlanImage;
}) {
  if (!calibration) return null;
  const ppi = calibration.pxPerInch;
  const W = floorPlan.width;
  const H = floorPlan.height;

  return (
    <div className="print-sheet">
      <div className="print-header">
        <div className="print-titleblock">
          <div className="print-title">FOOTPRINT LAYOUT</div>
          <div className="print-sub">{floorPlan.label || "Floor plan"}</div>
        </div>
        <div className="print-meta">
          <div>
            <b>DRAWN</b> {new Date().toLocaleDateString()}
          </div>
          <div>
            <b>OBJECTS</b> {shapes.length}
          </div>
          <div>
            <b>SCALE</b> {(ppi * 12).toFixed(2)} px / ft
          </div>
        </div>
      </div>

      <div className="print-canvas">
        <svg viewBox={`0 0 ${W} ${H}`} className="print-svg">
          <rect x={0} y={0} width={W} height={H} fill="white" />
          {/* grid */}
          <g opacity={0.18}>
            {(() => {
              const step = ppi * 12;
              const lines: React.ReactElement[] = [];
              for (let x = 0; x <= W; x += step) {
                lines.push(
                  <line key={`vx${x}`} x1={x} y1={0} x2={x} y2={H} stroke="#888" strokeWidth={0.3} />
                );
              }
              for (let y = 0; y <= H; y += step) {
                lines.push(
                  <line key={`hy${y}`} x1={0} y1={y} x2={W} y2={y} stroke="#888" strokeWidth={0.3} />
                );
              }
              return lines;
            })()}
          </g>
          {/* invert the white-on-blue plan back to dark-on-white for the print sheet */}
          <image href={floorPlan.src} x={0} y={0} width={W} height={H} style={{ filter: "invert(1)" }} />
          {shapes.map((s) => {
            const verts = shapeWorldVertices(s)
              .map((v) => `${v.x * ppi},${v.y * ppi}`)
              .join(" ");
            const b = shapeBounds(s);
            return (
              <g key={s.id}>
                <polygon points={verts} fill={s.color} fillOpacity={0.35} stroke="#222" strokeWidth={1.2} />
                <text
                  x={b.cx * ppi}
                  y={b.cy * ppi}
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{ fontFamily: '"Special Elite", serif', fontSize: 18, fontWeight: 700 }}
                  fill="#111"
                >
                  {s.letter}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="print-legend">
        <div className="print-legend-title">OBJECT LEGEND</div>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Type</th>
              <th>Dimensions</th>
              <th>Rotation</th>
            </tr>
          </thead>
          <tbody>
            {shapes.map((s) => (
              <tr key={s.id}>
                <td>
                  <span className="legend-chip" style={{ background: s.color }}>
                    {s.letter}
                  </span>
                </td>
                <td>{s.name || <em>—</em>}</td>
                <td>{s.type === "rect" ? "Rectangle" : s.type === "lshape" ? "L-shape" : "Polygon"}</td>
                <td>{describeShape(s)}</td>
                <td>
                  {Math.round(s.transform.rotation || 0)}°
                  {s.transform.flipX ? " · ⇆" : ""}
                  {s.transform.flipY ? " · ⇅" : ""}
                </td>
              </tr>
            ))}
            {shapes.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <em>no objects placed yet</em>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="print-foot">Footprint Studio · printed {new Date().toLocaleString()}</div>
    </div>
  );
}
