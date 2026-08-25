import { app, BrowserWindow, Menu, nativeImage, screen, Tray, type MenuItemConstructorOptions } from "electron";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { brand } from "../../brand.js";
import type { ChromeMode, UiSettings } from "../../core/types.js";

const OPACITY_MIN = 20;
const OPACITY_MAX = 100;
const HUD_HEIGHT = 22;
const HUD_HEIGHT_MAX = HUD_HEIGHT * 3;

type Bounds = { x: number; y: number; width: number; height: number };

export class DesktopPresence {
  private tray: Tray | undefined;
  private quitting = false;
  private window: BrowserWindow | undefined;
  private settings: UiSettings;
  private hudHeight = HUD_HEIGHT;
  private windowBounds: Bounds | undefined;
  private opacityPanel: BrowserWindow | undefined;
  private readonly settingsPath: string;

  constructor(
    private readonly projectRoot: string,
    private readonly onUi: (settings: UiSettings) => void,
  ) {
    this.settingsPath = path.join(os.homedir(), brand.configDirName, "ui.json");
    this.settings = this.load();
  }

  get isQuitting(): boolean {
    return this.quitting;
  }

  current(): UiSettings {
    return this.settings;
  }

  attach(window: BrowserWindow): void {
    this.window = window;
    this.applyLook();
    if (this.startedHidden() || this.settings.chrome === "hud") this.dockHud();
    window.on("close", (event) => {
      if (this.quitting) return;
      event.preventDefault();
      this.dockHud();
    });
  }

  startTray(): void {
    const fromAssets = nativeImage.createFromPath(path.resolve(this.projectRoot, "assets/icon.png"));
    const icon = fromAssets.isEmpty()
      ? nativeImage.createFromPath(process.execPath)
      : fromAssets.resize({ width: 32, height: 32 });
    this.tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
    this.tray.setToolTip(brand.name);
    this.rebuildMenu();
    this.tray.on("click", () => this.show());
    screen.on("display-added", () => this.onDisplaysChanged());
    screen.on("display-removed", () => this.onDisplaysChanged());
    screen.on("display-metrics-changed", () => this.onDisplaysChanged());
  }

  private onDisplaysChanged(): void {
    this.rebuildMenu();
    if (this.settings.chrome === "hud" && this.window) this.placeHud(this.window);
  }

  show(): void {
    this.setChrome("window");
    const win = this.window ?? BrowserWindow.getAllWindows()[0];
    if (!win) return;
    win.show();
    win.focus();
  }

  quit(): void {
    this.quitting = true;
    this.opacityPanel?.destroy();
    this.tray?.destroy();
    app.quit();
  }

