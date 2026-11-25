import { useCallback, useEffect, useState } from "react";
import {
  BatteryCharging,
  CircuitBoard,
  Cpu,
  HardDrive,
  MemoryStick,
  Monitor,
  RefreshCw,
  Thermometer,
  Wind,
} from "lucide-react";
import type { ReactNode } from "react";
import { api } from "../lib/api";
import { bytes, percent, unavailable } from "../lib/format";
import { Panel } from "../components/ui/Panel";
import { PageHeader } from "../components/ui/PageHeader";
import { Ring } from "../components/ui/Ring";
import { useTelemetry } from "../store/telemetry";
import type { HardwareDetails, SpecGroup } from "../types";

const ICONS: Record<string, ReactNode> = {
  cpu: <Cpu size={15} />,
  memory: <MemoryStick size={15} />,
  gpu: <Monitor size={15} />,
  board: <CircuitBoard size={15} />,
  disk: <HardDrive size={15} />,
  battery: <BatteryCharging size={15} />,
  thermometer: <Thermometer size={15} />,
};

function SpecCard({ group, delay = 0 }: { group: SpecGroup; delay?: number }) {
  return (
    <Panel title={group.title} icon={ICONS[group.icon] ?? <CircuitBoard size={15} />} delay={delay}>
      <dl className="divide-y divide-line/[0.05]">
        {group.items.map((item) => (
          <div key={item.label} className="flex items-start justify-between gap-4 py-2 first:pt-0 last:pb-0">
            <dt className="shrink-0 text-[10px] text-muted">{item.label}</dt>
            <dd
              className="numeric max-w-[62%] truncate text-right text-[10px] text-ink/90"
              title={item.value ?? unavailable}
            >
              {item.value ?? <span className="text-faint">{unavailable}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

export function Hardware() {
  const { snapshot } = useTelemetry();
  const [details, setDetails] = useState<HardwareDetails | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDetails(await api.hardware());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Hardware center"
        title="Hardware components"
        subtitle="Detected specifications and live sensor values — nothing is estimated"
        action={
          <button
            onClick={() => void load()}
            className="focus-ring flex items-center gap-2 rounded-xl glass-subtle px-3 py-2 text-[11px] text-muted transition hover:text-accent"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        }
      />

      {snapshot && snapshot.batteries.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {snapshot.batteries.map((battery) => (
            <Panel key={battery.name} title={`Battery · ${battery.name}`} icon={<BatteryCharging size={15} />}>
              <div className="flex items-center gap-5">
                <Ring value={battery.chargePercent} size={96} stroke={9} color="#34d399">
                  <div>
                    <p className="numeric text-lg text-ink">{percent(battery.chargePercent)}</p>
                    <p className="text-[9px] text-faint">{battery.state}</p>
                  </div>
                </Ring>
                <div className="space-y-2 text-[10px]">
                  <div>
                    <p className="text-faint">Design health</p>
                    <p className="numeric text-xs text-ink">{percent(battery.healthPercent, 1)}</p>
                  </div>
                  <div>
                    <p className="text-faint">Power draw</p>
                    <p className="numeric text-xs text-ink">
                      {battery.powerWatts !== null ? `${battery.powerWatts.toFixed(2)} W` : unavailable}
                    </p>
                  </div>
                  <div>
                    <p className="text-faint">Technology</p>
                    <p className="text-xs text-ink">{battery.technology || unavailable}</p>
                  </div>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}

      {snapshot && (snapshot.temperatures.length > 0 || snapshot.fans.length > 0) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel title="Temperature sensors" subtitle="hwmon chip readings" icon={<Thermometer size={15} />}>
            <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
              {snapshot.temperatures.map((s, i) => (
                <div key={`${s.chip}-${s.label}-${i}`} className="flex items-center justify-between gap-3 border-b border-line/[0.04] py-1.5 last:border-0">
                  <div className="min-w-0">
                    <p className="truncate text-[10px] text-muted">{s.label}</p>
                    <p className="truncate text-[9px] text-faint/70">{s.chip}</p>
                  </div>
                  <span className="numeric text-[11px] text-ink">{s.value.toFixed(1)} °C</span>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Fan sensors" subtitle="Reported fan speeds" icon={<Wind size={15} />}>
            {snapshot.fans.length === 0 ? (
              <p className="py-8 text-center text-[11px] text-faint">No fan speed sensors detected on this system</p>
            ) : (
              <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                {snapshot.fans.map((s, i) => (
                  <div key={`${s.chip}-${s.label}-${i}`} className="flex items-center justify-between gap-3 border-b border-line/[0.04] py-1.5 last:border-0">
                    <div className="min-w-0">
                      <p className="truncate text-[10px] text-muted">{s.label}</p>
                      <p className="truncate text-[9px] text-faint/70">{s.chip}</p>
                    </div>
                    <span className="numeric text-[11px] text-ink">{s.value.toFixed(0)} RPM</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}

      {loading && !details ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-[260px] rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {details?.groups.map((group, i) => <SpecCard key={group.title + i} group={group} delay={Math.min(i * 0.03, 0.2)} />)}
        </div>
      )}

      {snapshot && snapshot.storage.length > 0 && (
        <Panel title="Storage devices" subtitle="Capacity and filesystem" icon={<HardDrive size={15} />}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {snapshot.storage.map((disk) => (
              <div key={`${disk.name}-${disk.mountPoint}`} className="glass-subtle rounded-xl p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs font-medium text-ink">{disk.name || disk.mountPoint}</p>
                  <span className="numeric text-[10px] text-accent">{percent(disk.usagePercent)}</span>
                </div>
                <p className="numeric mt-1 text-[9px] text-faint">{disk.mountPoint} · {disk.fileSystem}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line/[0.08]">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#22d3ee] to-accent" style={{ width: `${Math.min(100, disk.usagePercent)}%` }} />
                </div>
                <p className="numeric mt-2 text-[10px] text-muted">{bytes(disk.usedBytes)} used of {bytes(disk.totalBytes)}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
