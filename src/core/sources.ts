import type { ActivityEvent } from "./events.js";
import type { IngestEnvelope } from "./types.js";

export abstract class SourceAdapter {
  abstract readonly kind: string;
  abstract readonly label: string;
  abstract canHandle(envelope: IngestEnvelope): boolean;
  abstract normalize(envelope: IngestEnvelope): ActivityEvent[];
}

export abstract class IdeSourceAdapter extends SourceAdapter {
  readonly family = "ide" as const;
}

export class SourceRegistry {
  private readonly adapters: SourceAdapter[] = [];

  register(adapter: SourceAdapter): void {
    const index = this.adapters.findIndex((a) => a.kind === adapter.kind);
    if (index >= 0) this.adapters.splice(index, 1);
    this.adapters.push(adapter);
  }

  resolve(envelope: IngestEnvelope): SourceAdapter | undefined {
    return this.adapters.find((adapter) => adapter.canHandle(envelope));
  }

  normalize(envelope: IngestEnvelope): ActivityEvent[] {
    return this.resolve(envelope)?.normalize(envelope) ?? [];
  }

  list(): Array<{ kind: string; label: string }> {
    return this.adapters.map((a) => ({ kind: a.kind, label: a.label }));
  }
}
