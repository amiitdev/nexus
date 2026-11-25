import clsx from "clsx";
import { unavailable } from "../../lib/format";

interface MeterProps {
  label: string;
  valueText?: string | null;
  percent: number | null;
  color?: string;
  className?: string;
}

export function Meter({ label, valueText, percent, color = "rgb(var(--c-accent))", className }: MeterProps) {
  const width = percent === null ? 0 : Math.max(0, Math.min(100, percent));
  return (
    <div className={clsx("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3 text-[11px]">
        <span className="text-muted">{label}</span>
        <span className="numeric text-ink/90">{valueText ?? unavailable}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[rgb(var(--c-line)/0.08)]">
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${width}%`, background: `linear-gradient(90deg, rgb(var(--c-accent-soft)), ${color})` }}
        />
      </div>
    </div>
  );
}
