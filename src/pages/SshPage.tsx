import { useCallback, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronUp,
  Download,
  Eye,
  FileArchive,
  FileCode2,
  FileImage,
  FileText,
  Film,
  Folder,
  FolderPlus,
  HardDrive,
  Home,
  KeyRound,
  Loader2,
  LockKeyhole,
  Monitor,
  Music2,
  Pencil,
  Plug,
  PlugZap,
  Plus,
  RefreshCw,
  Server,
  ShieldCheck,
  Smartphone,
  Trash2,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { Badge, Button, Segmented } from "../components/ui/Controls";
import { Modal } from "../components/ui/Modal";
import { PageHeader } from "../components/ui/PageHeader";
import { api, isTauri } from "../lib/api";
import { bytes } from "../lib/format";
import type {
  SshConnection,
  SshDetectedHost,
  SshDeviceStatus,
  SshFileEntry,
  SshListing,
  SshTransferProgress,
} from "../types";

const TEXT_FILE = /\.(txt|md|markdown|json|ya?ml|toml|log|conf|ini|cfg|py|js|jsx|ts|tsx|rs|go|sh|bash|zsh|css|html|xml|csv|env)$/i;

const blankConnection = (): SshConnection => ({
  id: `ssh-${Date.now()}`,
  name: "",
  host: "",
  port: 22,
  username: "",
  authMethod: "password",
  password: null,
  privateKeyPath: null,
  passphrase: null,
  remoteHome: null,
  fingerprint: null,
  createdAt: Date.now(),
});

function parentOf(path: string): string {
  const parts = path.replace(/\/+$/, "").split("/");
  parts.pop();
  return parts.join("/") || "/";
}

function joinPath(base: string, name: string): string {
  if (base === "/") return `/${name}`;
  return `${base.replace(/\/+$/, "")}/${name}`;
}

function FileIcon({ entry, size = 13 }: { entry: SshFileEntry; size?: number }) {
  if (entry.kind === "dir") return <Folder size={size} className="text-accent" />;
  if (entry.kind === "link") return <ArrowUp size={size} className="rotate-45 text-warn" />;
  const name = entry.name.toLowerCase();
  if (/\.(png|jpe?g|gif|svg|webp|bmp)$/.test(name)) return <FileImage size={size} className="text-[#38bdf8]" />;
  if (/\.(mp4|mkv|avi|mov|webm)$/.test(name)) return <Film size={size} className="text-[#f472b6]" />;
  if (/\.(mp3|wav|flac|ogg|m4a)$/.test(name)) return <Music2 size={size} className="text-[#a78bfa]" />;
  if (/\.(zip|rar|7z|tar|gz|xz)$/.test(name)) return <FileArchive size={size} className="text-amber-300" />;
  if (/\.(py|js|ts|jsx|tsx|rs|go|sh|java|c|cpp|json|ya?ml|toml)$/.test(name)) return <FileCode2 size={size} className="text-emerald-300" />;
  return <FileText size={size} className="text-muted" />;
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.1em] text-faint">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[10px] text-faint">{hint}</span>}
    </label>
  );
}

const inputClass =
  "numeric w-full rounded-xl glass-subtle px-3 py-2.5 text-[11px] text-ink outline-none transition placeholder:text-faint focus:border-accent/40";

function DeviceIcon({ name }: { name: string }) {
  const lower = name.toLowerCase();
  if (lower.includes("phone") || lower.includes("mobile") || lower.includes("android") || lower.includes("iphone")) {
    return <Smartphone size={15} />;
  }
  if (lower.includes("laptop") || lower.includes("desktop") || lower.includes("pc")) {
    return <Monitor size={15} />;
  }
  return <Server size={15} />;
}

type Side = "local" | "remote";

