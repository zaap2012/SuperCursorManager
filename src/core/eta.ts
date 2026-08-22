import type { EtaEstimate, SessionStatus } from "./types.js";
import type { WorkSession } from "./sessions.js";

export abstract class EtaStrategy {
  abstract estimate(session: WorkSession, now?: number): EtaEstimate | null;
}

export class HeuristicEtaStrategy extends EtaStrategy {
  estimate(session: WorkSession, now = Date.now()): EtaEstimate | null {
    if (session.status === "completed" || session.status === "aborted") {
      return { remainingMs: 0, confidence: 0.95, label: "concluído" };
    }
    if (session.status === "error") {
      return { remainingMs: 0, confidence: 0.7, label: "interrompeu" };
    }

    const tools = session.tools;
    const finished = tools.filter((t) => t.endedAt && t.startedAt);
    const running = tools.filter((t) => t.status === "running");
    const avgMs = average(
      finished.map((t) => (t.endedAt as number) - t.startedAt),
      session.mode === "ask" ? 8_000 : 14_000,
    );

    const silence = now - session.updatedAt;
    if (silence > 25_000 && running.length === 0) {
      return {
        remainingMs: Math.min(silence, 90_000),
        confidence: 0.2,
        label: "aguardando",
      };
    }

    const remainingTools = guessRemainingTools(session, running.length);
    const remainingMs = clamp(
      remainingTools * avgMs + running.length * avgMs * 0.45,
      5_000,
      45 * 60_000,
    );

    const confidence = clamp(
      0.2 + finished.length * 0.06 - (silence > 12_000 ? 0.15 : 0),
      0.15,
      0.8,
    );

    return {
      remainingMs,
      confidence,
      label: formatEtaLabel(remainingMs, confidence),
    };
  }
}

function guessRemainingTools(session: WorkSession, running: number): number {
  const n = session.tools.length;
  if (session.mode === "ask") return Math.max(1, 2 - Math.floor(n / 3) + running);
  if (n < 3) return 8 + running;
  const recentFiles = session.files.filter((f) => session.updatedAt - f.lastAt < 20_000);
  if (recentFiles.length > 0) return 5 + running;
  return 2 + running;
}

function average(values: number[], fallback: number): number {
  if (!values.length) return fallback;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function formatEtaLabel(ms: number, confidence: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return confidence < 0.35 ? "~1 min?" : "~1 min";
  if (minutes === 1) return confidence < 0.35 ? "~1 min?" : "~1 min";
  return confidence < 0.35 ? `~${minutes} min?` : `~${minutes} min`;
}

export function statusAfterSilence(status: SessionStatus, silenceMs: number, runningTools = 0): SessionStatus {
  if (status === "active" && runningTools === 0 && silenceMs > 45_000) return "waiting";
  return status;
}
