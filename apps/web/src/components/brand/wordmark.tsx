import { cn } from "@/lib/utils";

/** "ROBOVERSE" in Chakra Petch 700 with a cyan X whose two strokes draw in once. */
export function Wordmark({ className, size = 22 }: { className?: string; size?: number }) {
  return (
    <span
      className={cn("inline-flex items-start font-display font-bold leading-none tracking-[0.04em] text-text", className)}
      style={{ fontSize: size }}
      aria-label="Roboverse X"
    >
      <span aria-hidden>ROBOVERSE</span>
      <svg
        aria-hidden
        viewBox="0 0 10 10"
        width={size * 0.6}
        height={size * 0.6}
        className="ml-[2px] -mt-[2px] text-accent"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <path className="rvx-x-stroke" pathLength={1} d="M1.5 1.5 8.5 8.5" />
        <path className="rvx-x-stroke" pathLength={1} d="M8.5 1.5 1.5 8.5" />
      </svg>
    </span>
  );
}
