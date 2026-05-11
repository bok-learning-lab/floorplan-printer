"use client";

import { useEffect, useState } from "react";
import type { Calibration, Shape, ToolMode } from "@/lib/studio/types";
import { shapeBounds, lShapeVertices, rectVertices } from "@/lib/studio/geometry";
import { formatFeetInches, parseFeetInches } from "@/lib/studio/units";

export const PALETTE = [
  "#f6d27a", // warm yellow
  "#f08c66", // salmon
  "#9ad9a8", // mint
  "#b1a8e4", // lavender
  "#7ad7ff", // sky
  "#f0a4c0", // pink
  "#d8c39e", // sand
  "#9ec3e8", // blueprint blue (light)
];

export type AddShapeSpec =
  | {
      type: "rect";
      vertices: { x: number; y: number }[];
      name: string;
      color: string;
      meta: { kind: "rect"; w: number; h: number };
    }
  | {
      type: "lshape";
      vertices: { x: number; y: number }[];
      name: string;
      color: string;
      meta: { kind: "lshape"; outerW: number; outerH: number; notchW: number; notchH: number };
    }
  | {
      type: "polygon";
      polyDraw: true;
      name: string;
      color: string;
    };

type Props = {
  shapes: Shape[];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  onAddShape: (spec: AddShapeSpec) => void;
  onUpdateShape: (id: string, patch: Partial<Shape>) => void;
  onDeleteShape: (id: string) => void;
  onDuplicateShape: (id: string) => void;
  onFlipX: (id: string) => void;
  onFlipY: (id: string) => void;
  onRotate90: (id: string) => void;
  onSendBack: (id: string) => void;
  onBringForward: (id: string) => void;
  tool: ToolMode;
  setTool: (t: ToolMode) => void;
  calibration: Calibration | null;
  gridOn: boolean;
  setGridOn: (b: boolean) => void;
  snapOn: boolean;
  setSnapOn: (b: boolean) => void;
  onExport: () => void;
  onImport: () => void;
  onPrint: () => void;
  onReset: () => void;
  onUploadFloorPlan: () => void;
  floorPlanLabel: string;
};

