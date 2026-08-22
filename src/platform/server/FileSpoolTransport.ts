import fs from "node:fs";
import path from "node:path";
import type { IngestEnvelope } from "../../core/index.js";

export class FileSpoolTransport {
  private offset = 0;
  private timer: NodeJS.Timeout | undefined;
  private watcher: fs.FSWatcher | undefined;

  constructor(
    private readonly filePath: string,
    private readonly onEnvelope: (envelope: IngestEnvelope) => void,
  ) {}

  start(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (fs.existsSync(this.filePath)) {
      const size = fs.statSync(this.filePath).size;
      this.offset = Math.max(0, size - 128_000);
    } else fs.writeFileSync(this.filePath, "");
    this.readNew();
    this.timer = setInterval(() => this.readNew(), 200);
    try {
      this.watcher = fs.watch(this.filePath, () => this.readNew());
    } catch {
      // poll fallback is enough on some Windows setups
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.watcher?.close();
  }

  private readNew(): void {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const stat = fs.statSync(this.filePath);
      if (stat.size < this.offset) this.offset = 0;
      if (stat.size === this.offset) return;
      const fd = fs.openSync(this.filePath, "r");
      const length = stat.size - this.offset;
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, this.offset);
      fs.closeSync(fd);
      this.offset = stat.size;
      const chunk = buffer.toString("utf8");
      for (const line of chunk.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          this.onEnvelope(JSON.parse(trimmed) as IngestEnvelope);
        } catch {
          // ignore malformed line
        }
      }
    } catch {
      // next tick retries
    }
  }
}
