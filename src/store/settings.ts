import { create } from "zustand";
import { api, isTauri } from "../lib/api";
import { applyTheme } from "../lib/theme";
import type { AppSettings, CategoryRule } from "../types";

export const DEFAULT_CATEGORIES: CategoryRule[] = [
  { name: "Documents", extensions: ["pdf", "doc", "docx", "odt", "rtf", "xls", "xlsx", "ods", "csv", "txt", "md", "ppt", "pptx", "epub", "tex"], folders: [
    { name: "PDF", extensions: ["pdf"] },
    { name: "Word", extensions: ["doc", "docx", "odt", "rtf"] },
    { name: "Excel", extensions: ["xls", "xlsx", "ods", "csv"] },
    { name: "Other", extensions: ["txt", "md", "ppt", "pptx", "epub", "tex"] },
  ] },
  { name: "Images", extensions: ["png", "jpg", "jpeg", "svg", "gif", "webp", "bmp", "ico", "tiff", "tif", "heic", "avif"], folders: [
    { name: "PNG", extensions: ["png"] },
    { name: "JPG", extensions: ["jpg", "jpeg"] },
    { name: "SVG", extensions: ["svg"] },
    { name: "Other", extensions: ["gif", "webp", "bmp", "ico", "tiff", "tif", "heic", "avif"] },
  ] },
  { name: "Videos", extensions: ["mp4", "mkv", "avi", "mov", "webm", "flv", "wmv", "m4v", "mpeg", "mpg"], folders: [
    { name: "MP4", extensions: ["mp4"] },
    { name: "MKV", extensions: ["mkv"] },
    { name: "AVI", extensions: ["avi"] },
    { name: "Other", extensions: ["mov", "webm", "flv", "wmv", "m4v", "mpeg", "mpg"] },
  ] },
  { name: "Audio", extensions: ["mp3", "wav", "flac", "m4a", "aac", "ogg", "opus", "wma"], folders: [
    { name: "MP3", extensions: ["mp3"] },
    { name: "WAV", extensions: ["wav"] },
    { name: "FLAC", extensions: ["flac"] },
    { name: "Other", extensions: ["m4a", "aac", "ogg", "opus", "wma"] },
  ] },
  { name: "Archives", extensions: ["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "tgz", "zst"], folders: [
    { name: "ZIP", extensions: ["zip"] },
    { name: "RAR", extensions: ["rar"] },
    { name: "7Z", extensions: ["7z"] },
    { name: "TAR", extensions: ["tar", "gz", "bz2", "xz", "tgz", "zst"] },
  ] },
  { name: "Applications", extensions: ["deb", "rpm", "appimage", "msi", "exe", "sh", "flatpak", "snap", "run"], folders: [
    { name: "DEB", extensions: ["deb"] },
    { name: "RPM", extensions: ["rpm"] },
    { name: "AppImage", extensions: ["appimage"] },
    { name: "Other", extensions: ["msi", "exe", "sh", "flatpak", "snap", "run"] },
  ] },
  { name: "Code", extensions: ["py", "pyw", "js", "jsx", "ts", "tsx", "mjs", "cjs", "java", "class", "jar", "rs", "go", "c", "cpp", "cc", "h", "hpp", "json", "html", "css", "yml", "yaml", "toml", "sql", "sh", "php", "rb", "lua", "swift", "kt"], folders: [
    { name: "Python", extensions: ["py", "pyw"] },
    { name: "JavaScript", extensions: ["js", "jsx", "ts", "tsx", "mjs", "cjs"] },
    { name: "Java", extensions: ["java", "class", "jar"] },
    { name: "Other", extensions: ["rs", "go", "c", "cpp", "cc", "h", "hpp", "json", "html", "css", "yml", "yaml", "toml", "sql", "sh", "php", "rb", "lua", "swift", "kt"] },
  ] },
];

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  accent: "violet",
  refreshIntervalMs: 1500,
  temperatureUnit: "C",
  minimizeToTray: true,
  launchAtLogin: false,
  downloadsDir: null,
  notifications: true,
  ignoreHidden: true,
  excludeIncomplete: true,
  monitorGpu: true,
  monitorNetwork: true,
  categories: DEFAULT_CATEGORIES,
};

interface SettingsState {
  settings: AppSettings;
  loaded: boolean;
  error: string | null;
  load: () => Promise<void>;
  patch: (partial: Partial<AppSettings>) => void;
  save: () => Promise<void>;
  resetCategories: () => Promise<CategoryRule[]>;
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  error: null,

  load: async () => {
    if (!isTauri()) {
      applyTheme(DEFAULT_SETTINGS);
      set({ loaded: true, error: "Running outside the desktop runtime — showing interface only." });
      return;
    }
    try {
      const settings = await api.settings();
      applyTheme(settings);
      set({ settings, loaded: true, error: null });
    } catch (e) {
      applyTheme(DEFAULT_SETTINGS);
      set({ loaded: true, error: `Could not load settings: ${String(e)}` });
    }
  },

  patch: (partial) => {
    const settings = { ...get().settings, ...partial };
    applyTheme(settings);
    set({ settings });
  },

  save: async () => {
    const settings = get().settings;
    if (!isTauri()) return;
    try {
      await api.saveSettings(settings);
      set({ error: null });
    } catch (e) {
      set({ error: `Could not save settings: ${String(e)}` });
    }
  },

  resetCategories: async () => {
    const categories = isTauri() ? await api.defaultCategories() : DEFAULT_CATEGORIES;
    get().patch({ categories });
    return categories;
  },
}));
