"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

export function MalpracticeGuard() {
  const [isMalpractice, setIsMalpractice] = useState(false);

  useEffect(() => {
    const triggerMalpractice = () => {
      // 1. Instantly hide the page content synchronously so the OS captures a black/blank screen
      let style = document.getElementById("anti-screenshot-style");
      if (!style) {
        style = document.createElement("style");
        style.id = "anti-screenshot-style";
        style.innerHTML = "html, body { opacity: 0 !important; background: black !important; }";
        document.head.appendChild(style);
      }

      // Try to clear clipboard to prevent pasted screenshots
      try {
        navigator.clipboard.writeText("Screenshots are disabled in this environment.");
      } catch (e) {}

      // 2. Wait for the OS to finish the screenshot capture on the blank screen, 
      // then remove the blanking style and show the Malpractice warning.
      setTimeout(() => {
        if (style) {
          style.remove();
        }
        setIsMalpractice(true);
        // Automatically hide the warning after 5 seconds so they can continue
        setTimeout(() => setIsMalpractice(false), 5000);
      }, 800); // 800ms delay to ensure the OS captures the blanked screen
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // PrintScreen key
      if (e.key === "PrintScreen") {
        e.preventDefault();
        triggerMalpractice();
      }
      
      // Mac & Windows Shortcuts for Screenshots
      // Cmd/Win + Shift + 3/4/5/S
      if (e.metaKey && e.shiftKey && ["3", "4", "5", "s", "S"].includes(e.key)) {
        e.preventDefault();
        triggerMalpractice();
      }
      
      // Ctrl + PrintScreen
      if (e.ctrlKey && e.key === "PrintScreen") {
        e.preventDefault();
        triggerMalpractice();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen") {
        e.preventDefault();
        triggerMalpractice();
      }
    };

    // Disable right click to prevent saving images or inspecting
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    // Use capture phase to intercept the event as early as possible
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("keyup", handleKeyUp, { capture: true });
    window.addEventListener("contextmenu", handleContextMenu);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.removeEventListener("keyup", handleKeyUp, { capture: true });
      window.removeEventListener("contextmenu", handleContextMenu);
    };
  }, []);

  if (!isMalpractice) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-red-950/95 backdrop-blur-xl flex flex-col items-center justify-center text-white">
      <AlertTriangle className="w-24 h-24 text-red-500 mb-6 animate-pulse" />
      <h1 className="text-5xl font-black mb-4 tracking-tight">MALPRACTICE DETECTED</h1>
      <p className="text-xl max-w-lg text-center text-red-200">
        Screen capturing or recording is strictly prohibited. 
        Your actions have been logged.
      </p>
    </div>
  );
}
