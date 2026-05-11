import type { CatalogItem } from "./types";

// One concrete shape to print: dimensions in real inches + label.
export type PackedShape = {
  id: string;          // e.g. "Chair-3"
  label: string;
  kind: "rect" | "lshape";
  widthIn: number;     // real inches (bbox)
  depthIn: number;     // real inches (bbox)
  notchWIn?: number;
  notchHIn?: number;
};

export type Placement = {
  shape: PackedShape;
  // Position on the page in PAPER inches (1in paper = 1ft real, so widthIn / 12 inches paper).
  pageX: number;
  pageY: number;
  pageWidth: number;   // paper inches
  pageHeight: number;  // paper inches
};

export type PackedPage = {
  placements: Placement[];
};

const GUTTER_IN = 0.25; // 0.25" paper gutter between shapes

// Expand a catalog item to its individual shapes.
export function expandCatalog(items: CatalogItem[]): PackedShape[] {
  const out: PackedShape[] = [];
  for (const it of items) {
    const baseLabel = it.prefix.trim() || (it.kind === "rect" ? "Rect" : "L");
    for (let i = 1; i <= it.qty; i++) {
      const id = `${baseLabel}-${i}`;
      if (it.kind === "rect") {
        out.push({ id, label: id, kind: "rect", widthIn: it.width, depthIn: it.depth });
      } else {
        out.push({
          id,
          label: id,
          kind: "lshape",
          widthIn: it.outerW,
          depthIn: it.outerH,
          notchWIn: it.notchW,
          notchHIn: it.notchH,
        });
      }
    }
  }
  return out;
}

// Greedy left-to-right top-to-bottom pack on pages sized in PAPER inches.
// inchesPerFoot lets the caller supply the print scale (default 1 in paper / 1 ft real).
export function packShapes(
  shapes: PackedShape[],
  pageWidthIn: number,
  pageHeightIn: number
): PackedPage[] {
  const pages: PackedPage[] = [];
  let current: PackedPage = { placements: [] };
  let curX = 0;
  let curY = 0;
  let rowHeight = 0;

  function startNewPage() {
    if (current.placements.length > 0) pages.push(current);
    current = { placements: [] };
    curX = 0;
    curY = 0;
    rowHeight = 0;
  }

  // sort by paper-height desc so tallest items lead each row (improves packing slightly)
  const sorted = [...shapes].sort((a, b) => b.depthIn - a.depthIn);

  for (const s of sorted) {
    const wPaper = s.widthIn / 12; // 1 ft real = 1 in paper, so /12 inches paper
    const hPaper = s.depthIn / 12;

    // If shape is larger than a single page, skip and warn via label trick — caller can
    // detect by absence in placements. Practical furniture sizes shouldn't hit this.
    if (wPaper > pageWidthIn || hPaper > pageHeightIn) {
      continue;
    }

    // wrap row
    if (curX + wPaper > pageWidthIn) {
      curX = 0;
      curY += rowHeight + GUTTER_IN;
      rowHeight = 0;
    }
    // wrap page
    if (curY + hPaper > pageHeightIn) {
      startNewPage();
    }

    current.placements.push({
      shape: s,
      pageX: curX,
      pageY: curY,
      pageWidth: wPaper,
      pageHeight: hPaper,
    });
    curX += wPaper + GUTTER_IN;
    rowHeight = Math.max(rowHeight, hPaper);
  }

  if (current.placements.length > 0) pages.push(current);
  return pages;
}