  enableLogin(): void {
    app.setName(brand.name);
    if (process.platform !== "win32") {
      app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });
      return;
    }
    const electronExe = this.electronPath();
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true,
      path: electronExe,
      args: [this.projectRoot, "--hidden"],
    });
    this.writeStartupShortcut();
    this.pruneDuplicateRunKeys();
    this.refreshStartupBundle();
  }

  private electronPath(): string {
    const local = path.join(this.projectRoot, "node_modules/electron/dist/electron.exe");
    return fs.existsSync(local) ? local : process.execPath;
  }

  private refreshStartupBundle(): void {
    execFile(
      "cmd.exe",
      ["/d", "/c", "npx tsc -p tsconfig.node.json && npx vite build"],
      { cwd: this.projectRoot, windowsHide: true, env: process.env },
      () => undefined,
    );
  }

  private writeStartupShortcut(): void {
    if (process.platform !== "win32") return;
    const startup = path.join(
      os.homedir(),
      "AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Startup",
      `${brand.name}.lnk`,
    );
    const target = this.electronPath();
    const args = `"${this.projectRoot}" --hidden`;
    const workdir = this.projectRoot;
    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `$s = (New-Object -ComObject WScript.Shell).CreateShortcut('${startup.replace(/'/g, "''")}'); $s.TargetPath = '${target.replace(/'/g, "''")}'; $s.Arguments = '${args.replace(/'/g, "''")}'; $s.WorkingDirectory = '${workdir.replace(/'/g, "''")}'; $s.WindowStyle = 7; $s.Save()`,
      ],
      { windowsHide: true },
      () => undefined,
    );
  }

  private pruneDuplicateRunKeys(): void {
    if (process.platform !== "win32") return;
    const keep = new Set([brand.name, "dev.pulse.manager", app.getName()]);
    const extras = ["electron.app.Electron", "Electron"];
    for (const name of extras) {
      if (keep.has(name)) continue;
      execFile(
        "reg",
        ["delete", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "/v", name, "/f"],
        { windowsHide: true },
        () => undefined,
      );
    }
  }

  startedHidden(): boolean {
    return (
      process.argv.includes("--hidden") ||
      process.argv.includes("--hud") ||
      app.getLoginItemSettings().wasOpenedAsHidden
    );
  }

  setOpacity(target: "window" | "hud", percent: number): void {
    const value = clamp(percent, OPACITY_MIN, OPACITY_MAX);
    if (target === "hud") this.patch({ opacityHud: value });
    else this.patch({ opacityWindow: value });
    this.applyLook();
  }

  showOpacityPanel(): void {
    if (this.opacityPanel && !this.opacityPanel.isDestroyed()) {
      this.opacityPanel.show();
      this.opacityPanel.focus();
      return;
    }
    const panel = new BrowserWindow({
      width: 340,
      height: 168,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      show: true,
      backgroundColor: "#00000000",
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    this.opacityPanel = panel;
    panel.on("closed", () => {
      if (this.opacityPanel === panel) this.opacityPanel = undefined;
    });
    const packed = path.join(this.projectRoot, "dist/renderer/index.html");
    const hidden = this.startedHidden();
    const devUrl = process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5173";
    if (app.isPackaged || hidden) {
      void panel.loadFile(packed, { hash: "opacity" });
      return;
    }
    void panel.loadURL(`${devUrl}/#opacity`);
  }

  private setHudScreen(screenIndex: number): void {
    this.patch({ hudScreen: Math.max(1, Math.round(screenIndex)) });
    if (this.settings.chrome === "hud" && this.window) this.placeHud(this.window);
    this.rebuildMenu();
  }

  private hudDisplays() {
    const primary = screen.getPrimaryDisplay();
    const rest = screen
      .getAllDisplays()
      .filter((item) => item.id !== primary.id)
      .sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y);
    return [primary, ...rest];
  }

  private hudArea() {
    const list = this.hudDisplays();
    const index = Math.min(Math.max(1, this.settings.hudScreen || 1), list.length) - 1;
    return list[index]?.bounds ?? screen.getPrimaryDisplay().bounds;
  }

  private setOverlay(overlay: boolean): void {
    this.patch({ overlay });
    this.applyLook();
    this.rebuildMenu();
  }

  private setChrome(chrome: ChromeMode): void {
    this.patch({ chrome });
    if (chrome === "hud") this.dockHud();
    else this.restoreWindow();
    this.rebuildMenu();
  }

  private dockHud(): void {
    const win = this.window;
    if (!win) return;
    if (this.settings.chrome !== "hud") this.patch({ chrome: "hud" });
    if (!this.windowBounds && !win.isMaximized()) this.windowBounds = win.getBounds();
    this.hudHeight = HUD_HEIGHT;
    win.setMinimumSize(200, HUD_HEIGHT);
    win.setSkipTaskbar(true);
    this.placeHud(win);
    this.applyLook();
    if (!win.isVisible()) win.showInactive();
  }

  private restoreWindow(): void {
    const win = this.window;
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    win.setSkipTaskbar(false);
    win.setResizable(true);
    win.setMinimumSize(1, 1);
    win.setMaximumSize(16384, 16384);
    win.setMinimumSize(960, 640);
    const bounds = this.windowBounds ?? { x: 120, y: 80, width: 1280, height: 860 };
    win.setBounds(bounds);
    this.applyLook();
    win.show();
    win.focus();
  }

  private applyLook(): void {
    const win = this.window;
    if (!win) return;
    const base = this.settings.chrome === "hud" ? this.settings.opacityHud : this.settings.opacityWindow;
    win.setOpacity(clamp(base, OPACITY_MIN, OPACITY_MAX) / 100);
    if (this.settings.overlay) win.setAlwaysOnTop(true, "screen-saver");
    else win.setAlwaysOnTop(false);
    const passClicks = this.settings.chrome === "hud" && !this.settings.overlay;
    win.setIgnoreMouseEvents(passClicks, passClicks ? { forward: true } : undefined);
  }

  setHudHeight(height: number): void {
    const next = clamp(Math.round(height), HUD_HEIGHT, HUD_HEIGHT_MAX);
    if (next === this.hudHeight) return;
    this.hudHeight = next;
    const win = this.window;
    if (!win || this.settings.chrome !== "hud") return;
    this.placeHud(win);
  }

  private placeHud(win: BrowserWindow): void {
    const area = this.hudArea();
    win.setMaximumSize(area.width, HUD_HEIGHT_MAX);
    win.setBounds({ x: area.x, y: area.y, width: area.width, height: this.hudHeight });
  }

  minimize(): void {
    this.window?.minimize();
  }

  toggleMaximize(): void {
    const win = this.window;
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  }

  dock(): void {
    this.dockHud();
    this.rebuildMenu();
  }

  private patch(partial: Partial<UiSettings>): void {
    this.settings = { ...this.settings, ...partial };
    this.save();
    this.onUi(this.settings);
  }

  private rebuildMenu(): void {
    if (!this.tray) return;
    const displays = this.hudDisplays();
    const screenMenu: MenuItemConstructorOptions[] = displays.map((item, index) => {
      const n = index + 1;
      const { width, height } = item.bounds;
      const primary = index === 0 ? " · principal" : "";
      return {
        label: `TELA ${n} (${width}×${height}${primary})`,
        type: "radio",
        checked: Math.min(this.settings.hudScreen || 1, displays.length) === n,
        click: () => this.setHudScreen(n),
      };
    });
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Abrir janela", click: () => this.show() },
        { label: "Barra no topo", type: "checkbox", checked: this.settings.chrome === "hud", click: () => this.setChrome(this.settings.chrome === "hud" ? "window" : "hud") },
        { label: "Tela da barra", submenu: screenMenu, enabled: displays.length > 0 },
        { type: "separator" },
        { label: "Visibilidade…", click: () => this.showOpacityPanel() },
        {
          label: "Sobrepor",
          type: "checkbox",
          checked: this.settings.overlay,
          click: (item) => this.setOverlay(item.checked),
        },
        { type: "separator" },
        { label: "Sair", click: () => this.quit() },
      ]),
    );
  }

  private load(): UiSettings {
    try {
      const raw = JSON.parse(fs.readFileSync(this.settingsPath, "utf8")) as Partial<UiSettings> & {
        opacity?: number;
      };
      const legacy = clamp(Number(raw.opacity) || 92, OPACITY_MIN, OPACITY_MAX);
      return {
        chrome: raw.chrome === "hud" ? "hud" : "window",
        opacityWindow: clamp(Number(raw.opacityWindow) || 90, OPACITY_MIN, OPACITY_MAX),
        opacityHud: clamp(Number(raw.opacityHud) || legacy, OPACITY_MIN, OPACITY_MAX),
        overlay: Boolean(raw.overlay),
        hudScreen: Math.max(1, Number(raw.hudScreen) || 1),
      };
    } catch {
      return { chrome: "window", opacityWindow: 90, opacityHud: 92, overlay: false, hudScreen: 1 };
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.settingsPath), { recursive: true });
    fs.writeFileSync(this.settingsPath, `${JSON.stringify(this.settings, null, 2)}\n`);
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
