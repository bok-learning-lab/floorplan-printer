// Print-kit catalog: rectangular and L-shape items, sized in real-world inches,
// with a label prefix and a quantity. Each item expands to `qty` numbered shapes
// at print time (e.g. "Chair-1", "Chair-2", …).

export type CatalogItem =
  | {
      id: string;
      kind: "rect";
      prefix: string;
      qty: number;
      width: number; // real inches
      depth: number; // real inches
    }
  | {
      id: string;
      kind: "lshape";
      prefix: string;
      qty: number;
      outerW: number;
      outerH: number;
      notchW: number;
      notchH: number;
    };

export type PrintedState = {
  calibration: { pxPerInch: number; refInches: number; p1: { x: number; y: number }; p2: { x: number; y: number } } | null;
  catalog: CatalogItem[];
  floorPlanSrc: string;
  floorPlanWidth: number; // image pixels
  floorPlanHeight: number;
  floorPlanLabel: string;
};
