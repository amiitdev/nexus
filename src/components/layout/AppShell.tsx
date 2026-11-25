import { AnimatePresence, motion } from "framer-motion";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Activity,
  Cpu,
  FolderInput,
  HardDrive,
  LayoutDashboard,
  Minus,
  Monitor,
  Moon,
  Network,
  PlugZap,
  RefreshCw,
  Settings2,
  Square,
  Sun,
  X,
} from "lucide-react";
import clsx from "clsx";
import { lazy, Suspense, useEffect, useState } from "react";
import type { ComponentType } from "react";
import { isTauri } from "../../lib/api";
import { bytes, duration, percent, speed } from "../../lib/format";
import { useSettings } from "../../store/settings";
import { useTelemetry } from "../../store/telemetry";
import type { PageId } from "../../types";
const Dashboard = lazy(() => import("../../pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const Hardware = lazy(() => import("../../pages/Hardware").then((m) => ({ default: m.Hardware })));
const Performance = lazy(() => import("../../pages/Performance").then((m) => ({ default: m.Performance })));
const Organizer = lazy(() => import("../../pages/Organizer").then((m) => ({ default: m.Organizer })));
const Processes = lazy(() => import("../../pages/Processes").then((m) => ({ default: m.Processes })));
const NetworkPage = lazy(() => import("../../pages/NetworkPage").then((m) => ({ default: m.NetworkPage })));
const SettingsPage = lazy(() => import("../../pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const SshPage = lazy(() => import("../../pages/SshPage").then((m) => ({ default: m.SshPage })));

const NAV: { id: PageId; label: string; icon: typeof Cpu; description: string }[] = [
  { id: "dashboard", label: "Overview", icon: LayoutDashboard, description: "Live system status" },
  { id: "hardware", label: "Hardware", icon: HardDrive, description: "Components & sensors" },
  { id: "performance", label: "Performance", icon: Activity, description: "Real-time graphs" },
  { id: "organizer", label: "Downloads", icon: FolderInput, description: "One-click organizer" },
  { id: "desktop", label: "Desktop", icon: Monitor, description: "Desktop organizer" },
  { id: "processes", label: "Processes", icon: Cpu, description: "Running applications" },
  { id: "network", label: "Network", icon: Network, description: "Traffic & interfaces" },
  { id: "ssh", label: "SSH devices", icon: PlugZap, description: "Connect & transfer files" },
];

function Logo() {
  return (
    <div className="flex items-center gap-3 px-2">
      <div className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-accent to-[#22d3ee] shadow-[0_8px_22px_-8px_rgb(var(--c-accent)/0.9)]">
        <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.45),transparent_55%)]" />
        <span className="numeric relative text-sm font-bold text-white">N</span>
      </div>
      <div>
        <p className="text-[15px] font-bold leading-none tracking-[0.14em] text-ink">NEXUS</p>
        <p className="mt-1 text-[9px] font-medium tracking-[0.16em] text-faint">CONTROL CENTER</p>
      </div>
    </div>
  );
}

function TitleBar({ page }: { page: PageId }) {
  const { snapshot, connected } = useTelemetry();
  const settings = useSettings((s) => s.settings);
  const patch = useSettings((s) => s.patch);
  const [maximized, setMaximized] = useState(false);
  const win = isTauri() ? getCurrentWindow() : null;

  useEffect(() => {
    if (!win) return;
    void win.isMaximized().then(setMaximized);
  }, [win]);

  const current = NAV.find((n) => n.id === page) ?? NAV[0];

  return (
    <div
      data-tauri-drag-region
      className="flex h-[52px] shrink-0 items-center gap-4 border-b border-line/[0.06] px-5"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 text-[11px]">
        <span className="font-semibold tracking-[0.12em] text-faint">NEXUS</span>
        <span className="text-faint/60">/</span>
        <span className="truncate font-medium text-ink">{current.label}</span>
      </div>

      <div className="hidden items-center gap-1.5 xl:flex">
        <div className="flex items-center gap-2 rounded-lg glass-subtle px-2.5 py-1.5">
          <span className={clsx("h-1.5 w-1.5 rounded-full", connected ? "bg-good live-dot" : "bg-bad")} />
          <span className="text-[10px] text-muted">Live</span>
        </div>
        {snapshot && (
          <>
            <div className="numeric rounded-lg glass-subtle px-2.5 py-1.5 text-[10px] text-muted">
              CPU <span className="text-ink">{percent(snapshot.cpu.usage)}</span>
            </div>
            <div className="numeric rounded-lg glass-subtle px-2.5 py-1.5 text-[10px] text-muted">
              RAM <span className="text-ink">{percent(snapshot.memory.usagePercent)}</span>
            </div>
            <div className="numeric rounded-lg glass-subtle px-2.5 py-1.5 text-[10px] text-muted">
              NET <span className="text-ink">{speed(snapshot.network.downloadBytesPerSec)}</span>
            </div>
          </>
        )}
      </div>

      <button
        onClick={() => {
          patch({ theme: settings.theme === "light" ? "dark" : "light" });
          void useSettings.getState().save();
        }}
        title="Toggle theme"
        className="focus-ring grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-line/[0.07] hover:text-ink"
      >
        {settings.theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
      </button>

      {win && (
        <div className="flex items-center gap-1 border-l border-line/[0.07] pl-3">
          <button
            title="Minimize"
            onClick={() => void win.minimize()}
            className="traffic focus-ring grid h-7 w-7 place-items-center rounded-lg text-muted transition hover:bg-line/[0.08] hover:text-ink"
          >
            <Minus size={14} />
          </button>
          <button
            title="Maximize"
            onClick={() => void win.toggleMaximize().then(() => win.isMaximized()).then(setMaximized)}
            className="traffic focus-ring grid h-7 w-7 place-items-center rounded-lg text-muted transition hover:bg-line/[0.08] hover:text-ink"
          >
            {maximized ? <Square size={11} /> : <Square size={13} />}
          </button>
          <button
            title="Close"
            onClick={() => void win.close()}
            className="traffic focus-ring grid h-7 w-7 place-items-center rounded-lg text-muted transition hover:bg-bad/20 hover:text-bad"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

function Sidebar({ page, onNavigate }: { page: PageId; onNavigate: (p: PageId) => void }) {
  const { snapshot, connected, refresh } = useTelemetry();
  return (
    <aside className="flex w-[232px] shrink-0 flex-col border-r border-line/[0.06] bg-[rgb(var(--c-surface)/0.35)] backdrop-blur-xl">
      <div className="flex h-[52px] items-center border-b border-line/[0.06] px-3">
        <Logo />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
        <p className="mb-3 px-3 text-[9px] font-semibold uppercase tracking-[0.18em] text-faint">Workspace</p>
        {NAV.map((item) => {
          const active = item.id === page;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={clsx(
                "focus-ring group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-200",
                active
                  ? "bg-accent/[0.11] text-accent shadow-[inset_0_0_0_1px_rgb(var(--c-accent)/0.16)]"
                  : "text-muted hover:bg-line/[0.05] hover:text-ink",
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-accent"
                />
              )}
              <Icon size={17} strokeWidth={active ? 2.2 : 1.8} />
              <span className="min-w-0">
                <span className="block text-xs font-medium">{item.label}</span>
                <span className="block truncate text-[9px] opacity-60">{item.description}</span>
              </span>
            </button>
          );
        })}

        <p className="mb-3 mt-7 px-3 text-[9px] font-semibold uppercase tracking-[0.18em] text-faint">System</p>
        <button
          onClick={() => onNavigate("settings")}
          className={clsx(
            "focus-ring flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-200",
            page === "settings" ? "bg-accent/[0.11] text-accent" : "text-muted hover:bg-line/[0.05] hover:text-ink",
          )}
        >
          <Settings2 size={17} strokeWidth={1.8} />
          <span>
            <span className="block text-xs font-medium">Settings</span>
            <span className="block truncate text-[9px] opacity-60">Preferences</span>
          </span>
        </button>
      </nav>

      <div className="p-3">
        <div className="glass-subtle rounded-xl p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[10px] font-medium text-muted">
              <span className={clsx("h-1.5 w-1.5 rounded-full", connected ? "bg-good" : "bg-bad")} />
              {connected ? "System online" : "Monitoring paused"}
            </span>
            <button onClick={() => void refresh()} title="Refresh now" className="focus-ring rounded-md p-1 text-faint transition hover:text-accent">
              <RefreshCw size={12} />
            </button>
          </div>
          <p className="numeric mt-2 truncate text-[10px] text-ink/80">
            {snapshot ? `${snapshot.system.distribution} ${snapshot.system.version}` : "Waiting for telemetry…"}
          </p>
          <p className="numeric mt-0.5 text-[9px] text-faint">
            {snapshot ? `Uptime ${duration(snapshot.cpu.uptimeSeconds)} · ${bytes(snapshot.memory.totalBytes)} RAM` : "—"}
          </p>
        </div>
      </div>
    </aside>
  );
}

const DownloadsPage = () => <Organizer location="downloads" />;
const DesktopPage = () => <Organizer location="desktop" />;

const PAGES: Record<PageId, ComponentType> = {
  dashboard: Dashboard,
  hardware: Hardware,
  performance: Performance,
  organizer: DownloadsPage,
  desktop: DesktopPage,
  processes: Processes,
  network: NetworkPage,
  ssh: SshPage,
  settings: SettingsPage,
};

export function AppShell() {
  const [page, setPage] = useState<PageId>("dashboard");
  const Page = PAGES[page];

  return (
    <div className="flex h-full w-full overflow-hidden rounded-[inherit]">
      <Sidebar page={page} onNavigate={setPage} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TitleBar page={page} />
        <main className="min-h-0 flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto w-full max-w-[1620px] px-6 py-6 lg:px-8"
            >
              <Suspense fallback={<div className="skeleton h-[420px] rounded-2xl" />}>
                <Page />
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
