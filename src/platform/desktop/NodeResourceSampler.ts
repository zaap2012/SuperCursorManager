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

export class NodeHostResourceSampler extends HostResourceSampler {
  private previous = os.cpus().map(coreTimes);
  private wmi: WmiCpu | null = null;
  private wmiAt = 0;

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
    const spec = await this.cpuSpec(coresNow[0]);

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
      },
    };
  }

  private async cpuSpec(fallback?: os.CpuInfo): Promise<{
    model: string;
    vendor?: string;
    currentMhz: number;
    maxMhz: number;
    physicalCores: number;
  }> {
    const baseMhz = fallback?.speed ?? 0;
    const model = fallback?.model.replace(/\s+/g, " ").trim() ?? "CPU";
    if (process.platform === "win32") {
      const wmi = await this.readWmi();
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
    }
    return {
      model,
      currentMhz: baseMhz,
      maxMhz: baseMhz,
      physicalCores: os.cpus().length,
    };
  }

  private async readWmi(): Promise<WmiCpu | null> {
    if (this.wmi && Date.now() - this.wmiAt < 4000) return this.wmi;
    try {
      const { stdout } = await execFileAsync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          "$p = Get-CimInstance Win32_Processor | Select-Object -First 1 Name,Manufacturer,NumberOfCores,NumberOfLogicalProcessors,MaxClockSpeed,CurrentClockSpeed; $perf = Get-CimInstance Win32_PerfFormattedData_Counters_ProcessorInformation | Where-Object { $_.Name -eq '_Total' } | Select-Object -First 1 -ExpandProperty PercentProcessorPerformance; [pscustomobject]@{ Name=$p.Name; Manufacturer=$p.Manufacturer; NumberOfCores=$p.NumberOfCores; NumberOfLogicalProcessors=$p.NumberOfLogicalProcessors; MaxClockSpeed=$p.MaxClockSpeed; CurrentClockSpeed=$p.CurrentClockSpeed; PercentProcessorPerformance=$perf } | ConvertTo-Json -Compress",
        ],
        { windowsHide: true, timeout: 3500 },
      );
      const parsed = JSON.parse(stdout) as WmiCpu | WmiCpu[];
      this.wmi = Array.isArray(parsed) ? parsed[0] : parsed;
      this.wmiAt = Date.now();
      return this.wmi;
    } catch {
      return this.wmi;
    }
  }
}

export class NodeProcessGroupSampler extends ProcessGroupSampler {
  private previous = new Map<string, number>();
  private previousAt = Date.now();

  constructor(
    readonly id: string,
    readonly label: string,
    readonly match: RegExp,
  ) {
    super();
  }

  async sample(): Promise<ProcessGroupSnapshot | null> {
    const processes = await listProcesses();
    const matched = processes.filter((proc) => this.match.test(proc.name));
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

    return {
      id: this.id,
      label: this.label,
      cpuPercent: round(cpuPercent),
      memBytes,
      processCount: matched.length,
    };
  }
}

function coreTimes(cpu: os.CpuInfo): CpuTimes {
  const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
  return { idle: cpu.times.idle, total };
}

async function listProcesses(): Promise<PidCpu[]> {
  if (process.platform === "win32") {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "Get-Process | Select-Object Id,ProcessName,WorkingSet64,CPU | ConvertTo-Csv -NoTypeInformation",
      ],
      { windowsHide: true, timeout: 4000 },
    );
    return parseCsv(stdout);
  }

  const { stdout } = await execFileAsync("ps", ["-A", "-o", "pid=,comm=,rss=,time="], {
    timeout: 4000,
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
    }));
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