export function Sidebar(p: Props) {
  const [creating, setCreating] = useState<null | "rect" | "lshape" | "polygon">(null);
  const selected = p.shapes.find((s) => s.id === p.selectedId);

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="titleblock">
          <div className="brand-line" />
          <div className="brand-row">
            <div className="brand">FOOTPRINT</div>
            <div className="brand-sub">STUDIO · v1</div>
          </div>
          <div className="meta-row">
            <div>
              <span className="meta-label">project</span> <span className="meta-val">50 CHURCH ST · 3F</span>
            </div>
            <div>
              <span className="meta-label">sheet</span> <span className="meta-val">{p.floorPlanLabel}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="sidebar-body">
      {!p.calibration && (
        <div className="callout">
          <div className="callout-label">⌖ start here</div>
          <div className="callout-body">
            Set the scale by clicking two points on the floor plan and entering the real distance between them.
          </div>
          <button className="btn btn--primary" onClick={() => p.setTool("calibrate")}>
            calibrate scale →
          </button>
          <div className="callout-hint">tip · pick a wall you already know the length of</div>
        </div>
      )}

      {p.calibration && (
        <>
          <Section label="add shape">
            <div className="shape-buttons">
              <ShapeBtn active={creating === "rect"} onClick={() => setCreating((c) => (c === "rect" ? null : "rect"))}>
                <RectIcon /> rectangle
              </ShapeBtn>
              <ShapeBtn active={creating === "lshape"} onClick={() => setCreating((c) => (c === "lshape" ? null : "lshape"))}>
                <LIcon /> L-shape
              </ShapeBtn>
              <ShapeBtn active={creating === "polygon"} onClick={() => setCreating((c) => (c === "polygon" ? null : "polygon"))}>
                <PolyIcon /> polygon
              </ShapeBtn>
            </div>

            {creating === "rect" && (
              <RectForm
                onCreate={(spec) => {
                  p.onAddShape(spec);
                  setCreating(null);
                }}
                onCancel={() => setCreating(null)}
              />
            )}
            {creating === "lshape" && (
              <LForm
                onCreate={(spec) => {
                  p.onAddShape(spec);
                  setCreating(null);
                }}
                onCancel={() => setCreating(null)}
              />
            )}
            {creating === "polygon" && (
              <PolyForm
                onStart={(spec) => {
                  p.onAddShape(spec);
                  setCreating(null);
                }}
                onCancel={() => setCreating(null)}
              />
            )}
          </Section>

          {selected && (
            <Section label={`selected · ${selected.letter}`}>
              <SelectedPanel
                shape={selected}
                onUpdate={(patch) => p.onUpdateShape(selected.id, patch)}
                onDelete={() => p.onDeleteShape(selected.id)}
                onDuplicate={() => p.onDuplicateShape(selected.id)}
                onFlipX={() => p.onFlipX(selected.id)}
                onFlipY={() => p.onFlipY(selected.id)}
                onRotate90={() => p.onRotate90(selected.id)}
                onSendBack={() => p.onSendBack(selected.id)}
                onBringForward={() => p.onBringForward(selected.id)}
              />
            </Section>
          )}

          <Section label={`objects · ${p.shapes.length}`}>
            <div className="object-list">
              {p.shapes.length === 0 && <div className="empty">no objects yet — add a shape above</div>}
              {p.shapes.map((s) => (
                <ObjectRow
                  key={s.id}
                  shape={s}
                  selected={s.id === p.selectedId}
                  onSelect={() => p.setSelectedId(s.id)}
                  onRename={(name) => p.onUpdateShape(s.id, { name })}
                  onDelete={() => p.onDeleteShape(s.id)}
                />
              ))}
            </div>
          </Section>

          <Section label="canvas">
            <div className="toggle-row">
              <Toggle on={p.gridOn} onChange={p.setGridOn} label="1 ft grid" />
              <Toggle on={p.snapOn} onChange={p.setSnapOn} label="edge snap" />
            </div>
            <div className="form-actions" style={{ justifyContent: "stretch" }}>
              <button className="btn btn--ghost" onClick={() => p.setTool("calibrate")} style={{ flex: 1 }}>
                re-calibrate
              </button>
              <button className="btn btn--ghost" onClick={p.onUploadFloorPlan} style={{ flex: 1 }}>
                upload plan
              </button>
            </div>
          </Section>
        </>
      )}

      {!p.calibration && (
        <Section label="floor plan">
          <button className="btn btn--ghost" onClick={p.onUploadFloorPlan} style={{ width: "100%" }}>
            upload a different plan
          </button>
          <div className="form-hint" style={{ marginTop: 8 }}>
            using default · {p.floorPlanLabel}
          </div>
        </Section>
      )}
      </div>

      <div className="sidebar-foot">
        <div className="foot-buttons">
          <button className="btn btn--ghost" onClick={p.onExport}>
            export json
          </button>
          <button className="btn btn--ghost" onClick={p.onImport}>
            import json
          </button>
        </div>
        <div className="foot-buttons">
          <button className="btn btn--primary" onClick={p.onPrint} disabled={!p.calibration}>
            ⎙ print view
          </button>
        </div>
        <button className="btn btn--ghost btn--small" onClick={p.onReset}>
          reset everything
        </button>
        <div className="foot-stamp">DRAWN BY · USER &nbsp;·&nbsp; AS-PLACED &nbsp;·&nbsp; NTS</div>
      </div>
    </aside>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="section">
      <div className="section-label">
        <span>{label}</span>
        <div className="section-rule" />
      </div>
      <div className="section-body">{children}</div>
    </section>
  );
}

function ShapeBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className={`shape-btn ${active ? "is-active" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

function DimInput({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(value);
  return (
    <label className="diminput">
      <span className="diminput-label">{label}</span>
      <input
        type="text"
        value={text}
        autoFocus={autoFocus}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value);
        }}
        placeholder={placeholder || `e.g. 6' 3"`}
        spellCheck={false}
      />
    </label>
  );
}

