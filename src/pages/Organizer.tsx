import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  Archive,
  ArrowRight,
  Check,
  Code2,
  FileArchive,
  FileCode2,
  FileImage,
  FileMusic,
  FileText,
  Film,
  FolderInput,
  FolderOpen,
  History,
  Loader2,
  Package,
  RotateCcw,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Trash2,
  Undo2,
} from "lucide-react";
import type { ReactNode } from "react";
import { api, isTauri } from "../lib/api";
import { bytes, dateTime } from "../lib/format";
import { Button, Badge, Toggle, Segmented } from "../components/ui/Controls";
import { Modal } from "../components/ui/Modal";
import { Panel } from "../components/ui/Panel";
import { PageHeader } from "../components/ui/PageHeader";
import { useSettings } from "../store/settings";
import type { CategoryRule, OrganizeOperation, OrganizePreview, OrganizeResult } from "../types";

const CATEGORY_ICONS: Record<string, ReactNode> = {
  Documents: <FileText size={16} />,
  Images: <FileImage size={16} />,
  Videos: <Film size={16} />,
  Audio: <FileMusic size={16} />,
  Archives: <Archive size={16} />,
  Applications: <Package size={16} />,
  Code: <Code2 size={16} />,
  Other: <FolderOpen size={16} />,
};

type Location = "downloads" | "desktop" | "custom";

