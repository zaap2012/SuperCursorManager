import { brand } from "../brand";
import type { AppSnapshot } from "../core/types";

export class LiveClient {
  private socket: WebSocket | null = null;
  private closed = false;
  private lastHudHeight = 0;

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

  async windowAction(action: "minimize" | "maximize" | "close"): Promise<void> {
    await fetch(`http://127.0.0.1:${this.port}/v1/window/${action}`, { method: "POST" });
  }

  async setHudHeight(height: number): Promise<void> {
    const next = Math.round(height);
    if (next === this.lastHudHeight) return;
    this.lastHudHeight = next;
    await fetch(`http://127.0.0.1:${this.port}/v1/window/hud-height`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ height: next }),
    });
  }

  async setHover(hovering: boolean): Promise<void> {
    await fetch(`http://127.0.0.1:${this.port}/v1/window/hover`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hovering }),
    });
  }

  async finishSession(id: string): Promise<void> {
    await fetch(`http://127.0.0.1:${this.port}/v1/sessions/${encodeURIComponent(id)}/finish`, {
      method: "POST",
    });
    await this.pullSnapshot();
  }

  private async pullSnapshot(): Promise<void> {
    try {
      const res = await fetch(`http://127.0.0.1:${this.port}/v1/snapshot`);
      if (!res.ok) return;
      const data = (await res.json()) as AppSnapshot;
      this.onSnapshot({
        ...data,
        ui: data.ui ?? { chrome: "window", opacity: 92, overlay: false },
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
      this.onSnapshot(JSON.parse(String(event.data)) as AppSnapshot);
    };
    ws.onclose = () => {
      if (!this.closed) setTimeout(() => this.connect(), 1000);
    };
  }
}