function RectForm({ onCreate, onCancel }: { onCreate: (s: AddShapeSpec) => void; onCancel: () => void }) {
  const [w, setW] = useState(`6'`);
  const [h, setH] = useState(`3'`);
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[0]);

  function submit() {
    const wIn = parseFeetInches(w);
    const hIn = parseFeetInches(h);
    if (!wIn || !hIn) return;
    onCreate({
      type: "rect",
      vertices: rectVertices(wIn, hIn),
      name,
      color,
      meta: { kind: "rect", w: wIn, h: hIn },
    });
  }

  return (
    <div className="form">
      <div className="form-row">
        <DimInput label="width" value={w} onChange={setW} autoFocus />
        <DimInput label="depth" value={h} onChange={setH} />
      </div>
      <NameAndColor name={name} color={color} setName={setName} setColor={setColor} />
      <div className="form-actions">
        <button className="btn btn--ghost" onClick={onCancel}>
          cancel
        </button>
        <button className="btn btn--primary" onClick={submit}>
          add
        </button>
      </div>
    </div>
  );
}

function LForm({ onCreate, onCancel }: { onCreate: (s: AddShapeSpec) => void; onCancel: () => void }) {
  const [ow, setOw] = useState(`7'`);
  const [oh, setOh] = useState(`5'`);
  const [nw, setNw] = useState(`3'`);
  const [nh, setNh] = useState(`3'`);
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[1]);

  function submit() {
    const oW = parseFeetInches(ow);
    const oH = parseFeetInches(oh);
    const nW = parseFeetInches(nw);
    const nH = parseFeetInches(nh);
    if (!oW || !oH || !nW || !nH) return;
    if (nW >= oW || nH >= oH) return;
    onCreate({
      type: "lshape",
      vertices: lShapeVertices(oW, oH, nW, nH),
      name,
      color,
      meta: { kind: "lshape", outerW: oW, outerH: oH, notchW: nW, notchH: nH },
    });
  }

  return (
    <div className="form">
      <div className="form-section-label">outer bounding box</div>
      <div className="form-row">
        <DimInput label="outer w" value={ow} onChange={setOw} autoFocus />
        <DimInput label="outer h" value={oh} onChange={setOh} />
      </div>
      <div className="form-section-label">notch (removed from top-right)</div>
      <div className="form-row">
        <DimInput label="notch w" value={nw} onChange={setNw} />
        <DimInput label="notch h" value={nh} onChange={setNh} />
      </div>
      <div className="form-hint">tip · use mirror/rotate after to orient the L</div>
      <NameAndColor name={name} color={color} setName={setName} setColor={setColor} />
      <div className="form-actions">
        <button className="btn btn--ghost" onClick={onCancel}>
          cancel
        </button>
        <button className="btn btn--primary" onClick={submit}>
          add
        </button>
      </div>
    </div>
  );
}

function PolyForm({ onStart, onCancel }: { onStart: (s: AddShapeSpec) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[2]);

  function go() {
    onStart({ type: "polygon", polyDraw: true, name, color });
  }

  return (
    <div className="form">
      <div className="form-hint">
        click on the canvas to drop vertices.
        <br />
        <b>Enter</b> finishes · <b>⌫</b> undoes last · <b>Esc</b> cancels.
      </div>
      <NameAndColor name={name} color={color} setName={setName} setColor={setColor} />
      <div className="form-actions">
        <button className="btn btn--ghost" onClick={onCancel}>
          cancel
        </button>
        <button className="btn btn--primary" onClick={go}>
          start drawing
        </button>
      </div>
    </div>
  );
}

