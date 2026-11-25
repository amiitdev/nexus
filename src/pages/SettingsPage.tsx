import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  Check,
  FolderOpen,
  Gauge,
  Laptop,
  Moon,
  Palette,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  Sun,
  Thermometer,
} from "lucide-react";
import clsx from "clsx";
import { api, isTauri } from "../lib/api";
import { ACCENTS } from "../lib/theme";
import { Button, Segmented, Toggle } from "../components/ui/Controls";
import { Panel } from "../components/ui/Panel";
import { PageHeader } from "../components/ui/PageHeader";
import { useSettings } from "../store/settings";
import { useTelemetry } from "../store/telemetry";
import type { AccentKey } from "../types";

function Row({ title, description, control }: { title: string; description: string; control: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-5 border-b border-line/[0.05] py-3 last:border-0">
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-ink">{title}</p>
        <p className="mt-0.5 text-[10px] text-muted">{description}</p>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

export function SettingsPage() {
  const settings = useSettings((s) => s.settings);
  const patch = useSettings((s) => s.patch);
  const save = useSettings((s) => s.save);
  const error = useSettings((s) => s.error);
  const resetCategories = useSettings((s) => s.resetCategories);
  const { snapshot } = useTelemetry();
  const [saved, setSaved] = useState(false);
  const [version, setVersion] = useState("1.0.0");

  useEffect(() => {
    if (isTauri()) void api.version().then(setVersion).catch(() => undefined);
  }, []);

  const persist = async () => {
    await save();
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  const browse = async () => {
    if (!isTauri()) return;
    const picked = await openDialog({ directory: true, title: "Choose Downloads folder" });
    if (typeof picked === "string") patch({ downloadsDir: picked });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Preferences"
        title="Settings"
        subtitle="Appearance, monitoring behavior and organizer rules"
        action={
          <Button variant="primary" onClick={() => void persist()}>
            {saved ? <Check size={14} /> : <Save size={14} />}
            {saved ? "Saved" : "Save changes"}
          </Button>
        }
      />
      {error && <div className="rounded-xl border border-warn/25 bg-warn/[0.07] px-4 py-3 text-[11px] text-warn">{error}</div>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Appearance" subtitle="Theme and accent color" icon={<Palette size={15} />}>
          <Row
            title="Color theme"
            description="Dark is tuned for AMOLED displays; light for bright environments"
            control={
              <Segmented
                size="sm"
                value={settings.theme}
                onChange={(theme) => patch({ theme })}
                options={[
                  { value: "dark" as const, label: "Dark" },
                  { value: "light" as const, label: "Light" },
                  { value: "system" as const, label: "System" },
                ]}
              />
            }
          />
          <div className="py-4">
            <p className="text-[11px] font-medium text-ink">Accent color</p>
            <p className="mt-0.5 text-[10px] text-muted">Applied to highlights, graphs and interactive elements</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(Object.keys(ACCENTS) as AccentKey[]).map((key) => (
                <button
                  key={key}
                  onClick={() => patch({ accent: key })}
                  title={ACCENTS[key].name}
                  className={clsx(
                    "focus-ring relative h-9 w-9 rounded-xl transition-transform hover:scale-110",
                    settings.accent === key && "ring-2 ring-ink/70 ring-offset-2 ring-offset-[rgb(var(--c-surface))]",
                  )}
                  style={{ background: `linear-gradient(140deg, ${ACCENTS[key].soft}, ${ACCENTS[key].hex})` }}
                >
                  {settings.accent === key && <Check size={14} className="absolute inset-0 m-auto text-white drop-shadow" />}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <div className="glass-subtle flex flex-1 items-center gap-2 rounded-xl p-3 text-[10px] text-muted"><Moon size={14} className="text-accent" /> Dark preview</div>
            <div className="glass-subtle flex flex-1 items-center gap-2 rounded-xl p-3 text-[10px] text-muted"><Sun size={14} className="text-accent" /> Light preview</div>
          </div>
        </Panel>

        <Panel title="Monitoring" subtitle="Polling and sensor preferences" icon={<Gauge size={15} />}>
          <Row
            title="Refresh interval"
            description="How often live telemetry is collected"
            control={
              <Segmented
                size="sm"
                value={String(settings.refreshIntervalMs)}
                onChange={(v) => patch({ refreshIntervalMs: Number(v) })}
                options={[
                  { value: "1000", label: "1s" },
                  { value: "1500", label: "1.5s" },
                  { value: "3000", label: "3s" },
                  { value: "5000", label: "5s" },
                ]}
              />
            }
          />
          <Row
            title="Temperature unit"
            description="Display temperatures in Celsius or Fahrenheit"
            control={
              <Segmented
                size="sm"
                value={settings.temperatureUnit}
                onChange={(temperatureUnit) => patch({ temperatureUnit })}
                options={[{ value: "C" as const, label: "°C" }, { value: "F" as const, label: "°F" }]}
              />
            }
          />
          <Row title="GPU monitoring" description="Query NVIDIA, AMD and Intel GPU interfaces" control={<Toggle checked={settings.monitorGpu} onChange={(monitorGpu) => patch({ monitorGpu })} label="GPU monitoring" />} />
          <Row title="Network monitoring" description="Track interface throughput and totals" control={<Toggle checked={settings.monitorNetwork} onChange={(monitorNetwork) => patch({ monitorNetwork })} label="Network monitoring" />} />
          <Row title="Notifications" description="Show results of organizing and long operations" control={<Toggle checked={settings.notifications} onChange={(notifications) => patch({ notifications })} label="Notifications" />} />
        </Panel>

        <Panel title="Behavior" subtitle="Startup and window handling" icon={<Settings2 size={15} />}>
          <Row title="Minimize to tray" description="Close button hides the window instead of quitting" control={<Toggle checked={settings.minimizeToTray} onChange={(minimizeToTray) => patch({ minimizeToTray })} label="Minimize to tray" />} />
          <Row title="Launch at login" description="Installs an XDG autostart entry" control={<Toggle checked={settings.launchAtLogin} onChange={(launchAtLogin) => patch({ launchAtLogin })} label="Launch at login" />} />
          <Row title="Ignore hidden files" description="Skip dotfiles during organization" control={<Toggle checked={settings.ignoreHidden} onChange={(ignoreHidden) => patch({ ignoreHidden })} label="Ignore hidden files" />} />
          <Row title="Exclude incomplete downloads" description="Skip .part, .crdownload and temporary files" control={<Toggle checked={settings.excludeIncomplete} onChange={(excludeIncomplete) => patch({ excludeIncomplete })} label="Exclude incomplete" />} />
        </Panel>

        <Panel title="Paths" subtitle="Default folders used by the organizer" icon={<FolderOpen size={15} />}>
          <p className="text-[10px] text-muted">Downloads directory</p>
          <div className="mt-2 flex gap-2">
            <input
              value={settings.downloadsDir ?? ""}
              onChange={(e) => patch({ downloadsDir: e.target.value })}
              placeholder="Leave empty to use XDG Downloads"
              spellCheck={false}
              className="numeric min-w-0 flex-1 rounded-xl border border-line/[0.07] bg-base/40 px-3 py-2.5 text-[11px] text-ink outline-none focus:border-accent/50"
            />
            <Button onClick={() => void browse()} disabled={!isTauri()}>Browse</Button>
          </div>
          <div className="mt-4 rounded-xl bg-accent/[0.06] p-3 text-[10px] text-muted">
            <ShieldCheck size={13} className="mb-1.5 text-accent" />
            Organization only affects the selected folder. Hidden files, symlinks and partial downloads are always skipped.
          </div>
        </Panel>
      </div>

      <Panel title="Organizer categories" subtitle="Extension rules used to build the folder structure" icon={<Laptop size={15} />}>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[10px] text-muted">{settings.categories.length} categories · edit them in the Downloads page</p>
          <Button size="sm" onClick={() => void resetCategories()}><RotateCcw size={12} /> Restore defaults</Button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {settings.categories.map((category) => (
            <div key={category.name} className="glass-subtle rounded-xl p-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium text-ink">{category.name}/</p>
                <span className="numeric text-[9px] text-faint">{category.extensions.length} ext</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {category.folders.map((folder) => (
                  <span key={folder.name} className="rounded-md bg-line/[0.06] px-1.5 py-0.5 text-[9px] text-muted">{folder.name}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="About" subtitle="Application and host information" icon={<Thermometer size={15} />}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            ["NEXUS version", version],
            ["Distribution", snapshot ? `${snapshot.system.distribution} ${snapshot.system.version}` : "—"],
            ["Kernel", snapshot?.system.kernel ?? "—"],
            ["Architecture", snapshot?.system.architecture ?? "—"],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-[9px] uppercase tracking-[0.12em] text-faint">{label}</p>
              <p className="numeric mt-1 truncate text-[11px] text-ink">{value}</p>
            </div>
          ))}
        </div>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-5 text-[10px] leading-relaxed text-faint">
          NEXUS reads system state directly from Linux interfaces (/proc, /sys, hwmon, DRM and DMI) and uses native GPU tools when available.
          No metric is fabricated: unsupported hardware is reported as “Not available”.
        </motion.p>
      </Panel>
    </div>
  );
}
