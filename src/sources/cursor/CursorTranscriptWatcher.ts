import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { IngestEnvelope } from "../../core/index.js";
import { decodeBytes, normalizeText } from "../../core/text.js";

export abstract class ActivityProbe {
  abstract readonly sourceKind: string;
  abstract start(onEnvelope: (envelope: IngestEnvelope) => void): void;
  abstract stop(): void;
}

type FileCursor = { size: number; mtime: number };

const ACTIVE_WINDOW_MS = 2 * 60 * 60 * 1000;
const REPLAY_BYTES = 512_000;

export class CursorTranscriptWatcher extends ActivityProbe {
  readonly sourceKind = "ide.cursor";
  private timer: NodeJS.Timeout | undefined;
  private readonly offsets = new Map<string, FileCursor>();
  private readonly projectsRoot: string;

  constructor(home = os.homedir()) {
    super();
    this.projectsRoot = path.join(home, ".cursor", "projects");
  }

  start(onEnvelope: (envelope: IngestEnvelope) => void): void {
    this.hydrate(onEnvelope);
    this.timer = setInterval(() => this.scanLive(onEnvelope), 1000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private hydrate(onEnvelope: (envelope: IngestEnvelope) => void): void {
    if (!fs.existsSync(this.projectsRoot)) return;
    const now = Date.now();
    for (const filePath of listTranscripts(this.projectsRoot)) {
      try {
        const stat = fs.statSync(filePath);
        this.offsets.set(filePath, { size: stat.size, mtime: stat.mtimeMs });
        if (now - stat.mtimeMs > ACTIVE_WINDOW_MS) continue;
        this.replay(filePath, stat, onEnvelope, now);
      } catch {
        // skip
      }
    }
  }

  private scanLive(onEnvelope: (envelope: IngestEnvelope) => void): void {
    if (!fs.existsSync(this.projectsRoot)) return;
    for (const filePath of listTranscripts(this.projectsRoot)) {
      try {
        const stat = fs.statSync(filePath);
        const prev = this.offsets.get(filePath);
        if (prev && stat.size === prev.size && stat.mtimeMs === prev.mtime) continue;
        const start = prev && stat.size >= prev.size ? prev.size : Math.max(0, stat.size - REPLAY_BYTES);
        const chunk = readSlice(filePath, start, stat.size);
        this.offsets.set(filePath, { size: stat.size, mtime: stat.mtimeMs });
        emitChunk(chunk, filePath, this.projectsRoot, stat.mtimeMs, onEnvelope, /"type"\s*:\s*"turn_ended"/.test(chunk));
        if (/"type"\s*:\s*"turn_ended"/.test(chunk)) {
          const conversationId = conversationIdFrom(filePath);
          const roots = [decodeProjectSlug(projectSlugFromTranscript(filePath, this.projectsRoot))];
          onEnvelope(envelope("stop", conversationId, roots, stat.mtimeMs, { status: "completed" }));
        }
      } catch {
        // skip unreadable transcript
      }
    }
  }

  private replay(
    filePath: string,
    stat: fs.Stats,
    onEnvelope: (envelope: IngestEnvelope) => void,
    now: number,
  ): void {
    const start = Math.max(0, stat.size - REPLAY_BYTES);
    const chunk = readSlice(filePath, start, stat.size);
    const startedAt = Number(stat.birthtimeMs) || stat.mtimeMs;
    const conversationId = conversationIdFrom(filePath);
    const roots = [decodeProjectSlug(projectSlugFromTranscript(filePath, this.projectsRoot))];
    const ended = /"type"\s*:\s*"turn_ended"/.test(chunk);
    const stale = now - stat.mtimeMs > 6 * 60_000;
    onEnvelope(
      envelope("sessionStart", conversationId, roots, startedAt, {
        composer_mode: "agent",
        is_background_agent: filePath.includes(`${path.sep}subagents${path.sep}`),
      }),
    );
    emitChunk(chunk, filePath, this.projectsRoot, stat.mtimeMs, onEnvelope, ended || stale);
    if (ended || stale) {
      onEnvelope(
        envelope("stop", conversationId, roots, stat.mtimeMs, {
          status: ended ? "completed" : "completed",
        }),
      );
    }
  }
}

function emitChunk(
  chunk: string,
  filePath: string,
  projectsRoot: string,
  occurredAt: number,
  onEnvelope: (envelope: IngestEnvelope) => void,
  closeDangling: boolean,
): void {
  const roots = [decodeProjectSlug(projectSlugFromTranscript(filePath, projectsRoot))];
  const conversationId = conversationIdFrom(filePath);
  const isSub = filePath.includes(`${path.sep}subagents${path.sep}`);
  const openTools: Array<{ id: string; name: string }> = [];
  const close = (id: string, name: string) => {
    onEnvelope(
      envelope("postToolUse", conversationId, roots, occurredAt, {
        tool_name: name,
        tool_use_id: id,
      }),
    );
  };
  for (const line of chunk.split(/\r?\n/)) {
    for (const item of lineToEnvelopes(line, conversationId, roots, occurredAt, { skipStop: false, isSub })) {
      const payload = item.payload as { hook_event_name?: string; tool_use_id?: string; tool_name?: string };
      const hook = payload.hook_event_name ?? "";
      if (hook === "preToolUse") {
        for (const tool of openTools.splice(0)) close(tool.id, tool.name);
        openTools.push({ id: payload.tool_use_id ?? "", name: payload.tool_name ?? "Tool" });
      }
      if (hook === "stop") {
        for (const tool of openTools.splice(0)) close(tool.id, tool.name);
      }
      onEnvelope(item);
    }
  }
  if (closeDangling) {
    for (const tool of openTools) close(tool.id, tool.name);
  }
}

let transcriptListAt = 0;
let transcriptList: string[] = [];

function listTranscripts(root: string): string[] {
  if (Date.now() - transcriptListAt < 2500 && transcriptList.length) return transcriptList;
  const out: string[] = [];
  for (const project of safeDir(root)) {
    const transcripts = path.join(root, project, "agent-transcripts");
    if (!fs.existsSync(transcripts)) continue;
    walkJsonl(transcripts, out);
  }
  transcriptList = out;
  transcriptListAt = Date.now();
  return out;
}

function walkJsonl(dir: string, out: string[]): void {
  for (const entry of safeDirents(dir)) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJsonl(full, out);
    else if (entry.name.endsWith(".jsonl")) out.push(full);
  }
}

function safeDir(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function safeDirents(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function readSlice(filePath: string, start: number, end: number): string {
  const length = Math.max(0, end - start);
  if (!length) return "";
  const fd = fs.openSync(filePath, "r");
  const buffer = Buffer.alloc(length);
  fs.readSync(fd, buffer, 0, length, start);
  fs.closeSync(fd);
  let offset = 0;
  while (offset < buffer.length && (buffer[offset] & 0xc0) === 0x80) offset += 1;
  return decodeBytes(offset ? buffer.subarray(offset) : buffer);
}

function projectSlugFromTranscript(filePath: string, projectsRoot: string): string {
  const rel = path.relative(projectsRoot, filePath);
  return rel.split(/[\\/]/)[0] ?? "workspace";
}

function conversationIdFrom(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  const idx = parts.lastIndexOf("agent-transcripts");
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  return path.basename(filePath, ".jsonl");
}

function decodeProjectSlug(slug: string): string {
  const parts = slug.split("-");
  if (parts.length >= 2 && /^[a-zA-Z]$/.test(parts[0])) {
    return `${parts[0].toUpperCase()}:\\${parts.slice(1).join("\\")}`;
  }
  return slug;
}

function lineToEnvelopes(
  line: string,
  conversationId: string,
  roots: string[],
  occurredAt: number,
  opts: { skipStop: boolean; isSub: boolean },
): IngestEnvelope[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return [];
  }

  if (parsed.type === "turn_ended") {
    if (opts.skipStop) return [];
    return [envelope("stop", conversationId, roots, occurredAt, { status: str(parsed.status) ?? "completed" })];
  }

  const message = isRecord(parsed.message) ? parsed.message : null;
  const content = message && Array.isArray(message.content) ? message.content : [];
  const tools = content.filter((item) => isRecord(item) && item.type === "tool_use") as Record<string, unknown>[];
  if (tools.length) {
    const out: IngestEnvelope[] = [];
    if (opts.isSub) {
      out.push(
        envelope("subagentStart", conversationId, roots, occurredAt, {
          subagent_id: conversationId,
          subagent_type: "generalPurpose",
          task: str(tools[0] && isRecord(tools[0].input) ? tools[0].input.description : undefined),
        }),
      );
    }
    for (const tool of tools) {
      const input = isRecord(tool.input) ? tool.input : {};
      const name = str(tool.name) ?? "Tool";
      const filePath = str(input.path) ?? str(input.file_path) ?? str(input.target_directory);
      if (filePath && /^(Write|StrReplace|Delete|EditNotebook|TabWrite)$/i.test(name)) {
        out.push(envelope("afterFileEdit", conversationId, roots, occurredAt, { file_path: filePath }));
      }
      out.push(
        envelope("preToolUse", conversationId, roots, occurredAt, {
          tool_name: name,
          tool_use_id: str(tool.id) ?? `${conversationId}:${name}:${out.length}`,
          tool_input: input,
          file_path: filePath,
        }),
      );
    }
    return out;
  }

  if (parsed.role === "user") {
    const text = extractText(content);
    if (text) return [envelope("beforeSubmitPrompt", conversationId, roots, occurredAt, { prompt: text.slice(0, 240) })];
  }

  if (parsed.role === "assistant") {
    const text = extractText(content);
    if (text) return [envelope("afterAgentResponse", conversationId, roots, occurredAt, { text: text.slice(0, 240) })];
  }

  return [];
}

function envelope(
  hook: string,
  conversationId: string,
  roots: string[],
  occurredAt: number,
  extra: Record<string, unknown>,
): IngestEnvelope {
  return {
    schemaVersion: 1,
    source: { kind: "ide.cursor" },
    receivedAt: occurredAt,
    payload: {
      hook_event_name: hook,
      conversation_id: conversationId,
      workspace_roots: roots,
      ...extra,
    },
  };
}

function extractText(content: unknown[]): string {
  const joined = content
    .map((item) => (isRecord(item) && item.type === "text" ? str(item.text) : undefined))
    .filter((text): text is string => Boolean(text))
    .join("\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalizeText(joined);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return normalizeText(value);
}
