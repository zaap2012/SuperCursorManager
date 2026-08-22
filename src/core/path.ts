import type { ProjectRef } from "./types.js";

export function basename(filePath: string): string {
  const normalized = filePath.replace(/[\\/]+$/, "");
  const parts = normalized.split(/[\\/]/);
  return parts[parts.length - 1] || filePath;
}

export function projectFromRoots(roots: string[] | undefined, fallback = "workspace"): ProjectRef {
  const list = (roots ?? []).filter(Boolean);
  const root = list[0] ?? fallback;
  return {
    id: root,
    name: basename(root),
    roots: list.length ? list : [root],
  };
}
