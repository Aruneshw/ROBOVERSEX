"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

export function MalpracticeGuard() {
  const [isMalpractice, setIsMalpractice] = useState(false);

  useEffect(() => {
    // This function blanks the screen without triggering the malpractice warning.
    // It's used for when the window loses focus (e.g. Snipping Tool opens).
    const blankScreen = () => {
      let style = document.getElementById("anti-screenshot-style");
      if (!style) {
        style = document.createElement("style");
        style.id = "anti-screenshot-style";
        style.innerHTML = "html, body { opacity: 0 !important; background: #000 !important; }";
        document.head.appendChild(style);
      }
    };

    const restoreScreen = () => {
      const style = document.getElementById("anti-screenshot-style");
      if (style) {
        style.remove();
      }
    };

    const triggerMalpractice = () => {
      blankScreen();
      
      try {
        navigator.clipboard.writeText("Screenshots are disabled in this environment.");
      } catch (e) {}

      setTimeout(() => {
        restoreScreen();
        setIsMalpractice(true);
        setTimeout(() => setIsMalpractice(false), 5000);
      }, 800);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen") {
        e.preventDefault();
        triggerMalpractice();
      }
      if (e.metaKey && e.shiftKey && ["3", "4", "5", "s", "S"].includes(e.key)) {
        e.preventDefault();
        triggerMalpractice();
      }
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

    // When a Snipping Tool is opened, the window loses focus.
    // We blank the screen immediately, but we don't show the malpractice window
    // to respect the user's request of not showing it on tab switch.
    const handleBlur = () => {
      blankScreen();
    };

    const handleFocus = () => {
      restoreScreen();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        blankScreen();
      } else {
        restoreScreen();
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("keyup", handleKeyUp, { capture: true });
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("contextmenu", handleContextMenu);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.removeEventListener("keyup", handleKeyUp, { capture: true });
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
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
