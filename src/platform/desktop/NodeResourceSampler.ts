import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  HostResourceSampler,
  ProcessGroupSampler,
  type HostCpuSnapshot,
  type ProcessGroupSnapshot,
  type ResourceSnapshot,
} from "../../core/index.js";

const execFileAsync = promisify(execFile);
const ACTIVE_CORE_THRESHOLD = 8;

type CpuTimes = { idle: number; total: number };
type PidCpu = { pid: string; cpuSeconds: number; memBytes: number; name: string };
type WmiCpu = {
  Name?: string;
  Manufacturer?: string;
  NumberOfCores?: number;
  NumberOfLogicalProcessors?: number;
  MaxClockSpeed?: number;
  CurrentClockSpeed?: number;
  PercentProcessorPerformance?: number;
};

type WmiIoNet = {
  Read: number;
  Write: number;
  Rx: number;
  Tx: number;
};

type HostPerf = WmiCpu & WmiIoNet;

export class NodeHostResourceSampler extends HostResourceSampler {
  private previous = os.cpus().map(coreTimes);
  private perf: HostPerf | null = null;
  private perfAt = 0;
  private perfBusy = false;

  async sample(): Promise<Partial<ResourceSnapshot>> {
    const coresNow = os.cpus();
    const coreUsages = coresNow.map((cpu, index) => {
      const prev = this.previous[index] ?? coreTimes(cpu);
      const current = coreTimes(cpu);
      const idle = current.idle - prev.idle;
      const total = current.total - prev.total;
      const usagePercent = total > 0 ? (1 - idle / total) * 100 : 0;
      return {
        index,
        usagePercent: round(usagePercent),
        active: usagePercent >= ACTIVE_CORE_THRESHOLD,
      };
    });
    this.previous = coresNow.map(coreTimes);

    const usagePercent = average(coreUsages.map((core) => core.usagePercent));
    const memTotalBytes = os.totalmem();
    const memAvailable = os.freemem();
    const memUsedBytes = memTotalBytes - memAvailable;
    const spec = this.cachedSpec(coresNow[0]);
    this.kickPerf();
    const ioNet = this.ioFromPerf(this.perf);

    const cpu: HostCpuSnapshot = {
      usagePercent: round(usagePercent),
      currentMhz: spec.currentMhz,
      maxMhz: spec.maxMhz,
      model: spec.model,
      vendor: spec.vendor,
      physicalCores: spec.physicalCores,
      logicalCores: coresNow.length,
      activeCores: coreUsages.filter((core) => core.active).length,
      cores: coreUsages,
    };

    return {
      host: {
        cpuPercent: cpu.usagePercent,
        memUsedBytes,
        memTotalBytes,
        cpu,
        memory: {
          usedBytes: memUsedBytes,
          totalBytes: memTotalBytes,
          availableBytes: memAvailable,
          usedPercent: round((memUsedBytes / memTotalBytes) * 100),
        },
        io: {
          readBytesPerSec: ioNet.readBytesPerSec,
          writeBytesPerSec: ioNet.writeBytesPerSec,
        },
        net: {
          recvBytesPerSec: ioNet.recvBytesPerSec,
          sentBytesPerSec: ioNet.sentBytesPerSec,
          totalBytesPerSec: ioNet.recvBytesPerSec + ioNet.sentBytesPerSec,
        },
      },
    };
  }

  private cachedSpec(fallback?: os.CpuInfo): {
    model: string;
    vendor?: string;
    currentMhz: number;
    maxMhz: number;
    physicalCores: number;
  } {
    const baseMhz = fallback?.speed ?? 0;
    const model = fallback?.model.replace(/\s+/g, " ").trim() ?? "CPU";
    const wmi = this.perf;
    if (wmi) {
      const maxMhz = Number(wmi.MaxClockSpeed) || baseMhz;
      const perf = Number(wmi.PercentProcessorPerformance);
      const currentMhz =
        perf > 0 ? Math.round((maxMhz * perf) / 100) : Number(wmi.CurrentClockSpeed) || maxMhz;
      return {
        model: String(wmi.Name ?? model).replace(/\s+/g, " ").trim(),
        vendor: wmi.Manufacturer,
        currentMhz,
        maxMhz,
        physicalCores: Number(wmi.NumberOfCores) || Math.max(1, Math.round((fallback ? os.cpus().length : 1) / 2)),
      };
    }
    return {
      model,
      currentMhz: baseMhz,
      maxMhz: baseMhz,
      physicalCores: os.cpus().length,
    };
  }

  private kickPerf(): void {
    if (this.perfBusy) return;
    this.perfBusy = true;
    void this.readHostPerf().finally(() => {
      this.perfBusy = false;
    });
  }

  private ioFromPerf(raw: HostPerf | null) {
    return {
      readBytesPerSec: Number(raw?.Read) || 0,
      writeBytesPerSec: Number(raw?.Write) || 0,
      recvBytesPerSec: Number(raw?.Rx) || 0,
      sentBytesPerSec: Number(raw?.Tx) || 0,
    };
  }

