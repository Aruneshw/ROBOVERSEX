import type { SVGProps } from "react";

/** Original turtle-shell hexagon inside a rounded square. Uses currentColor. */
export function LogoGlyph({ size = 28, ...props }: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="Roboverse X"
      {...props}
    >
      <rect x="1.5" y="1.5" width="29" height="29" rx="8" strokeWidth="1.6" />
      <path d="M16 6.5 24.2 11.25v9.5L16 25.5l-8.2-4.75v-9.5Z" strokeWidth="1.6" />
      <path d="M16 11.2 20.1 13.6v4.8L16 20.8l-4.1-2.4v-4.8Z" strokeWidth="1.2" opacity="0.7" />
      <path d="M16 6.5v4.7M24.2 11.25l-4.1 2.35M24.2 20.75l-4.1-2.35M16 25.5v-4.7M7.8 20.75l4.1-2.35M7.8 11.25l4.1 2.35" strokeWidth="1.1" opacity="0.55" />
    </svg>
  );
}
