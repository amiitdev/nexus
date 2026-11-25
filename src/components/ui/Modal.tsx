import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}

export function Modal({ open, onClose, title, description, children, footer, width = "max-w-2xl" }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 6 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className={`glass-panel relative z-10 w-full ${width} overflow-hidden rounded-2xl`}
          >
            <header className="flex items-start gap-4 border-b border-line/[0.07] px-6 py-5">
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold tracking-[-0.01em] text-ink">{title}</h2>
                {description && <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>}
              </div>
              <button
                onClick={onClose}
                className="focus-ring grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-line/[0.07] hover:text-ink"
                aria-label="Close dialog"
              >
                <X size={15} />
              </button>
            </header>
            <div className="max-h-[65vh] overflow-y-auto px-6 py-5">{children}</div>
            {footer && (
              <footer className="flex items-center justify-end gap-2 border-t border-line/[0.07] px-6 py-4">
                {footer}
              </footer>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
