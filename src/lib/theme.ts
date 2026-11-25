import type { AccentKey, AppSettings } from "../types";

export const ACCENTS: Record<AccentKey, { name: string; hex: string; soft: string }> = {
  violet: { name: "Violet", hex: "#7c6cff", soft: "#a99dff" },
  cyan: { name: "Cyan", hex: "#22d3ee", soft: "#67e8f9" },
  emerald: { name: "Emerald", hex: "#34d399", soft: "#6ee7b7" },
  amber: { name: "Amber", hex: "#fbbf24", soft: "#fcd34d" },
  rose: { name: "Rose", hex: "#fb7185", soft: "#fda4af" },
  blue: { name: "Blue", hex: "#60a5fa", soft: "#93c5fd" },
};

function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  return `${parseInt(h.slice(0, 2), 16)} ${parseInt(h.slice(2, 4), 16)} ${parseInt(h.slice(4, 6), 16)}`;
}

export function applyTheme(settings: Pick<AppSettings, "theme" | "accent">) {
  const root = document.documentElement;
  const prefersLight =
    settings.theme === "light" ||
    (settings.theme === "system" && window.matchMedia("(prefers-color-scheme: light)").matches);
  root.dataset.theme = prefersLight ? "light" : "dark";

  const accent = ACCENTS[settings.accent] ?? ACCENTS.violet;
  root.style.setProperty("--c-accent", hexToRgb(accent.hex));
  root.style.setProperty("--c-accent-soft", hexToRgb(accent.soft));
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", prefersLight ? "#f4f5f8" : "#07080b");
}
