import { Activity, ArrowDownRight, ArrowUpRight, Globe2, Network, Radio, Wifi } from "lucide-react";
import { Panel } from "../components/ui/Panel";
import { PageHeader, Unavailable } from "../components/ui/PageHeader";
import { Sparkline, TrendChart, chartData } from "../components/ui/Charts";
import { Badge } from "../components/ui/Controls";
import { bytes, speed } from "../lib/format";
import { useSettings } from "../store/settings";
import { useTelemetry, windowed } from "../store/telemetry";

export function NetworkPage() {
  const { snapshot, history } = useTelemetry();
  const monitorNetwork = useSettings((s) => s.settings.monitorNetwork);

  if (!monitorNetwork) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Connectivity" title="Network" subtitle="Network monitoring is turned off" />
        <div className="glass-panel grid min-h-[320px] place-items-center rounded-2xl">
          <div className="text-center">
            <Wifi size={28} className="mx-auto text-faint/50" />
            <p className="mt-3 text-xs text-muted">Enable network monitoring in Settings to see live traffic.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Connectivity" title="Network" subtitle="Waiting for interface statistics…" />
        <div className="skeleton h-[280px] rounded-2xl" />
      </div>
    );
  }

  const { network } = snapshot;
  const points = windowed(history.netDown, 60_000);
  const upPoints = windowed(history.netUp, 60_000);
  const isUp = network.linkStatus === "up";

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Connectivity"
        title="Network"
        subtitle="Per-second throughput and cumulative traffic from the kernel network stack"
        action={
          <Badge tone={isUp ? "good" : "warn"}>
            <span className={`h-1.5 w-1.5 rounded-full ${isUp ? "bg-good" : "bg-warn"}`} />
            {isUp ? "Link up" : "Link down"}
          </Badge>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="glass-panel overflow-hidden rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#22d3ee]/10 text-[#22d3ee]"><ArrowDownRight size={17} /></span>
            <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-faint">Download</span>
          </div>
          <p className="numeric mt-5 text-[34px] font-medium leading-none tracking-[-0.05em] text-ink">{speed(network.downloadBytesPerSec)}</p>
          <p className="numeric mt-2 text-[10px] text-muted">Total received {bytes(network.totalReceivedBytes)}</p>
          <div className="-mx-1 mt-3"><Sparkline points={points} color="#22d3ee" height={64} /></div>
        </div>
        <div className="glass-panel overflow-hidden rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#fb7185]/10 text-[#fb7185]"><ArrowUpRight size={17} /></span>
            <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-faint">Upload</span>
          </div>
          <p className="numeric mt-5 text-[34px] font-medium leading-none tracking-[-0.05em] text-ink">{speed(network.uploadBytesPerSec)}</p>
          <p className="numeric mt-2 text-[10px] text-muted">Total transmitted {bytes(network.totalTransmittedBytes)}</p>
          <div className="-mx-1 mt-3"><Sparkline points={upPoints} color="#fb7185" height={64} /></div>
        </div>
      </div>

      {network.isWireless && (
        <Panel title="Connected network" subtitle="Wireless association" icon={<Wifi size={15} />}>
          <div className="flex flex-wrap items-center gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-accent/10 text-accent"><Wifi size={20} /></span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{network.ssid ?? "Not available"}</p>
              <p className="numeric mt-1 text-[10px] text-muted">
                {network.signalDbm !== null
                  ? `${network.signalDbm} dBm · ${network.signalPercent?.toFixed(0)}% signal`
                  : "Signal strength not available"}
                {" · "}{network.interface}
              </p>
            </div>
            {network.signalPercent !== null && (
              <div className="ml-auto w-32">
                <div className="h-1.5 overflow-hidden rounded-full bg-line/[0.08]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#fbbf24] to-[#34d399] transition-[width] duration-700"
                    style={{ width: `${Math.min(100, Math.max(0, network.signalPercent))}%` }}
                  />
                </div>
                <p className="numeric mt-1 text-right text-[9px] text-faint">{network.signalPercent.toFixed(0)}%</p>
              </div>
            )}
          </div>
        </Panel>
      )}

      <Panel title="Traffic history" subtitle="Inbound and outbound over the last minute" icon={<Activity size={15} />}>
        <TrendChart
          data={chartData({ down: windowed(history.netDown, 60_000), up: windowed(history.netUp, 60_000) })}
          series={[
            { key: "down", name: "Download", color: "#22d3ee" },
            { key: "up", name: "Upload", color: "#fb7185" },
          ]}
          format={speed}
          height={280}
        />
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Active interface" subtitle="Default route" icon={<Network size={15} />}>
          <div className="space-y-3">
            {[
              ["Interface", network.interface],
              ["IPv4 address", network.ipAddress ?? "Not available"],
              ["Link state", network.linkStatus],
              ["Network (SSID)", network.ssid ?? "Not available"],
              ["Connection", isUp ? "Connected" : "Disconnected"],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-[9px] uppercase tracking-[0.12em] text-faint">{label}</p>
                <p className="numeric mt-0.5 truncate text-[11px] text-ink">{value}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Data transferred" subtitle="Since boot" icon={<Globe2 size={15} />}>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between text-[10px]"><span className="text-muted">Received</span><span className="numeric text-ink">{bytes(network.totalReceivedBytes)}</span></div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line/[0.08]">
                <div className="h-full rounded-full bg-[#22d3ee]" style={{ width: `${(network.totalReceivedBytes / Math.max(1, network.totalReceivedBytes + network.totalTransmittedBytes)) * 100}%` }} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-[10px]"><span className="text-muted">Transmitted</span><span className="numeric text-ink">{bytes(network.totalTransmittedBytes)}</span></div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line/[0.08]">
                <div className="h-full rounded-full bg-[#fb7185]" style={{ width: `${(network.totalTransmittedBytes / Math.max(1, network.totalReceivedBytes + network.totalTransmittedBytes)) * 100}%` }} />
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="Interface details" subtitle="Kernel network state" icon={<Radio size={15} />}>
          {network.ipAddress ? (
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/10 text-accent"><Wifi size={18} /></span>
              <div>
                <p className="numeric text-xs text-ink">{network.ipAddress}</p>
                <p className="text-[10px] text-muted">Routing via {network.interface}</p>
              </div>
            </div>
          ) : (
            <Unavailable label="IP address" />
          )}
          <p className="mt-4 text-[10px] leading-relaxed text-faint">
            Rates are computed from kernel byte counters between samples — no synthetic traffic is generated.
          </p>
        </Panel>
      </div>
    </div>
  );
}
