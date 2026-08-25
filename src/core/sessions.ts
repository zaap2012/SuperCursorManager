import { basename } from "./path.js";
import { clipText } from "./text.js";
import { HeuristicEtaStrategy, statusAfterSilence, type EtaStrategy } from "./eta.js";
import type {
  ActivityEvent,
  AgentMessageEvent,
  AgentSpawnEvent,
  FileMutationEvent,
  PromptEvent,
  SessionLifecycleEvent,
  ToolActivityEvent,
} from "./events.js";
import type {
  AgentRef,
  FileChangeRecord,
  ProjectRef,
  SessionSnapshot,
  SessionStatus,
  ToolUseRecord,
} from "./types.js";

export abstract class WorkSession {
  abstract readonly family: string;
  readonly id: string;
  readonly sourceKind: string;
  readonly sourceLabel: string;
  project: ProjectRef;
  status: SessionStatus = "active";
  headline = "Iniciando…";
  mode?: string;
  model?: string;
  startedAt: number;
  updatedAt: number;
  tools: ToolUseRecord[] = [];
  files: FileChangeRecord[] = [];
  agents: AgentRef[] = [];

  constructor(init: {
    id: string;
    sourceKind: string;
    sourceLabel: string;
    project: ProjectRef;
    startedAt?: number;
  }) {
    this.id = init.id;
    this.sourceKind = init.sourceKind;
    this.sourceLabel = init.sourceLabel;
    this.project = init.project;
    this.startedAt = init.startedAt ?? Date.now();
    this.updatedAt = this.startedAt;
  }

  apply(event: ActivityEvent): void {
    this.updatedAt = event.occurredAt;
    if (event.project) this.project = event.project;
    this.onEvent(event);
  }

  protected abstract onEvent(event: ActivityEvent): void;

  settle(now = Date.now()): void {
    const silence = now - this.updatedAt;
    for (const tool of this.tools) {
      if (tool.status === "running" && now - tool.startedAt > 4 * 60_000) {
        tool.status = "ok";
        tool.endedAt = tool.startedAt + 4 * 60_000;
      }
    }
    if (this.status === "active" || this.status === "waiting") {
      const running = this.tools.some((tool) => tool.status === "running");
      if (!running && silence > 6 * 60_000) {
        this.status = "completed";
        if (/^(conclu[ií]do|finalizado)?$/i.test(this.headline.trim()) || this.headline === "Concluído") {
          const lastFile = [...this.files].sort((a, b) => b.lastAt - a.lastAt)[0];
          this.headline = lastFile ? `Editou ${lastFile.name}` : "Concluído";
        }
        this.agents = this.agents.map((agent) => ({ ...agent, status: "completed" }));
      }
    }
  }

  finish(status: SessionStatus = "aborted"): void {
    this.status = status;
    this.updatedAt = Date.now();
    this.headline = status === "aborted" ? "Finalizado" : "Concluído";
    this.tools = this.tools.map((tool) =>
      tool.status === "running" ? { ...tool, status: "ok", endedAt: Date.now() } : tool,
    );
    this.agents = this.agents.map((agent) => ({ ...agent, status }));
  }

  toSnapshot(eta: EtaStrategy, now = Date.now()): SessionSnapshot {
    this.settle(now);
    const runningCount = this.tools.filter((tool) => tool.status === "running").length;
    const status = statusAfterSilence(this.status, now - this.updatedAt, runningCount);
    const stuck =
      (status === "active" || status === "waiting") &&
      (now - this.updatedAt > 3 * 60_000 || this.tools.some((tool) => tool.status === "running" && now - tool.startedAt > 90_000));
    return {
      id: this.id,
      family: this.family,
      sourceKind: this.sourceKind,
      sourceLabel: this.sourceLabel,
      status,
      project: this.project,
      headline: this.headline,
      mode: this.mode,
      model: this.model,
      startedAt: this.startedAt,
      updatedAt: this.updatedAt,
      eta: eta.estimate(this, now),
      agents: this.agents,
      tools: this.tools.slice(-8),
      files: [...this.files].sort((a, b) => b.lastAt - a.lastAt).slice(0, 12),
      stats: {
        toolCount: this.tools.length,
        fileCount: this.files.length,
        subagentCount: this.agents.filter((a) => a.role === "subagent").length,
      },
      stuck,
    };
  }
}

export class AgentWorkSession extends WorkSession {
  readonly family: string = "agent";

  protected onEvent(event: ActivityEvent): void {
    switch (event.type) {
      case "session.lifecycle":
        this.onLifecycle(event as SessionLifecycleEvent);
        break;
      case "tool.activity":
        this.onTool(event as ToolActivityEvent);
        break;
      case "agent.spawn":
        this.onAgent(event as AgentSpawnEvent);
        break;
      case "file.mutation":
        this.onFile(event as FileMutationEvent);
        break;
      case "prompt":
        this.onPrompt(event as PromptEvent);
        break;
      case "agent.message":
        this.onMessage(event as AgentMessageEvent);
        break;
      default:
        break;
    }
  }

