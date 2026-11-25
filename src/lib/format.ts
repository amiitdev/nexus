const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"];

export function bytes(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Not available";
  let v = value;
  let i = 0;
  while (Math.abs(v) >= 1024 && i < UNITS.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : digits)} ${UNITS[i]}`;
}

export function speed(bytesPerSecond: number): string {
  return `${bytes(bytesPerSecond)}/s`;
}

export function percent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Not available";
  return `${value.toFixed(digits)}%`;
}

export function temperature(celsius: number | null | undefined, unit: "C" | "F" = "C"): string {
  if (celsius === null || celsius === undefined || !Number.isFinite(celsius)) return "Not available";
  const value = unit === "F" ? celsius * 1.8 + 32 : celsius;
  return `${value.toFixed(1)}°${unit}`;
}

export function duration(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${Math.floor(seconds % 60)}s`;
}

export function clockTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function dateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const unavailable = "Not available";
