import { LogoGlyph } from "@/components/brand/logo-glyph";
import { Wordmark } from "@/components/brand/wordmark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

const SWATCHES = [
  ["bg", "bg-bg"], ["surface", "bg-surface"], ["surface-2", "bg-surface-2"], ["surface-3", "bg-surface-3"],
  ["line", "bg-line"], ["line-strong", "bg-line-strong"], ["text", "bg-text"], ["muted", "bg-muted"],
  ["faint", "bg-faint"], ["primary", "bg-primary"], ["primary-hover", "bg-primary-hover"], ["accent", "bg-accent"],
  ["success", "bg-success"], ["warning", "bg-warning"], ["danger", "bg-danger"], ["sim-bg", "bg-sim-bg"],
  ["terminal-bg", "bg-terminal-bg"],
] as const;

const SCALE = [12, 13, 14, 16, 20, 28, 40, 64];

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LogoGlyph className="text-primary" size={32} />
          <Wordmark size={26} />
        </div>
        <ThemeToggle />
      </header>

      <section className="rounded-panel border border-line bg-surface">
        <div className="flex h-10 items-center border-b border-line bg-surface-2 px-4">
          <h2 className="hud-title text-muted">Phase 0 · Foundation</h2>
        </div>
        <div className="space-y-3 p-4">
          <p className="text-muted">
            Design tokens, fonts, theming and the simulation core are wired. Toggle the theme (top right) to compare
            Deep Space and Pale Sky.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button>Enter the Arena</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button disabled>Disabled</Button>
          </div>
        </div>
      </section>

      <section className="rounded-panel border border-line bg-surface">
        <div className="flex h-10 items-center border-b border-line bg-surface-2 px-4">
          <h2 className="hud-title text-muted">Colour tokens</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:grid-cols-4">
          {SWATCHES.map(([name, cls]) => (
            <div key={name} className="overflow-hidden rounded-chip border border-line">
              <div className={`${cls} h-12`} />
              <div className="tabular bg-surface-2 px-2 py-1 text-[12px] text-muted">--{name}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-panel border border-line bg-surface">
        <div className="flex h-10 items-center border-b border-line bg-surface-2 px-4">
          <h2 className="hud-title text-muted">Type scale</h2>
        </div>
        <div className="space-y-2 p-4">
          {SCALE.map((px) => (
            <div key={px} className="flex items-baseline gap-4">
              <span className="tabular w-12 shrink-0 text-[12px] text-faint">{px}px</span>
              <span className="font-display font-semibold" style={{ fontSize: px }}>Chakra Petch 12.34</span>
              {px <= 20 && <span style={{ fontSize: px }}>Inter body text</span>}
              {px <= 20 && <span className="tabular" style={{ fontSize: px }}>x 5.54 y 5.54</span>}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
