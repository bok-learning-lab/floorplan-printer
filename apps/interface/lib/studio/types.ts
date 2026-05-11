// Floorplan studio: shared types.
// All geometry stored in real-world inches. Pixel space comes via calibration.

export type Point = { x: number; y: number };

export type Transform = {
  x: number;
  y: number;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
};

export type ShapeType = "rect" | "lshape" | "polygon";

export type ShapeMeta =
  | { kind: "rect"; w: number; h: number }
  | { kind: "lshape"; outerW: number; outerH: number; notchW: number; notchH: number }
  | null;

export type Shape = {
  id: string;
  letter: string;
  type: ShapeType;
  vertices: Point[];
  transform: Transform;
  name: string;
  color: string;
  meta: ShapeMeta;
  // Shapes sharing a non-null groupId move/rotate/flip together.
  groupId?: string | null;
};

export type Calibration = {
  pxPerInch: number;
  p1: Point;
  p2: Point;
  refInches: number;
};

export type FloorPlanImage = {
  src: string;
  width: number;
  height: number;
  label?: string;
};

export type ToolMode =
  | "select"
  | "pan"
  | "calibrate"
  | "polygon-draw";
