"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { CatalogItem } from "@/lib/printed/types";
import { uid } from "@/lib/studio/geometry";
import { CalibrationCanvas } from "./CalibrationCanvas";
import { CatalogPanel } from "./CatalogPanel";
import { PrintDocument } from "./PrintDocument";

const STORAGE_KEY = "footprint-print-kit-v1";

const DEFAULT_PLAN = {
  src: "/floorplan/floorplan-blueprint.png",
  width: 894,
  height: 800,
  label: "50 CHURCH · 3F · RM 308",
};

type Calibration = {
  pxPerInch: number;
  refInches: number;
  p1: { x: number; y: number };
  p2: { x: number; y: number };
};

export default function PrintedStudio() {
  const [floorPlan, setFloorPlan] = useState(DEFAULT_PLAN);
  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>(defaultCatalog());
  const [calibrating, setCalibrating] = useState(false);
  const [printing, setPrinting] = useState(false);

  const planInputRef = useRef<HTMLInputElement | null>(null);

  // hydrate
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const j = JSON.parse(raw);
      if (j.floorPlan) setFloorPlan(j.floorPlan);
      if (j.calibration) setCalibration(j.calibration);
      if (Array.isArray(j.catalog)) setCatalog(j.catalog);
    } catch {}
  }, []);

  // persist
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ floorPlan, calibration, catalog })
      );
    } catch {}
  }, [floorPlan, calibration, catalog]);

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
        setCalibration(null);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(f);
    e.target.value = "";
  }

  function onPrint() {
    if (!calibration) return;
    setPrinting(true);
    setTimeout(() => {
      window.print();
      setTimeout(() => setPrinting(false), 800);
    }, 250);
  }

  function onAddItem(item: CatalogItem) {
    setCatalog((prev) => [...prev, item]);
  }
  function onUpdateItem(id: string, patch: Partial<CatalogItem>) {
    setCatalog((prev) =>
      prev.map((it) => (it.id === id ? ({ ...it, ...patch } as CatalogItem) : it))
    );
  }
  function onRemoveItem(id: string) {
    setCatalog((prev) => prev.filter((it) => it.id !== id));
  }

  return (
    <div className={`studio printed-studio ${printing ? "is-printing" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-head">
          <div className="titleblock">
            <div className="brand-line" />
            <div className="brand-row">
              <div className="brand">FOOTPRINT</div>
              <div className="brand-sub">PRINT KIT</div>
            </div>
            <div className="meta-row">
              <div>
                <span className="meta-label">scale</span> <span className="meta-val">1&quot; PAPER = 1&apos; REAL</span>
              </div>
              <div>
                <span className="meta-label">sheet</span> <span className="meta-val">{floorPlan.label}</span>
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <Link href="/" className="btn btn--ghost btn--small">
                ← back to chooser
              </Link>
            </div>
          </div>
        </div>

        <div className="sidebar-body">
          {!calibration && (
            <div className="callout">
              <div className="callout-label">⌖ start here</div>
              <div className="callout-body">
                Click two points on the floor plan you know the real-world distance between.
                That sets the scale so every printed page comes out at 1 inch = 1 foot.
              </div>
              <button className="btn btn--primary" onClick={() => setCalibrating(true)}>
                calibrate scale →
              </button>
              <div className="callout-hint">tip · pick a wall you already know the length of</div>
            </div>
          )}

          {calibration && (
            <CatalogPanel
              catalog={catalog}
              onAdd={onAddItem}
              onUpdate={onUpdateItem}
              onRemove={onRemoveItem}
            />
          )}

          <section className="section">
            <div className="section-label">
              <span>floor plan</span>
              <div className="section-rule" />
            </div>
            <div className="section-body">
              <div className="form-actions" style={{ justifyContent: "stretch" }}>
                <button className="btn btn--ghost" onClick={() => setCalibrating(true)} style={{ flex: 1 }}>
                  re-calibrate
                </button>
                <button className="btn btn--ghost" onClick={onUploadFloorPlan} style={{ flex: 1 }}>
                  upload plan
                </button>
              </div>
            </div>
          </section>
        </div>

        <div className="sidebar-foot">
          <div className="foot-buttons">
            <button
              className="btn btn--primary"
              onClick={onPrint}
              disabled={!calibration || catalog.length === 0}
              title={!calibration ? "calibrate first" : catalog.length === 0 ? "add a shape" : ""}
            >
              ⎙ generate print
            </button>
          </div>
          <div className="foot-stamp">DRAWN BY · USER &nbsp;·&nbsp; FOR CUT-AND-TAPE &nbsp;·&nbsp; 1&quot; = 1&apos;</div>
        </div>
      </aside>

      <main className="main">
        <CalibrationCanvas
          floorPlan={floorPlan}
          calibration={calibration}
          isCalibrating={calibrating}
          onCalibrate={(c) => {
            setCalibration(c);
            setCalibrating(false);
          }}
          onCancel={() => setCalibrating(false)}
        />
      </main>

      {printing && calibration && (
        <PrintDocument
          floorPlan={floorPlan}
          calibration={calibration}
          catalog={catalog}
        />
      )}

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

function defaultCatalog(): CatalogItem[] {
  return [
    { id: uid(), kind: "rect", prefix: "Chair", qty: 4, width: 24, depth: 24 },
    { id: uid(), kind: "rect", prefix: "Table", qty: 1, width: 72, depth: 36 },
  ];
}
