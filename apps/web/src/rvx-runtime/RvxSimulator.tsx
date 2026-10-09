"use client";

import { useEffect, useRef } from "react";
import { rvx } from "./runtime";

export type RvxSimulatorProps = { className?: string; style?: React.CSSProperties };

/** Turtlesim viewport: a square 500×500 canvas, letterboxed and centred in its parent. */
export function RvxSimulator({ className, style }: RvxSimulatorProps) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = box.current, cv = canvas.current;
    if (!el || !cv) return;
    const detach = rvx.attachCanvas(cv);
    const size = () => {
      const s = Math.max(0, Math.floor(Math.min(el.clientWidth, el.clientHeight)));
      cv.style.width = cv.style.height = `${s}px`;
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(el);
    return () => { ro.disconnect(); detach(); };
  }, []);

  return (
    <div
      ref={box}
      className={className}
      style={{ width: "100%", height: "100%", minHeight: 160, display: "flex", alignItems: "center", justifyContent: "center", background: "#4556FF", overflow: "hidden", ...style }}
    >
      <canvas ref={canvas} aria-label="Turtlesim simulation" style={{ display: "block", imageRendering: "auto" }} />
    </div>
  );
}
