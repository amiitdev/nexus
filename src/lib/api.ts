import { invoke } from "@tauri-apps/api/core";
import type {
  AppSettings,
  CategoryRule,
  HardwareDetails,
  OrganizeOperation,
  OrganizePreview,
  OrganizeResult,
  OrganizeSettings,
  ProcessList,
  SshConnectResult,
  SshConnection,
  SshDetectedHost,
  SshDeviceStatus,
  SshListing,
  SshTransferProgress,
  SystemSnapshot,
} from "../types";

export const isTauri = () => "__TAURI_INTERNALS__" in window;

export const api = {
  snapshot: () => invoke<SystemSnapshot>("get_snapshot"),
  hardware: () => invoke<HardwareDetails>("get_hardware_details"),
  processes: () => invoke<ProcessList>("list_processes"),
  terminate: (pid: number, force = false) =>
    invoke<void>("terminate_process", { pid, force }),
  settings: () => invoke<AppSettings>("get_settings"),
  saveSettings: (settings: AppSettings) => invoke<void>("save_settings", { settings }),
  downloadsDir: () => invoke<string>("get_downloads_dir"),
  desktopDir: () => invoke<string>("get_desktop_dir"),
  defaultCategories: () => invoke<CategoryRule[]>("get_default_categories"),
  preview: (sourceDir: string | null, settings: OrganizeSettings | null) =>
    invoke<OrganizePreview>("preview_organize", { sourceDir, settings }),
  organize: (previewId: string) => invoke<OrganizeResult>("organize", { previewId }),
  history: () => invoke<OrganizeOperation[]>("get_organize_history"),
  undo: (operationId: string) =>
    invoke<[number, { source: string; reason: string }[]]>("undo_operation", { operationId }),
  restore: (operationId: string, destination: string) =>
    invoke<void>("restore_file", { operationId, destination }),
  version: () => invoke<string>("get_app_version"),

  // SSH device manager
  sshConnections: () => invoke<SshConnection[]>("ssh_list_connections"),
  sshSaveConnection: (connection: SshConnection) =>
    invoke<SshConnection[]>("ssh_save_connection", { connection }),
  sshDeleteConnection: (id: string) =>
    invoke<SshConnection[]>("ssh_delete_connection", { id }),
  sshDetectedHosts: () => invoke<SshDetectedHost[]>("ssh_detected_hosts"),
  sshSuggestKey: () => invoke<string | null>("ssh_suggest_key"),
  sshTest: (connection: SshConnection) =>
    invoke<SshConnectResult>("ssh_test_connection", { connection }),
  sshAcceptKey: (connection: SshConnection, fingerprint: string) =>
    invoke<SshConnectResult>("ssh_accept_host_key", { connection, fingerprint }),
  sshConnect: (connection: SshConnection) =>
    invoke<SshConnectResult>("ssh_connect", { connection }),
  sshDisconnect: (id: string) => invoke<SshDeviceStatus[]>("ssh_disconnect", { id }),
  sshStatuses: () => invoke<SshDeviceStatus[]>("ssh_statuses"),
  sshListDir: (connection: SshConnection, path: string) =>
    invoke<SshListing>("ssh_list_dir", { connection, path }),
  sshCreateDir: (connection: SshConnection, path: string) =>
    invoke<void>("ssh_create_dir", { connection, path }),
  sshDeleteRemote: (connection: SshConnection, path: string) =>
    invoke<void>("ssh_delete_remote", { connection, path }),
  sshRenameRemote: (connection: SshConnection, from: string, to: string) =>
    invoke<void>("ssh_rename_remote", { connection, from, to }),
  sshReadFile: (connection: SshConnection, path: string, maxBytes: number) =>
    invoke<string>("ssh_read_file", { connection, path, maxBytes }),
  sshDownload: (connection: SshConnection, paths: string[], localDir: string) =>
    invoke<SshTransferProgress[]>("ssh_download", { connection, paths, localDir }),
  sshUpload: (connection: SshConnection, paths: string[], remoteDir: string) =>
    invoke<SshTransferProgress[]>("ssh_upload", { connection, paths, remoteDir }),
  sshLocalHome: () => invoke<string>("ssh_local_home"),
  sshLocalList: (path: string) => invoke<SshListing>("ssh_local_list", { path }),
  sshLocalCreateDir: (path: string) => invoke<void>("ssh_local_create_dir", { path }),
  sshLocalDelete: (path: string) => invoke<void>("ssh_local_delete", { path }),
};
