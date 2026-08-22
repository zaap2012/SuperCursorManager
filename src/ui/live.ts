import { brand } from "../brand";
import type { AppSnapshot } from "../core/types";

export class LiveClient {
  private socket: WebSocket | null = null;
  private closed = false;
  private lastHudHeight = 0;
  private reconnectMs = 800;

  constructor(
    private readonly onSnapshot: (snapshot: AppSnapshot) => void,
    private readonly port = brand.ingestPort,
  ) {}

  start(): void {
    this.closed = false;
    void this.pullSnapshot();
    this.connect();
  }

  stop(): void {
    this.closed = true;
    this.socket?.close();
  }

  async installCursor(): Promise<void> {
    await fetch(`http://127.0.0.1:${this.port}/v1/integrations/cursor/install`, {
      method: "POST",
    });
    await this.pullSnapshot();
  }

  async windowAction(action: "minimize" | "maximize" | "close" | "open"): Promise<void> {
    await this.post(`/v1/window/${action}`);
  }

  async setHudHeight(height: number): Promise<void> {
    const next = Math.round(height);
    if (next === this.lastHudHeight) return;
    this.lastHudHeight = next;
    await this.post("/v1/window/hud-height", { height: next });
  }

  async setHover(hovering: boolean): Promise<void> {
    await this.post("/v1/window/hover", { hovering });
  }

  async finishSession(id: string): Promise<void> {
    await fetch(`http://127.0.0.1:${this.port}/v1/sessions/${encodeURIComponent(id)}/finish`, {
      method: "POST",
    });
    await this.pullSnapshot();
  }

  private async post(path: string, body?: unknown): Promise<void> {
    try {
      await fetch(`http://127.0.0.1:${this.port}${path}`, {
        method: "POST",
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      // ingest still booting
    }
  }

  private async pullSnapshot(): Promise<void> {
    try {
      const res = await fetch(`http://127.0.0.1:${this.port}/v1/snapshot`);
      if (!res.ok) return;
      const data = (await res.json()) as AppSnapshot;
      this.onSnapshot({
        ...data,
        ui: data.ui ?? { chrome: "window", opacityWindow: 90, opacityHud: 92, overlay: false },
      });
    } catch {
      // server still booting
    }
  }

  private connect(): void {
    if (this.closed) return;
    const ws = new WebSocket(`ws://127.0.0.1:${this.port}/v1/live`);
    this.socket = ws;
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(String(event.data)) as AppSnapshot;
        this.onSnapshot({
          ...data,
          ui: data.ui ?? { chrome: "window", opacityWindow: 90, opacityHud: 92, overlay: false },
        });
      } catch {
        // ignore malformed frame
      }
    };
    ws.onopen = () => {
      this.reconnectMs = 800;
    };
    ws.onerror = () => {
      ws.close();
    };
    ws.onclose = () => {
      if (!this.closed) {
        const wait = this.reconnectMs;
        this.reconnectMs = Math.min(this.reconnectMs * 1.6, 8000);
        setTimeout(() => this.connect(), wait);
      }
    };
  }
}
