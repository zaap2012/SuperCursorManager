import { useEffect, useMemo, useState } from "react";
import { brand } from "../brand";
import type { AppSnapshot } from "../core/types";
import { HudStrip } from "./components/HudStrip";
import { ResourceBar } from "./components/ResourceBar";
import { SessionCard } from "./components/SessionCard";
import { WindowControls } from "./components/WindowControls";
import { LiveClient } from "./live";
import { loadViewMode, saveViewMode, type ViewMode } from "./viewMode";

const empty: AppSnapshot = {
  brand: { name: brand.name, tagline: brand.tagline },
  ingest: { port: brand.ingestPort, listening: false },
  resources: null,
  sessions: [],
  projects: [],
  integrations: [],
  ui: { chrome: "window", opacity: 92, overlay: false },
};

export function App() {
  const [snap, setSnap] = useState<AppSnapshot>(empty);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<ViewMode>(loadViewMode);
  const client = useMemo(() => new LiveClient(setSnap), []);

  useEffect(() => {
    client.start();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const enter = () => void client.setHover(true);
    const leave = () => void client.setHover(false);
    window.addEventListener("mouseenter", enter);
    window.addEventListener("mouseleave", leave);
    document.addEventListener("mouseenter", enter);
    document.addEventListener("mouseleave", leave);
    return () => {
      client.stop();
      clearInterval(tick);
      window.removeEventListener("mouseenter", enter);
      window.removeEventListener("mouseleave", leave);
      document.removeEventListener("mouseenter", enter);
      document.removeEventListener("mouseleave", leave);
      void client.setHover(false);
    };
  }, [client]);

  const cursor = snap.integrations.find((item) => item.id === "ide.cursor");
  const chrome = snap.ui?.chrome ?? "window";
  const live = snap.sessions.filter((s) => s.status === "active" || s.status === "waiting");
  const done = snap.sessions.filter((s) => s.status !== "active" && s.status !== "waiting");

  return (
    <div className={`app view-${view} chrome-${chrome}`}>
      {chrome === "hud" ? (
        <HudStrip
          sessions={live}
          now={now}
          resources={snap.resources}
          onHeight={(h) => void client.setHudHeight(h)}
        />
      ) : (
        <>
      <WindowControls
        onMin={() => void client.windowAction("minimize")}
        onMax={() => void client.windowAction("maximize")}
        onClose={() => void client.windowAction("close")}
      />
      <header className="topbar">
        <div>
          <p className="logo">{snap.brand.name}</p>
          <p className="tag">{snap.brand.tagline}</p>
        </div>
        <div className="top-actions">
          <span className={`dot ${snap.ingest.listening ? "on" : ""}`}>
            {snap.ingest.listening ? "ingest ok" : "ingest off"} · :{snap.ingest.port}
          </span>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              const next = view === "analytic" ? "synthetic" : "analytic";
              setView(next);
              saveViewMode(next);
            }}
          >
            {view === "analytic" ? "Sintético" : "Analítico"}
          </button>
          <button
            disabled={busy || cursor?.installed}
            onClick={async () => {
              setBusy(true);
              try {
                await client.installCursor();
              } finally {
                setBusy(false);
              }
            }}
          >
            {cursor?.installed ? "Cursor conectado" : busy ? "Instalando…" : "Instalar Cursor"}
          </button>
        </div>
      </header>

      <ResourceBar resources={snap.resources} view={view} />

      {snap.sessions.length === 0 ? (
        <section className="empty">
          <h1>Nenhuma sessão ainda</h1>
          <p>
            Instale a integração e abra um agente no Cursor. Os cards aparecem sozinhos — projeto,
            ferramentas, arquivos e ETA estimado.
          </p>
        </section>
      ) : (
        <>
          <section className="grid">
            {live.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                now={now}
                view={view}
                chrome="window"
                onFinish={() => client.finishSession(session.id)}
              />
            ))}
          </section>
          {done.length > 0 ? (
            <>
              <h2 className="section-title">Recentes</h2>
              <section className="grid dim">
                {done.map((session) => (
                  <SessionCard key={session.id} session={session} now={now} view={view} chrome="window" />
                ))}
              </section>
            </>
          ) : null}
        </>
      )}
        </>
      )}
    </div>
  );
}
