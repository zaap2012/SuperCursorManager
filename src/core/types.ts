export type SessionStatus = "active" | "waiting" | "completed" | "aborted" | "error";

export type ProjectRef = {
  id: string;
  name: string;
  roots: string[];
};

export type AgentRef = {
  id: string;
  role: "primary" | "subagent";
  type?: string;
  task?: string;
  status: SessionStatus;
  model?: string;
};

export type ToolUseRecord = {
  id: string;
  name: string;
  status: "running" | "ok" | "fail";
  startedAt: number;
  endedAt?: number;
  detail?: string;
};

export type FileChangeRecord = {
  path: string;
  name: string;
  count: number;
  lastAt: number;
};

export type EtaEstimate = {
  remainingMs: number;
  confidence: number;
  label: string;
};

export type CpuCoreSnapshot = {
  index: number;
  usagePercent: number;
  active: boolean;
};

export type HostCpuSnapshot = {
  usagePercent: number;
  currentMhz: number;
  maxMhz: number;
  model: string;
  vendor?: string;
  physicalCores: number;
  logicalCores: number;
  activeCores: number;
  cores: CpuCoreSnapshot[];
};

export type HostMemorySnapshot = {
  usedBytes: number;
  totalBytes: number;
  availableBytes: number;
  usedPercent: number;
};

export type ProcessGroupSnapshot = {
  id: string;
  label: string;
  cpuPercent: number;
  memBytes: number;
  processCount: number;
};

export type HostIoSnapshot = {
  readBytesPerSec: number;
  writeBytesPerSec: number;
};

export type HostNetSnapshot = {
  recvBytesPerSec: number;
  sentBytesPerSec: number;
  totalBytesPerSec: number;
};

export type ResourceSnapshot = {
  sampledAt: number;
  host: {
    cpuPercent: number;
    memUsedBytes: number;
    memTotalBytes: number;
    cpu: HostCpuSnapshot;
    memory: HostMemorySnapshot;
    io: HostIoSnapshot;
    net: HostNetSnapshot;
  };
  groups: Record<string, ProcessGroupSnapshot>;
};

export type SessionSnapshot = {
  id: string;
  family: string;
  sourceKind: string;
  sourceLabel: string;
  status: SessionStatus;
  project: ProjectRef;
  headline: string;
  mode?: string;
  model?: string;
  startedAt: number;
  updatedAt: number;
  eta: EtaEstimate | null;
  agents: AgentRef[];
  tools: ToolUseRecord[];
  files: FileChangeRecord[];
  stats: {
    toolCount: number;
    fileCount: number;
    subagentCount: number;
  };
  stuck: boolean;
};

export type IntegrationStatus = {
  id: string;
  label: string;
  installed: boolean;
};

export type ChromeMode = "window" | "hud";

export type UiSettings = {
  chrome: ChromeMode;
  opacity: number;
  overlay: boolean;
};

export type AppSnapshot = {
  brand: { name: string; tagline: string };
  ingest: { port: number; listening: boolean };
  resources: ResourceSnapshot | null;
  sessions: SessionSnapshot[];
  projects: ProjectRef[];
  integrations: IntegrationStatus[];
  ui: UiSettings;
};

export type IngestEnvelope = {
  schemaVersion: 1;
  source: {
    kind: string;
    instanceId?: string;
  };
  receivedAt?: number;
  payload: unknown;
};
