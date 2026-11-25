import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api, isTauri } from "../lib/api";
import { useSettings } from "./settings";
import type { SystemSnapshot } from "../types";

export interface Point {
  t: number;
  v: number;
}

export interface History {
  cpu: Point[];
  memory: Point[];
  gpu: Point[];
  cpuFreq: Point[];
  cpuTemp: Point[];
  netDown: Point[];
  netUp: Point[];
  diskRead: Point[];
  diskWrite: Point[];
}

const MAX_POINTS = 3600;

const emptyHistory = (): History => ({
  cpu: [], memory: [], gpu: [], cpuFreq: [], cpuTemp: [],
  netDown: [], netUp: [], diskRead: [], diskWrite: [],
});

interface TelemetryState {
  snapshot: SystemSnapshot | null;
  history: History;
  connected: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const TelemetryContext = createContext<TelemetryState | null>(null);

function push(list: Point[], point: Point): Point[] {
  const next = list.length >= MAX_POINTS ? list.slice(list.length - MAX_POINTS + 1) : list.slice();
  next.push(point);
  return next;
}

export function TelemetryProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<SystemSnapshot | null>(null);
  const [history, setHistory] = useState<History>(emptyHistory);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const interval = useSettings((s) => s.settings.refreshIntervalMs);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (busy.current || !isTauri()) return;
    busy.current = true;
    try {
      const next = await api.snapshot();
      setSnapshot(next);
      setConnected(true);
      setError(null);
      const t = next.timestamp;
      setHistory((h) => ({
        cpu: push(h.cpu, { t, v: next.cpu.usage }),
        memory: push(h.memory, { t, v: next.memory.usagePercent }),
        gpu: push(h.gpu, { t, v: next.gpus.reduce((max, g) => Math.max(max, g.utilization ?? 0), 0) }),
        cpuFreq: push(h.cpuFreq, { t, v: next.cpu.frequencyMhz ?? 0 }),
        cpuTemp: push(h.cpuTemp, { t, v: next.cpu.temperatureC ?? 0 }),
        netDown: push(h.netDown, { t, v: next.network.downloadBytesPerSec }),
        netUp: push(h.netUp, { t, v: next.network.uploadBytesPerSec }),
        diskRead: push(h.diskRead, { t, v: next.storage[0]?.readBytesPerSec ?? 0 }),
        diskWrite: push(h.diskWrite, { t, v: next.storage[0]?.writeBytesPerSec ?? 0 }),
      }));
    } catch (e) {
      setConnected(false);
      setError(`Live monitoring unavailable: ${String(e)}`);
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), Math.max(500, interval));
    return () => window.clearInterval(id);
  }, [interval, refresh]);

  return (
    <TelemetryContext.Provider value={{ snapshot, history, connected, error, refresh }}>
      {children}
    </TelemetryContext.Provider>
  );
}

export function useTelemetry(): TelemetryState {
  const ctx = useContext(TelemetryContext);
  if (!ctx) throw new Error("useTelemetry must be used inside TelemetryProvider");
  return ctx;
}

export function windowed(points: Point[], rangeMs: number): Point[] {
  if (points.length === 0) return [];
  const cutoff = Date.now() - rangeMs;
  const filtered = points.filter((p) => p.t >= cutoff);
  return filtered.length > 1 ? filtered : points.slice(-2);
}
