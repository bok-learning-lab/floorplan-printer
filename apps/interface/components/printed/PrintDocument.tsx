"use client";

import { useMemo } from "react";
import type { CatalogItem } from "@/lib/printed/types";
import { expandCatalog, packShapes, type Placement } from "@/lib/printed/packing";

// US Letter portrait at 1in:1ft scale.
const PAGE_W_IN = 8.5;
const PAGE_H_IN = 11;
const MARGIN_IN = 0.5;
const OVERLAP_IN = 0.5; // tape overlap region

// Usable area on each printed page (paper inches).
const USABLE_W_IN = PAGE_W_IN - 2 * MARGIN_IN; // 7.5
const USABLE_H_IN = PAGE_H_IN - 2 * MARGIN_IN; // 10

// Real feet per page step (accounting for overlap on next tile).
const STEP_X_FT = USABLE_W_IN - OVERLAP_IN; // 7.0
const STEP_Y_FT = USABLE_H_IN - OVERLAP_IN; // 9.5

type Calibration = {
  pxPerInch: number;
  refInches: number;
  p1: { x: number; y: number };
  p2: { x: number; y: number };
};

type Props = {
  floorPlan: { src: string; width: number; height: number; label?: string };
  calibration: Calibration;
  catalog: CatalogItem[];
};

export function PrintDocument({ floorPlan, calibration, catalog }: Props) {
  const ppi = calibration.pxPerInch;
  // Real-world dimensions (in feet) covered by the floor plan image.
  const realWidthFt = floorPlan.width / ppi / 12;
  const realHeightFt = floorPlan.height / ppi / 12;

  // Image dimensions expressed in PAPER inches at print scale (1 in paper = 1 ft real).
  const imgWidthPaperIn = realWidthFt; // 1 ft real → 1 in paper
  const imgHeightPaperIn = realHeightFt;

  const tilesX = Math.max(1, Math.ceil((realWidthFt - OVERLAP_IN) / STEP_X_FT) || 1);
  const tilesY = Math.max(1, Math.ceil((realHeightFt - OVERLAP_IN) / STEP_Y_FT) || 1);

  // ── shape pages ───────────────────────────────────────────────────────
  const packedPages = useMemo(() => {
    const shapes = expandCatalog(catalog);
    return packShapes(shapes, USABLE_W_IN, USABLE_H_IN);
  }, [catalog]);

  const totalShapeCount = useMemo(() => expandCatalog(catalog).length, [catalog]);
  const totalSheets = tilesX * tilesY + packedPages.length;

  // Render tile pages
  const tilePages: React.ReactElement[] = [];
  let tileNum = 1;
  for (let j = 0; j < tilesY; j++) {
    for (let i = 0; i < tilesX; i++) {
      tilePages.push(
        <TilePage
          key={`tile-${i}-${j}`}
          i={i}
          j={j}
          tilesX={tilesX}
          tilesY={tilesY}
          imgSrc={floorPlan.src}
          imgWidthPaperIn={imgWidthPaperIn}
          imgHeightPaperIn={imgHeightPaperIn}
          label={floorPlan.label || "Floor Plan"}
          tileNum={tileNum++}
          totalSheets={totalSheets}
        />
      );
    }
  }

  return (
    <div className="print-doc">
      <div className="print-page print-cover">
        <div className="cover-rule" />
        <div className="cover-title">FOOTPRINT PRINT KIT</div>
        <div className="cover-sub">{floorPlan.label}</div>
        <dl className="cover-meta">
          <dt>SCALE</dt>
          <dd>1&quot; paper = 1&apos; real (1:12)</dd>
          <dt>PLAN SIZE</dt>
          <dd>
            {fmt(realWidthFt)}&apos; × {fmt(realHeightFt)}&apos;
          </dd>
          <dt>PLAN TILES</dt>
          <dd>
            {tilesX} × {tilesY} = {tilesX * tilesY} sheet{tilesX * tilesY === 1 ? "" : "s"}
          </dd>
          <dt>SHAPE PAGES</dt>
          <dd>
            {packedPages.length} sheet{packedPages.length === 1 ? "" : "s"} · {totalShapeCount} cut-outs
          </dd>
          <dt>OVERLAP</dt>
          <dd>{OVERLAP_IN}&quot; on the right and bottom of every tile — line up the dashed strip on the next sheet</dd>
          <dt>PRINTED</dt>
          <dd>{new Date().toLocaleString()}</dd>
        </dl>
        <ol className="cover-steps">
          <li>
            <b>Print this document at 100% scale.</b> Do NOT use &quot;fit to page&quot; — that breaks the 1&quot;:1&apos; ratio.
          </li>
          <li>
            <b>Verify scale on the first plan sheet</b> by measuring the calibration reference line printed in the corner.
          </li>
          <li>Cut each plan tile along the solid border. Overlap the dashed strip with the next tile and tape.</li>
          <li>Cut out each shape along its solid border. The label stays on the cut-out.</li>
          <li>Arrange the cut-outs on the assembled floor plan.</li>
        </ol>
        <div className="cover-stamp">FOOTPRINT STUDIO &nbsp;·&nbsp; CUT &amp; TAPE EDITION</div>
      </div>

      {tilePages}

      {packedPages.map((pg, idx) => (
        <ShapePage
          key={`shape-${idx}`}
          page={pg}
          pageIndex={idx}
          totalShapePages={packedPages.length}
          sheetNum={tilesX * tilesY + idx + 1}
          totalSheets={totalSheets}
        />
      ))}
    </div>
  );
}

