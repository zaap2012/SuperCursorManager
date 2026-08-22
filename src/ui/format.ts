export function formatMhz(mhz: number): string {
  if (!mhz) return "—";
  if (mhz >= 1000) return `${(mhz / 1000).toFixed(mhz >= 3000 ? 1 : 2)} GHz`;
  return `${Math.round(mhz)} MHz`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

export function formatKbPerSec(bytesPerSec: number): string {
  const kb = Math.max(0, bytesPerSec) / 1024;
  if (kb < 10) return `${kb.toFixed(1)}KB/s`;
  return `${Math.round(kb)}KB/s`;
}

export function formatBytesPerSec(bytesPerSec: number): string {
  return `${formatBytes(Math.max(0, bytesPerSec))}/s`;
}

export function formatCompactRate(bytesPerSec: number): string {
  const n = Math.max(0, bytesPerSec);
  if (n < 512) return "0";
  if (n < 1024) return `${Math.round(n)}B`;
  const units = ["K", "M", "G"];
  let value = n / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)}${units[unit]}/s`;
}

export function formatCompactBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  const units = ["K", "M", "G", "T"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)}${units[unit]}`;
}

export function formatElapsed(from: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - from) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return `${minutes}m ${rest}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function statusLabel(status: string): string {
  switch (status) {
    case "active":
      return "ao vivo";
    case "waiting":
      return "aguardando";
    case "completed":
      return "concluído";
    case "aborted":
      return "cancelado";
    case "error":
      return "erro";
    default:
      return status;
  }
}
