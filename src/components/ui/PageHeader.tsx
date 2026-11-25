import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-accent/80">{eyebrow}</p>
        )}
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.035em] text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-xs text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Unavailable({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[90px] flex-col items-center justify-center gap-1.5 text-center">
      <span className="text-[11px] text-faint">{label ? `${label} ` : ""}Not available</span>
      <span className="text-[10px] text-faint/60">Your hardware or driver does not expose this reading</span>
    </div>
  );
}
