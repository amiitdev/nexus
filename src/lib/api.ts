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
};
