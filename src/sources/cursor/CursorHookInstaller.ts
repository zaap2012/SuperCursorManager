import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { brand } from "../../brand.js";

const HOOK_EVENTS = [
  "sessionStart",
  "sessionEnd",
  "preToolUse",
  "postToolUse",
  "postToolUseFailure",
  "subagentStart",
  "subagentStop",
  "afterFileEdit",
  "afterTabFileEdit",
  "afterShellExecution",
  "afterMCPExecution",
  "beforeSubmitPrompt",
  "afterAgentResponse",
  "afterAgentThought",
  "stop",
  "workspaceOpen",
] as const;

const RELAY_JS = `${brand.id}-relay.js`;
const RELAY_MJS = `${brand.id}-relay.mjs`;
const RELAY_PS1 = `${brand.id}-relay.ps1`;

export class CursorHookInstaller {
  constructor(
    private readonly relaySourceDir: string,
    private readonly home = os.homedir(),
  ) {}

  status(): { installed: boolean; hooksPath: string; relayPath: string } {
    const hooksPath = path.join(this.home, ".cursor", "hooks.json");
    const relayPath = this.existingRelayPath();
    if (!fs.existsSync(hooksPath) || !relayPath) {
      return { installed: false, hooksPath, relayPath: this.preferredRelayPath() };
    }
    const raw = fs.readFileSync(hooksPath, "utf8");
    const broken = raw.includes("electron.exe") || raw.includes(`-File`) && raw.includes(RELAY_PS1);
    const looksOurs =
      (raw.includes(RELAY_JS) && raw.includes("cscript")) ||
      (raw.includes(RELAY_MJS) && raw.includes("node"));
    return { installed: looksOurs && !broken, hooksPath, relayPath };
  }

  install(): { installed: boolean; hooksPath: string; relayPath: string } {
    const cursorDir = path.join(this.home, ".cursor");
    const hooksDir = path.join(cursorDir, "hooks");
    const hooksPath = path.join(cursorDir, "hooks.json");
    fs.mkdirSync(hooksDir, { recursive: true });

    const { command, relayPath } = this.prepareRelay(hooksDir);
    const current = readJson(hooksPath);
    const hooks = isRecord(current.hooks) ? current.hooks : {};
    for (const event of HOOK_EVENTS) {
      const list = Array.isArray(hooks[event]) ? [...(hooks[event] as unknown[])] : [];
      const filtered = list.filter((entry) => !isOurHook(entry));
      filtered.push({ command });
      hooks[event] = filtered;
    }

    fs.writeFileSync(
      hooksPath,
      `${JSON.stringify({ version: 1, ...omit(current, ["hooks"]), hooks }, null, 2)}\n`,
      "utf8",
    );
    return { installed: true, hooksPath, relayPath };
  }

  private preferredRelayPath(): string {
    const hooksDir = path.join(this.home, ".cursor", "hooks");
    return process.platform === "win32"
      ? path.join(hooksDir, RELAY_JS)
      : path.join(hooksDir, RELAY_MJS);
  }

  private existingRelayPath(): string | null {
    const hooksDir = path.join(this.home, ".cursor", "hooks");
    const mjs = path.join(hooksDir, RELAY_MJS);
    const js = path.join(hooksDir, RELAY_JS);
    if (fs.existsSync(mjs)) return mjs;
    if (fs.existsSync(js)) return js;
    return null;
  }

  private prepareRelay(hooksDir: string): { command: string; relayPath: string } {
    if (process.platform === "win32") {
      const node = findNodeExecutable();
      if (node) {
        const relayPath = path.join(hooksDir, RELAY_MJS);
        fs.copyFileSync(path.join(this.relaySourceDir, "relay.mjs"), relayPath);
        return {
          relayPath,
          command: `"${node.replace(/\\/g, "/")}" "${relayPath.replace(/\\/g, "/")}"`,
        };
      }
      const relayPath = path.join(hooksDir, RELAY_JS);
      fs.copyFileSync(path.join(this.relaySourceDir, "relay.js"), relayPath);
      return {
        relayPath,
        command: `cscript.exe //nologo "${relayPath.replace(/\//g, "\\")}"`,
      };
    }

    const relayPath = path.join(hooksDir, RELAY_MJS);
    fs.copyFileSync(path.join(this.relaySourceDir, "relay.mjs"), relayPath);
    const node = findNodeExecutable() ?? "node";
    return { relayPath, command: `"${node}" "${relayPath}"` };
  }
}

function findNodeExecutable(): string | null {
  if (process.execPath && !process.execPath.toLowerCase().includes("electron")) {
    return process.execPath;
  }
  const candidates = [
    path.join(process.env.ProgramFiles ?? "C:\\Program Files", "nodejs", "node.exe"),
    path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "nodejs", "node.exe"),
    path.join(os.homedir(), "AppData", "Local", "Programs", "node", "node.exe"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  try {
    const pathEnv = [machinePath(), userPath(), process.env.PATH ?? ""].filter(Boolean).join(";");
    const out = execFileSync("where.exe", ["node"], {
      encoding: "utf8",
      windowsHide: true,
      env: { ...process.env, PATH: pathEnv },
    });
    const first = out
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.toLowerCase().endsWith("node.exe") && fs.existsSync(line));
    return first ?? null;
  } catch {
    return null;
  }
}

function userPath(): string {
  return queryReg("HKCU\\Environment");
}

function machinePath(): string {
  return queryReg("HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment");
}

function queryReg(key: string): string {
  try {
    const out = execFileSync("reg.exe", ["query", key, "/v", "Path"], {
      encoding: "utf8",
      windowsHide: true,
    });
    const match = out.match(/Path\s+REG_\w+\s+(.+)/i);
    return match?.[1]?.trim() ?? "";
  } catch {
    return "";
  }
}

function readJson(filePath: string): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isOurHook(entry: unknown): boolean {
  if (!isRecord(entry)) return false;
  const command = typeof entry.command === "string" ? entry.command : "";
  return (
    command.includes(RELAY_JS) ||
    command.includes(RELAY_MJS) ||
    command.includes(RELAY_PS1) ||
    command.includes(`${brand.id}-relay`)
  );
}

function omit(record: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const next = { ...record };
  for (const key of keys) delete next[key];
  return next;
}
