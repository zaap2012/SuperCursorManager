import type { ProjectRef, SessionStatus } from "./types.js";

let seq = 0;

function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

export type EventBase = {
  sourceKind: string;
  sessionKey: string;
  project?: ProjectRef;
  occurredAt?: number;
  raw?: unknown;
};

export abstract class ActivityEvent {
  abstract readonly type: string;
  readonly id: string;
  readonly occurredAt: number;
  readonly sourceKind: string;
  readonly sessionKey: string;
  readonly project?: ProjectRef;
  readonly raw?: unknown;

  constructor(init: EventBase) {
    this.id = nextId("evt");
    this.sourceKind = init.sourceKind;
    this.sessionKey = init.sessionKey;
    this.project = init.project;
    this.occurredAt = init.occurredAt ?? Date.now();
    this.raw = init.raw;
  }
}

export class SessionLifecycleEvent extends ActivityEvent {
  readonly type = "session.lifecycle";
  readonly phase: "start" | "stop" | "end";
  readonly status?: SessionStatus;
  readonly mode?: string;
  readonly model?: string;
  readonly background?: boolean;
  readonly reason?: string;

  constructor(
    init: EventBase & {
      phase: "start" | "stop" | "end";
      status?: SessionStatus;
      mode?: string;
      model?: string;
      background?: boolean;
      reason?: string;
    },
  ) {
    super(init);
    this.phase = init.phase;
    this.status = init.status;
    this.mode = init.mode;
    this.model = init.model;
    this.background = init.background;
    this.reason = init.reason;
  }
}

export class ToolActivityEvent extends ActivityEvent {
  readonly type = "tool.activity";
  readonly toolId: string;
  readonly toolName: string;
  readonly phase: "start" | "end" | "fail";
  readonly detail?: string;
  readonly durationMs?: number;
  readonly model?: string;

  constructor(
    init: EventBase & {
      toolId: string;
      toolName: string;
      phase: "start" | "end" | "fail";
      detail?: string;
      durationMs?: number;
      model?: string;
    },
  ) {
    super(init);
    this.toolId = init.toolId;
    this.toolName = init.toolName;
    this.phase = init.phase;
    this.detail = init.detail;
    this.durationMs = init.durationMs;
    this.model = init.model;
  }
}

export class AgentSpawnEvent extends ActivityEvent {
  readonly type = "agent.spawn";
  readonly agentId: string;
  readonly phase: "start" | "stop";
  readonly agentType?: string;
  readonly task?: string;
  readonly status?: SessionStatus;
  readonly model?: string;
  readonly files: string[];

  constructor(
    init: EventBase & {
      agentId: string;
      phase: "start" | "stop";
      agentType?: string;
      task?: string;
      status?: SessionStatus;
      model?: string;
      files?: string[];
    },
  ) {
    super(init);
    this.agentId = init.agentId;
    this.phase = init.phase;
    this.agentType = init.agentType;
    this.task = init.task;
    this.status = init.status;
    this.model = init.model;
    this.files = init.files ?? [];
  }
}

export class FileMutationEvent extends ActivityEvent {
  readonly type = "file.mutation";
  readonly filePath: string;
  readonly origin?: string;

  constructor(init: EventBase & { filePath: string; origin?: string }) {
    super(init);
    this.filePath = init.filePath;
    this.origin = init.origin;
  }
}

export class PromptEvent extends ActivityEvent {
  readonly type = "prompt";
  readonly text: string;

  constructor(init: EventBase & { text: string }) {
    super(init);
    this.text = init.text;
  }
}

export class AgentMessageEvent extends ActivityEvent {
  readonly type = "agent.message";
  readonly kind: "thought" | "response";
  readonly text: string;

  constructor(init: EventBase & { kind: "thought" | "response"; text: string }) {
    super(init);
    this.kind = init.kind;
    this.text = init.text;
  }
}

export class WorkspacePresenceEvent extends ActivityEvent {
  readonly type = "workspace.presence";
}
