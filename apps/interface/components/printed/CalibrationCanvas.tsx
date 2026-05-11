"use client";

import { useEffect, useRef, useState } from "react";
import { parseFeetInches, formatFeetInches } from "@/lib/studio/units";

type Point = { x: number; y: number };

type Calibration = {
  pxPerInch: number;
  refInches: number;
  p1: Point;
  p2: Point;
};

type Props = {
  floorPlan: { src: string; width: number; height: number; label?: string };
  calibration: Calibration | null;
  isCalibrating: boolean;
  onCalibrate: (c: Calibration) => void;
  onCancel: () => void;
};

type CalibState =
  | null
  | { stage: "p2"; p1: Point; p2: null }
  | { stage: "distance"; p1: Point; p2: Point };

export function CalibrationCanvas({ floorPlan, calibration, isCalibrating, onCalibrate, onCancel }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [state, setState] = useState<CalibState>(null);
  const [hover, setHover] = useState<Point | null>(null);
  const [distance, setDistance] = useState("16'");

  useEffect(() => {
    if (!isCalibrating) setState(null);
  }, [isCalibrating]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!isCalibrating) return;
      if (e.key === "Escape") {
        setState(null);
        onCancel();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isCalibrating, onCancel]);

  function svgPointFromEvent(e: React.PointerEvent | React.MouseEvent): Point {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (!isCalibrating) return;
    const p = svgPointFromEvent(e);
    if (!state || state.stage === "distance") {
      setState({ stage: "p2", p1: p, p2: null });
    } else if (state.stage === "p2") {
      setState({ stage: "distance", p1: state.p1, p2: p });
    }
  }
  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    setHover(svgPointFromEvent(e));
  }

  function confirm() {
    if (!state || state.stage !== "distance") return;
    const inches = parseFeetInches(distance);
    if (!inches || inches <= 0) return;
    const dx = state.p2.x - state.p1.x;
    const dy = state.p2.y - state.p1.y;
    const distPx = Math.sqrt(dx * dx + dy * dy);
    onCalibrate({ pxPerInch: distPx / inches, refInches: inches, p1: state.p1, p2: state.p2 });
    setState(null);
  }

  // Render the existing calibration line if present (for reference after calibration is set)
  const showRef = !isCalibrating && calibration;

  return (
    <div className="canvas-wrap" style={{ cursor: isCalibrating ? "crosshair" : "default" }}>
      <svg
        ref={svgRef}
        className="canvas-svg"
        viewBox={`0 0 ${floorPlan.width} ${floorPlan.height}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
      >
        <defs>
          <filter id="paper-print" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves={2} seed={7} />
            <feColorMatrix values="0 0 0 0 1   0 0 0 0 1   0 0 0 0 1   0 0 0 0.06 0" />
            <feComposite in2="SourceGraphic" operator="in" />
          </filter>
          <linearGradient id="blueprintBgPrint" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0a2a47" />
            <stop offset="100%" stopColor="#0e3a63" />
          </linearGradient>
        </defs>

        <rect x={0} y={0} width={floorPlan.width} height={floorPlan.height} fill="url(#blueprintBgPrint)" />
        <rect x={0} y={0} width={floorPlan.width} height={floorPlan.height} filter="url(#paper-print)" pointerEvents="none" />

        <image href={floorPlan.src} x={0} y={0} width={floorPlan.width} height={floorPlan.height} opacity={0.92} pointerEvents="none" />

        {showRef && (
          <g pointerEvents="none" opacity={0.65}>
            <line
              x1={calibration.p1.x}
              y1={calibration.p1.y}
              x2={calibration.p2.x}
              y2={calibration.p2.y}
              stroke="#ffcc66"
              strokeWidth={1.2}
              strokeDasharray="4 3"
            />
            <circle cx={calibration.p1.x} cy={calibration.p1.y} r={4} fill="#ffcc66" />
            <circle cx={calibration.p2.x} cy={calibration.p2.y} r={4} fill="#ffcc66" />
          </g>
        )}

        {isCalibrating && state?.stage === "p2" && state.p1 && (
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
        )}
        {isCalibrating && state?.stage === "distance" && (
          <g pointerEvents="none">
            <line
              x1={state.p1.x}
              y1={state.p1.y}
              x2={state.p2.x}
              y2={state.p2.y}
              stroke="#ffcc66"
              strokeWidth={1.8}
            />
            <circle cx={state.p1.x} cy={state.p1.y} r={5} fill="#ffcc66" />
            <circle cx={state.p2.x} cy={state.p2.y} r={5} fill="#ffcc66" />
          </g>
        )}
      </svg>

      <div className="canvas-hud">
        <div className="hud-chip">
          {calibration ? (
            <>
              calibrated&nbsp;·&nbsp;<b>1&quot; paper = 1&apos; real</b>&nbsp;·&nbsp;ref{" "}
              <b>{formatFeetInches(calibration.refInches, { compact: true })}</b>
            </>
          ) : (
            <>not calibrated</>
          )}
        </div>
        {isCalibrating && !state && (
          <div className="hud-chip hud-chip--accent">click the first point of a known distance</div>
        )}
        {isCalibrating && state?.stage === "p2" && (
          <div className="hud-chip hud-chip--accent">click the second point</div>
        )}
        {isCalibrating && state?.stage === "distance" && (
          <div className="hud-chip hud-chip--input">
            <span>real distance between points</span>
            <input
              type="text"
              value={distance}
              autoFocus
              onChange={(e) => setDistance(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirm();
                else if (e.key === "Escape") {
                  setState(null);
                  onCancel();
                }
              }}
              placeholder={`16' or 192" or 16ft`}
            />
            <button onClick={confirm}>set</button>
            <button
              onClick={() => {
                setState(null);
                onCancel();
              }}
            >
              cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
