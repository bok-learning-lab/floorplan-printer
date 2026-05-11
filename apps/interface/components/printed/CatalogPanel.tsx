"use client";

import { useState } from "react";
import type { CatalogItem } from "@/lib/printed/types";
import { uid } from "@/lib/studio/geometry";
import { formatFeetInches, parseFeetInches } from "@/lib/studio/units";

// Limit per shape based on Letter portrait usable area at 1in:1ft scale
// (7.5in × 10in = 7.5ft × 10ft real). Larger shapes won't print on a single sheet.
const MAX_W_IN = 7.5 * 12;
const MAX_H_IN = 10 * 12;

type Props = {
  catalog: CatalogItem[];
  onAdd: (item: CatalogItem) => void;
  onUpdate: (id: string, patch: Partial<CatalogItem>) => void;
  onRemove: (id: string) => void;
};

export function CatalogPanel({ catalog, onAdd, onUpdate, onRemove }: Props) {
  const [creating, setCreating] = useState<null | "rect" | "lshape">(null);

  return (
    <section className="section">
      <div className="section-label">
        <span>shape catalog · {catalog.length}</span>
        <div className="section-rule" />
      </div>
      <div className="section-body">
        <div className="shape-buttons">
          <button
            className={`shape-btn ${creating === "rect" ? "is-active" : ""}`}
            onClick={() => setCreating((c) => (c === "rect" ? null : "rect"))}
          >
            <RectIcon /> rectangle
          </button>
          <button
            className={`shape-btn ${creating === "lshape" ? "is-active" : ""}`}
            onClick={() => setCreating((c) => (c === "lshape" ? null : "lshape"))}
          >
            <LIcon /> L-shape
          </button>
        </div>

        {creating === "rect" && (
          <RectForm
            onCreate={(spec) => {
              onAdd(spec);
              setCreating(null);
            }}
            onCancel={() => setCreating(null)}
          />
        )}
        {creating === "lshape" && (
          <LForm
            onCreate={(spec) => {
              onAdd(spec);
              setCreating(null);
            }}
            onCancel={() => setCreating(null)}
          />
        )}

        <div className="object-list" style={{ marginTop: 10 }}>
          {catalog.length === 0 && (
            <div className="empty">no shapes yet — add a rectangle or L-shape above</div>
          )}
          {catalog.map((it) => (
            <CatalogRow key={it.id} item={it} onUpdate={(patch) => onUpdate(it.id, patch)} onRemove={() => onRemove(it.id)} />
          ))}
        </div>

        {catalog.some((it) =>
          it.kind === "rect"
            ? it.width > MAX_W_IN || it.depth > MAX_H_IN
            : it.outerW > MAX_W_IN || it.outerH > MAX_H_IN
        ) && (
          <div className="form-hint" style={{ marginTop: 8, color: "#ff7a7a" }}>
            ⚠ some shapes are larger than a single sheet (max {MAX_W_IN / 12}&apos; × {MAX_H_IN / 12}&apos;). They&apos;ll be skipped at print.
          </div>
        )}
      </div>
    </section>
  );
}

