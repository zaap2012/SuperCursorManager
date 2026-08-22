import type { SessionSnapshot } from "../../core/types";
import { formatElapsed, statusLabel } from "../format";
import type { ViewMode } from "../viewMode";

export function SessionCard({
  session,
  now,
  view,
  chrome = "window",
  onFinish,
}: {
  session: SessionSnapshot;
  now: number;
  view: ViewMode;
  chrome?: "window" | "hud";
  onFinish?: () => void;
}) {
  const running = session.tools.find((tool) => tool.status === "running");
  const analytic = view === "analytic" || chrome === "hud";
  const hud = chrome === "hud";

  return (
    <article className={`card status-${session.status} view-${view} ${hud ? "hud-card" : ""}`}>
      <header className="card-top">
        <div>
          <p className="eyebrow">
            {session.sourceLabel} · {session.project.name}
            {session.stuck ? " · travado" : ""}
          </p>
          <h2>{session.headline}</h2>
        </div>
        <div className="card-actions">
          <span className={`pill ${session.status}`}>{statusLabel(session.status)}</span>
          {onFinish && (session.status === "active" || session.status === "waiting") ? (
            <button type="button" className="ghost tiny" onClick={() => onFinish()}>
              Finalizar
            </button>
          ) : null}
        </div>
      </header>

      <dl className={`meta ${analytic ? "wide" : ""}`}>
        <div>
          <dt>ETA</dt>
          <dd>{session.eta?.label ?? "—"}</dd>
        </div>
        <div>
          <dt>Tempo</dt>
          <dd>
            {formatElapsed(
              session.startedAt,
              session.status === "active" || session.status === "waiting" ? now : session.updatedAt,
            )}
          </dd>
        </div>
        {analytic ? (
          <>
            <div>
              <dt>Modelo</dt>
              <dd>{session.model ?? "—"}</dd>
            </div>
            <div>
              <dt>Agora</dt>
              <dd>{running ? `${running.name}${running.detail ? `: ${truncate(running.detail, 28)}` : ""}` : "—"}</dd>
            </div>
            <div>
              <dt>Tools</dt>
              <dd>{session.stats.toolCount}</dd>
            </div>
            <div>
              <dt>Arquivos</dt>
              <dd>{session.stats.fileCount}</dd>
            </div>
          </>
        ) : (
          <>
            <div>
              <dt>Agora</dt>
              <dd>{running?.name ?? `${session.stats.toolCount} tools`}</dd>
            </div>
            <div>
              <dt>Arquivos</dt>
              <dd>{session.stats.fileCount}</dd>
            </div>
          </>
        )}
      </dl>

      {hud ? (
        <p className="card-foot">
          {session.agents
            .filter((agent) => agent.role === "subagent")
            .slice(0, 3)
            .map((agent) => agent.type ?? "sub")
            .join(" · ") || "sem subagentes"}
          {session.files[0] ? ` · ${session.files[0].name}` : ""}
        </p>
      ) : analytic ? (
        <>
          <section className="chips">
            {session.agents.map((agent) => (
              <span key={agent.id} className={`chip ${agent.role}`}>
                {agent.role === "primary" ? "agente" : agent.type ?? "subagente"}
                {agent.task ? ` · ${truncate(agent.task, 42)}` : ""}
              </span>
            ))}
            {running ? <span className="chip live">{running.name}</span> : null}
          </section>

          <section className="split">
            <div>
              <h3>Ferramentas ({session.stats.toolCount})</h3>
              <ul>
                {session.tools.length === 0 ? <li className="muted">Nenhuma ainda</li> : null}
                {[...session.tools].reverse().map((tool) => (
                  <li key={tool.id}>
                    <b>{tool.name}</b>
                    {tool.detail ? <span> {truncate(tool.detail, 64)}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Arquivos ({session.stats.fileCount})</h3>
              <ul>
                {session.files.length === 0 ? <li className="muted">Nenhum editado</li> : null}
                {session.files.map((file) => (
                  <li key={file.path} title={file.path}>
                    {file.name}
                    <span className="count">×{file.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <footer className="card-foot">
            {session.sourceKind} · subagentes {session.stats.subagentCount}
            {session.project.roots[0] ? ` · ${session.project.roots[0]}` : ""}
          </footer>
        </>
      ) : (
        <p className="card-foot">
          {session.stats.subagentCount} subagentes · {running ? "em execução" : statusLabel(session.status)}
        </p>
      )}
    </article>
  );
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
