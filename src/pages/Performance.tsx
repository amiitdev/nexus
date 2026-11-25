import { useState } from "react";
import { Activity, ArrowDownRight, ArrowUpRight, Cpu, HardDrive, MemoryStick, Network, Thermometer, Zap } from "lucide-react";
import { Panel } from "../components/ui/Panel";
import { PageHeader } from "../components/ui/PageHeader";
import { Segmented } from "../components/ui/Controls";
import { TrendChart, chartData } from "../components/ui/Charts";
import { bytes, percent, speed, temperature } from "../lib/format";
import { useSettings } from "../store/settings";
import { useTelemetry, windowed } from "../store/telemetry";
import type { Point } from "../store/telemetry";

type RangeKey = "1m" | "5m" | "15m" | "1h";
const RANGES: Record<RangeKey, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
};

type MetricKey = "cpu" | "memory" | "gpu" | "network" | "disk" | "freq" | "temp";

export function Performance() {
  const { snapshot, history } = useTelemetry();
  const unit = useSettings((s) => s.settings.temperatureUnit);
  const refreshInterval = useSettings((s) => s.settings.refreshIntervalMs);
  const monitorGpu = useSettings((s) => s.settings.monitorGpu);
  const monitorNetwork = useSettings((s) => s.settings.monitorNetwork);
  const [range, setRange] = useState<RangeKey>("1m");
  const [view, setView] = useState<"detailed" | "compact">("detailed");
  const [metric, setMetric] = useState<MetricKey>("cpu");

  if (!snapshot) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Telemetry" title="Performance" subtitle="Starting live collection…" />
        <div className="skeleton h-[420px] rounded-2xl" />
      </div>
    );
  }

  const ms = RANGES[range];
  const w = (points: Point[]) => windowed(points, ms);
  const metrics: Record<MetricKey, { label: string; color: string; series: { key: string; name: string; color: string }[]; data: Record<string, Point[]>; format: (v: number) => string }> = {
    cpu: {
      label: "CPU utilization",
      color: "rgb(var(--c-accent))",
      series: [{ key: "cpu", name: "CPU", color: "rgb(var(--c-accent))" }],
      data: { cpu: w(history.cpu) },
      format: percent,
    },
    memory: {
      label: "Memory utilization",
      color: "#22d3ee",
      series: [{ key: "mem", name: "Memory", color: "#22d3ee" }],
      data: { mem: w(history.memory) },
      format: percent,
    },
    gpu: {
      label: "GPU utilization",
      color: "#34d399",
      series: [{ key: "gpu", name: "GPU", color: "#34d399" }],
      data: { gpu: w(history.gpu) },
      format: percent,
    },
    network: {
      label: "Network traffic",
      color: "#fbbf24",
      series: [
        { key: "down", name: "Download", color: "#22d3ee" },
        { key: "up", name: "Upload", color: "#fb7185" },
      ],
      data: { down: w(history.netDown), up: w(history.netUp) },
      format: speed,
    },
    disk: {
      label: "Disk activity",
      color: "#60a5fa",
      series: [
        { key: "read", name: "Read", color: "#60a5fa" },
        { key: "write", name: "Write", color: "#fbbf24" },
      ],
      data: { read: w(history.diskRead), write: w(history.diskWrite) },
      format: speed,
    },
    freq: {
      label: "CPU frequency",
      color: "#a78bfa",
      series: [{ key: "freq", name: "Frequency", color: "#a78bfa" }],
      data: { freq: w(history.cpuFreq) },
      format: (v) => `${(v / 1000).toFixed(1)} GHz`,
    },
    temp: {
      label: "CPU temperature",
      color: "#fb7185",
      series: [{ key: "temp", name: "Temperature", color: "#fb7185" }],
      data: { temp: w(history.cpuTemp) },
      format: (v) => `${v.toFixed(0)}°`,
    },
  };

  const current = metrics[metric];
  const tiles = [
    { icon: <Cpu size={14} />, label: "CPU", value: percent(snapshot.cpu.usage), sub: temperature(snapshot.cpu.temperatureC, unit) },
    { icon: <MemoryStick size={14} />, label: "Memory", value: percent(snapshot.memory.usagePercent), sub: bytes(snapshot.memory.usedBytes) },
    { icon: <Zap size={14} />, label: "GPU", value: snapshot.gpus[0] ? percent(snapshot.gpus[0].utilization) : "—", sub: snapshot.gpus[0]?.name ?? "Not available" },
    { icon: <ArrowDownRight size={14} />, label: "Download", value: speed(snapshot.network.downloadBytesPerSec), sub: bytes(snapshot.network.totalReceivedBytes) },
    { icon: <ArrowUpRight size={14} />, label: "Upload", value: speed(snapshot.network.uploadBytesPerSec), sub: bytes(snapshot.network.totalTransmittedBytes) },
    { icon: <HardDrive size={14} />, label: "Disk read", value: snapshot.storage[0]?.readBytesPerSec !== undefined && snapshot.storage[0]?.readBytesPerSec !== null ? speed(snapshot.storage[0].readBytesPerSec!) : "Not available", sub: "Active filesystem" },
    { icon: <Activity size={14} />, label: "Disk write", value: snapshot.storage[0]?.writeBytesPerSec !== undefined && snapshot.storage[0]?.writeBytesPerSec !== null ? speed(snapshot.storage[0].writeBytesPerSec!) : "Not available", sub: "Active filesystem" },
    { icon: <Thermometer size={14} />, label: "CPU temp", value: temperature(snapshot.cpu.temperatureC, unit), sub: `${(snapshot.cpu.frequencyMhz ? snapshot.cpu.frequencyMhz / 1000 : 0).toFixed(2)} GHz` },
  ].filter((tile) => {
    if (!monitorGpu && tile.label === "GPU") return false;
    if (!monitorNetwork && (tile.label === "Download" || tile.label === "Upload")) return false;
    return true;
  });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Real-time telemetry"
        title="Performance"
        subtitle={`Polling every ${(refreshInterval / 1000).toFixed(1)}s · ${snapshot.cpu.logicalThreads} threads · ${snapshot.system.kernel}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              size="sm"
              value={range}
              onChange={setRange}
              options={[
                { value: "1m", label: "1 min" },
                { value: "5m", label: "5 min" },
                { value: "15m", label: "15 min" },
                { value: "1h", label: "1 hour" },
              ]}
            />
            <Segmented
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: "detailed", label: "Detailed" },
                { value: "compact", label: "Compact" },
              ]}
            />
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        {tiles.map((tile) => (
          <div key={tile.label} className="glass-panel rounded-xl px-3.5 py-3">
            <div className="flex items-center gap-1.5 text-faint">
              {tile.icon}
              <span className="text-[9px] uppercase tracking-[0.12em]">{tile.label}</span>
            </div>
            <p className="numeric mt-2 truncate text-sm text-ink">{tile.value}</p>
            <p className="numeric truncate text-[9px] text-faint">{tile.sub}</p>
          </div>
        ))}
      </div>

      <Panel
        title={current.label}
        subtitle={`Last ${range} · ${w(Object.values(current.data)[0] ?? []).length} samples`}
        icon={<Activity size={15} />}
        action={
          <div className="flex flex-wrap gap-1">
            {(Object.keys(metrics) as MetricKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setMetric(key)}
                className={`rounded-lg px-2.5 py-1 text-[10px] font-medium transition ${
                  metric === key ? "bg-accent/15 text-accent" : "text-faint hover:text-ink"
                }`}
              >
                {metrics[key].label.split(" ")[0]}
              </button>
            ))}
          </div>
        }
      >
        <TrendChart data={chartData(current.data)} series={current.series} format={current.format} height={view === "compact" ? 220 : 300} />
      </Panel>

      {view === "detailed" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel title="CPU & memory" subtitle="Utilization over selected range" icon={<Cpu size={15} />} delay={0.04}>
            <TrendChart
              data={chartData({ cpu: w(history.cpu), mem: w(history.memory) })}
              series={[
                { key: "cpu", name: "CPU", color: "rgb(var(--c-accent))" },
                { key: "mem", name: "Memory", color: "#22d3ee" },
              ]}
              height={190}
            />
          </Panel>
          <Panel title="Network throughput" subtitle="Inbound & outbound" icon={<Network size={15} />} delay={0.08}>
            <TrendChart
              data={chartData({ down: w(history.netDown), up: w(history.netUp) })}
              series={[
                { key: "down", name: "Download", color: "#22d3ee" },
                { key: "up", name: "Upload", color: "#fb7185" },
              ]}
              format={speed}
              height={190}
            />
          </Panel>
          <Panel title="Storage I/O" subtitle="Read & write throughput" icon={<HardDrive size={15} />} delay={0.12}>
            <TrendChart
              data={chartData({ read: w(history.diskRead), write: w(history.diskWrite) })}
              series={[
                { key: "read", name: "Read", color: "#60a5fa" },
                { key: "write", name: "Write", color: "#fbbf24" },
              ]}
              format={speed}
              height={190}
            />
          </Panel>
          <Panel title="Thermal & frequency" subtitle="Processor telemetry" icon={<Thermometer size={15} />} delay={0.16}>
            <TrendChart
              data={chartData({ temp: w(history.cpuTemp), freq: w(history.cpuFreq) })}
              series={[
                { key: "temp", name: "Temperature °C", color: "#fb7185" },
                { key: "freq", name: "Frequency MHz", color: "#a78bfa" },
              ]}
              height={190}
            />
          </Panel>
        </div>
      ) : (
        <Panel title="Live ticker" subtitle="All monitored metrics at this instant" icon={<Activity size={15} />}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {tiles.map((tile) => (
              <div key={tile.label} className="glass-subtle rounded-xl px-3 py-2.5">
                <p className="text-[9px] uppercase tracking-[0.12em] text-faint">{tile.label}</p>
                <p className="numeric mt-1 truncate text-xs text-ink">{tile.value}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