function CatalogRow({
  item,
  onUpdate,
  onRemove,
}: {
  item: CatalogItem;
  onUpdate: (patch: Partial<CatalogItem>) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const dims =
    item.kind === "rect"
      ? `${formatFeetInches(item.width, { compact: true })} × ${formatFeetInches(item.depth, { compact: true })}`
      : `L · ${formatFeetInches(item.outerW, { compact: true })} × ${formatFeetInches(item.outerH, { compact: true })}`;

  return (
    <div className="object-row">
      <div className="object-letter" style={{ background: "#9ec3e8" }}>
        ×{item.qty}
      </div>
      <div className="object-info" onClick={() => setOpen((o) => !o)} style={{ cursor: "pointer" }}>
        <div className="object-name">{item.prefix || "Untitled"}</div>
        <div className="object-dims">{dims}</div>
      </div>
      <button className="object-edit" onClick={() => setOpen((o) => !o)} title="edit">
        ✎
      </button>
      <button className="object-edit" onClick={onRemove} title="remove">
        ✕
      </button>
      {open && (
        <div style={{ flexBasis: "100%", marginTop: 10 }}>
          <EditForm item={item} onSave={(patch) => onUpdate(patch)} onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

function EditForm({
  item,
  onSave,
  onClose,
}: {
  item: CatalogItem;
  onSave: (patch: Partial<CatalogItem>) => void;
  onClose: () => void;
}) {
  const [prefix, setPrefix] = useState(item.prefix);
  const [qty, setQty] = useState(String(item.qty));
  // Width / depth strings
  const [w, setW] = useState(formatFeetInches(item.kind === "rect" ? item.width : item.outerW, { compact: true }));
  const [d, setD] = useState(formatFeetInches(item.kind === "rect" ? item.depth : item.outerH, { compact: true }));
  const [nw, setNw] = useState(item.kind === "lshape" ? formatFeetInches(item.notchW, { compact: true }) : "");
  const [nh, setNh] = useState(item.kind === "lshape" ? formatFeetInches(item.notchH, { compact: true }) : "");

  function submit() {
    const wIn = parseFeetInches(w);
    const dIn = parseFeetInches(d);
    const q = Math.max(1, Math.min(99, parseInt(qty, 10) || 1));
    if (!wIn || !dIn) return;
    if (item.kind === "rect") {
      onSave({ prefix, qty: q, width: wIn, depth: dIn });
    } else {
      const nwIn = parseFeetInches(nw) || 0;
      const nhIn = parseFeetInches(nh) || 0;
      onSave({ prefix, qty: q, outerW: wIn, outerH: dIn, notchW: nwIn, notchH: nhIn });
    }
    onClose();
  }

  return (
    <div className="form" style={{ marginTop: 4 }}>
      <label className="diminput">
        <span className="diminput-label">label prefix</span>
        <input type="text" value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="e.g. Chair" />
      </label>
      <div className="form-row">
        <label className="diminput">
          <span className="diminput-label">{item.kind === "rect" ? "width" : "outer w"}</span>
          <input type="text" value={w} onChange={(e) => setW(e.target.value)} />
        </label>
        <label className="diminput">
          <span className="diminput-label">{item.kind === "rect" ? "depth" : "outer h"}</span>
          <input type="text" value={d} onChange={(e) => setD(e.target.value)} />
        </label>
      </div>
      {item.kind === "lshape" && (
        <div className="form-row">
          <label className="diminput">
            <span className="diminput-label">notch w</span>
            <input type="text" value={nw} onChange={(e) => setNw(e.target.value)} />
          </label>
          <label className="diminput">
            <span className="diminput-label">notch h</span>
            <input type="text" value={nh} onChange={(e) => setNh(e.target.value)} />
          </label>
        </div>
      )}
      <label className="diminput">
        <span className="diminput-label">quantity</span>
        <input type="number" min={1} max={99} value={qty} onChange={(e) => setQty(e.target.value)} />
      </label>
      <div className="form-actions">
        <button className="btn btn--ghost" onClick={onClose}>
          cancel
        </button>
        <button className="btn btn--primary" onClick={submit}>
          save
        </button>
      </div>
    </div>
  );
}

function RectForm({ onCreate, onCancel }: { onCreate: (item: CatalogItem) => void; onCancel: () => void }) {
  const [prefix, setPrefix] = useState("");
  const [w, setW] = useState(`2'`);
  const [d, setD] = useState(`2'`);
  const [qty, setQty] = useState("1");

  function submit() {
    const wIn = parseFeetInches(w);
    const dIn = parseFeetInches(d);
    const q = Math.max(1, Math.min(99, parseInt(qty, 10) || 1));
    if (!wIn || !dIn) return;
    onCreate({ id: uid(), kind: "rect", prefix: prefix.trim() || "Rect", qty: q, width: wIn, depth: dIn });
  }

  return (
    <div className="form" style={{ marginTop: 10 }}>
      <label className="diminput">
        <span className="diminput-label">label prefix</span>
        <input type="text" value={prefix} autoFocus onChange={(e) => setPrefix(e.target.value)} placeholder="e.g. Chair" />
      </label>
      <div className="form-row">
        <label className="diminput">
          <span className="diminput-label">width</span>
          <input type="text" value={w} onChange={(e) => setW(e.target.value)} placeholder={`e.g. 2' 6"`} />
        </label>
        <label className="diminput">
          <span className="diminput-label">depth</span>
          <input type="text" value={d} onChange={(e) => setD(e.target.value)} placeholder={`e.g. 2'`} />
        </label>
      </div>
      <label className="diminput">
        <span className="diminput-label">quantity</span>
        <input type="number" min={1} max={99} value={qty} onChange={(e) => setQty(e.target.value)} />
      </label>
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

function LForm({ onCreate, onCancel }: { onCreate: (item: CatalogItem) => void; onCancel: () => void }) {
  const [prefix, setPrefix] = useState("");
  const [ow, setOw] = useState(`7'`);
  const [oh, setOh] = useState(`5'`);
  const [nw, setNw] = useState(`3'`);
  const [nh, setNh] = useState(`3'`);
  const [qty, setQty] = useState("1");

  function submit() {
    const oW = parseFeetInches(ow);
    const oH = parseFeetInches(oh);
    const nW = parseFeetInches(nw);
    const nH = parseFeetInches(nh);
    const q = Math.max(1, Math.min(99, parseInt(qty, 10) || 1));
    if (!oW || !oH || !nW || !nH) return;
    if (nW >= oW || nH >= oH) return;
    onCreate({
      id: uid(),
      kind: "lshape",
      prefix: prefix.trim() || "L",
      qty: q,
      outerW: oW,
      outerH: oH,
      notchW: nW,
      notchH: nH,
    });
  }

  return (
    <div className="form" style={{ marginTop: 10 }}>
      <label className="diminput">
        <span className="diminput-label">label prefix</span>
        <input type="text" value={prefix} autoFocus onChange={(e) => setPrefix(e.target.value)} placeholder="e.g. Sofa" />
      </label>
      <div className="form-section-label">outer bbox</div>
      <div className="form-row">
        <label className="diminput">
          <span className="diminput-label">outer w</span>
          <input type="text" value={ow} onChange={(e) => setOw(e.target.value)} />
        </label>
        <label className="diminput">
          <span className="diminput-label">outer h</span>
          <input type="text" value={oh} onChange={(e) => setOh(e.target.value)} />
        </label>
      </div>
      <div className="form-section-label">notch (top-right)</div>
      <div className="form-row">
        <label className="diminput">
          <span className="diminput-label">notch w</span>
          <input type="text" value={nw} onChange={(e) => setNw(e.target.value)} />
        </label>
        <label className="diminput">
          <span className="diminput-label">notch h</span>
          <input type="text" value={nh} onChange={(e) => setNh(e.target.value)} />
        </label>
      </div>
      <label className="diminput">
        <span className="diminput-label">quantity</span>
        <input type="number" min={1} max={99} value={qty} onChange={(e) => setQty(e.target.value)} />
      </label>
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