function fmt(n: number): string {
  return Math.round(n * 10) / 10 + "";
}

// ── One plan tile ────────────────────────────────────────────────────────
function TilePage({
  i,
  j,
  tilesX,
  tilesY,
  imgSrc,
  imgWidthPaperIn,
  imgHeightPaperIn,
  label,
  tileNum,
  totalSheets,
}: {
  i: number;
  j: number;
  tilesX: number;
  tilesY: number;
  imgSrc: string;
  imgWidthPaperIn: number;
  imgHeightPaperIn: number;
  label: string;
  tileNum: number;
  totalSheets: number;
}) {
  // The image is drawn at imgWidthPaperIn × imgHeightPaperIn (in inches),
  // offset so this tile shows the right chunk.
  // Tile (i,j) covers from x = i*STEP_X_FT to x + USABLE_W_IN (real feet = paper inches).
  const offsetX = -i * STEP_X_FT;
  const offsetY = -j * STEP_Y_FT;
  const isLastCol = i === tilesX - 1;
  const isLastRow = j === tilesY - 1;

  return (
    <div className="print-page print-tile">
      <div className="page-header">
        <div>
          <b>{label}</b>
          <span className="page-header-meta"> · tile {i + 1}/{tilesX} × {j + 1}/{tilesY}</span>
        </div>
        <div className="page-header-meta">
          sheet {tileNum} / {totalSheets} · 1&quot; = 1&apos;
        </div>
      </div>

      <div className="page-canvas">
        <svg
          width={`${USABLE_W_IN}in`}
          height={`${USABLE_H_IN}in`}
          viewBox={`0 0 ${USABLE_W_IN} ${USABLE_H_IN}`}
          preserveAspectRatio="xMinYMin meet"
        >
          {/* paper background */}
          <rect x={0} y={0} width={USABLE_W_IN} height={USABLE_H_IN} fill="white" />

          {/* 1-ft grid for reference (light gray) */}
          <g opacity={0.18}>
            {Array.from({ length: Math.floor(USABLE_W_IN) + 1 }).map((_, k) => (
              <line
                key={`vx${k}`}
                x1={k}
                y1={0}
                x2={k}
                y2={USABLE_H_IN}
                stroke="#888"
                strokeWidth={0.005}
              />
            ))}
            {Array.from({ length: Math.floor(USABLE_H_IN) + 1 }).map((_, k) => (
              <line
                key={`hy${k}`}
                x1={0}
                y1={k}
                x2={USABLE_W_IN}
                y2={k}
                stroke="#888"
                strokeWidth={0.005}
              />
            ))}
          </g>

          {/* the floor plan slice, clipped to the page canvas */}
          <defs>
            <clipPath id={`clip-${i}-${j}`}>
              <rect x={0} y={0} width={USABLE_W_IN} height={USABLE_H_IN} />
            </clipPath>
          </defs>
          <g clipPath={`url(#clip-${i}-${j})`}>
            {/* invert the white-on-blue source back to dark-on-white for print legibility */}
            <image
              href={imgSrc}
              x={offsetX}
              y={offsetY}
              width={imgWidthPaperIn}
              height={imgHeightPaperIn}
              style={{ filter: "invert(1)" }}
            />
          </g>

          {/* solid cut/page border */}
          <rect
            x={0}
            y={0}
            width={USABLE_W_IN}
            height={USABLE_H_IN}
            fill="none"
            stroke="#111"
            strokeWidth={0.012}
          />

          {/* overlap strip indicators */}
          {!isLastCol && (
            <line
              x1={USABLE_W_IN - OVERLAP_IN}
              y1={0}
              x2={USABLE_W_IN - OVERLAP_IN}
              y2={USABLE_H_IN}
              stroke="#999"
              strokeWidth={0.008}
              strokeDasharray="0.08 0.06"
            />
          )}
          {!isLastRow && (
            <line
              x1={0}
              y1={USABLE_H_IN - OVERLAP_IN}
              x2={USABLE_W_IN}
              y2={USABLE_H_IN - OVERLAP_IN}
              stroke="#999"
              strokeWidth={0.008}
              strokeDasharray="0.08 0.06"
            />
          )}

          {/* corner registration ticks */}
          <Crosshair x={0} y={0} />
          <Crosshair x={USABLE_W_IN} y={0} />
          <Crosshair x={0} y={USABLE_H_IN} />
          <Crosshair x={USABLE_W_IN} y={USABLE_H_IN} />

          {/* sheet coordinates */}
          <text
            x={0.08}
            y={USABLE_H_IN - 0.08}
            fontSize={0.12}
            fontFamily="Helvetica, Arial, sans-serif"
            fill="#666"
          >
            [{i + 1}, {j + 1}]
          </text>
        </svg>
      </div>

      <div className="page-foot">
        {!isLastCol && (
          <span>
            <b>→</b> tape onto tile [{i + 2}, {j + 1}]
          </span>
        )}
        {!isLastRow && (
          <span>
            <b>↓</b> tape onto tile [{i + 1}, {j + 2}]
          </span>
        )}
      </div>
    </div>
  );
}

