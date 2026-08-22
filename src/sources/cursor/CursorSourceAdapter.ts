import {
  AgentMessageEvent,
  AgentSpawnEvent,
  FileMutationEvent,
  IdeSourceAdapter,
  PromptEvent,
  SessionLifecycleEvent,
  ToolActivityEvent,
  WorkspacePresenceEvent,
  projectFromRoots,
  type ActivityEvent,
  type IngestEnvelope,
  type SessionStatus,
} from "../../core/index.js";

type CursorPayload = Record<string, unknown>;

export class CursorSourceAdapter extends IdeSourceAdapter {
  readonly kind = "ide.cursor";
  readonly label = "Cursor";

  canHandle(envelope: IngestEnvelope): boolean {
    return envelope.source.kind === this.kind || envelope.source.kind === "cursor";
  }

  normalize(envelope: IngestEnvelope): ActivityEvent[] {
    const payload = asRecord(envelope.payload);
    const hook = str(payload.hook_event_name) ?? str(payload.event) ?? "unknown";
    const roots = asStringArray(payload.workspace_roots);
    const project = projectFromRoots(roots);
    const sessionKey =
      str(payload.conversation_id) ??
      str(payload.session_id) ??
      str(payload.parent_conversation_id) ??
      `ws:${project.id}`;
    const base = {
      sourceKind: this.kind,
      sessionKey,
      project,
      occurredAt: envelope.receivedAt,
      raw: payload,
    };

    switch (hook) {
      case "workspaceOpen":
        return [new WorkspacePresenceEvent(base)];
      case "sessionStart":
        return [
          new SessionLifecycleEvent({
            ...base,
            phase: "start",
            mode: str(payload.composer_mode),
            model: str(payload.model) ?? str(payload.model_id),
            background: bool(payload.is_background_agent),
          }),
        ];
      case "sessionEnd":
        return [
          new SessionLifecycleEvent({
            ...base,
            phase: "end",
            status: mapEndStatus(str(payload.reason)),
            reason: str(payload.reason),
            background: bool(payload.is_background_agent),
          }),
        ];
      case "stop":
        return [
          new SessionLifecycleEvent({
            ...base,
            phase: "stop",
            status: mapEndStatus(str(payload.status)),
            model: str(payload.model) ?? str(payload.model_id),
          }),
        ];
      case "preToolUse":
      case "beforeShellExecution":
      case "beforeMCPExecution":
        return [
          new ToolActivityEvent({
            ...base,
            toolId: str(payload.tool_use_id) ?? str(payload.tool_call_id) ?? `tool-${hook}`,
            toolName: toolNameOf(payload, hook),
            phase: "start",
            detail: toolDetail(payload),
            model: str(payload.model) ?? str(payload.model_id),
          }),
        ];
      case "postToolUse":
      case "afterShellExecution":
      case "afterMCPExecution":
        return [
          new ToolActivityEvent({
            ...base,
            toolId: str(payload.tool_use_id) ?? str(payload.tool_call_id) ?? `tool-${hook}`,
            toolName: toolNameOf(payload, hook),
            phase: "end",
            detail: toolDetail(payload),
            durationMs: num(payload.duration),
            model: str(payload.model) ?? str(payload.model_id),
          }),
        ];
      case "postToolUseFailure":
        return [
          new ToolActivityEvent({
            ...base,
            toolId: str(payload.tool_use_id) ?? `tool-${hook}`,
            toolName: toolNameOf(payload, hook),
            phase: "fail",
            detail: str(payload.error_message) ?? toolDetail(payload),
            durationMs: num(payload.duration),
          }),
        ];
      case "subagentStart":
        return [
          new AgentSpawnEvent({
            ...base,
            agentId: str(payload.subagent_id) ?? str(payload.tool_call_id) ?? "subagent",
            phase: "start",
            agentType: str(payload.subagent_type),
            task: str(payload.task),
            model: str(payload.subagent_model) ?? str(payload.model),
          }),
        ];
      case "subagentStop":
        return [
          new AgentSpawnEvent({
            ...base,
            agentId: str(payload.subagent_id) ?? str(payload.subagent_type) ?? "subagent",
            phase: "stop",
            agentType: str(payload.subagent_type),
            task: str(payload.summary) ?? str(payload.task) ?? str(payload.description),
            status: mapEndStatus(str(payload.status)),
            files: asStringArray(payload.modified_files),
          }),
        ];
      case "afterFileEdit":
      case "afterTabFileEdit": {
        const filePath = str(payload.file_path);
        return filePath
          ? [new FileMutationEvent({ ...base, filePath, origin: hook })]
          : [];
      }
      case "beforeSubmitPrompt": {
        const text = str(payload.prompt);
        return text ? [new PromptEvent({ ...base, text })] : [];
      }
      case "afterAgentThought": {
        const text = str(payload.text);
        return text ? [new AgentMessageEvent({ ...base, kind: "thought", text })] : [];
      }
      case "afterAgentResponse": {
        const text = str(payload.text);
        return text ? [new AgentMessageEvent({ ...base, kind: "response", text })] : [];
      }
      default:
        return [];
    }
  }
}

function asRecord(value: unknown): CursorPayload {
  return value && typeof value === "object" ? (value as CursorPayload) : {};
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function bool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function toolNameOf(payload: CursorPayload, hook: string): string {
  return (
    str(payload.tool_name) ??
    (hook.includes("Shell") ? "Shell" : undefined) ??
    (hook.includes("MCP") ? "MCP" : undefined) ??
    hook
  );
}

function toolDetail(payload: CursorPayload): string | undefined {
  const input = payload.tool_input;
  if (input && typeof input === "object") {
    const rec = input as CursorPayload;
    return (
      str(rec.command) ??
      str(rec.path) ??
      str(rec.file_path) ??
      str(rec.relative_workspace_path) ??
      str(rec.query) ??
      str(rec.description) ??
      str(rec.prompt)
    );
  }
  return str(payload.command) ?? str(payload.file_path) ?? str(payload.task);
}

function mapEndStatus(value?: string): SessionStatus {
  if (value === "aborted" || value === "user_close" || value === "window_close") return "aborted";
  if (value === "error") return "error";
  return "completed";
}
