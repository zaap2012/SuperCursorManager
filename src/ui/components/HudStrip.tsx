import { useEffect, useRef } from "react";
import type { ResourceSnapshot, SessionSnapshot } from "../../core/types";
import { formatElapsed, statusLabel } from "../format";
import { HudStats } from "./HudStats";

export function HudStrip({
  sessions,
  now,
  resources,
  onHeight,
}: {
  sessions: SessionSnapshot[];
  now: number;
  resources: ResourceSnapshot | null;
  onHeight?: (height: number) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const items = uniqueByProject(sessions.filter((s) => s.status === "active" || s.status === "waiting"));

  useEffect(() => {
    const el = ref.current;
    if (!el || !onHeight) return;
    const report = () => onHeight(el.scrollHeight);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [items.length, onHeight]);

  return (
    <section ref={ref} className="hud-strip">
      <div className="hud-live">
        {!items.length ? (
          <span className="muted">Nenhum agente ativo</span>
        ) : (
          items.map((session) => {
            const running = session.tools.find((tool) => tool.status === "running");
            const done = session.status !== "active" && session.status !== "waiting";
            const clockEnd = done ? session.updatedAt : now;
            return (
              <article key={session.id} className={`hud-chip status-${session.status}`}>
                <b>{session.project.name}</b>
                <span className={`dot ${session.status === "active" ? "on" : ""}`}>
                  {statusLabel(session.status)}
                </span>
                <span className="hud-now" title={session.headline}>
                  {summarize(session, running?.name)}
                </span>
                {session.status === "active" && session.eta?.label && !/conclu/i.test(session.eta.label) ? (
                  <span>{session.eta.label}</span>
                ) : null}
                <span>{formatElapsed(session.startedAt, clockEnd)}</span>
              </article>
            );
          })
        )}
      </div>
      <HudStats resources={resources} />
    </section>
  );
}

function uniqueByProject(sessions: SessionSnapshot[]): SessionSnapshot[] {
  const seen = new Set<string>();
  const out: SessionSnapshot[] = [];
  for (const session of [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)) {
    const key = session.project.id || session.project.name;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(session);
  }
  return out;
}

function summarize(session: SessionSnapshot, runningName?: string): string {
  if (runningName) {
    const tool = session.tools.find((item) => item.status === "running");
    const detail = tool?.detail?.replace(/\\/g, "/").split("/").pop();
    return detail ? `${tool?.name}: ${detail}` : runningName;
  }
  const file = session.files[0]?.name;
  if (file) return file;
  const last = [...session.tools].reverse().find((tool) => tool.name);
  if (last) {
    const detail = last.detail?.replace(/\\/g, "/").split("/").pop();
    return detail ? `${last.name}: ${detail}` : last.name;
  }
  const head = session.headline.replace(/\s+/g, " ").trim();
  if (head && !/^(conclu[ií]do|finalizado|cancelado|falhou)$/i.test(head)) {
    return head.slice(0, 48);
  }
  return `${session.stats.toolCount} tools`;
}
