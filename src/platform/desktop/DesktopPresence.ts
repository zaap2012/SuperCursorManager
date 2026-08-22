import { app, BrowserWindow, Menu, nativeImage, screen, Tray, type MenuItemConstructorOptions } from "electron";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { brand } from "../../brand.js";
import type { ChromeMode, UiSettings } from "../../core/types.js";

const OPACITY_STEPS = [15, 25, 35, 45, 55, 65, 75, 85, 90, 95];
const HUD_HEIGHT = 22;
const HUD_HEIGHT_MAX = HUD_HEIGHT * 3;
const HOVER_HOLD_MS = 2000;

type Bounds = { x: number; y: number; width: number; height: number };

export class DesktopPresence {
  private tray: Tray | undefined;
  private quitting = false;
  private hovering = false;
  private hoverLeaveTimer: NodeJS.Timeout | undefined;
  private window: BrowserWindow | undefined;
  private settings: UiSettings;
  private hudHeight = HUD_HEIGHT;
  private windowBounds: Bounds | undefined;
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
    if (this.settings.chrome === "hud") this.dockHud();
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
    this.tray?.destroy();
    app.quit();
  }

  enableLogin(): void {
    app.setName(brand.name);
    if (process.platform !== "win32") {
      app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });
      return;
    }
    if (app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true, args: ["--hidden"] });
    } else {
      app.setLoginItemSettings({
        openAtLogin: true,
        openAsHidden: true,
        path: process.execPath,
        args: [this.projectRoot, "--hidden"],
      });
    }
    this.pruneDuplicateRunKeys();
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
    return process.argv.includes("--hidden") || app.getLoginItemSettings().wasOpenedAsHidden;
  }

  private setWindowOpacity(percent: number): void {
    this.patch({ opacityWindow: clamp(percent, 15, 95) });
    this.applyLook();
    this.rebuildMenu();
  }

  private setHudOpacity(percent: number): void {
    this.patch({ opacityHud: clamp(percent, 15, 95) });
    this.applyLook();
    this.rebuildMenu();
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
    const boost = this.hovering ? 30 : 0;
    const base = this.settings.chrome === "hud" ? this.settings.opacityHud : this.settings.opacityWindow;
    win.setOpacity(clamp(base - boost, 15, 95) / 100);
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
    const area = screen.getPrimaryDisplay().bounds;
    win.setMaximumSize(area.width, HUD_HEIGHT_MAX);
    win.setBounds({ x: area.x, y: area.y, width: area.width, height: this.hudHeight });
  }

  setHover(hovering: boolean): void {
    if (hovering) {
      if (this.hoverLeaveTimer) {
        clearTimeout(this.hoverLeaveTimer);
        this.hoverLeaveTimer = undefined;
      }
      if (this.hovering) return;
      this.hovering = true;
      this.applyLook();
      return;
    }
    if (!this.hovering || this.hoverLeaveTimer) return;
    this.hoverLeaveTimer = setTimeout(() => {
      this.hoverLeaveTimer = undefined;
      this.hovering = false;
      this.applyLook();
    }, HOVER_HOLD_MS);
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
    const windowOpacity: MenuItemConstructorOptions[] = OPACITY_STEPS.map((value) => ({
      label: `${value}%`,
      type: "radio",
      checked: this.settings.opacityWindow === value,
      click: () => this.setWindowOpacity(value),
    }));
    const hudOpacity: MenuItemConstructorOptions[] = OPACITY_STEPS.map((value) => ({
      label: `${value}%`,
      type: "radio",
      checked: this.settings.opacityHud === value,
      click: () => this.setHudOpacity(value),
    }));
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Abrir janela", click: () => this.show() },
        { label: "Barra no topo", type: "checkbox", checked: this.settings.chrome === "hud", click: () => this.setChrome(this.settings.chrome === "hud" ? "window" : "hud") },
        { type: "separator" },
        { label: "Visibilidade da janela", submenu: windowOpacity },
        { label: "Visibilidade da barra", submenu: hudOpacity },
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
      const raw = JSON.parse(fs.readFileSync(this.settingsPath, "utf8")) as Partial<UiSettings>;
      const legacy = clamp(Number(raw.opacity) || 92, 15, 95);
      return {
        chrome: raw.chrome === "hud" ? "hud" : "window",
        opacityWindow: clamp(Number(raw.opacityWindow) || 90, 15, 95),
        opacityHud: clamp(Number(raw.opacityHud) || legacy, 15, 95),
        overlay: Boolean(raw.overlay),
      };
    } catch {
      return { chrome: "window", opacityWindow: 90, opacityHud: 92, overlay: false };
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
