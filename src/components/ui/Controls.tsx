import clsx from "clsx";
import type { ReactNode } from "react";

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
  title?: string;
  type?: "button" | "submit";
}

export function Button({
  children,
  onClick,
  variant = "secondary",
  size = "md",
  disabled,
  className,
  title,
  type = "button",
}: ButtonProps) {
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "focus-ring inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40",
        size === "sm" ? "h-8 px-3 text-[11px]" : "h-10 px-4 text-xs",
        variant === "primary" && "bg-accent text-white shadow-[0_8px_24px_-10px_rgb(var(--c-accent)/0.9)] hover:brightness-110",
        variant === "secondary" && "glass-subtle text-ink hover:border-accent/40 hover:text-accent",
        variant === "ghost" && "text-muted hover:bg-[rgb(var(--c-line)/0.06)] hover:text-ink",
        variant === "danger" && "bg-bad/15 text-bad hover:bg-bad/25",
        className,
      )}
    >
      {children}
    </button>
  );
}

interface SegmentedProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
}

export function Segmented<T extends string>({ options, value, onChange, size = "md", className }: SegmentedProps<T>) {
  return (
    <div className={clsx("inline-flex rounded-xl glass-subtle p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            "focus-ring rounded-lg font-medium transition-all duration-200",
            size === "sm" ? "px-2.5 py-1 text-[10px]" : "px-3.5 py-1.5 text-[11px]",
            value === o.value
              ? "bg-accent/15 text-accent shadow-[inset_0_0_0_1px_rgb(var(--c-accent)/0.25)]"
              : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        "focus-ring relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-200 disabled:opacity-40",
        checked ? "border-accent/50 bg-accent" : "border-line/10 bg-[rgb(var(--c-line)/0.10)]",
      )}
    >
      <span
        className={clsx(
          "absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow-sm transition-[left] duration-200",
          checked ? "left-[22px]" : "left-0.5",
        )}
        style={{ height: 18, width: 18 }}
      />
    </button>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "accent" }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium",
        tone === "neutral" && "bg-[rgb(var(--c-line)/0.07)] text-muted",
        tone === "good" && "bg-good/10 text-good",
        tone === "warn" && "bg-warn/10 text-warn",
        tone === "bad" && "bg-bad/10 text-bad",
        tone === "accent" && "bg-accent/12 text-accent",
      )}
    >
      {children}
    </span>
  );
}
