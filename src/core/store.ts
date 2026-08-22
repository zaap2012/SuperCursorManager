import { EventEmitter } from "node:events";
import { brand } from "../brand.js";
import { WorkspacePresenceEvent, type ActivityEvent } from "./events.js";
import { defaultEta, type SessionFactory, type WorkSession } from "./sessions.js";
import type { EtaStrategy } from "./eta.js";
import type {
  AppSnapshot,
  IntegrationStatus,
  ProjectRef,
  ResourceSnapshot,
  SessionStatus,
  UiSettings,
} from "./types.js";

const defaultUi: UiSettings = { chrome: "window", opacityWindow: 90, opacityHud: 92, overlay: false };

export class SessionStore extends EventEmitter {
  private readonly sessions = new Map<string, WorkSession>();
  private readonly projects = new Map<string, ProjectRef>();
  private resources: ResourceSnapshot | null = null;
  private listening = false;
  private integrations: IntegrationStatus[] = [];
  private ui: UiSettings = { ...defaultUi };

  constructor(
    private readonly factory: SessionFactory,
    private readonly eta: EtaStrategy = defaultEta,
  ) {
    super();
  }

  setListening(listening: boolean): void {
    this.listening = listening;
    this.emitChange();
  }

  setIntegrations(integrations: IntegrationStatus[]): void {
    this.integrations = integrations;
    this.emitChange();
  }

  setResources(resources: ResourceSnapshot): void {
    this.resources = resources;
    this.emitChange();
  }

  setUi(patch: Partial<UiSettings>): UiSettings {
    this.ui = { ...this.ui, ...patch };
    this.emitChange();
    return this.ui;
  }

  finishSession(id: string, status: SessionStatus = "aborted"): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.finish(status);
    this.emitChange();
    return true;
  }

  apply(events: ActivityEvent[]): void {
    if (!events.length) return;
    for (const event of events) {
      if (event instanceof WorkspacePresenceEvent && event.project) {
        this.projects.set(event.project.id, event.project);
        continue;
      }
      if (event.project) this.projects.set(event.project.id, event.project);
      let session = this.sessions.get(event.sessionKey);
      if (!session) {
        const created = this.factory.create(event);
        if (!created) continue;
        session = created;
        this.sessions.set(event.sessionKey, session);
      }
      session.apply(event);
    }
    this.prune();
    this.emitChange();
  }

  snapshot(): AppSnapshot {
    const now = Date.now();
    const sessions = [...this.sessions.values()]
      .map((session) => session.toSnapshot(this.eta, now))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    const live = sessions.filter((s) => s.status === "active" || s.status === "waiting");
    const done = sessions.filter((s) => s.status !== "active" && s.status !== "waiting").slice(0, 24);

    return {
      brand: { name: brand.name, tagline: brand.tagline },
      ingest: { port: brand.ingestPort, listening: this.listening },
      resources: this.resources,
      sessions: [...live, ...done],
      projects: [...this.projects.values()],
      integrations: this.integrations,
      ui: this.ui,
    };
  }

  private prune(): void {
    const done = [...this.sessions.entries()]
      .filter(([, session]) => session.status !== "active" && session.status !== "waiting")
      .sort((a, b) => a[1].updatedAt - b[1].updatedAt);
    while (done.length > 40) {
      const extra = done.shift();
      if (extra) this.sessions.delete(extra[0]);
    }
  }

  private emitChange(): void {
    this.emit("change", this.snapshot());
  }
}
