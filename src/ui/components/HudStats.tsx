import type { ResourceSnapshot } from "../../core/types";
import { formatBytes, formatBytesPerSec } from "../format";

export function HudStats({ resources }: { resources: ResourceSnapshot | null }) {
  const cpu = resources?.host.cpu;
  const mem = resources?.host.memory;
  const io = resources?.host.io;
  const net = resources?.host.net;
  const cursor = resources?.groups["ide.cursor"];
  if (!cpu || !mem) return <aside className="hud-stats muted">…</aside>;

  return (
    <aside className="hud-stats" title="Uso do PC (totais)">
      <span>
        Cursor {cursor ? `${cursor.cpuPercent.toFixed(0)}% ${formatBytes(cursor.memBytes)}` : "—"}
      </span>
      <span>
        RAM {mem.usedPercent.toFixed(0)}%
      </span>
      <span>
        CPU {cpu.usagePercent.toFixed(0)}%
      </span>
      <span>L {formatBytesPerSec(io?.readBytesPerSec ?? 0)}</span>
      <span>G {formatBytesPerSec(io?.writeBytesPerSec ?? 0)}</span>
      <span>Net {formatBytesPerSec(net?.totalBytesPerSec ?? 0)}</span>
    </aside>
  );
}
