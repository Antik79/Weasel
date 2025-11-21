export interface FileSystemItem {
  name: string;
  fullPath: string;
  isDirectory: boolean;
  sizeBytes: number;
  modifiedAt: string;
}

export interface SystemStatus {
  hostname: string;
  ipAddress: string;
  cpuUsagePercent: number;
  memoryUsagePercent: number;
  drives: DriveStatus[];
  capturedAt: string;
}

export interface DriveStatus {
  name: string;
  totalBytes: number;
  freeBytes: number;
}

export interface NetworkAdapterInfo {
  id: string;
  name: string;
  description: string;
  status: string;
  macAddress: string | null;
  ipAddresses: string[];
  speedBytesPerSecond: number | null;
}

export interface NetworkAdapterStats {
  adapterId: string;
  bytesReceived: number;
  bytesSent: number;
  packetsReceived: number;
  packetsSent: number;
  capturedAt: string;
}

export interface EventLogEntry {
  provider: string;
  level: string;
  message: string;
  timestamp: string;
  eventId: number;
}

export interface InstalledApplication {
  displayName: string;
  identifier: string;
  version: string;
  publisher: string;
  isSystemComponent: boolean;
}

export interface PackageOperationResult {
  succeeded: boolean;
  exitCode: number;
  message: string;
}

export interface PackageSearchResult {
  id: string;
  name: string;
  version: string;
  publisher: string;
  description: string | null;
}

export interface PackageDetails {
  name: string;
  id: string;
  version?: string | null;
  publisher?: string | null;
  description?: string | null;
  homepage?: string | null;
  license?: string | null;
  licenseUrl?: string | null;
  installerType?: string | null;
  installerUrl?: string | null;
  tags: string[];
  documentationLinks: string[];
}

export interface PackageShowResponse {
  success: boolean;
  message?: string | null;
  package?: PackageDetails | null;
  alternatives: PackageSearchResult[];
}

export interface BundlePackage {
  id: string;
  name: string;
  version?: string | null;
  publisher?: string | null;
}

export interface PackageBundle {
  id: string;
  name: string;
  description: string;
  packages: BundlePackage[];
  createdAt: string;
  updatedAt: string;
}

export interface ProcessInfo {
  id: number;
  name: string;
  workingSetBytes: number;
  startTime?: string | null;
  responding: boolean;
  userName?: string | null;
  executablePath?: string | null;
}

export interface SystemServiceInfo {
  serviceName: string;
  displayName: string;
  status: string;
  serviceType: string;
  canPauseAndContinue: boolean;
}

export interface CaptureSettings {
  folder: string;
  filenamePattern: string;
  enableIntervalCapture: boolean;
  intervalSeconds: number;
}

export interface LogFileInfo {
  name: string;
  sizeBytes: number;
  lastModified: string;
}

export interface LogsResponse {
  folder: string;
  files: LogFileInfo[];
}

export interface LoggingConfig {
  folder: string;
  retentionDays: number;
  minimumLevel: string; // "Trace", "Debug", "Information", "Warning", "Error", "Critical", "None"
  maxFileSizeBytes: number;
  maxFilesPerDay: number;
  enableSizeRotation: boolean;
}

export interface DiskMonitoringConfig {
  enabled: boolean;
  monitoredDrives: DriveMonitorConfig[];
  folderMonitors: FolderMonitorOptions[];
  notificationRecipients: string[];
}

export interface DriveMonitorConfig {
  driveName: string;
  enabled: boolean;
  checkIntervalMinutes: number;
  thresholdPercent: number | null;
  thresholdBytes: number | null;
}

export interface FolderMonitorOptions {
  path: string;
  enabled: boolean;
  checkIntervalMinutes: number;
  thresholdBytes: number;
  thresholdDirection: "Over" | "Under";
}

export interface SmtpConfig {
  host: string;
  port: number;
  enableSsl: boolean;
  username: string | null;
  password: string | null;
  fromAddress: string | null;
  fromName: string | null;
  testRecipient?: string | null;
}

export interface DiskMonitoringStatus {
  isRunning: boolean;
  lastCheck: string | null;
  driveStatuses: DriveAlertStatus[];
}

export interface DriveAlertStatus {
  driveName: string;
  totalBytes: number;
  freeBytes: number;
  freePercent: number;
  isBelowThreshold: boolean;
  lastAlertSent: string | null;
}

export interface ApplicationMonitorConfig {
  enabled: boolean;
  applications: MonitoredApplication[];
  notificationRecipients: string[];
}

export interface MonitoredApplication {
  id: string;
  name: string;
  executablePath: string;
  arguments?: string | null;
  workingDirectory?: string | null;
  enabled: boolean;
  checkIntervalSeconds: number;
  restartDelaySeconds: number;
  logPath?: string | null;
  eventLogSource?: string | null;
}

export interface VncConfig {
  enabled: boolean;
  port: number;
  allowRemote: boolean;
  hasPassword: boolean;
}

export interface VncStatus {
  isRunning: boolean;
  port: number;
  connectionCount: number;
  allowRemote: boolean;
}

