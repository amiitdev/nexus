import { useState } from "react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowUpRight,
  CircuitBoard,
  Clock3,
  Cpu,
  Gauge,
  HardDrive,
  Info,
  Layers,
  MemoryStick,
  Monitor,
  Server,
  Thermometer,
  Wifi,
  Zap,
} from "lucide-react";
import clsx from "clsx";
import { Panel } from "../components/ui/Panel";
import { PageHeader, Unavailable } from "../components/ui/PageHeader";
import { Ring } from "../components/ui/Ring";
import { Meter } from "../components/ui/Meter";
import { Segmented } from "../components/ui/Controls";
import { Sparkline, TrendChart, chartData } from "../components/ui/Charts";
import { bytes, duration, percent, speed, temperature, unavailable } from "../lib/format";
import { useSettings } from "../store/settings";
import { useTelemetry, windowed } from "../store/telemetry";
import type { Point } from "../store/telemetry";

function Kpi({
  icon,
  label,
  value,
  unit,
  detail,
  points,
  accent = "rgb(var(--c-accent))",
  ring,
  delay = 0,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  unit?: string;
  detail: string;
  points: Point[];
  accent?: string;
  ring?: number | null;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      className="glass-panel group relative overflow-hidden rounded-2xl p-5"
    >
      <div className="flex items-start justify-between">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent/[0.10] text-accent">{icon}</span>
        <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-faint">{label}</span>
      </div>
      <div className="mt-5 flex items-end gap-3">
        <div className="numeric text-[34px] font-medium leading-none tracking-[-0.05em] text-ink">
          {value}
          {unit && <span className="ml-1 text-base font-normal text-muted">{unit}</span>}
        </div>
        {ring !== undefined && ring !== null && (
          <div className="ml-auto opacity-90">
            <Ring value={ring} size={44} stroke={5} color={accent} />
          </div>
        )}
      </div>
      <p className="numeric mt-2 truncate text-[10px] text-muted">{detail}</p>
      <div className="-mx-1 mt-2 opacity-80">
        <Sparkline points={points} color={accent} height={44} />
      </div>
    </motion.div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-subtle rounded-xl px-3 py-2.5">
      <p className="text-[9px] uppercase tracking-[0.12em] text-faint">{label}</p>
      <p className="numeric mt-1 truncate text-xs text-ink" title={value}>{value}</p>
    </div>
  );
}

