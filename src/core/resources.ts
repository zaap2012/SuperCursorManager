import type { ProcessGroupSnapshot, ResourceSnapshot } from "./types.js";

export abstract class ResourceSampler {
  abstract readonly id: string;
  abstract sample(): Promise<Partial<ResourceSnapshot> | ProcessGroupSnapshot | null>;
}

export abstract class HostResourceSampler extends ResourceSampler {
  readonly id = "host";
}

export abstract class ProcessGroupSampler extends ResourceSampler {
  abstract readonly label: string;
  abstract readonly match: RegExp;
}

export class CompositeResourceSampler {
  constructor(private readonly samplers: ResourceSampler[]) {}

  async sample(): Promise<ResourceSnapshot> {
    const sampledAt = Date.now();
    const snapshot: ResourceSnapshot = {
      sampledAt,
      host: {
        cpuPercent: 0,
        memUsedBytes: 0,
        memTotalBytes: 0,
        cpu: {
          usagePercent: 0,
          currentMhz: 0,
          maxMhz: 0,
          model: "CPU",
          physicalCores: 0,
          logicalCores: 0,
          activeCores: 0,
          cores: [],
        },
        memory: { usedBytes: 0, totalBytes: 0, availableBytes: 0, usedPercent: 0 },
      },
      groups: {},
    };

    for (const sampler of this.samplers) {
      const piece = await sampler.sample();
      if (!piece) continue;
      if ("host" in piece && piece.host) snapshot.host = piece.host;
      if ("groups" in piece && piece.groups) Object.assign(snapshot.groups, piece.groups);
      if ("id" in piece && "processCount" in piece && "cpuPercent" in piece) {
        const group = piece as ProcessGroupSnapshot;
        snapshot.groups[group.id] = group;
      }
    }

    return snapshot;
  }
}
