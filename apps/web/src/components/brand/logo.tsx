import { cn } from "@/lib/utils";

interface BrandProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export function LogoGlyph({ className, ...props }: BrandProps) {
  return (
    <div 
      className={cn("flex items-center justify-center font-bold font-mono tracking-tighter bg-primary text-primary-foreground rounded-sm", className)}
      style={{ width: "1em", height: "1em" }}
      {...props}
    >
      X
    </div>
  );
}

export function Wordmark({ className, ...props }: BrandProps) {
  return (
    <div className={cn("flex items-center gap-2 text-xl font-bold tracking-tight", className)} {...props}>
      <LogoGlyph className="w-6 h-6 rounded-md text-lg" />
      <span className="font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/70">
        Roboverse X
      </span>
    </div>
  );
}