export function SshPage() {
  const [connections, setConnections] = useState<SshConnection[]>([]);
  const [statuses, setStatuses] = useState<SshDeviceStatus[]>([]);
  const [detected, setDetected] = useState<SshDetectedHost[]>([]);
  const [suggestedKey, setSuggestedKey] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [localPath, setLocalPath] = useState("");
  const [remotePath, setRemotePath] = useState("");
  const [local, setLocal] = useState<SshListing | null>(null);
  const [remote, setRemote] = useState<SshListing | null>(null);
  const [localSelected, setLocalSelected] = useState<Set<string>>(new Set());
  const [remoteSelected, setRemoteSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editor, setEditor] = useState<SshConnection | null>(null);
  const [trust, setTrust] = useState<{ connection: SshConnection; fingerprint: string } | null>(null);
  const [transfers, setTransfers] = useState<Record<string, SshTransferProgress>>({});
  const [preview, setPreview] = useState<{ name: string; text: string } | null>(null);
  const [folderDialog, setFolderDialog] = useState<Side | null>(null);
  const [folderName, setFolderName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ side: Side; entry: SshFileEntry } | null>(null);

  const active = connections.find((c) => c.id === activeId) ?? null;
  const activeStatus = statuses.find((s) => s.id === activeId);
  const connected = activeStatus?.connected ?? false;

  const refreshLocal = useCallback(async (path?: string) => {
    if (!isTauri()) return;
    const target = path ?? localPath;
    if (!target) return;
    try {
      setLocal(await api.sshLocalList(target));
    } catch (e) {
      setError(String(e));
    }
  }, [localPath]);

  const refreshRemote = useCallback(async () => {
    if (!active || !connected || !isTauri()) return;
    try {
      setRemote(await api.sshListDir(active, remotePath));
    } catch (e) {
      setError(String(e));
    }
  }, [active, connected, remotePath]);

  const load = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const [conns, stats, hosts, home, key] = await Promise.all([
        api.sshConnections(),
        api.sshStatuses(),
        api.sshDetectedHosts(),
        api.sshLocalHome(),
        api.sshSuggestKey(),
      ]);
      setConnections(conns);
      setStatuses(stats);
      setDetected(hosts);
      setSuggestedKey(key);
      setLocalPath((previous) => previous || home);
      setActiveId((previous) => previous ?? conns[0]?.id ?? null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void refreshLocal();
  }, [localPath, refreshLocal]);

  useEffect(() => {
    void refreshRemote();
  }, [refreshRemote]);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    void listen<SshTransferProgress>("ssh-transfer", (event) => {
      setTransfers((previous) => ({ ...previous, [event.payload.id]: event.payload }));
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  const refreshDevices = async () => {
    if (!isTauri()) return;
    const [conns, stats] = await Promise.all([api.sshConnections(), api.sshStatuses()]);
    setConnections(conns);
    setStatuses(stats);
  };

  const connectDevice = async (connection: SshConnection) => {
    setBusy("Connecting");
    setError(null);
    try {
      const result = await api.sshConnect(connection);
      if (result.needsTrust && result.fingerprint) {
        setTrust({ connection, fingerprint: result.fingerprint });
        return;
      }
      if (!result.connected) {
        setError(result.error ?? "Could not connect to this device.");
        return;
      }
      setActiveId(connection.id);
      setRemotePath("");
      setNotice(`Connected to ${connection.name || connection.host}.`);
      await refreshDevices();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  const disconnectDevice = async (id: string) => {
    setBusy("Disconnecting");
    try {
      setStatuses(await api.sshDisconnect(id));
      setRemote(null);
      setRemoteSelected(new Set());
      setNotice("Device disconnected.");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  const saveDevice = async () => {
    if (!editor || !isTauri()) return;
    setBusy("Saving");
    setError(null);
    try {
      const wasConnected = statuses.some((s) => s.id === editor.id && s.connected);
      if (wasConnected) await api.sshDisconnect(editor.id);
      const saved = await api.sshSaveConnection(editor);
      setConnections(saved);
      setEditor(null);
      const device = saved.find((c) => c.id === editor.id) ?? saved[saved.length - 1];
      setNotice(`Saved ${device.name}.`);
      await connectDevice(device);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  const trustAndConnect = async () => {
    if (!trust) return;
    setBusy("Trusting device");
    setError(null);
    try {
      const result = await api.sshAcceptKey(trust.connection, trust.fingerprint);
      setTrust(null);
      if (!result.connected) {
        setError(result.error ?? "Connection failed after trusting this device.");
        return;
      }
      setActiveId(trust.connection.id);
      setRemotePath("");
      setNotice("Host key trusted and saved. Connected securely.");
      await refreshDevices();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  const importHost = async (host: SshDetectedHost) => {
    setBusy("Importing");
    setError(null);
    try {
      const key = host.identityFile ?? suggestedKey;
      const candidate: SshConnection = {
        ...blankConnection(),
        name: host.name,
        host: host.host,
        port: host.port || 22,
        username: host.username,
        authMethod: key ? "key" : "agent",
        privateKeyPath: key,
      };
      const saved = await api.sshSaveConnection(candidate);
      setConnections(saved);
      const device = saved.find((c) => c.id === candidate.id) ?? candidate;
      setNotice(`Imported ${host.name} from ~/.ssh/config.`);
      await connectDevice(device);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  const toggleSelection = (side: Side, path: string) => {
    const setter = side === "local" ? setLocalSelected : setRemoteSelected;
    setter((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const openEntry = (side: Side, entry: SshFileEntry) => {
    if (entry.kind === "dir") {
      if (side === "local") {
        setLocalPath(entry.path);
        setLocalSelected(new Set());
      } else {
        setRemotePath(entry.path);
        setRemoteSelected(new Set());
      }
    } else {
      toggleSelection(side, entry.path);
    }
  };

  const previewRemote = async (entry: SshFileEntry) => {
    if (!active || !TEXT_FILE.test(entry.name)) {
      setNotice("Preview is available for text files only.");
      return;
    }
    setBusy("Reading file");
    try {
      const text = await api.sshReadFile(active, entry.path, 128 * 1024);
      setPreview({ name: entry.name, text });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  const transfer = async (direction: "upload" | "download") => {
    if (!active || !connected) return;
    const paths = direction === "upload" ? [...localSelected] : [...remoteSelected];
    if (paths.length === 0) {
      setNotice(`Select files in the ${direction === "upload" ? "local" : "remote"} pane first.`);
      return;
    }
    setBusy(direction === "upload" ? "Uploading" : "Downloading");
    setError(null);
    try {
      const results =
        direction === "upload"
          ? await api.sshUpload(active, paths, remotePath)
          : await api.sshDownload(active, paths, localPath);
      const failed = results.filter((r) => r.error);
      if (failed.length) {
        setError(failed.map((f) => `${f.label}: ${f.error}`).join(" · "));
      } else {
        const totalBytes = results.reduce((sum, r) => sum + r.total, 0);
        setNotice(`${direction === "upload" ? "Uploaded" : "Downloaded"} ${paths.length} item${paths.length === 1 ? "" : "s"} · ${bytes(totalBytes)}.`);
      }
      if (direction === "upload") setLocalSelected(new Set());
      else setRemoteSelected(new Set());
      await Promise.all([refreshLocal(), refreshRemote()]);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  const confirmFolder = async () => {
    const name = folderName.trim();
    if (!name || !folderDialog) return;
    setBusy("Creating folder");
    setError(null);
    try {
      if (folderDialog === "local") {
        await api.sshLocalCreateDir(joinPath(localPath, name));
        await refreshLocal();
      } else {
        if (!active) return;
        await api.sshCreateDir(active, joinPath(remotePath, name));
        await refreshRemote();
      }
      setNotice(`Created folder “${name}”.`);
      setFolderDialog(null);
      setFolderName("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy("Deleting");
    setError(null);
    try {
      if (deleteTarget.side === "local") {
        await api.sshLocalDelete(deleteTarget.entry.path);
        setLocalSelected(new Set());
        await refreshLocal();
      } else {
        if (!active) return;
        await api.sshDeleteRemote(active, deleteTarget.entry.path);
        setRemoteSelected(new Set());
        await refreshRemote();
      }
      setNotice(`Removed “${deleteTarget.entry.name}”.`);
      setDeleteTarget(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  const recentTransfers = useMemo(
    () => Object.values(transfers).sort((a, b) => a.id.localeCompare(b.id)).slice(-6).reverse(),
    [transfers],
  );

  const renderPane = (side: Side) => {
    const isLocal = side === "local";
    const listing = isLocal ? local : remote;
    const path = isLocal ? localPath : remotePath;
    const selected = isLocal ? localSelected : remoteSelected;
    const setPath = isLocal ? setLocalPath : setRemotePath;
    const title = isLocal ? "This device" : active?.name || "Remote device";

    return (
      <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line/[0.07] bg-[rgb(var(--c-surface)/0.45)]">
        <div className="flex items-center gap-2 border-b border-line/[0.06] px-3 py-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent/10 text-accent">
            {isLocal ? <HardDrive size={14} /> : <DeviceIcon name={active?.name ?? "device"} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold text-ink">{title}</p>
            <p className="text-[9px] text-faint">{isLocal ? "Local filesystem" : `${active?.username}@${active?.host}`}</p>
          </div>
          {!isLocal && connected && <Badge tone="good"><span className="h-1.5 w-1.5 rounded-full bg-good live-dot" /> Live</Badge>}
        </div>

        <div className="flex items-center gap-1.5 border-b border-line/[0.05] px-3 py-2">
          <button
            title="Parent folder"
            onClick={() => {
              setPath(parentOf(path || "/"));
              (isLocal ? setLocalSelected : setRemoteSelected)(new Set());
            }}
            className="focus-ring grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-line/[0.08] hover:text-ink"
          >
            <ChevronUp size={13} />
          </button>
          <button
            title="Home"
            onClick={() => {
              if (isLocal) setLocalPath(local?.path?.split("/").slice(0, 3).join("/") || "/");
              else setRemotePath("");
            }}
            className="focus-ring grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-line/[0.08] hover:text-ink"
          >
            <Home size={12} />
          </button>
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const target = (e.target as HTMLInputElement).value;
                if (isLocal) setLocalPath(target);
                else setRemotePath(target);
              }
            }}
            spellCheck={false}
            placeholder="/path/to/folder"
            className="numeric min-w-0 flex-1 bg-transparent py-1 text-[10px] text-muted outline-none placeholder:text-faint"
          />
          <button
            title="Refresh"
            onClick={() => (isLocal ? void refreshLocal() : void refreshRemote())}
            className="focus-ring grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-line/[0.08] hover:text-ink"
          >
            <RefreshCw size={12} />
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 border-b border-line/[0.05] px-3 py-2 text-[10px]">
          <span className="text-faint">{listing?.entries.length ?? 0} items {selected.size > 0 && <span className="text-accent">· {selected.size} selected</span>}</span>
          <div className="flex items-center gap-1">
            <button
              title="New folder"
              onClick={() => {
                setFolderDialog(side);
                setFolderName("");
              }}
              className="focus-ring grid h-6 w-6 place-items-center rounded-md text-muted transition hover:bg-line/[0.08] hover:text-accent"
            >
              <FolderPlus size={12} />
            </button>
            <button
              title="Delete selected item"
              disabled={selected.size !== 1}
              onClick={() => {
                const entry = listing?.entries.find((e) => selected.has(e.path));
                if (entry) setDeleteTarget({ side, entry });
              }}
              className="focus-ring grid h-6 w-6 place-items-center rounded-md text-muted transition hover:bg-bad/15 hover:text-bad disabled:opacity-30"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        <div className="h-[330px] overflow-y-auto">
          {!listing ? (
            <div className="grid h-full place-items-center text-[10px] text-faint">
              {isLocal ? "Loading local files…" : "Connect a device to browse its files"}
            </div>
          ) : listing.entries.length === 0 ? (
            <div className="grid h-full place-items-center text-[10px] text-faint">This folder is empty</div>
          ) : (
            listing.entries.map((entry) => (
              <div
                key={entry.path}
                className={`group flex items-center gap-2.5 border-b border-line/[0.035] px-3 py-2 last:border-0 transition ${
                  selected.has(entry.path) ? "bg-accent/[0.08]" : "hover:bg-line/[0.04]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(entry.path)}
                  onChange={() => toggleSelection(side, entry.path)}
                  className="h-3 w-3 shrink-0 accent-[rgb(var(--c-accent))]"
                />
                <button
                  onClick={() => openEntry(side, entry)}
                  onDoubleClick={() => !isLocal && void previewRemote(entry)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <FileIcon entry={entry} />
                  <span className="truncate text-[11px] text-ink">{entry.name}</span>
                </button>
                <span className="numeric shrink-0 text-[9px] text-faint">{entry.kind === "dir" ? "—" : bytes(entry.size)}</span>
                {!isLocal && TEXT_FILE.test(entry.name) && (
                  <button
                    title="Preview text file"
                    onClick={() => void previewRemote(entry)}
                    className="focus-ring hidden h-5 w-5 place-items-center rounded text-faint transition hover:text-accent group-hover:grid"
                  >
                    <Eye size={11} />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
        {listing && (
          <div className="numeric truncate border-t border-line/[0.05] px-3 py-1.5 text-[9px] text-faint" title={listing.path}>
            {listing.path}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Device network"
        title="SSH devices"
        subtitle="Connect devices, browse their folders and move files both ways over encrypted SFTP"
        action={
          <div className="flex items-center gap-2">
            <Badge tone="accent"><LockKeyhole size={11} /> End-to-end SSH</Badge>
            <Button variant="primary" size="sm" onClick={() => setEditor(blankConnection())}>
              <Plus size={13} /> Add device
            </Button>
          </div>
        }
      />

      {error && <div className="rounded-xl border border-bad/25 bg-bad/[0.07] px-4 py-3 text-[11px] text-bad">{error}</div>}
      {notice && (
        <div className="flex items-center gap-2 rounded-xl border border-good/25 bg-good/[0.07] px-4 py-3 text-[11px] text-good">
          <Check size={12} /> {notice}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[286px_minmax(0,1fr)]">
        <div className="space-y-4">
          <section className="glass-panel rounded-2xl p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-[12px] font-semibold text-ink">Saved devices</h2>
                <p className="text-[10px] text-muted">{connections.length} connection{connections.length === 1 ? "" : "s"}</p>
              </div>
              <button
                title="Refresh status"
                onClick={() => void refreshDevices()}
                className="focus-ring grid h-7 w-7 place-items-center rounded-lg text-muted transition hover:text-accent"
              >
                <RefreshCw size={12} />
              </button>
            </div>
            {connections.length === 0 ? (
              <p className="rounded-xl glass-subtle px-3 py-4 text-center text-[10px] text-faint">
                No devices yet. Add one or import from your SSH config.
              </p>
            ) : (
              <div className="space-y-2">
                {connections.map((conn) => {
                  const isConnected = statuses.find((s) => s.id === conn.id)?.connected ?? false;
                  const isActive = conn.id === activeId;
                  return (
                    <div
                      key={conn.id}
                      className={`rounded-xl border px-3 py-2.5 transition ${
                        isActive ? "border-accent/30 bg-accent/[0.07]" : "border-line/[0.06] bg-[rgb(var(--c-line)/0.025)]"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-line/[0.07] text-muted">
                          <DeviceIcon name={conn.name || conn.host} />
                        </span>
                        <button onClick={() => setActiveId(conn.id)} className="min-w-0 flex-1 text-left">
                          <p className="truncate text-[11px] font-medium text-ink">{conn.name || conn.host}</p>
                          <p className="numeric truncate text-[9px] text-faint">
                            {conn.username}@{conn.host}:{conn.port}
                          </p>
                        </button>
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isConnected ? "bg-good live-dot" : "bg-faint/40"}`} />
                      </div>
                      <div className="mt-2.5 flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant={isConnected ? "secondary" : "primary"}
                          className="flex-1"
                          disabled={busy !== null}
                          onClick={() => {
                            if (isConnected) void disconnectDevice(conn.id);
                            else void connectDevice(conn);
                          }}
                        >
                          {busy ? <Loader2 size={12} className="animate-spin" /> : isConnected ? <PlugZap size={12} /> : <Plug size={12} />}
                          {isConnected ? "Disconnect" : "Connect"}
                        </Button>
                        <button
                          title="Edit device"
                          onClick={() => setEditor({ ...conn })}
                          className="focus-ring grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-line/[0.08] hover:text-accent"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          title="Delete device"
                          onClick={async () => {
                            await api.sshDeleteConnection(conn.id);
                            if (activeId === conn.id) setActiveId(null);
                            await refreshDevices();
                            setNotice("Device removed from NEXUS.");
                          }}
                          className="focus-ring grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-bad/15 hover:text-bad"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {detected.length > 0 && (
            <section className="glass-panel rounded-2xl p-4">
              <div className="mb-1 flex items-center gap-2 text-accent">
                <ShieldCheck size={13} />
                <h2 className="text-[12px] font-semibold text-ink">Detected SSH hosts</h2>
              </div>
              <p className="mb-3 text-[10px] leading-relaxed text-muted">
                Found in <span className="numeric">~/.ssh/config</span> — import to connect with one click.
              </p>
              <div className="space-y-2">
                {detected.map((host, index) => {
                  const exists = connections.some((c) => c.host === host.host && c.username === host.username);
                  return (
                    <div key={`${host.name}-${index}`} className="flex items-center gap-2 rounded-xl glass-subtle px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] text-ink">{host.name}</p>
                        <p className="numeric truncate text-[9px] text-faint">{host.username || "user"}@{host.host}:{host.port}</p>
                      </div>
                      {exists ? (
                        <Badge tone="good"><Check size={10} /> Added</Badge>
                      ) : (
                        <Button size="sm" disabled={busy !== null} onClick={() => void importHost(host)}>
                          Import
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <div className="rounded-2xl glass-subtle p-4 text-[10px] leading-relaxed text-muted">
            <p className="mb-2 flex items-center gap-1.5 text-ink"><AlertTriangle size={12} className="text-warn" /> Safety first</p>
            <p>The host fingerprint is verified on first connect and stored. A changed fingerprint blocks the connection. Credentials stay in a local 0600 file — never in the cloud.</p>
          </div>
        </div>

        <section className="glass-panel rounded-2xl p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[13px] font-semibold text-ink">File transfer</h2>
              <p className="text-[10px] text-muted">
                {connected && active ? `Connected to ${active.name || active.host} · drag-free two-way browser` : "Select a device and connect to browse its folders"}
              </p>
            </div>
            {connected && active && (
              <Button variant="secondary" size="sm" onClick={() => void disconnectDevice(active.id)}>
                <PlugZap size={12} /> Disconnect
              </Button>
            )}
          </div>

          {!connected ? (
            <div className="grid min-h-[420px] place-items-center rounded-xl border border-dashed border-line/[0.1]">
              <div className="max-w-[320px] text-center">
                <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-accent/10 text-accent">
                  <Server size={24} />
                </span>
                <p className="text-[13px] font-medium text-ink">No active device</p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                  Add a device with its IP, username and password/key, or import an existing host from your SSH config. Then press Connect.
                </p>
                <Button variant="primary" size="sm" className="mt-4" onClick={() => setEditor(blankConnection())}>
                  <Plus size={12} /> Add device
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-[minmax(0,1fr)_64px_minmax(0,1fr)] items-start gap-2">
                {renderPane("local")}
                <div className="flex flex-col items-center justify-center gap-3 pt-24">
                  <button
                    title="Upload selected local files to this folder"
                    disabled={localSelected.size === 0 || busy !== null}
                    onClick={() => void transfer("upload")}
                    className="focus-ring grid h-10 w-10 place-items-center rounded-xl bg-accent/15 text-accent transition hover:bg-accent/25 disabled:opacity-30"
                  >
                    <Upload size={16} />
                  </button>
                  <button
                    title="Download selected remote files here"
                    disabled={remoteSelected.size === 0 || busy !== null}
                    onClick={() => void transfer("download")}
                    className="focus-ring grid h-10 w-10 place-items-center rounded-xl bg-accent/15 text-accent transition hover:bg-accent/25 disabled:opacity-30"
                  >
                    <Download size={16} />
                  </button>
                </div>
                {renderPane("remote")}
              </div>

              {recentTransfers.length > 0 && (
                <div className="rounded-xl border border-line/[0.06] p-3">
                  <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-faint">Recent transfers</p>
                  <div className="space-y-2">
                    {recentTransfers.map((t) => {
                      const pct = t.total > 0 ? Math.min(100, (t.transferred / t.total) * 100) : t.done ? 100 : 0;
                      return (
                        <div key={t.id} className="flex items-center gap-3">
                          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-line/[0.07] text-muted">
                            {t.direction === "upload" ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-[10px] text-ink">{t.label}</p>
                              <p className="numeric shrink-0 text-[9px] text-faint">
                                {bytes(t.transferred)} / {bytes(t.total)}
                              </p>
                            </div>
                            <div className="mt-1 h-1 overflow-hidden rounded-full bg-line/[0.1]">
                              <div
                                className={`h-full rounded-full transition-all ${t.error ? "bg-bad" : "bg-accent"}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                          {t.done && <Check size={12} className={t.error ? "text-bad" : "text-good"} />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Add / edit device */}
      <Modal
        open={editor !== null}
        onClose={() => setEditor(null)}
        title={editor && connections.some((c) => c.id === editor.id) ? "Edit SSH device" : "Add SSH device"}
        description="Saved locally. Passwords and key passphrases are written to a 0600 file."
        footer={
          <>
            <Button onClick={() => setEditor(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => void saveDevice()} disabled={busy !== null || !editor?.host.trim()}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Plug size={13} />}
              Save & connect
            </Button>
          </>
        }
      >
        {editor && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Device name" hint="Shown in the device list, e.g. My Phone">
                <input
                  className={inputClass}
                  value={editor.name}
                  onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                  placeholder="My phone"
                />
              </Field>
              <Field label="Authentication">
                <Segmented
                  value={editor.authMethod}
                  onChange={(value) => setEditor({ ...editor, authMethod: value })}
                  options={[
                    { value: "password" as const, label: "Password" },
                    { value: "key" as const, label: "Private key" },
                    { value: "agent" as const, label: "SSH agent" },
                  ]}
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_90px]">
              <Field label="Host / IP address">
                <input
                  className={inputClass}
                  value={editor.host}
                  onChange={(e) => setEditor({ ...editor, host: e.target.value })}
                  placeholder="192.168.29.192"
                  spellCheck={false}
                />
              </Field>
              <Field label="Port">
                <input
                  className={inputClass}
                  type="number"
                  min={1}
                  max={65535}
                  value={editor.port}
                  onChange={(e) => setEditor({ ...editor, port: Number(e.target.value) || 22 })}
                />
              </Field>
            </div>
            <Field label="Username">
              <div className="flex items-center gap-2 rounded-xl glass-subtle px-3">
                <UserRound size={13} className="shrink-0 text-faint" />
                <input
                  className="w-full bg-transparent py-2.5 text-[11px] text-ink outline-none placeholder:text-faint"
                  value={editor.username}
                  onChange={(e) => setEditor({ ...editor, username: e.target.value })}
                  placeholder="u0_a395"
                  spellCheck={false}
                />
              </div>
            </Field>

            {editor.authMethod === "password" && (
              <Field label="Password" hint="Stored in ~/.local/share/nexus/ssh-connections.json (0600)">
                <div className="flex items-center gap-2 rounded-xl glass-subtle px-3">
                  <LockKeyhole size={13} className="shrink-0 text-faint" />
                  <input
                    className="w-full bg-transparent py-2.5 text-[11px] text-ink outline-none placeholder:text-faint"
                    type="password"
                    value={editor.password ?? ""}
                    onChange={(e) => setEditor({ ...editor, password: e.target.value })}
                    placeholder="SSH password"
                    autoComplete="off"
                  />
                </div>
              </Field>
            )}

            {editor.authMethod === "key" && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Private key file">
                  <div className="flex gap-2">
                    <input
                      className={`${inputClass} min-w-0 flex-1`}
                      value={editor.privateKeyPath ?? ""}
                      onChange={(e) => setEditor({ ...editor, privateKeyPath: e.target.value })}
                      placeholder="~/.ssh/id_ed25519"
                      spellCheck={false}
                    />
                    <Button
                      disabled={!isTauri()}
                      onClick={async () => {
                        const picked = await openDialog({ files: true, title: "Choose private key" });
                        if (typeof picked === "string") setEditor((current) => (current ? { ...current, privateKeyPath: picked } : current));
                      }}
                    >
                      Browse
                    </Button>
                  </div>
                </Field>
                <Field label="Key passphrase" hint="Leave empty for an unencrypted key">
                  <div className="flex items-center gap-2 rounded-xl glass-subtle px-3">
                    <KeyRound size={13} className="shrink-0 text-faint" />
                    <input
                      className="w-full bg-transparent py-2.5 text-[11px] text-ink outline-none placeholder:text-faint"
                      type="password"
                      value={editor.passphrase ?? ""}
                      onChange={(e) => setEditor({ ...editor, passphrase: e.target.value })}
                      placeholder="Optional"
                      autoComplete="off"
                    />
                  </div>
                </Field>
              </div>
            )}

            {editor.authMethod === "agent" && (
              <div className="rounded-xl glass-subtle px-3 py-2.5 text-[10px] leading-relaxed text-muted">
                Uses keys already loaded in your SSH agent (<span className="numeric">ssh-add -l</span>). No secret is stored.
              </div>
            )}

            <Field label="Home folder (optional)" hint="Left blank → the remote SFTP home directory is used">
              <input
                className={inputClass}
                value={editor.remoteHome ?? ""}
                onChange={(e) => setEditor({ ...editor, remoteHome: e.target.value })}
                placeholder="/storage/emulated/0"
                spellCheck={false}
              />
            </Field>
          </div>
        )}
      </Modal>

      {/* Host key trust */}
      <Modal
        open={trust !== null}
        onClose={() => setTrust(null)}
        title="Verify this device"
        description="The fingerprint below is the device's SSH host key. Confirm it on the device before trusting it."
        footer={
          <>
            <Button onClick={() => setTrust(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => void trustAndConnect()} disabled={busy !== null}>
              <ShieldCheck size={13} /> Trust & connect
            </Button>
          </>
        }
      >
        {trust && (
          <div className="space-y-3">
            <div className="rounded-xl border border-accent/20 bg-accent/[0.06] px-4 py-3">
              <p className="mb-1 text-[10px] uppercase tracking-[0.12em] text-faint">Host key fingerprint</p>
              <p className="numeric break-all text-[12px] text-ink">{trust.fingerprint}</p>
            </div>
            <p className="text-[11px] leading-relaxed text-muted">
              Connecting to <span className="text-ink">{trust.connection.username}@{trust.connection.host}:{trust.connection.port}</span>.
              NEXUS stores this fingerprint and refuses to connect if it ever changes.
            </p>
          </div>
        )}
      </Modal>

      {/* New folder */}
      <Modal
        open={folderDialog !== null}
        onClose={() => setFolderDialog(null)}
        title="New folder"
        description={`Create a folder in the ${folderDialog === "local" ? "local" : "remote"} pane.`}
        footer={
          <>
            <Button onClick={() => setFolderDialog(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => void confirmFolder()} disabled={!folderName.trim()}>Create</Button>
          </>
        }
      >
        <input
          autoFocus
          className={inputClass}
          value={folderName}
          onChange={(e) => setFolderName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void confirmFolder();
          }}
          placeholder="Folder name"
        />
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete item?"
        description="This permanently removes the item. Folders must be empty."
        footer={
          <>
            <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => void confirmDelete()}>
              <Trash2 size={13} /> Delete
            </Button>
          </>
        }
      >
        {deleteTarget && (
          <p className="numeric rounded-xl glass-subtle px-4 py-3 text-[11px] text-ink">{deleteTarget.entry.path}</p>
        )}
      </Modal>

      {/* Text preview */}
      <Modal
        open={preview !== null}
        onClose={() => setPreview(null)}
        title={preview?.name ?? "File preview"}
        description="First 128 KB shown as text"
        width="max-w-3xl"
        footer={<Button onClick={() => setPreview(null)}><X size={12} /> Close</Button>}
      >
        {preview && (
          <pre className="numeric max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-xl glass-subtle p-4 text-[10px] leading-relaxed text-muted">
            {preview.text || "(empty file)"}
          </pre>
        )}
      </Modal>

      {busy && (
        <div className="pointer-events-none fixed bottom-6 right-6 z-[60] flex items-center gap-2 rounded-xl glass-panel px-4 py-2.5 text-[11px] text-ink shadow-xl">
          <Loader2 size={13} className="animate-spin text-accent" /> {busy}…
        </div>
      )}
    </div>
  );
}
