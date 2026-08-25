import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { brand } from "../../brand.js";
import type { IngestEnvelope, SessionStore, SourceRegistry } from "../../core/index.js";
import { FileSpoolTransport } from "./FileSpoolTransport.js";
import type { CursorHookInstaller } from "../../sources/cursor/CursorHookInstaller.js";
import { CursorTranscriptWatcher } from "../../sources/cursor/CursorTranscriptWatcher.js";

export function pulseHome(home = os.homedir()): string {
  return path.join(home, brand.configDirName);
}

export function spoolPath(home = os.homedir()): string {
  return path.join(pulseHome(home), "spool.jsonl");
}

export class LocalIngestServer {
  private server: http.Server | undefined;
  private wss: WebSocketServer | undefined;
  private spool: FileSpoolTransport | undefined;
  private transcripts: CursorTranscriptWatcher | undefined;
  private debounce: NodeJS.Timeout | undefined;

  constructor(
    private readonly store: SessionStore,
    private readonly registry: SourceRegistry,
    private readonly cursorInstaller: CursorHookInstaller,
    private readonly port = brand.ingestPort,
    private readonly chrome?: {
      minimize(): void;
      toggleMaximize(): void;
      dock(): void;
      show(): void;
      setHudHeight(height: number): void;
      setOpacity(target: "window" | "hud", percent: number): void;
      showOpacityPanel(): void;
    },
  ) {}

  start(): void {
    fs.mkdirSync(pulseHome(), { recursive: true });
    fs.writeFileSync(
      path.join(pulseHome(), "ingest.json"),
      `${JSON.stringify({ url: `http://127.0.0.1:${this.port}/v1/ingest`, port: this.port }, null, 2)}\n`,
    );

    this.server = http.createServer((req, res) => this.handle(req, res));
    this.wss = new WebSocketServer({ noServer: true });
    this.server.on("upgrade", (req, socket, head) => {
      if (req.url !== "/v1/live") {
        socket.destroy();
        return;
      }
      this.wss?.handleUpgrade(req, socket, head, (ws) => {
        this.wss?.emit("connection", ws, req);
        ws.send(JSON.stringify(this.store.snapshot()));
      });
    });
    this.server.listen(this.port, "127.0.0.1", () => {
      this.store.setListening(true);
      this.refreshIntegrations();
    });
    this.server.on("error", () => this.store.setListening(false));

    this.spool = new FileSpoolTransport(spoolPath(), (envelope) => this.accept(envelope));
    this.spool.start();
    this.transcripts = new CursorTranscriptWatcher();
    this.transcripts.start((envelope) => this.accept(envelope));
    this.store.on("change", () => this.broadcastSoon());
  }

  stop(): void {
    this.spool?.stop();
    this.transcripts?.stop();
    this.wss?.close();
    this.server?.close();
    this.store.setListening(false);
  }

  accept(envelope: IngestEnvelope): void {
    const events = this.registry.normalize({
      ...envelope,
      schemaVersion: 1,
      receivedAt: envelope.receivedAt ?? Date.now(),
    });
    this.store.apply(events);
  }

  private broadcastSoon(): void {
    if (this.debounce) return;
    this.debounce = setTimeout(() => {
      this.debounce = undefined;
      const payload = JSON.stringify(this.store.snapshot());
      this.wss?.clients.forEach((client: WebSocket) => {
        if (client.readyState === client.OPEN) client.send(payload);
      });
    }, 60);
  }

  private refreshIntegrations(): void {
    const cursor = this.cursorInstaller.status();
    this.store.setIntegrations([
      { id: "ide.cursor", label: "Cursor", installed: cursor.installed },
    ]);
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url ?? "/";
    try {
      if (req.method === "GET" && url === "/v1/health") {
        return json(res, 200, { ok: true, brand: brand.name });
      }
      if (req.method === "GET" && url === "/v1/snapshot") {
        return json(res, 200, this.store.snapshot());
      }
      if (req.method === "POST" && url === "/v1/ingest") {
        const body = await readBody(req);
        const parsed = JSON.parse(body || "{}") as IngestEnvelope;
        this.accept(parsed);
        return json(res, 202, { ok: true });
      }
      if (req.method === "POST" && url === "/v1/integrations/cursor/install") {
        this.cursorInstaller.install();
        this.refreshIntegrations();
        return json(res, 200, this.cursorInstaller.status());
      }
      const finish = url.match(/^\/v1\/sessions\/([^/]+)\/finish$/);
      if (req.method === "POST" && finish) {
        const id = decodeURIComponent(finish[1]);
        const ok = this.store.finishSession(id, "aborted");
        return json(res, ok ? 200 : 404, { ok });
      }
      if (req.method === "POST" && url === "/v1/window/minimize") {
        this.chrome?.minimize();
        return json(res, 200, { ok: true });
      }
      if (req.method === "POST" && url === "/v1/window/maximize") {
        this.chrome?.toggleMaximize();
        return json(res, 200, { ok: true });
      }
      if (req.method === "POST" && url === "/v1/window/close") {
        this.chrome?.dock();
        return json(res, 200, { ok: true });
      }
      if (req.method === "POST" && url === "/v1/window/open") {
        this.chrome?.show();
        return json(res, 200, { ok: true });
      }
      if (req.method === "POST" && url === "/v1/window/opacity") {
        const body = await readBody(req);
        const parsed = JSON.parse(body || "{}") as { target?: string; percent?: number };
        const target = parsed.target === "hud" ? "hud" : "window";
        this.chrome?.setOpacity(target, Number(parsed.percent) || 0);
        return json(res, 200, { ok: true });
      }
      if (req.method === "POST" && url === "/v1/window/opacity-panel") {
        this.chrome?.showOpacityPanel();
        return json(res, 200, { ok: true });
      }
      if (req.method === "POST" && url === "/v1/window/hud-height") {
        const body = await readBody(req);
        const parsed = JSON.parse(body || "{}") as { height?: number };
        this.chrome?.setHudHeight(Number(parsed.height) || 0);
        return json(res, 200, { ok: true });
      }
      json(res, 404, { error: "not_found" });
    } catch (error) {
      json(res, 500, { error: error instanceof Error ? error.message : "fail" });
    }
  }
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(payload);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
