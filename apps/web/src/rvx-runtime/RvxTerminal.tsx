"use client";

import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";
import { rvx } from "./runtime";

export type RvxTerminalProps = { className?: string; fontSize?: number; style?: React.CSSProperties };

/** Real xterm.js terminal bound to the RVX shell. Fills its parent (give the parent a height). */
export function RvxTerminal({ className, fontSize = 13, style }: RvxTerminalProps) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      const [{ Terminal }, { FitAddon }, { WebLinksAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
        import("@xterm/addon-web-links"),
      ]);
      const el = host.current;
      if (disposed || !el) return;
      const term = new Terminal({
        fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize,
        lineHeight: 1.25,
        cursorBlink: true,
        cursorStyle: "block",
        scrollback: 5000,
        convertEol: false,
        allowProposedApi: false,
        theme: {
          background: "#050A16", foreground: "#D6E2FF", cursor: "#36D7F5", cursorAccent: "#050A16",
          selectionBackground: "#3D7BFF55", black: "#0B1326", red: "#FF5470", green: "#2BD98C", yellow: "#F5B33D",
          blue: "#3D7BFF", magenta: "#B48CFF", cyan: "#36D7F5", white: "#D6E2FF", brightBlack: "#5C6F96",
          brightRed: "#FF7A90", brightGreen: "#5BE6A8", brightYellow: "#F8C866", brightBlue: "#5B90FF",
          brightMagenta: "#C9A8FF", brightCyan: "#6FE3F8", brightWhite: "#FFFFFF",
        },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.loadAddon(new WebLinksAddon());
      term.open(el);
      const refit = () => { try { if (el.clientWidth > 0 && el.clientHeight > 0) fit.fit(); } catch { /* not visible yet */ } };
      refit();
      const ro = new ResizeObserver(refit);
      ro.observe(el);
      const detach = rvx.attachTerminal(term);
      term.focus();
      cleanup = () => { ro.disconnect(); detach(); term.dispose(); };
    })();
    return () => { disposed = true; cleanup(); };
  }, [fontSize]);

  return (
    <div
      ref={host}
      className={className}
      onClick={() => host.current?.querySelector("textarea")?.focus()}
      style={{ width: "100%", height: "100%", minHeight: 120, background: "#050A16", padding: "6px 0 0 8px", boxSizing: "border-box", ...style }}
    />
  );
}
