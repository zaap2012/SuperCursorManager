import type { ResourceSnapshot } from "../../core/types";
import { formatBytes, formatKbPerSec, formatMhz } from "../format";
import { useSmoothNumber, type FlashDir } from "../useSmoothNumber";
import type { ViewMode } from "../viewMode";

export function ResourceBar({
  resources,
  view,
}: {
  resources: ResourceSnapshot | null;
  view: ViewMode;
}) {
  const cpu = resources?.host.cpu;
  const memory = resources?.host.memory;
  const io = resources?.host.io;
  const net = resources?.host.net;
  const cursor = resources?.groups["ide.cursor"];
  const analytic = view === "analytic";
  const digits = analytic ? 1 : 0;

  const curCpu = useSmoothNumber(cursor?.cpuPercent ?? 0);
  const ram = useSmoothNumber(memory?.usedPercent ?? 0);
  const cpuUse = useSmoothNumber(cpu?.usagePercent ?? 0);
  const coresOn = useSmoothNumber(cpu?.activeCores ?? 0);
  const readKb = useSmoothNumber((io?.readBytesPerSec ?? 0) / 1024);
  const writeKb = useSmoothNumber((io?.writeBytesPerSec ?? 0) / 1024);
  const downKb = useSmoothNumber((net?.recvBytesPerSec ?? 0) / 1024);
  const upKb = useSmoothNumber((net?.sentBytesPerSec ?? 0) / 1024);

  if (!cpu || !memory) {
    return <section className="resource-panel muted">Medindo recursos do PC…</section>;
  }

  return (
    <section className={`resource-panel ${view}`}>
      <div className="resource-summary">
        <Metric
          label="Cursor"
          value={cursor ? `${curCpu.value.toFixed(digits)}%` : "—"}
          hint={cursor ? `${formatBytes(cursor.memBytes)} · ${cursor.processCount} proc` : "não detectado"}
          bar={cursor ? curCpu.value : undefined}
          flash={curCpu.flash}
        />
        <Metric
          label="RAM (total)"
          value={`${ram.value.toFixed(digits)}%`}
          hint={`${formatBytes(memory.usedBytes)} / ${formatBytes(memory.totalBytes)}`}
          bar={ram.value}
          flash={ram.flash}
        />
        <Metric
          label="CPU (total)"
          value={`${cpuUse.value.toFixed(digits)}%`}
          hint={`${formatMhz(cpu.currentMhz)} · ${Math.round(coresOn.value)}/${cpu.logicalCores} núcleos`}
          bar={cpuUse.value}
          flash={cpuUse.flash}
        />
        <Metric
          label="Leitura (total)"
          value={formatKbPerSec(readKb.value * 1024)}
          hint="disco · KB/s"
          flash={readKb.flash}
        />
        <Metric
          label="Gravação (total)"
          value={formatKbPerSec(writeKb.value * 1024)}
          hint="disco · KB/s"
          flash={writeKb.flash}
        />
        <Metric
          label="Internet (total)"
          value={`${formatKbPerSec(downKb.value * 1024)} / ${formatKbPerSec(upKb.value * 1024)}`}
          hint="D · U"
          flash={downKb.flash ?? upKb.flash}
        />
      </div>

      {analytic ? (
        <div className="resource-details">
          <article>
            <h3>Processador</h3>
            <p className="model">{cpu.model}</p>
            <dl>
              <div>
                <dt>Uso atual</dt>
                <dd className={flashClass(cpuUse.flash)}>{cpuUse.value.toFixed(1)}%</dd>
              </div>
              <div>
                <dt>Clock atual</dt>
                <dd>{formatMhz(cpu.currentMhz)}</dd>
              </div>
              <div>
                <dt>Clock máx.</dt>
                <dd>{formatMhz(cpu.maxMhz)}</dd>
              </div>
              <div>
                <dt>Núcleos ativos</dt>
                <dd className={flashClass(coresOn.flash)}>
                  {Math.round(coresOn.value)} / {cpu.logicalCores}
                </dd>
              </div>
              <div>
                <dt>Físicos / lógicos</dt>
                <dd>
                  {cpu.physicalCores} / {cpu.logicalCores}
                </dd>
              </div>
              {cpu.vendor ? (
                <div>
                  <dt>Vendor</dt>
                  <dd>{cpu.vendor}</dd>
                </div>
              ) : null}
            </dl>
            <div className="cores">
              {cpu.cores.map((core) => (
                <CoreMeter key={core.index} index={core.index} usage={core.usagePercent} active={core.active} />
              ))}
            </div>
          </article>
          <article>
            <h3>Memória</h3>
            <div className="usage-track" title={`${ram.value.toFixed(1)}%`}>
              <div
                className={`usage-fill ${flashClass(ram.flash)}`}
                style={{ width: `${Math.min(100, ram.value)}%` }}
              />
            </div>
            <dl>
              <div>
                <dt>Usada</dt>
                <dd>{formatBytes(memory.usedBytes)}</dd>
              </div>
              <div>
                <dt>Disponível</dt>
                <dd>{formatBytes(memory.availableBytes)}</dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd>{formatBytes(memory.totalBytes)}</dd>
              </div>
              <div>
                <dt>Pressão</dt>
                <dd className={flashClass(ram.flash)}>{ram.value.toFixed(1)}%</dd>
              </div>
            </dl>
            <h3>Disco e rede</h3>
            <dl>
              <div>
                <dt>Leitura</dt>
                <dd className={flashClass(readKb.flash)}>{formatKbPerSec(readKb.value * 1024)}</dd>
              </div>
              <div>
                <dt>Gravação</dt>
                <dd className={flashClass(writeKb.flash)}>{formatKbPerSec(writeKb.value * 1024)}</dd>
              </div>
              <div>
                <dt>Download</dt>
                <dd className={flashClass(downKb.flash)}>{formatKbPerSec(downKb.value * 1024)}</dd>
              </div>
              <div>
                <dt>Upload</dt>
                <dd className={flashClass(upKb.flash)}>{formatKbPerSec(upKb.value * 1024)}</dd>
              </div>
            </dl>
            {cursor ? (
              <>
                <h3>Cursor</h3>
                <dl>
                  <div>
                    <dt>CPU do grupo</dt>
                    <dd className={flashClass(curCpu.flash)}>{curCpu.value.toFixed(1)}%</dd>
                  </div>
                  <div>
                    <dt>RAM do grupo</dt>
                    <dd>{formatBytes(cursor.memBytes)}</dd>
                  </div>
                  <div>
                    <dt>Processos</dt>
                    <dd>{cursor.processCount}</dd>
                  </div>
                </dl>
              </>
            ) : null}
          </article>
        </div>
      ) : null}
    </section>
  );
}

function CoreMeter({ index, usage, active }: { index: number; usage: number; active: boolean }) {
  const smooth = useSmoothNumber(usage);
  return (
    <div className={`core ${active ? "on" : ""}`} title={`CPU ${index}`}>
      <span>{index}</span>
      <div className="core-track">
        <div
          className={`core-fill ${flashClass(smooth.flash)}`}
          style={{ height: `${Math.min(100, smooth.value)}%` }}
        />
      </div>
      <small className={flashClass(smooth.flash)}>{Math.round(smooth.value)}%</small>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  bar,
  flash,
}: {
  label: string;
  value: string;
  hint: string;
  bar?: number;
  flash?: FlashDir;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong className={flashClass(flash)}>{value}</strong>
      {bar != null ? (
        <div className="usage-track" title={`${Math.round(bar)}%`}>
          <div
            className={`usage-fill ${flashClass(flash)}`}
            style={{ width: `${Math.min(100, Math.max(0, bar))}%` }}
          />
        </div>
      ) : null}
      <small>{hint}</small>
    </div>
  );
}

function flashClass(flash: FlashDir | undefined): string {
  if (flash === "up") return "flash-up";
  if (flash === "down") return "flash-down";
  return "";
}