// ── One shape page ───────────────────────────────────────────────────────
function ShapePage({
  page,
  pageIndex,
  totalShapePages,
  sheetNum,
  totalSheets,
}: {
  page: { placements: Placement[] };
  pageIndex: number;
  totalShapePages: number;
  sheetNum: number;
  totalSheets: number;
}) {
  return (
    <div className="print-page print-shapes">
      <div className="page-header">
        <div>
          <b>CUT-OUTS</b>
          <span className="page-header-meta">
            {" "}
            · page {pageIndex + 1} of {totalShapePages}
          </span>
        </div>
        <div className="page-header-meta">
          sheet {sheetNum} / {totalSheets} · 1&quot; = 1&apos;
        </div>
      </div>
      <div className="page-canvas">
        <svg
          width={`${USABLE_W_IN}in`}
          height={`${USABLE_H_IN}in`}
          viewBox={`0 0 ${USABLE_W_IN} ${USABLE_H_IN}`}
          preserveAspectRatio="xMinYMin meet"
        >
          <rect x={0} y={0} width={USABLE_W_IN} height={USABLE_H_IN} fill="white" />
          {page.placements.map((pl, k) => (
            <ShapeBlock key={k} placement={pl} />
          ))}
          <rect
            x={0}
            y={0}
            width={USABLE_W_IN}
            height={USABLE_H_IN}
            fill="none"
            stroke="#bbb"
            strokeWidth={0.005}
            strokeDasharray="0.06 0.04"
          />
        </svg>
      </div>
      <div className="page-foot">
        <span>cut along the solid line · label stays on the cut-out</span>
      </div>
    </div>
  );
}

function ShapeBlock({ placement }: { placement: Placement }) {
  const { shape, pageX, pageY, pageWidth, pageHeight } = placement;

  // Build the path for the cut outline (rect or L-shape).
  let pathD: string;
  if (shape.kind === "rect") {
    pathD = `M ${pageX} ${pageY} h ${pageWidth} v ${pageHeight} h ${-pageWidth} Z`;
  } else {
    // L-shape: notch removed from top-right of the bbox (matches lib/studio/geometry).
    const nw = (shape.notchWIn || 0) / 12;
    const nh = (shape.notchHIn || 0) / 12;
    pathD = [
      `M ${pageX} ${pageY}`,
      `h ${pageWidth - nw}`,
      `v ${nh}`,
      `h ${nw}`,
      `v ${pageHeight - nh}`,
      `h ${-pageWidth}`,
      `Z`,
    ].join(" ");
  }

  // Label position: centered in the bbox (good enough; L-shape label may sit near the notch).
  const labelX = pageX + pageWidth / 2;
  const labelY = pageY + pageHeight / 2;
  const dimsLine = `${fmtIn(shape.widthIn)} × ${fmtIn(shape.depthIn)}`;

  // Font sizes in SVG inch units. Cap at 0.16 in (≈11 pt) for tiny shapes.
  const labelSize = Math.min(0.18, Math.max(0.08, Math.min(pageWidth, pageHeight) * 0.18));
  const dimSize = labelSize * 0.6;

  return (
    <g>
      <path d={pathD} fill="white" stroke="#111" strokeWidth={0.012} />
      <text
        x={labelX}
        y={labelY - dimSize * 0.6}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={labelSize}
        fontFamily="'Special Elite', 'Courier New', monospace"
        fontWeight={700}
        fill="#111"
      >
        {shape.label}
      </text>
      <text
        x={labelX}
        y={labelY + labelSize * 0.6}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={dimSize}
        fontFamily="Helvetica, Arial, sans-serif"
        fill="#555"
      >
        {dimsLine}
      </text>
    </g>
  );
}

function Crosshair({ x, y }: { x: number; y: number }) {
  const r = 0.12;
  return (
    <g stroke="#111" strokeWidth={0.012} fill="none">
      <line x1={x - r} y1={y} x2={x + r} y2={y} />
      <line x1={x} y1={y - r} x2={x} y2={y + r} />
    </g>
  );
}

function fmtIn(inches: number): string {
  const ft = Math.floor(inches / 12);
  const inRem = Math.round(inches - ft * 12);
  if (inRem === 0) return `${ft}'`;
  if (ft === 0) return `${inRem}"`;
  return `${ft}' ${inRem}"`;
}