export function Dashboard() {
  const { snapshot, history } = useTelemetry();
  const unit = useSettings((s) => s.settings.temperatureUnit);
  const monitorGpu = useSettings((s) => s.settings.monitorGpu);
  const monitorNetwork = useSettings((s) => s.settings.monitorNetwork);
  const [cpuTab, setCpuTab] = useState<"usage" | "freq" | "temp">("usage");

  if (!snapshot) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Live" title="Overview" subtitle="Collecting telemetry from your system…" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[188px] rounded-2xl" />)}
        </div>
        <div className="skeleton h-[360px] rounded-2xl" />
      </div>
    );
  }

  const { cpu, memory, gpus, storage, network, system } = snapshot;
  const primaryGpu = gpus[0];
  const range = 60_000;
  const cpuPoints = windowed(history.cpu, range);
  const memPoints = windowed(history.memory, range);
  const netPoints = windowed(history.netDown, range);
  const chartSeries =
    cpuTab === "usage"
      ? [{ key: "cpu", name: "CPU usage", color: "rgb(var(--c-accent))" }]
      : cpuTab === "freq"
        ? [{ key: "freq", name: "Frequency", color: "#22d3ee" }]
        : [{ key: "temp", name: "Temperature", color: "#fb7185" }];
  const chartPoints =
    cpuTab === "usage" ? cpuPoints : cpuTab === "freq"
      ? windowed(history.cpuFreq, range)
      : windowed(history.cpuTemp, range);
  const chartFormat = cpuTab === "usage" ? percent : cpuTab === "freq"
    ? (v: number) => `${(v / 1000).toFixed(1)} GHz`
    : (v: number) => `${v.toFixed(0)}°`;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Live overview"
        title="Your system, at a glance"
        subtitle={`${system.distribution} ${system.version} · Kernel ${system.kernel} · ${system.hostname}`}
        action={
          <div className="flex items-center gap-2 rounded-xl glass-subtle px-3 py-2 text-[10px] text-muted">
            <Clock3 size={13} className="text-accent" />
            <span className="numeric">Uptime {duration(cpu.uptimeSeconds)}</span>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={<Cpu size={16} />}
          label="Processor"
          value={cpu.usage.toFixed(0)}
          unit="%"
          detail={`${temperature(cpu.temperatureC, unit)} · ${cpu.frequencyMhz ? `${(cpu.frequencyMhz / 1000).toFixed(2)} GHz` : unavailable}`}
          points={cpuPoints}
          ring={cpu.usage}
          delay={0.02}
        />
        <Kpi
          icon={<MemoryStick size={16} />}
          label="Memory"
          value={bytes(memory.usedBytes)}
          detail={`${percent(memory.usagePercent)} of ${bytes(memory.totalBytes)}`}
          points={memPoints}
          ring={memory.usagePercent}
          accent="#22d3ee"
          delay={0.06}
        />
        <Kpi
          icon={<Monitor size={16} />}
          label="Graphics"
          value={monitorGpu && primaryGpu ? percent(primaryGpu.utilization) : "—"}
          detail={!monitorGpu ? "Disabled in settings" : primaryGpu ? `${primaryGpu.name} · ${temperature(primaryGpu.temperatureC, unit)}` : "No GPU metrics exposed"}
          points={windowed(history.gpu, range)}
          ring={primaryGpu?.utilization ?? null}
          accent="#34d399"
          delay={0.1}
        />
        <Kpi
          icon={<Wifi size={16} />}
          label="Network"
          value={monitorNetwork ? speed(network.downloadBytesPerSec) : "—"}
          detail={!monitorNetwork ? "Disabled in settings" : `${network.ssid ? `Wi-Fi ${network.ssid} · ` : ""}↓ ${bytes(network.totalReceivedBytes)}  ↑ ${bytes(network.totalTransmittedBytes)}`}
          points={netPoints}
          accent="#fbbf24"
          delay={0.14}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)]">
        <Panel
          title="Processor activity"
          subtitle={cpu.model}
          icon={<Cpu size={15} />}
          delay={0.05}
          action={
            <Segmented
              size="sm"
              value={cpuTab}
              onChange={setCpuTab}
              options={[
                { value: "usage", label: "Usage" },
                { value: "freq", label: "Frequency" },
                { value: "temp", label: "Thermal" },
              ]}
            />
          }
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Cores / threads" value={`${cpu.physicalCores} / ${cpu.logicalThreads}`} />
            <Stat label="Load (1 / 5 / 15)" value={cpu.loadAverage.map((v) => v.toFixed(2)).join("  ")} />
            <Stat label="Frequency" value={cpu.frequencyMhz ? `${(cpu.frequencyMhz / 1000).toFixed(2)} GHz` : unavailable} />
            <Stat label="Package power" value={cpu.powerWatts !== null ? `${cpu.powerWatts.toFixed(1)} W` : unavailable} />
          </div>
          <div className="mt-4">
            <TrendChart data={chartData({ [chartSeries[0].key]: chartPoints })} series={chartSeries} format={chartFormat} height={190} />
          </div>
          <div className="mt-4 border-t border-line/[0.06] pt-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-faint">Per-core utilization</p>
              <p className="numeric text-[10px] text-muted">{cpu.logicalThreads} threads</p>
            </div>
            <div className="grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-4">
              {cpu.perCoreUsage.map((usage, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="numeric w-5 text-[9px] text-faint">{String(i).padStart(2, "0")}</span>
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-line/[0.08]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-accent-soft to-accent transition-[width] duration-500"
                      style={{ width: `${Math.min(100, usage)}%` }}
                    />
                  </div>
                  <span className="numeric w-7 text-right text-[9px] text-muted">{usage.toFixed(0)}</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="Memory" subtitle="Physical & swap" icon={<MemoryStick size={15} />} delay={0.1}>
          <div className="flex items-center gap-5">
            <Ring value={memory.usagePercent} size={116} stroke={10}>
              <div>
                <p className="numeric text-xl font-medium text-ink">{memory.usagePercent.toFixed(0)}%</p>
                <p className="text-[9px] text-faint">in use</p>
              </div>
            </Ring>
            <div className="min-w-0 flex-1">
              <p className="numeric text-lg text-ink">{bytes(memory.usedBytes)}</p>
              <p className="text-[10px] text-muted">of {bytes(memory.totalBytes)} total</p>
              <div className="mt-3 space-y-3">
                <Meter label="Available" valueText={bytes(memory.availableBytes)} percent={(memory.availableBytes / (memory.totalBytes || 1)) * 100} color="#22d3ee" />
                <Meter label="Cached" valueText={bytes(memory.cachedBytes)} percent={memory.cachedBytes !== null ? (memory.cachedBytes / (memory.totalBytes || 1)) * 100 : null} color="#34d399" />
              </div>
            </div>
          </div>
          <div className="mt-5 space-y-3 border-t border-line/[0.06] pt-4">
            <Meter label="Free" valueText={bytes(memory.freeBytes)} percent={(memory.freeBytes / (memory.totalBytes || 1)) * 100} color="#60a5fa" />
            <Meter label="Buffers" valueText={bytes(memory.buffersBytes)} percent={memory.buffersBytes !== null ? (memory.buffersBytes / (memory.totalBytes || 1)) * 100 : null} color="#fbbf24" />
            <Meter
              label="Swap"
              valueText={`${bytes(memory.swapUsedBytes)} / ${bytes(memory.swapTotalBytes)}`}
              percent={memory.swapTotalBytes > 0 ? memory.swapUsagePercent : null}
              color="#fb7185"
            />
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Graphics" subtitle="Detected GPU devices" icon={<Monitor size={15} />} delay={0.12}>
          {!monitorGpu ? (
            <p className="py-10 text-center text-[11px] text-faint">GPU monitoring is disabled in Settings.</p>
          ) : gpus.length === 0 ? (
            <Unavailable label="GPU" />
          ) : (
            <div className="space-y-3">
              {gpus.map((gpu, i) => (
                <div key={`${gpu.name}-${i}`} className="glass-subtle rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-ink">{gpu.name}</p>
                      <p className="mt-0.5 text-[10px] text-faint">{gpu.vendor} · via {gpu.source}</p>
                    </div>
                    <Ring value={gpu.utilization} size={48} stroke={5} color="#34d399">
                      <span className="numeric text-[10px] text-ink">{gpu.utilization !== null ? gpu.utilization.toFixed(0) : "—"}</span>
                    </Ring>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Stat label="Temperature" value={temperature(gpu.temperatureC, unit)} />
                    <Stat label="Clock" value={gpu.clockMhz ? `${gpu.clockMhz.toFixed(0)} MHz` : unavailable} />
                    <Stat label="Power" value={gpu.powerWatts !== null ? `${gpu.powerWatts.toFixed(1)} W` : unavailable} />
                    <Stat label="VRAM" value={gpu.memoryUsedBytes !== null ? bytes(gpu.memoryUsedBytes) : unavailable} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Storage" subtitle="Mounted filesystems" icon={<HardDrive size={15} />} delay={0.16}>
          <div className="space-y-4">
            {storage.length === 0 && <Unavailable label="Disks" />}
            {storage.slice(0, 5).map((disk) => (
              <div key={`${disk.name}-${disk.mountPoint}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-ink">{disk.name || disk.mountPoint}</p>
                    <p className="numeric truncate text-[9px] text-faint">{disk.mountPoint} · {disk.fileSystem}</p>
                  </div>
                  <p className="numeric shrink-0 text-[10px] text-muted">
                    {bytes(disk.usedBytes)} / {bytes(disk.totalBytes)}
                  </p>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line/[0.08]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#22d3ee] to-accent transition-[width] duration-700"
                    style={{ width: `${Math.min(100, disk.usagePercent)}%` }}
                  />
                </div>
                {disk.isRoot && (
                  <div className="numeric mt-1.5 flex gap-4 text-[9px] text-faint">
                    <span className="flex items-center gap-1"><ArrowDownRight size={10} /> {disk.readBytesPerSec !== null ? speed(disk.readBytesPerSec) : unavailable}</span>
                    <span className="flex items-center gap-1"><ArrowUpRight size={10} /> {disk.writeBytesPerSec !== null ? speed(disk.writeBytesPerSec) : unavailable}</span>
                    <span className="flex items-center gap-1"><Thermometer size={10} /> {temperature(disk.temperatureC, unit)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Panel title="System information" subtitle="Distribution & firmware" icon={<Server size={15} />} delay={0.2}>
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {[
              ["Distribution", `${system.distribution} ${system.version}`],
              ["Kernel", system.kernel],
              ["Desktop", system.desktopEnvironment || unavailable],
              ["Architecture", system.architecture],
              ["Motherboard", system.motherboard || unavailable],
              ["BIOS", system.biosVersion || unavailable],
              ["Hostname", system.hostname],
              ["Uptime", duration(cpu.uptimeSeconds)],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0">
                <p className="text-[9px] uppercase tracking-[0.12em] text-faint">{label}</p>
                <p className="numeric mt-0.5 truncate text-[11px] text-ink/90" title={value}>{value}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Temperature sensors" subtitle="Live hwmon readings" icon={<Thermometer size={15} />} delay={0.24}>
          {snapshot.temperatures.length === 0 ? (
            <Unavailable label="Temperature sensors" />
          ) : (
            <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
              {snapshot.temperatures.slice(0, 12).map((sensor, i) => (
                <div key={`${sensor.chip}-${sensor.label}-${i}`} className="flex items-center gap-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[10px] text-muted">{sensor.label}</p>
                    <p className="truncate text-[9px] text-faint/70">{sensor.chip}</p>
                  </div>
                  <span className="numeric text-[11px] text-ink">{temperature(sensor.value, "C")}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-[9px] text-faint">
        <span className="flex items-center gap-1.5"><Info size={11} /> All readings come from /proc, /sys and native GPU interfaces</span>
        <span className="flex items-center gap-1.5"><Zap size={11} /> Unavailable sensors are never substituted with estimates</span>
        <span className="flex items-center gap-1.5"><CircuitBoard size={11} /> {cpu.model}</span>
        <span className="flex items-center gap-1.5"><Gauge size={11} /> {cpu.architecture}</span>
        <span className={clsx("flex items-center gap-1.5", "text-faint/70")}><Layers size={11} /> {gpus.length} GPU{gpus.length === 1 ? "" : "s"} detected</span>
      </div>
    </div>
  );
}