  private async readHostPerf(): Promise<HostPerf | null> {
    if (this.perf && Date.now() - this.perfAt < 280) return this.perf;
    if (process.platform !== "win32") return this.perf;
    try {
      const { stdout } = await execFileAsync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          "$p = Get-CimInstance Win32_Processor | Select-Object -First 1 Name,Manufacturer,NumberOfCores,NumberOfLogicalProcessors,MaxClockSpeed,CurrentClockSpeed; $perf = Get-CimInstance Win32_PerfFormattedData_Counters_ProcessorInformation | Where-Object { $_.Name -eq '_Total' } | Select-Object -First 1 -ExpandProperty PercentProcessorPerformance; $d = Get-CimInstance Win32_PerfFormattedData_PerfDisk_PhysicalDisk | Where-Object { $_.Name -eq '_Total' } | Select-Object -First 1; $n = Get-CimInstance Win32_PerfFormattedData_Tcpip_NetworkInterface | Where-Object { $_.Name -notmatch 'isatap|Teredo|Loopback|Pseudo' }; [pscustomobject]@{ Name=$p.Name; Manufacturer=$p.Manufacturer; NumberOfCores=$p.NumberOfCores; NumberOfLogicalProcessors=$p.NumberOfLogicalProcessors; MaxClockSpeed=$p.MaxClockSpeed; CurrentClockSpeed=$p.CurrentClockSpeed; PercentProcessorPerformance=$perf; Read=[int64]$d.DiskReadBytesPersec; Write=[int64]$d.DiskWriteBytesPersec; Rx=[int64]($n | Measure-Object BytesReceivedPersec -Sum).Sum; Tx=[int64]($n | Measure-Object BytesSentPersec -Sum).Sum } | ConvertTo-Json -Compress",
        ],
        { windowsHide: true, timeout: 4000 },
      );
      const parsed = JSON.parse(stdout) as HostPerf | HostPerf[];
      this.perf = Array.isArray(parsed) ? parsed[0] : parsed;
      this.perfAt = Date.now();
      return this.perf;
    } catch {
      return this.perf;
    }
  }
}

export class NodeProcessGroupSampler extends ProcessGroupSampler {
  private previous = new Map<string, number>();
  private previousAt = Date.now();
  private last: ProcessGroupSnapshot | null = null;
  private busy = false;

  constructor(
    readonly id: string,
    readonly label: string,
    readonly match: RegExp,
  ) {
    super();
  }

  async sample(): Promise<ProcessGroupSnapshot | null> {
    if (!this.busy) {
      this.busy = true;
      void this.refresh()
        .catch(() => undefined)
        .finally(() => {
          this.busy = false;
        });
    }
    return this.last;
  }

  private async refresh(): Promise<void> {
    const processes = await listCursorProcesses();
    const matched = processes.filter((proc) => this.match.test(proc.name) && !/^electron$/i.test(proc.name));
    const now = Date.now();
    const elapsed = Math.max((now - this.previousAt) / 1000, 0.2);
    const cores = Math.max(os.cpus().length, 1);
    let cpuPercent = 0;
    let memBytes = 0;

    for (const proc of matched) {
      memBytes += proc.memBytes;
      const prev = this.previous.get(proc.pid);
      if (prev != null) {
        const delta = Math.max(proc.cpuSeconds - prev, 0);
        cpuPercent += (delta / elapsed / cores) * 100;
      }
    }

    this.previous = new Map(matched.map((proc) => [proc.pid, proc.cpuSeconds]));
    this.previousAt = now;
    this.last = {
      id: this.id,
      label: this.label,
      cpuPercent: round(Math.min(100, cpuPercent)),
      memBytes,
      processCount: matched.length,
    };
  }
}

function coreTimes(cpu: os.CpuInfo): CpuTimes {
  const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
  return { idle: cpu.times.idle, total };
}

async function listCursorProcesses(): Promise<PidCpu[]> {
  if (process.platform === "win32") {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "Get-Process -Name 'Cursor*' -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,WorkingSet64,CPU | ConvertTo-Csv -NoTypeInformation",
      ],
      { windowsHide: true, timeout: 2500 },
    );
    return parseCsv(stdout);
  }

  const { stdout } = await execFileAsync("ps", ["-A", "-o", "pid=,comm=,rss=,time="], {
    timeout: 2500,
  });
  return stdout
    .trim()
    .split(/\n/)
    .map((line) => line.trim().split(/\s+/))
    .filter((cols) => cols.length >= 4)
    .map(([pid, name, rss, time]) => ({
      pid,
      name,
      memBytes: Number(rss) * 1024,
      cpuSeconds: parseUnixTime(time),
    }))
    .filter((proc) => /cursor/i.test(proc.name));
}

function parseCsv(stdout: string): PidCpu[] {
  const lines = stdout.trim().split(/\r?\n/).slice(1);
  const out: PidCpu[] = [];
  for (const line of lines) {
    const cols = line.split(",").map((c) => c.replace(/^"|"$/g, ""));
    if (cols.length < 4) continue;
    const [id, name, ws, cpu] = cols;
    out.push({
      pid: id,
      name,
      memBytes: Number(ws) || 0,
      cpuSeconds: Number(cpu) || 0,
    });
  }
  return out;
}

function parseUnixTime(value: string): number {
  const parts = value.split(":").map(Number).reverse();
  return (parts[2] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[0] || 0);
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
