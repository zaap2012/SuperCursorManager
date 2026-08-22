import type { ResourceSnapshot } from "../../core/types";
import { formatBytes, formatKbPerSec, formatMhz } from "../format";
import type { ViewMode } from "../viewMode";

export function ResourceBar({
  resources,
  view,
}: {
  resources: ResourceSnapshot | null;
  view: ViewMode;
}) {
  if (!resources?.host.cpu) {
    return <section className="resource-panel muted">Medindo recursos do PC…</section>;
  }

  const { cpu, memory, io, net } = resources.host;
  const cursor = resources.groups["ide.cursor"];
  const analytic = view === "analytic";
  const digits = analytic ? 1 : 0;

  return (
    <section className={`resource-panel ${view}`}>
      <div className="resource-summary">
        <Metric
          label="Cursor"
          value={cursor ? `${cursor.cpuPercent.toFixed(digits)}%` : "—"}
          hint={cursor ? `${formatBytes(cursor.memBytes)} · ${cursor.processCount} proc` : "não detectado"}
          bar={cursor?.cpuPercent}
        />
        <Metric
          label="RAM (total)"
          value={`${memory.usedPercent.toFixed(digits)}%`}
          hint={`${formatBytes(memory.usedBytes)} / ${formatBytes(memory.totalBytes)}`}
          bar={memory.usedPercent}
        />
        <Metric
          label="CPU (total)"
          value={`${cpu.usagePercent.toFixed(digits)}%`}
          hint={`${formatMhz(cpu.currentMhz)} · ${cpu.activeCores}/${cpu.logicalCores} núcleos`}
          bar={cpu.usagePercent}
        />
        <Metric
          label="Leitura (total)"
          value={formatKbPerSec(io?.readBytesPerSec ?? 0)}
          hint="disco · KB/s"
        />
        <Metric
          label="Gravação (total)"
          value={formatKbPerSec(io?.writeBytesPerSec ?? 0)}
          hint="disco · KB/s"
        />
        <Metric
          label="Internet (total)"
          value={`${formatKbPerSec(net?.recvBytesPerSec ?? 0)} / ${formatKbPerSec(net?.sentBytesPerSec ?? 0)}`}
          hint="D · U"
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
                <dd>{cpu.usagePercent.toFixed(1)}%</dd>
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
                <dd>
                  {cpu.activeCores} / {cpu.logicalCores}
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
                <div key={core.index} className={`core ${core.active ? "on" : ""}`} title={`CPU ${core.index}`}>
                  <span>{core.index}</span>
                  <div className="core-track">
                    <div className="core-fill" style={{ height: `${Math.min(100, core.usagePercent)}%` }} />
                  </div>
                  <small>{core.usagePercent.toFixed(0)}%</small>
                </div>
              ))}
            </div>
          </article>
          <article>
            <h3>Memória</h3>
            <div className="usage-track" title={`${memory.usedPercent.toFixed(1)}%`}>
              <div className="usage-fill" style={{ width: `${Math.min(100, memory.usedPercent)}%` }} />
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
                <dd>{memory.usedPercent.toFixed(1)}%</dd>
              </div>
            </dl>
            <h3>Disco e rede</h3>
            <dl>
              <div>
                <dt>Leitura</dt>
                <dd>{formatKbPerSec(io?.readBytesPerSec ?? 0)}</dd>
              </div>
              <div>
                <dt>Gravação</dt>
                <dd>{formatKbPerSec(io?.writeBytesPerSec ?? 0)}</dd>
              </div>
              <div>
                <dt>Download</dt>
                <dd>{formatKbPerSec(net?.recvBytesPerSec ?? 0)}</dd>
              </div>
              <div>
                <dt>Upload</dt>
                <dd>{formatKbPerSec(net?.sentBytesPerSec ?? 0)}</dd>
              </div>
            </dl>
            {cursor ? (
              <>
                <h3>Cursor</h3>
                <dl>
                  <div>
                    <dt>CPU do grupo</dt>
                    <dd>{cursor.cpuPercent.toFixed(1)}%</dd>
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

function Metric({
  label,
  value,
  hint,
  bar,
}: {
  label: string;
  value: string;
  hint: string;
  bar?: number;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {bar != null ? (
        <div className="usage-track" title={`${Math.round(bar)}%`}>
          <div className="usage-fill" style={{ width: `${Math.min(100, Math.max(0, bar))}%` }} />
        </div>
      ) : null}
      <small>{hint}</small>
    </div>
  );
}