export function Organizer({ location = "downloads" }: { location?: "downloads" | "desktop" }) {
  const settings = useSettings((s) => s.settings);
  const patch = useSettings((s) => s.patch);
  const saveSettings = useSettings((s) => s.save);
  const [activeLocation, setActiveLocation] = useState<Location>(location);
  const [dir, setDir] = useState("");
  const [preview, setPreview] = useState<OrganizePreview | null>(null);
  const [history, setHistory] = useState<OrganizeOperation[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<OrganizeResult | null>(null);
  const [showRules, setShowRules] = useState(false);

  const loadHistory = useCallback(async () => {
    if (!isTauri()) return;
    try {
      setHistory(await api.history());
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    setActiveLocation(location);
    if (!isTauri()) return;
    const loader = location === "desktop" ? api.desktopDir() : api.downloadsDir();
    void loader.then(setDir).catch(() => undefined);
  }, [location]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const grouped = useMemo(() => {
    const map = new Map<string, { count: number; bytes: number }>();
    preview?.files.forEach((f) => {
      const entry = map.get(f.category) ?? { count: 0, bytes: 0 };
      entry.count += 1;
      entry.bytes += f.sizeBytes;
      map.set(f.category, entry);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].bytes - a[1].bytes);
  }, [preview]);

  const scan = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    setResult(null);
    try {
      const next = await api.preview(dir || null, null);
      setPreview(next);
      if (next.totalFiles === 0) setNotice("Nothing to organize — the folder is already tidy.");
    } catch (e) {
      setError(String(e));
      setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  const organize = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await api.organize(preview.id);
      setResult(outcome);
      setNotice(`Moved ${outcome.movedCount} file${outcome.movedCount === 1 ? "" : "s"} safely.`);
      setConfirmOpen(false);
      setPreview(null);
      await loadHistory();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const undo = async (id: string) => {
    setBusy(true);
    try {
      const [count, failures] = await api.undo(id);
      setNotice(`Restored ${count} file${count === 1 ? "" : "s"}${failures.length ? ` · ${failures.length} skipped` : ""}.`);
      await loadHistory();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const restoreOne = async (operation: string, destination: string) => {
    setBusy(true);
    try {
      await api.restore(operation, destination);
      setNotice("File restored to its original location.");
      await loadHistory();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const browse = async () => {
    if (!isTauri()) return;
    const picked = await openDialog({ directory: true, title: "Choose a folder to organize" });
    if (typeof picked === "string") {
      setDir(picked);
      if (activeLocation === "downloads") {
        patch({ downloadsDir: picked });
        void saveSettings();
      }
    }
  };

  const updateRule = (index: number, next: CategoryRule) => {
    const categories = settings.categories.map((c, i) => (i === index ? next : c));
    patch({ categories });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="File intelligence"
        title={activeLocation === "desktop" ? "Desktop organizer" : "Downloads organizer"}
        subtitle="Preview first, move safely, restore anytime — nothing is deleted or overwritten"
        action={
          <Badge tone="accent"><ShieldCheck size={11} /> Safe file operations</Badge>
        }
      />

      {error && (
        <div className="rounded-xl border border-bad/25 bg-bad/[0.07] px-4 py-3 text-[11px] text-bad">{error}</div>
      )}
      {notice && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-good/25 bg-good/[0.07] px-4 py-3 text-[11px] text-good">
          {notice}
        </motion.div>
      )}

      <Panel title="Source folder" subtitle="Files are sorted by extension into category folders" icon={<FolderInput size={15} />}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-[10px] text-faint">Location</span>
          <Segmented
            size="sm"
            value={activeLocation}
            onChange={(value) => {
              setActiveLocation(value);
              if (!isTauri()) return;
              if (value === "downloads") void api.downloadsDir().then(setDir);
              else if (value === "desktop") void api.desktopDir().then(setDir);
            }}
            options={[
              { value: "downloads" as const, label: "Downloads" },
              { value: "desktop" as const, label: "Desktop" },
              { value: "custom" as const, label: "Custom" },
            ]}
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl glass-subtle px-3.5">
            <FolderOpen size={15} className="shrink-0 text-faint" />
            <input
              value={dir}
              onChange={(e) => setDir(e.target.value)}
              placeholder="~/Downloads"
              spellCheck={false}
              className="numeric w-full bg-transparent py-3 text-[11px] text-ink outline-none placeholder:text-faint"
            />
          </div>
          <Button onClick={() => void browse()} disabled={!isTauri()} title={isTauri() ? "Browse" : "Available in the desktop app"}>
            Browse
          </Button>
          <Button variant="primary" onClick={() => void scan()} disabled={busy || !dir.trim()}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <ScanSearch size={14} />}
            Preview organization
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] text-muted">
          <span className="flex items-center gap-1.5"><Check size={11} className="text-good" /> Hidden files ignored</span>
          <span className="flex items-center gap-1.5"><Check size={11} className="text-good" /> Incomplete downloads skipped</span>
          <span className="flex items-center gap-1.5"><Check size={11} className="text-good" /> Collisions renamed, never overwritten</span>
          <span className="flex items-center gap-1.5"><Check size={11} className="text-good" /> Symbolic links skipped</span>
        </div>
      </Panel>

      <AnimatePresence>
        {preview && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { label: "Files to move", value: String(preview.totalFiles), icon: <FileArchive size={15} /> },
                { label: "Total size", value: bytes(preview.totalBytes), icon: <Archive size={15} /> },
                { label: "Skipped safely", value: String(preview.skipped.length), icon: <ShieldCheck size={15} /> },
              ].map((item) => (
                <div key={item.label} className="glass-panel flex items-center gap-3 rounded-2xl px-5 py-4">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/10 text-accent">{item.icon}</span>
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.14em] text-faint">{item.label}</p>
                    <p className="numeric mt-0.5 text-lg text-ink">{item.value}</p>
                  </div>
                </div>
              ))}
            </div>

            <Panel
              title="Preview"
              subtitle="Exact destination of every file — review before confirming"
              icon={<Sparkles size={15} />}
              action={<Button variant="primary" size="sm" onClick={() => setConfirmOpen(true)} disabled={preview.totalFiles === 0}>Organize {preview.totalFiles} files</Button>}
            >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
                {grouped.map(([category, info]) => (
                  <div key={category} className="glass-subtle rounded-xl px-3 py-3">
                    <div className="flex items-center gap-2 text-accent">{CATEGORY_ICONS[category] ?? <FolderOpen size={15} />}
                      <span className="truncate text-[10px] font-medium text-ink">{category}/</span>
                    </div>
                    <p className="numeric mt-2 text-sm text-ink">{info.count}</p>
                    <p className="numeric text-[9px] text-faint">{bytes(info.bytes)}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 max-h-[380px] overflow-y-auto rounded-xl border border-line/[0.06]">
                {preview.files.map((file) => (
                  <div key={file.source} className="flex items-center gap-3 border-b border-line/[0.04] px-3 py-2 last:border-0">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-line/[0.06] text-faint">
                      {CATEGORY_ICONS[file.category] ?? <FolderOpen size={12} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] text-ink">{file.name}</p>
                      <p className="numeric truncate text-[9px] text-faint">{file.category}{file.folder ? `/${file.folder}` : ""}/{file.name}</p>
                    </div>
                    <ArrowRight size={12} className="shrink-0 text-faint" />
                    <span className="numeric shrink-0 text-[10px] text-muted">{bytes(file.sizeBytes)}</span>
                  </div>
                ))}
              </div>
              {preview.skipped.length > 0 && (
                <p className="mt-3 text-[10px] text-faint">
                  {preview.skipped.length} file{preview.skipped.length === 1 ? "" : "s"} skipped: {preview.skipped.slice(0, 4).map((s) => `${s.name} (${s.reason})`).join(", ")}
                  {preview.skipped.length > 4 ? "…" : ""}
                </p>
              )}
            </Panel>
          </motion.div>
        )}
      </AnimatePresence>

      {result && (
        <Panel title="Organization result" icon={<Check size={15} />}>
          <p className="text-xs text-ink">{result.movedCount} files moved · {bytes(result.bytesMoved)}</p>
          {result.failed.length > 0 && (
            <div className="mt-3 space-y-1">
              {result.failed.map((f) => (
                <p key={f.source} className="numeric text-[10px] text-warn">{f.source} — {f.reason}</p>
              ))}
            </div>
          )}
        </Panel>
      )}

      <Panel title="Operation history" subtitle="Undo an entire operation or restore individual files" icon={<History size={15} />}>
        {history.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <History size={22} className="text-faint/50" />
            <p className="text-[11px] text-faint">No organizing operations yet</p>
            <p className="text-[10px] text-faint/60">Your moves will be journaled here for one-click restore</p>
          </div>
        ) : (
          <div className="space-y-2">
            {history.slice().reverse().map((op) => (
              <div key={op.id} className="glass-subtle rounded-xl p-3.5">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="numeric text-[10px] text-ink">{dateTime(op.timestamp)} · {op.moves.length} files</p>
                    <p className="numeric truncate text-[9px] text-faint">{op.sourceDir}</p>
                  </div>
                  <Button size="sm" onClick={() => void undo(op.id)} disabled={busy}>
                    <Undo2 size={12} /> Undo all
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {op.moves.map((m) => (
                    <button
                      key={m.destination}
                      onClick={() => void restoreOne(op.id, m.destination)}
                      title={`Restore ${m.destination}`}
                      className="numeric focus-ring flex max-w-[220px] items-center gap-1.5 rounded-lg bg-line/[0.05] px-2 py-1 text-[9px] text-muted transition hover:text-accent"
                    >
                      <RotateCcw size={10} className="shrink-0" />
                      <span className="truncate">{m.destination.split("/").pop()}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="Category rules"
        subtitle="Edit extensions to customize where files go"
        icon={<FileCode2 size={15} />}
        action={<Button size="sm" onClick={() => setShowRules((v) => !v)}>{showRules ? "Hide" : "Customize"}</Button>}
      >
        {!showRules ? (
          <p className="text-[11px] text-muted">
            {settings.categories.length} categories · change sorting rules, then save in Settings.
          </p>
        ) : (
          <div className="space-y-3">
            {settings.categories.map((category, ci) => (
              <div key={category.name} className="glass-subtle rounded-xl p-3.5">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-2 text-xs font-medium text-ink">
                    {CATEGORY_ICONS[category.name] ?? <FolderOpen size={14} />} {category.name}
                  </p>
                  <button
                    onClick={() => patch({ categories: settings.categories.filter((_, i) => i !== ci) })}
                    className="focus-ring rounded-md p-1 text-faint transition hover:text-bad"
                    title="Remove category"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {category.folders.map((folder, fi) => (
                    <label key={folder.name} className="block">
                      <span className="text-[9px] uppercase tracking-[0.1em] text-faint">{folder.name}/</span>
                      <input
                        value={folder.extensions.join(", ")}
                        onChange={(e) => {
                          const extensions = e.target.value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
                          const next = { ...category, folders: category.folders.map((f, i) => (i === fi ? { ...f, extensions } : f)) };
                          next.extensions = Array.from(new Set(next.folders.flatMap((f) => f.extensions)));
                          updateRule(ci, next);
                        }}
                        className="numeric mt-1 w-full rounded-lg border border-line/[0.07] bg-base/40 px-2.5 py-1.5 text-[10px] text-ink outline-none focus:border-accent/50"
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => patch({ categories: [...settings.categories, { name: "New category", extensions: [], folders: [{ name: "Other", extensions: [] }] }] })}
              >
                Add category
              </Button>
              <Button size="sm" variant="primary" onClick={() => void saveSettings()}>Save rules</Button>
            </div>
            <p className="text-[10px] text-faint">
              Settings: <Toggle checked={settings.ignoreHidden} onChange={(v) => { patch({ ignoreHidden: v }); void saveSettings(); }} label="Ignore hidden" /> ignore hidden files ·
              <span className="ml-1"><Toggle checked={settings.excludeIncomplete} onChange={(v) => { patch({ excludeIncomplete: v }); void saveSettings(); }} label="Exclude incomplete" /> exclude incomplete downloads</span>
            </p>
          </div>
        )}
      </Panel>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirm organization"
        description="NEXUS will move the files below. No file will be deleted or overwritten; existing names get a numeric suffix."
        footer={
          <>
            <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => void organize()} disabled={busy}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
              Organize {preview?.totalFiles ?? 0} files
            </Button>
          </>
        }
      >
        {preview && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="glass-subtle rounded-xl p-3">
                <p className="text-[9px] uppercase tracking-wider text-faint">From</p>
                <p className="numeric mt-1 truncate text-[11px] text-ink">{preview.sourceDir}</p>
              </div>
              <div className="glass-subtle rounded-xl p-3">
                <p className="text-[9px] uppercase tracking-wider text-faint">Files / size</p>
                <p className="numeric mt-1 text-[11px] text-ink">{preview.totalFiles} · {bytes(preview.totalBytes)}</p>
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-xl border border-line/[0.06]">
              {preview.files.slice(0, 60).map((f) => (
                <p key={f.source} className="numeric flex items-center gap-2 border-b border-line/[0.04] px-3 py-1.5 text-[10px] last:border-0">
                  <span className="truncate text-muted">{f.name}</span>
                  <ArrowRight size={10} className="shrink-0 text-faint" />
                  <span className="truncate text-accent">{f.category}{f.folder ? `/${f.folder}` : ""}/</span>
                </p>
              ))}
              {preview.files.length > 60 && <p className="px-3 py-2 text-[10px] text-faint">…and {preview.files.length - 60} more</p>}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
