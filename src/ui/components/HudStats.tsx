import type { ResourceSnapshot } from "../../core/types";
import { formatCompactBytes, formatCompactRate } from "../format";

export function HudStats({ resources }: { resources: ResourceSnapshot | null }) {
  const cpu = resources?.host.cpu;
  const mem = resources?.host.memory;
  const io = resources?.host.io;
  const net = resources?.host.net;
  const cursor = resources?.groups["ide.cursor"];
  if (!cpu || !mem) return <aside className="hud-stats muted">…</aside>;

  const title = [
    `Cursor ${cursor ? `${cursor.cpuPercent.toFixed(0)}% ${formatCompactBytes(cursor.memBytes)}` : "—"}`,
    `RAM ${mem.usedPercent.toFixed(0)}%`,
    `CPU ${cpu.usagePercent.toFixed(0)}%`,
    `Leitura ${formatCompactRate(io?.readBytesPerSec ?? 0)}`,
    `Gravação ${formatCompactRate(io?.writeBytesPerSec ?? 0)}`,
    `Internet ${formatCompactRate(net?.totalBytesPerSec ?? 0)}`,
  ].join(" · ");

  return (
    <aside className="hud-stats" title={title}>
      <span>Cur {cursor ? `${cursor.cpuPercent.toFixed(0)}% ${formatCompactBytes(cursor.memBytes)}` : "—"}</span>
      <span>RAM {mem.usedPercent.toFixed(0)}%</span>
      <span>CPU {cpu.usagePercent.toFixed(0)}%</span>
      <span>L {formatCompactRate(io?.readBytesPerSec ?? 0)}</span>
      <span>G {formatCompactRate(io?.writeBytesPerSec ?? 0)}</span>
      <span>Net {formatCompactRate(net?.totalBytesPerSec ?? 0)}</span>
    </aside>
  );
}