function NameAndColor({
  name,
  color,
  setName,
  setColor,
}: {
  name: string;
  color: string;
  setName: (s: string) => void;
  setColor: (s: string) => void;
}) {
  return (
    <>
      <label className="diminput">
        <span className="diminput-label">name (optional)</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Couch A, Workbench…"
        />
      </label>
      <div className="diminput">
        <span className="diminput-label">color</span>
        <div className="swatch-row">
          {PALETTE.map((c) => (
            <button
              key={c}
              className={`swatch ${c === color ? "is-active" : ""}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={c}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function SelectedPanel({
  shape,
  onUpdate,
  onDelete,
  onDuplicate,
  onFlipX,
  onFlipY,
  onRotate90,
  onSendBack,
  onBringForward,
}: {
  shape: Shape;
  onUpdate: (patch: Partial<Shape>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onFlipX: () => void;
  onFlipY: () => void;
  onRotate90: () => void;
  onSendBack: () => void;
  onBringForward: () => void;
}) {
  return (
    <div className="form">
      <label className="diminput">
        <span className="diminput-label">name</span>
        <input
          type="text"
          value={shape.name || ""}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder={`Object ${shape.letter}`}
        />
      </label>
      <div className="diminput">
        <span className="diminput-label">color</span>
        <div className="swatch-row">
          {PALETTE.map((c) => (
            <button
              key={c}
              className={`swatch ${c === shape.color ? "is-active" : ""}`}
              style={{ background: c }}
              onClick={() => onUpdate({ color: c })}
            />
          ))}
        </div>
      </div>
      <div className="diminput">
        <span className="diminput-label">rotation</span>
        <input
          type="number"
          value={Math.round(shape.transform.rotation || 0)}
          onChange={(e) =>
            onUpdate({ transform: { ...shape.transform, rotation: parseFloat(e.target.value) || 0 } })
          }
        />
      </div>
      <div className="action-grid">
        <button className="btn btn--ghost" onClick={onRotate90} title="rotate 90°">
          ⟳ 90°
        </button>
        <button className="btn btn--ghost" onClick={onFlipX} title="mirror horizontal">
          ⇆ flip H
        </button>
        <button className="btn btn--ghost" onClick={onFlipY} title="mirror vertical">
          ⇅ flip V
        </button>
        <button className="btn btn--ghost" onClick={onDuplicate} title="duplicate">
          ⧉ duplicate
        </button>
        <button className="btn btn--ghost" onClick={onBringForward} title="bring forward">
          ↑ forward
        </button>
        <button className="btn btn--ghost" onClick={onSendBack} title="send back">
          ↓ back
        </button>
      </div>
      <button className="btn btn--danger" onClick={onDelete}>
        delete
      </button>
    </div>
  );
}

function ObjectRow({
  shape,
  selected,
  onSelect,
  onRename,
  onDelete,
}: {
  shape: Shape;
  selected: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(shape.name || "");
  useEffect(() => setVal(shape.name || ""), [shape.name]);

  return (
    <div className={`object-row ${selected ? "is-selected" : ""}`} onClick={onSelect}>
      <div className="object-letter" style={{ background: shape.color }}>
        {shape.letter}
      </div>
      <div className="object-info">
        {editing ? (
          <input
            type="text"
            value={val}
            autoFocus
            onChange={(e) => setVal(e.target.value)}
            onBlur={() => {
              onRename(val);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onRename(val);
                setEditing(false);
              }
              if (e.key === "Escape") {
                setVal(shape.name || "");
                setEditing(false);
              }
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div
            className="object-name"
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
          >
            {shape.name || <em>untitled</em>}
          </div>
        )}
        <div className="object-dims">{describeShape(shape)}</div>
      </div>
      <button
        className="object-edit"
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        title="rename"
      >
        ✎
      </button>
      <button
        className="object-edit"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="delete"
      >
        ✕
      </button>
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (b: boolean) => void; label: string }) {
  return (
    <button className={`toggle ${on ? "is-on" : ""}`} onClick={() => onChange(!on)}>
      <span className="toggle-pip" />
      <span className="toggle-label">{label}</span>
    </button>
  );
}

export function describeShape(shape: Shape): string {
  if (shape.type === "rect" && shape.meta?.kind === "rect") {
    return `${formatFeetInches(shape.meta.w, { compact: true })} × ${formatFeetInches(shape.meta.h, { compact: true })}`;
  }
  if (shape.type === "lshape" && shape.meta?.kind === "lshape") {
    return `L · ${formatFeetInches(shape.meta.outerW, { compact: true })} × ${formatFeetInches(shape.meta.outerH, { compact: true })}`;
  }
  const b = shapeBounds(shape);
  return `poly · ${formatFeetInches(b.maxX - b.minX, { compact: true })} × ${formatFeetInches(b.maxY - b.minY, { compact: true })}`;
}

function RectIcon() {
  return (
    <svg width="20" height="14" viewBox="0 0 20 14">
      <rect x="2" y="2" width="16" height="10" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
function LIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path d="M2 2 L11 2 L11 9 L16 9 L16 16 L2 16 Z" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
function PolyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <polygon points="2,9 7,2 16,5 15,15 5,16" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
