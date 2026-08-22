import type { ResourceSnapshot } from "../../core/types";
import { formatKbPerSec } from "../format";

export function HudStats({ resources }: { resources: ResourceSnapshot | null }) {
  const cpu = resources?.host.cpu;
  const mem = resources?.host.memory;
  const io = resources?.host.io;
  const net = resources?.host.net;
  const cursor = resources?.groups["ide.cursor"];
  if (!cpu || !mem) return <aside className="hud-stats muted">…</aside>;

  const cursorRam = mem.totalBytes && cursor ? (cursor.memBytes / mem.totalBytes) * 100 : 0;
  const title = [
    `CURSOR CPU ${pct(cursor?.cpuPercent ?? 0)} RAM ${pct(cursorRam)} (${cursor?.processCount ?? 0} proc)`,
    `TOTAL CPU ${pct(cpu.usagePercent)} RAM ${pct(mem.usedPercent)}`,
    `DISCO L ${formatKbPerSec(io?.readBytesPerSec ?? 0)} G ${formatKbPerSec(io?.writeBytesPerSec ?? 0)}`,
    `INTERNET D ${formatKbPerSec(net?.recvBytesPerSec ?? 0)} U ${formatKbPerSec(net?.sentBytesPerSec ?? 0)}`,
  ].join("   ");

  return (
    <aside className="hud-stats" title={title}>
      <span>
        CURSOR (CPU {pct(cursor?.cpuPercent ?? 0)} | RAM {pct(cursorRam)})
      </span>
      <span>
        TOTAL (CPU {pct(cpu.usagePercent)} | RAM {pct(mem.usedPercent)})
      </span>
      <span>
        DISCO (L {formatKbPerSec(io?.readBytesPerSec ?? 0)} | G {formatKbPerSec(io?.writeBytesPerSec ?? 0)})
      </span>
      <span>
        INTERNET (D {formatKbPerSec(net?.recvBytesPerSec ?? 0)} | U {formatKbPerSec(net?.sentBytesPerSec ?? 0)})
      </span>
    </aside>
  );
}

function pct(n: number): string {
  return `${Math.round(Math.max(0, n))}%`;
}
