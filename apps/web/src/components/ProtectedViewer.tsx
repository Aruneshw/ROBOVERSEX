"use client";

import React, { useState, useEffect } from "react";
import { Eye, EyeOff } from "lucide-react";
import { DynamicWatermark } from "./DynamicWatermark";

interface ProtectedViewerProps {
  children: React.ReactNode;
  identifier?: string;
  requireHoverToView?: boolean;
}

export function ProtectedViewer({ children, identifier, requireHoverToView = false }: ProtectedViewerProps) {
  const [isVisible, setIsVisible] = useState(!requireHoverToView);
  const [isHovering, setIsHovering] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setPageVisible(!document.hidden);
    };
    
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  const shouldShowContent = pageVisible && (!requireHoverToView || isHovering);

  return (
    <div 
      className="relative w-full rounded-xl overflow-hidden border border-slate-800 bg-[#0a0f1c] select-none"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onContextMenu={(e) => e.preventDefault()} // Disable right click
      onDragStart={(e) => e.preventDefault()} // Disable dragging
    >
      <DynamicWatermark identifier={identifier} />

      {!shouldShowContent && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-md text-slate-300">
          <EyeOff className="w-12 h-12 mb-4 opacity-50" />
          <h3 className="font-bold text-lg">Protected Content</h3>
          <p className="text-sm opacity-60">
            {!pageVisible ? "Tab is not focused" : "Hover to view"}
          </p>
        </div>
      )}

      <div className={`transition-all duration-300 ${shouldShowContent ? "opacity-100 filter-none" : "opacity-0 blur-md pointer-events-none"}`}>
        {children}
      </div>
    </div>
  );
}
