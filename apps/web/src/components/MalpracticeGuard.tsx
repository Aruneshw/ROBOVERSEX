"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

export function MalpracticeGuard() {
  const [isMalpractice, setIsMalpractice] = useState(false);

  useEffect(() => {
    const triggerMalpractice = () => {
      setIsMalpractice(true);
      // Automatically hide the warning after 5 seconds so they can continue,
      // or you could leave it permanently by removing the setTimeout.
      setTimeout(() => setIsMalpractice(false), 5000);
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

    // When the window loses focus (often happens when snipping tool is opened)
    const handleBlur = () => {
      triggerMalpractice();
    };
    
    // When the user switches tabs or minimizes the window
    const handleVisibilityChange = () => {
      if (document.hidden) {
        triggerMalpractice();
      }
    };

    // Disable right click to prevent saving images or inspecting
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("contextmenu", handleContextMenu);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
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
        Screen capturing, recording, or leaving the testing environment is strictly prohibited. 
        Your actions have been logged.
      </p>
    </div>
  );
}
