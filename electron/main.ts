import { app, BrowserWindow, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brand } from "../src/brand.js";
import {
  AgentWorkSession,
  CompositeResourceSampler,
  CursorAgentSession,
  KindSessionFactory,
  SessionStore,
  SourceRegistry,
} from "../src/core/index.js";
import { DesktopPresence } from "../src/platform/desktop/DesktopPresence.js";
import { LocalIngestServer } from "../src/platform/server/LocalIngestServer.js";
import {
  NodeHostResourceSampler,
  NodeProcessGroupSampler,
} from "../src/platform/desktop/NodeResourceSampler.js";
import { CursorHookInstaller } from "../src/sources/cursor/CursorHookInstaller.js";
import { CursorSourceAdapter } from "../src/sources/cursor/CursorSourceAdapter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const iconPath = path.join(projectRoot, "assets/icon.png");

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

const registry = new SourceRegistry();
registry.register(new CursorSourceAdapter());

const factory = new KindSessionFactory({
  "ide.cursor": (event) =>
    new CursorAgentSession({
      id: event.sessionKey,
      sourceKind: "ide.cursor",
      sourceLabel: "Cursor",
      project: event.project ?? { id: "unknown", name: "workspace", roots: [] },
      startedAt: event.occurredAt,
    }),
  "*": (event) =>
    new AgentWorkSession({
      id: event.sessionKey,
      sourceKind: event.sourceKind,
      sourceLabel: event.sourceKind,
      project: event.project ?? { id: "unknown", name: "workspace", roots: [] },
      startedAt: event.occurredAt,
    }),
});

const store = new SessionStore(factory);
const installer = new CursorHookInstaller(path.join(projectRoot, "integrations/cursor"));
const presence = new DesktopPresence(projectRoot, (ui) => store.setUi(ui));
store.setUi(presence.current());
const server = new LocalIngestServer(store, registry, installer, brand.ingestPort, presence);
const resources = new CompositeResourceSampler([
  new NodeHostResourceSampler(),
  new NodeProcessGroupSampler("ide.cursor", "Cursor", /cursor/i),
]);

let resourceTimer: NodeJS.Timeout | undefined;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 420,
    minHeight: 22,
    title: brand.name,
    icon: iconPath,
    backgroundColor: "#00000000",
    transparent: true,
    frame: false,
    autoHideMenuBar: true,
    show: false,
    skipTaskbar: presence.startedHidden() || presence.current().chrome === "hud",
    alwaysOnTop: presence.current().overlay,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  presence.attach(win);
  if (!presence.startedHidden() && presence.current().chrome !== "hud") {
    win.show();
  }
  win.on("show", () => {
    if (presence.current().chrome !== "hud") win.setSkipTaskbar(false);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5173";
  if (!app.isPackaged) {
    const load = () => win.loadURL(devUrl);
    win.webContents.on("did-fail-load", () => {
      const packed = path.join(__dirname, "../renderer/index.html");
      win.loadFile(packed).catch(() => setTimeout(load, 800));
    });
    load();
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  if (presence.startedHidden()) {
    win.once("ready-to-show", () => {
      /* HUD/tray handled by presence */
    });
  }

  return win;
}

app.on("second-instance", () => {
  if (!gotLock) return;
  presence.show();
});

app.whenReady().then(() => {
  if (!gotLock) return;
  app.setName(brand.name);
  if (process.platform === "win32") app.setAppUserModelId("dev.pulse.manager");
  installer.install();
  server.start();
  presence.enableLogin();
  presence.startTray();
  let sampling = false;
  const sample = async () => {
    if (sampling) return;
    sampling = true;
    try {
      store.setResources(await resources.sample());
    } catch {
      // keep last sample
    } finally {
      sampling = false;
    }
  };
  void sample();
  resourceTimer = setInterval(() => void sample(), 333);
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else presence.show();
  });
});

app.on("window-all-closed", () => {
  // ingest + tray keep the process alive until Sair
});

app.on("before-quit", () => {
  if (resourceTimer) clearInterval(resourceTimer);
  server.stop();
});
