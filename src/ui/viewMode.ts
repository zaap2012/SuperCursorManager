export type ViewMode = "synthetic" | "analytic";

const KEY = "pulse.viewMode";

export function loadViewMode(): ViewMode {
  try {
    const value = localStorage.getItem(KEY);
    if (value === "analytic" || value === "synthetic") return value;
  } catch {
    // ignore
  }
  return "synthetic";
}

export function saveViewMode(mode: ViewMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // ignore
  }
}
