import type { ResourceSnapshot } from "../../core/types";
import { formatKbPerSec } from "../format";
import { useSmoothNumber, type FlashDir } from "../useSmoothNumber";

export function HudStats({ resources }: { resources: ResourceSnapshot | null }) {
  const cpu = resources?.host.cpu;
  const mem = resources?.host.memory;
  const io = resources?.host.io;
  const net = resources?.host.net;
  const cursor = resources?.groups["ide.cursor"];
  const cursorRam = mem?.totalBytes && cursor ? (cursor.memBytes / mem.totalBytes) * 100 : 0;

  const curCpu = useSmoothNumber(cursor?.cpuPercent ?? 0);
  const curRam = useSmoothNumber(cursorRam);
  const totCpu = useSmoothNumber(cpu?.usagePercent ?? 0);
  const totRam = useSmoothNumber(mem?.usedPercent ?? 0);
  const diskR = useSmoothNumber((io?.readBytesPerSec ?? 0) / 1024);
  const diskW = useSmoothNumber((io?.writeBytesPerSec ?? 0) / 1024);
  const netD = useSmoothNumber((net?.recvBytesPerSec ?? 0) / 1024);
  const netU = useSmoothNumber((net?.sentBytesPerSec ?? 0) / 1024);

  if (!cpu || !mem) return <aside className="hud-stats muted">…</aside>;

  const title = [
    `CURSOR CPU ${pct(curCpu.value)} RAM ${pct(curRam.value)}`,
    `TOTAL CPU ${pct(totCpu.value)} RAM ${pct(totRam.value)}`,
    `DISCO L ${kb(diskR.value)} G ${kb(diskW.value)}`,
    `INTERNET D ${kb(netD.value)} U ${kb(netU.value)}`,
  ].join("   ");

  return (
    <aside className="hud-stats" title={title}>
      <span>
        CURSOR (CPU <Flash n={curCpu} kind="pct" /> | RAM <Flash n={curRam} kind="pct" />)
      </span>
      <span>
        TOTAL (CPU <Flash n={totCpu} kind="pct" /> | RAM <Flash n={totRam} kind="pct" />)
      </span>
      <span>
        DISCO (L <Flash n={diskR} kind="kb" /> | G <Flash n={diskW} kind="kb" />)
      </span>
      <span>
        INTERNET (D <Flash n={netD} kind="kb" /> | U <Flash n={netU} kind="kb" />)
      </span>
    </aside>
  );
}

function Flash({
  n,
  kind,
}: {
  n: { value: number; flash: FlashDir };
  kind: "pct" | "kb";
}) {
  const text = kind === "pct" ? pct(n.value) : kb(n.value);
  return <em className={`hud-flash ${flashClass(n.flash)}`}>{text}</em>;
}

function flashClass(flash: FlashDir): string {
  if (flash === "up") return "flash-up";
  if (flash === "down") return "flash-down";
  return "";
}

function pct(n: number): string {
  return `${Math.round(Math.max(0, n))}%`;
}

function kb(n: number): string {
  return formatKbPerSec(Math.max(0, n) * 1024);
}