  protected onLifecycle(event: SessionLifecycleEvent): void {
    if (event.mode) this.mode = event.mode;
    if (event.model) this.model = event.model;
    if (event.phase === "start") {
      this.status = "active";
      this.headline = event.mode ? `Modo ${event.mode}` : "Sessão iniciada";
      this.ensurePrimaryAgent(event.model);
      return;
    }
    if (event.phase === "stop" || event.phase === "end") {
      this.status = event.status ?? (event.reason === "error" ? "error" : "completed");
      this.headline =
        this.status === "aborted"
          ? "Cancelado"
          : this.status === "error"
            ? "Falhou"
            : "Concluído";
      this.agents = this.agents.map((a) => ({ ...a, status: this.status }));
    }
  }

  protected onTool(event: ToolActivityEvent): void {
    if (event.model) this.model = event.model;
    const existing = this.tools.find((t) => t.id === event.toolId);
    if (event.phase === "start") {
      this.status = "active";
      const record: ToolUseRecord = {
        id: event.toolId,
        name: event.toolName,
        status: "running",
        startedAt: event.occurredAt,
        detail: event.detail,
      };
      if (existing) Object.assign(existing, record);
      else {
        this.tools.push(record);
        if (this.tools.length > 80) this.tools = this.tools.slice(-80);
      }
      this.headline = event.detail
        ? `${event.toolName}: ${truncate(event.detail, 72)}`
        : `Usando ${event.toolName}`;
      return;
    }

    const target = existing ?? {
      id: event.toolId,
      name: event.toolName,
      status: "ok" as const,
      startedAt: event.occurredAt - (event.durationMs ?? 0),
      detail: event.detail,
    };
    target.status = event.phase === "fail" ? "fail" : "ok";
    target.endedAt = event.occurredAt;
    if (event.detail) target.detail = event.detail;
    if (!existing) this.tools.push(target);
    this.headline =
      event.phase === "fail"
        ? `${event.toolName} falhou`
        : event.detail
          ? `${event.toolName}: ${truncate(event.detail, 72)}`
          : `${event.toolName} ok`;
  }

  protected onAgent(event: AgentSpawnEvent): void {
    if (event.phase === "start") {
      this.status = "active";
      const agent: AgentRef = {
        id: event.agentId,
        role: "subagent",
        type: event.agentType,
        task: event.task,
        status: "active",
        model: event.model,
      };
      const idx = this.agents.findIndex((a) => a.id === event.agentId);
      if (idx >= 0) this.agents[idx] = agent;
      else this.agents.push(agent);
      this.headline = event.task
        ? `${event.agentType ?? "subagente"}: ${truncate(event.task, 72)}`
        : `Subagente ${event.agentType ?? ""}`.trim();
      return;
    }

    this.agents = this.agents.map((a) =>
      a.id === event.agentId || a.type === event.agentType
        ? { ...a, status: event.status ?? "completed", task: event.task ?? a.task }
        : a,
    );
    for (const filePath of event.files) this.touchFile(filePath, event.occurredAt);
    if (event.task) this.headline = truncate(event.task, 88);
  }

  protected onFile(event: FileMutationEvent): void {
    this.status = "active";
    this.touchFile(event.filePath, event.occurredAt);
    this.headline = `Editando ${basename(event.filePath)}`;
  }

  protected onPrompt(event: PromptEvent): void {
    this.status = "active";
    this.headline = truncate(event.text, 96);
    this.ensurePrimaryAgent(this.model);
  }

  protected onMessage(event: AgentMessageEvent): void {
    if (event.kind === "thought") {
      this.headline = `Pensando: ${truncate(event.text, 80)}`;
      return;
    }
    if (this.status === "active") this.headline = truncate(event.text, 96);
  }

  protected ensurePrimaryAgent(model?: string): void {
    if (this.agents.some((a) => a.role === "primary")) {
      if (model) {
        this.agents = this.agents.map((a) => (a.role === "primary" ? { ...a, model } : a));
      }
      return;
    }
    this.agents.unshift({
      id: `${this.id}:primary`,
      role: "primary",
      type: "primary",
      status: this.status,
      model,
    });
  }

  protected touchFile(filePath: string, at: number): void {
    const existing = this.files.find((f) => f.path === filePath);
    if (existing) {
      existing.count += 1;
      existing.lastAt = at;
      return;
    }
    this.files.push({ path: filePath, name: basename(filePath), count: 1, lastAt: at });
  }
}

export class CursorAgentSession extends AgentWorkSession {
  readonly family = "agent.cursor";
}

export abstract class SessionFactory {
  abstract create(event: ActivityEvent): WorkSession | null;
}

export class KindSessionFactory extends SessionFactory {
  constructor(
    private readonly builders: Record<string, (event: ActivityEvent) => WorkSession>,
  ) {
    super();
  }

  create(event: ActivityEvent): WorkSession | null {
    const build = this.builders[event.sourceKind] ?? this.builders["*"];
    return build ? build(event) : null;
  }
}

function truncate(text: string, max: number): string {
  return clipText(text, max);
}

export const defaultEta = new HeuristicEtaStrategy();
