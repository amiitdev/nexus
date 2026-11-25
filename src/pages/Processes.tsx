import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Cpu,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Skull,
  X,
} from "lucide-react";
import clsx from "clsx";
import { api, isTauri } from "../lib/api";
import { bytes, dateTime, percent } from "../lib/format";
import { Badge, Button, Segmented, Toggle } from "../components/ui/Controls";
import { Modal } from "../components/ui/Modal";
import { PageHeader } from "../components/ui/PageHeader";
import type { ProcessInfo, ProcessList } from "../types";

type SortKey = "cpu" | "memory" | "name" | "pid";

function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`focus-ring flex items-center gap-1 rounded transition hover:text-ink ${
        active ? "text-accent" : ""
      }`}
      title={`Sort by ${label}`}
    >
      {label}
      {active && (dir === "asc" ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
    </button>
  );
}

export function Processes() {
  const [list, setList] = useState<ProcessList | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("cpu");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [auto, setAuto] = useState(true);
  const [selected, setSelected] = useState<ProcessInfo | null>(null);
  const [confirm, setConfirm] = useState<{ process: ProcessInfo; force: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isTauri()) return;
    try {
      setList(await api.processes());
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void load();
    if (!auto) return;
    const id = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(id);
  }, [auto, load]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = (list?.processes ?? []).filter(
      (p) => !q || p.name.toLowerCase().includes(q) || String(p.pid).includes(q) || p.user.toLowerCase().includes(q),
    );
    const direction = sortDir === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      if (sort === "cpu") return (a.cpuUsage - b.cpuUsage) * direction;
      if (sort === "memory") return (a.memoryBytes - b.memoryBytes) * direction;
      if (sort === "pid") return (a.pid - b.pid) * direction;
      return a.name.localeCompare(b.name) * direction;
    });
  }, [list, query, sort, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sort === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setSortDir(key === "name" || key === "pid" ? "asc" : "desc");
    }
  };

  const terminate = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      await api.terminate(confirm.process.pid, confirm.force);
      setNotice(`${confirm.process.name} (${confirm.process.pid}) terminated.`);
      setConfirm(null);
      setSelected(null);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Process control"
        title="Process manager"
        subtitle={list ? `${list.total} processes · refreshed ${dateTime(list.timestamp)}` : "Reading process table…"}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-2 text-[10px] text-muted">Auto refresh <Toggle checked={auto} onChange={setAuto} label="Auto refresh" /></span>
            <Button size="sm" onClick={() => void load()}><RefreshCw size={12} /> Refresh</Button>
          </div>
        }
      />

      {error && <div className="rounded-xl border border-bad/25 bg-bad/[0.07] px-4 py-3 text-[11px] text-bad">{error}</div>}
      {notice && <div className="rounded-xl border border-good/25 bg-good/[0.07] px-4 py-3 text-[11px] text-good">{notice}</div>}

      <div className="glass-panel overflow-hidden rounded-2xl">
        <div className="flex flex-wrap items-center gap-3 border-b border-line/[0.06] px-4 py-3">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl glass-subtle px-3">
            <Search size={14} className="text-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, PID or user…"
              className="w-full bg-transparent py-2 text-[11px] text-ink outline-none placeholder:text-faint"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-faint">Sort</span>
            <Segmented
              size="sm"
              value={sort}
              onChange={(value) => {
                setSort(value);
                setSortDir(value === "name" || value === "pid" ? "asc" : "desc");
              }}
              options={[
                { value: "cpu", label: "CPU" },
                { value: "memory", label: "Memory" },
                { value: "name", label: "Name" },
                { value: "pid", label: "PID" },
              ]}
            />
          </div>
          <span className="numeric text-[10px] text-faint">{rows.length} shown</span>
        </div>

        <div className="grid grid-cols-[minmax(200px,2.6fr)_minmax(80px,1fr)_minmax(70px,0.8fr)_minmax(90px,1.1fr)_minmax(90px,1.1fr)_28px] gap-3 border-b border-line/[0.06] px-4 py-2.5 text-[9px] uppercase tracking-[0.12em] text-faint">
          <SortHeader label="Process" active={sort === "name"} dir={sortDir} onClick={() => toggleSort("name")} />
          <span>User</span>
          <span>Status</span>
          <SortHeader label="CPU" active={sort === "cpu"} dir={sortDir} onClick={() => toggleSort("cpu")} />
          <SortHeader label="Memory" active={sort === "memory"} dir={sortDir} onClick={() => toggleSort("memory")} />
          <span />
        </div>

        <div className="max-h-[62vh] overflow-y-auto">
          {rows.slice(0, 300).map((p) => (
            <button
              key={p.pid}
              onClick={() => setSelected(p)}
              className={clsx(
                "grid w-full grid-cols-[minmax(200px,2.6fr)_minmax(80px,1fr)_minmax(70px,0.8fr)_minmax(90px,1.1fr)_minmax(90px,1.1fr)_28px] items-center gap-3 border-b border-line/[0.04] px-4 py-2.5 text-left transition hover:bg-line/[0.035]",
                selected?.pid === p.pid && "bg-accent/[0.06]",
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-line/[0.06] text-faint"><Cpu size={11} /></span>
                <span className="min-w-0">
                  <span className="block truncate text-[11px] text-ink" title={p.name}>{p.name}</span>
                  <span
                    className="numeric block truncate text-[9px] text-faint"
                    title={p.command ?? p.executable ?? undefined}
                  >
                    PID {p.pid}
                    {(p.executable ?? p.command)
                      ? ` · ${(p.executable ?? p.command ?? "").split("/").slice(-2).join("/")}`
                      : ""}
                  </span>
                </span>
                {p.isCritical && <ShieldAlert size={11} className="shrink-0 text-warn" />}
              </span>
              <span className="truncate text-[10px] text-muted">{p.user}</span>
              <span><Badge tone={p.status.toLowerCase().includes("run") ? "good" : "neutral"}>{p.status}</Badge></span>
              <span className="flex items-center gap-2">
                <span className="numeric w-8 text-right text-[10px] text-ink">{p.cpuUsage.toFixed(1)}%</span>
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-line/[0.08]">
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(100, p.cpuUsage)}%` }} />
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className="numeric w-14 text-right text-[10px] text-ink">{bytes(p.memoryBytes)}</span>
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-line/[0.08]">
                  <span className="block h-full rounded-full bg-[#22d3ee]" style={{ width: `${Math.min(100, p.memoryPercent * 10)}%` }} />
                </span>
              </span>
              <span />
            </button>
          ))}
          {rows.length === 0 && (
            <p className="py-14 text-center text-[11px] text-faint">{list ? "No processes match your search." : "Waiting for process data…"}</p>
          )}
        </div>
      </div>

      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="glass-panel fixed right-5 top-5 z-40 flex max-h-[calc(100vh-40px)] w-[380px] flex-col overflow-hidden rounded-2xl"
          >
            <div className="flex items-start justify-between border-b border-line/[0.06] px-5 py-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{selected.name}</p>
                <p className="numeric mt-0.5 text-[10px] text-faint">PID {selected.pid} · {selected.user}</p>
              </div>
              <button onClick={() => setSelected(null)} className="focus-ring rounded-lg p-1 text-faint hover:text-ink"><X size={15} /></button>
            </div>
            <div className="space-y-3 overflow-y-auto px-5 py-4">
              {[
                ["CPU usage", percent(selected.cpuUsage, 1)],
                ["Memory", `${bytes(selected.memoryBytes)} (${percent(selected.memoryPercent, 2)})`],
                ["Status", selected.status],
                ["Executable", selected.executable ?? "Not available"],
                ["Command", selected.command ?? "Not available"],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-[9px] uppercase tracking-[0.12em] text-faint">{label}</p>
                  <p className="numeric mt-1 break-all text-[11px] text-ink/90">{value}</p>
                </div>
              ))}
              {selected.isCritical && (
                <div className="flex items-start gap-2 rounded-xl bg-warn/[0.08] p-3 text-[10px] text-warn">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  This process may be a critical system service. Extra confirmation is required.
                </div>
              )}
            </div>
            <div className="border-t border-line/[0.06] px-5 py-4">
              <Button variant="danger" className="w-full" onClick={() => setConfirm({ process: selected, force: selected.isCritical })}>
                <Skull size={14} /> Terminate process
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title="Terminate process?"
        description={
          confirm?.force
            ? `${confirm.process.name} appears to be a system service. Terminating it may destabilize your session. This sends SIGKILL and requires final confirmation.`
            : `${confirm?.process.name ?? "This process"} (PID ${confirm?.process.pid ?? "—"}) will receive SIGTERM. Unsaved work may be lost.`
        }
        footer={
          <>
            <Button onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => void terminate()} disabled={busy}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Skull size={14} />}
              {confirm?.force ? "Yes, force terminate" : "Terminate"}
            </Button>
          </>
        }
      >
        {confirm && (
          <div className="glass-subtle rounded-xl p-3 text-[11px]">
            <p className="numeric text-ink">{confirm.process.name} · PID {confirm.process.pid}</p>
            <p className="mt-1 text-muted">{confirm.process.command ?? "No command line available"}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
