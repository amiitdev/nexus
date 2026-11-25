import { motion } from "framer-motion";
import type { ReactNode } from "react";
import clsx from "clsx";

interface PanelProps {
  title?: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  delay?: number;
}

export function Panel({
  title,
  subtitle,
  icon,
  action,
  children,
  className,
  bodyClassName,
  delay = 0,
}: PanelProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      className={clsx("glass-panel rounded-2xl overflow-hidden flex flex-col", className)}
    >
      {(title || action) && (
        <header className="flex items-center gap-3 px-5 pt-4 pb-3">
          {icon && (
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
              {icon}
            </span>
          )}
          <div className="min-w-0 flex-1">
            {title && <h2 className="truncate text-[13px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>}
            {subtitle && <p className="truncate text-[11px] text-muted">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={clsx("flex-1 px-5 pb-5", bodyClassName ?? (title ? "" : "pt-5"))}>{children}</div>
    </motion.section>
  );
}
