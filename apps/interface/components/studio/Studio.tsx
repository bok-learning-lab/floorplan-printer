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
import {
  groupBounds,
  letterLabel,
  rotateAround,
  shapeBounds,
  shapeWorldVertices,
  uid,
} from "@/lib/studio/geometry";

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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const primarySelectedId = selectedIds.at(-1) ?? null;
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
      setSelectedIds([id]);
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
    setSelectedIds([id]);
  }

  function updateShape(id: string, patch: Partial<Shape>) {
    setShapes((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function deleteShapes(ids: string[]) {
    setShapes((prev) => prev.filter((s) => !ids.includes(s.id)));
    setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
  }

  function duplicateShapes(ids: string[]) {
    if (ids.length === 0) return;
    const offsetIn = 6;
    // preserve grouping among duplicated members by minting a fresh groupId
    const sourceGroupIds = new Map<string, string>(); // old gid → new gid
    const newIds: string[] = [];
    setShapes((prev) => {
      const used = new Set(prev.map((s) => s.letter));
      let counter = 0;
      function letter() {
        while (used.has(letterLabel(counter))) counter++;
        const l = letterLabel(counter);
        used.add(l);
        counter++;
        return l;
      }
      const adds: Shape[] = [];
      for (const id of ids) {
        const s = prev.find((x) => x.id === id);
        if (!s) continue;
        let newGroupId: string | null = null;
        if (s.groupId) {
          if (!sourceGroupIds.has(s.groupId)) sourceGroupIds.set(s.groupId, uid());
          newGroupId = sourceGroupIds.get(s.groupId)!;
        }
        const newId = uid();
        newIds.push(newId);
        adds.push({
          ...s,
          id: newId,
          letter: letter(),
          groupId: newGroupId,
          transform: { ...s.transform, x: s.transform.x + offsetIn, y: s.transform.y + offsetIn },
        });
      }
      return [...prev, ...adds];
    });
    setSelectedIds(newIds);
  }

  // ── group operations ────────────────────────────────────────────────────
  // Rotate all members around the group's combined centroid by `deg`.
  function rotateGroupAroundCentroid(ids: string[], deg: number) {
    if (ids.length === 0 || deg === 0) return;
    const idSet = new Set(ids);
    const members = shapes.filter((s) => idSet.has(s.id));
    if (members.length === 0) return;
    const pivot = groupBounds(members);
    setShapes((prev) =>
      prev.map((s) => {
        if (!idSet.has(s.id)) return s;
        const np = rotateAround({ x: s.transform.x, y: s.transform.y }, { x: pivot.cx, y: pivot.cy }, deg);
        return {
          ...s,
          transform: {
            ...s.transform,
            x: np.x,
            y: np.y,
            rotation: ((s.transform.rotation || 0) + deg) % 360,
          },
        };
      })
    );
  }

  // Rotate each member in place (around its own center) by `deg`.
  function rotateEachInPlace(ids: string[], deg: number) {
    if (ids.length === 0 || deg === 0) return;
    const idSet = new Set(ids);
    setShapes((prev) =>
      prev.map((s) =>
        idSet.has(s.id)
          ? { ...s, transform: { ...s.transform, rotation: ((s.transform.rotation || 0) + deg) % 360 } }
          : s
      )
    );
  }

  // Mirror horizontally: mirror each member's position around the group's vertical
  // axis through centroid, negate rotation, toggle flipX.
  function flipGroupX(ids: string[]) {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const members = shapes.filter((s) => idSet.has(s.id));
    if (members.length === 0) return;
    const pivot = groupBounds(members);
    setShapes((prev) =>
      prev.map((s) =>
        idSet.has(s.id)
          ? {
              ...s,
              transform: {
                ...s.transform,
                x: 2 * pivot.cx - s.transform.x,
                rotation: -(s.transform.rotation || 0),
                flipX: !s.transform.flipX,
              },
            }
          : s
      )
    );
  }

  function flipGroupY(ids: string[]) {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const members = shapes.filter((s) => idSet.has(s.id));
    if (members.length === 0) return;
    const pivot = groupBounds(members);
    setShapes((prev) =>
      prev.map((s) =>
        idSet.has(s.id)
          ? {
              ...s,
              transform: {
                ...s.transform,
                y: 2 * pivot.cy - s.transform.y,
                rotation: -(s.transform.rotation || 0),
                flipY: !s.transform.flipY,
              },
            }
          : s
      )
    );
  }

  // Group: assign a fresh groupId to selected shapes.
  function groupSelected() {
    if (selectedIds.length < 2) return;
    const gid = uid();
    const idSet = new Set(selectedIds);
    setShapes((prev) => prev.map((s) => (idSet.has(s.id) ? { ...s, groupId: gid } : s)));
  }

  // Ungroup: clear groupId for the entire group containing any selected shape.
  function ungroupSelected() {
    const gids = new Set(
      shapes.filter((s) => selectedIds.includes(s.id) && s.groupId).map((s) => s.groupId as string)
    );
    if (gids.size === 0) return;
    setShapes((prev) => prev.map((s) => (s.groupId && gids.has(s.groupId) ? { ...s, groupId: null } : s)));
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
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.length) {
        e.preventDefault();
        deleteShapes(selectedIds);
      } else if (e.key === "d" && (e.metaKey || e.ctrlKey) && selectedIds.length) {
        e.preventDefault();
        duplicateShapes(selectedIds);
      } else if (e.key === "r" && selectedIds.length) {
        // single → rotate self; group → rotate around centroid
        rotateGroupAroundCentroid(selectedIds, 90);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, shapes, printing]);

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
        setSelectedIds([]);
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
    setSelectedIds([]);
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
        setSelectedIds([]);
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
        selectedIds={selectedIds}
        primarySelectedId={primarySelectedId}
        setSelectedIds={setSelectedIds}
        onSelectFromRow={(id, shift) => {
          setSelectedIds((prev) => {
            if (shift) {
              return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
            }
            return [id];
          });
        }}
        onAddShape={addShape}
        onUpdateShape={updateShape}
        onDelete={() => deleteShapes(selectedIds)}
        onDuplicate={() => duplicateShapes(selectedIds)}
        onFlipH={() => flipGroupX(selectedIds)}
        onFlipV={() => flipGroupY(selectedIds)}
        onRotateGroup90={() => rotateGroupAroundCentroid(selectedIds, 90)}
        onRotateEach90={() => rotateEachInPlace(selectedIds, 90)}
        onGroup={groupSelected}
        onUngroup={ungroupSelected}
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
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
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
