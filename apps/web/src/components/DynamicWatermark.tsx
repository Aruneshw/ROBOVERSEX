"use client";

import React, { useEffect, useState } from "react";

interface DynamicWatermarkProps {
  identifier?: string;
}

export function DynamicWatermark({ identifier = "user-session-id" }: DynamicWatermarkProps) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    // Slowly move the watermark to prevent easy cropping
    const interval = setInterval(() => {
      setOffset((prev) => ({
        x: (prev.x + 0.5) % 300,
        y: (prev.y + 0.5) % 200,
      }));
    }, 50);
    return () => clearInterval(interval);
  }, []);

  const timestamp = new Date().toISOString().split("T")[0];
  const watermarkText = `${identifier} | ${timestamp}`;

  return (
    <div className="pointer-events-none fixed inset-0 z-[9998] overflow-hidden opacity-[0.04] mix-blend-difference select-none">
      <svg width="100%" height="100%">
        <defs>
          <pattern
            id="watermark-pattern"
            x={offset.x}
            y={offset.y}
            width="300"
            height="200"
            patternUnits="userSpaceOnUse"
          >
            <text
              x="50%"
              y="50%"
              dominantBaseline="middle"
              textAnchor="middle"
              transform="rotate(-30 150 100)"
              fill="white"
              fontSize="18"
              fontWeight="bold"
              style={{ textShadow: "1px 1px 2px rgba(0,0,0,0.8)" }}
            >
              {watermarkText}
            </text>
          </pattern>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="url(#watermark-pattern)" />
      </svg>
    </div>
  );
}
