// Mirrors src-tauri/src/models.rs exactly (serde camelCase).

export interface SensorReading {
  label: string;
  chip: string;
  value: number;
  unit: string;
}

export interface CpuInfo {
  model: string;
  vendor: string;
  physicalCores: number;
  logicalThreads: number;
  usage: number;
  perCoreUsage: number[];
  frequencyMhz: number | null;
  minFrequencyMhz: number | null;
  maxFrequencyMhz: number | null;
  loadAverage: [number, number, number];
  temperatureC: number | null;
  powerWatts: number | null;
  architecture: string;
  uptimeSeconds: number;
}

export interface MemoryInfo {
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  freeBytes: number;
  cachedBytes: number | null;
  buffersBytes: number | null;
  usagePercent: number;
  swapTotalBytes: number;
  swapUsedBytes: number;
  swapUsagePercent: number;
}

export interface GpuInfo {
  name: string;
  vendor: string;
  utilization: number | null;
  temperatureC: number | null;
  memoryUsedBytes: number | null;
  memoryTotalBytes: number | null;
  clockMhz: number | null;
  powerWatts: number | null;
  fanSpeedPercent: number | null;
  source: string;
}

export interface StorageInfo {
  name: string;
  mountPoint: string;
  fileSystem: string;
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  usagePercent: number;
  isRoot: boolean;
  temperatureC: number | null;
  readBytesPerSec: number | null;
  writeBytesPerSec: number | null;
}

export interface NetworkInfo {
  interface: string;
  ipAddress: string | null;
  linkStatus: string;
  downloadBytesPerSec: number;
  uploadBytesPerSec: number;
  totalReceivedBytes: number;
  totalTransmittedBytes: number;
  isWireless: boolean;
  ssid: string | null;
  signalDbm: number | null;
  signalPercent: number | null;
}

export interface BatteryInfo {
  name: string;
  chargePercent: number | null;
  healthPercent: number | null;
  powerWatts: number | null;
  state: string;
  technology: string;
}

export interface SystemInfo {
  distribution: string;
  distroId: string;
  version: string;
  kernel: string;
  desktopEnvironment: string;
  hostname: string;
  architecture: string;
  biosVendor: string | null;
  biosVersion: string | null;
  motherboard: string | null;
  productName: string | null;
}

export interface SystemSnapshot {
  timestamp: number;
  cpu: CpuInfo;
  memory: MemoryInfo;
  gpus: GpuInfo[];
  storage: StorageInfo[];
  network: NetworkInfo;
  system: SystemInfo;
  temperatures: SensorReading[];
  fans: SensorReading[];
  batteries: BatteryInfo[];
}

export interface SpecItem {
  label: string;
  value: string | null;
}

export interface SpecGroup {
  title: string;
  icon: string;
  items: SpecItem[];
}

export interface HardwareDetails {
  groups: SpecGroup[];
  temperatures: SensorReading[];
  fans: SensorReading[];
}

export interface ProcessInfo {
  pid: number;
  name: string;
  cpuUsage: number;
  memoryBytes: number;
  memoryPercent: number;
  user: string;
  status: string;
  executable: string | null;
  command: string | null;
  isCritical: boolean;
}

export interface ProcessList {
  timestamp: number;
  total: number;
  processes: ProcessInfo[];
}

export interface FolderRule {
  name: string;
  extensions: string[];
}

export interface CategoryRule {
  name: string;
  extensions: string[];
  folders: FolderRule[];
}

export interface OrganizeSettings {
  ignoreHidden: boolean;
  excludeIncomplete: boolean;
  categories: CategoryRule[];
}

export interface PlannedMove {
  name: string;
  source: string;
  destination: string;
  sizeBytes: number;
  category: string;
  folder: string;
}

export interface SkippedFile {
  name: string;
  reason: string;
}

export interface CategoryTotal {
  category: string;
  fileCount: number;
  bytes: number;
}

export interface OrganizePreview {
  id: string;
  sourceDir: string;
  files: PlannedMove[];
  skipped: SkippedFile[];
  categoryTotals: CategoryTotal[];
  totalFiles: number;
  totalBytes: number;
  createdAt: number;
}

export interface MoveFailure {
  source: string;
  reason: string;
}

export interface OrganizeResult {
  operationId: string;
  movedCount: number;
  failed: MoveFailure[];
  bytesMoved: number;
}

export interface PerformedMove {
  original: string;
  destination: string;
  sizeBytes: number;
}

export interface OrganizeOperation {
  id: string;
  timestamp: number;
  sourceDir: string;
  moves: PerformedMove[];
}

export interface AppSettings {
  theme: "dark" | "light" | "system";
  accent: AccentKey;
  refreshIntervalMs: number;
  temperatureUnit: "C" | "F";
  minimizeToTray: boolean;
  launchAtLogin: boolean;
  downloadsDir: string | null;
  notifications: boolean;
  ignoreHidden: boolean;
  excludeIncomplete: boolean;
  monitorGpu: boolean;
  monitorNetwork: boolean;
  categories: CategoryRule[];
}

export type AccentKey = "violet" | "cyan" | "emerald" | "amber" | "rose" | "blue";

// SSH device manager
export interface SshConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: "password" | "key" | "agent";
  password: string | null;
  privateKeyPath: string | null;
  passphrase: string | null;
  remoteHome: string | null;
  fingerprint: string | null;
  createdAt: number;
}

export interface SshConnectResult {
  connected: boolean;
  needsTrust: boolean;
  fingerprint: string | null;
  error: string | null;
}

export interface SshDeviceStatus {
  id: string;
  connected: boolean;
  host: string;
  username: string;
}

export interface SshFileEntry {
  name: string;
  path: string;
  kind: "file" | "dir" | "link" | "other";
  size: number;
  modified: number;
  permissions: string | null;
}

export interface SshListing {
  path: string;
  entries: SshFileEntry[];
}

export interface SshDetectedHost {
  name: string;
  host: string;
  port: number;
  username: string;
  identityFile: string | null;
}

export interface SshTransferProgress {
  id: string;
  direction: "download" | "upload";
  label: string;
  transferred: number;
  total: number;
  done: boolean;
  error: string | null;
}

export type PageId =
  | "dashboard"
  | "hardware"
  | "performance"
  | "organizer"
  | "desktop"
  | "processes"
  | "network"
  | "ssh"
  | "settings";
