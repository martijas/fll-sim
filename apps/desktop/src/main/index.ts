import { app, BrowserWindow, dialog, ipcMain, net, protocol, session, shell } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, extname, join, normalize, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const isDev = !!process.env.ELECTRON_RENDERER_URL;
// The simulation worker shares a SharedArrayBuffer with the UI (pause, speed, hub buttons).
// The app only ever loads its own bundled content, so enabling it globally is safe.
app.commandLine.appendSwitch("enable-features", "SharedArrayBuffer");
const here = import.meta.dirname;

/** Repository root when running from source; packaged resources dir in production. */
function assetRoot(): string {
  return app.isPackaged ? process.resourcesPath : resolve(here, "../../../..");
}

// The production renderer is served from app:// so it can send cross-origin isolation headers
// (file:// cannot), which SharedArrayBuffer requires.
protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".wasm": "application/wasm",
  ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".woff2": "font/woff2",
};

function serveRenderer() {
  const root = resolve(here, "../renderer");
  protocol.handle("app", async (req) => {
    const url = new URL(req.url);
    const file = normalize(join(root, decodeURIComponent(url.pathname)));
    if (!file.startsWith(root)) return new Response("forbidden", { status: 403 });
    const res = await net.fetch(pathToFileURL(file).toString());
    const body = await res.arrayBuffer();
    return new Response(body, {
      status: res.status,
      headers: {
        "Content-Type": MIME[extname(file)] ?? "application/octet-stream",
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 950,
    minWidth: 1100,
    minHeight: 700,
    title: "FLL Sim",
    backgroundColor: "#15171c",
    webPreferences: {
      preload: join(here, "../preload/index.cjs"),
      contextIsolation: true,
      sandbox: false,
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  if (isDev) win.loadURL(process.env.ELECTRON_RENDERER_URL!);
  else win.loadURL("app://fllsim/index.html");
  if (process.env.FLLSIM_SMOKE) smokeTest(win, process.env.FLLSIM_SMOKE);
}

/**
 * Dev smoke test: FLLSIM_SMOKE=/path/prefix takes a screenshot after load, presses Run,
 * takes screenshots while/after the program runs, dumps the console panel, then quits.
 */
function smokeTest(win: BrowserWindow, prefix: string) {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const shot = async (name: string) => writeFile(`${prefix}-${name}.png`, (await win.webContents.capturePage()).toPNG());
  win.webContents.on("console-message", (e) => console.log(`[renderer] ${e.message}`));
  win.webContents.once("did-finish-load", async () => {
    await wait(5000);
    console.log("[smoke] " + (await win.webContents.executeJavaScript(`location.href + " isolated=" + self.crossOriginIsolated`)));
    await shot("1-loaded");
    await win.webContents.executeJavaScript(`document.querySelector("button.primary")?.click()`);
    await wait(3000);
    await shot("2-running");
    await wait(Number(process.env.FLLSIM_SMOKE_RUN_MS ?? 9000));
    await shot("3-done");
    const text = await win.webContents.executeJavaScript(`[...document.querySelectorAll(".console .line")].map(e => e.textContent).join("\\n")`);
    console.log("[console]\n" + text);
    app.quit();
  });
}

app.whenReady().then(() => {
  if (!isDev) serveRenderer();
  // Cross-origin isolation -> SharedArrayBuffer for the simulation worker.
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({
      responseHeaders: {
        ...details.responseHeaders,
        "Cross-Origin-Opener-Policy": ["same-origin"],
        "Cross-Origin-Embedder-Policy": ["require-corp"],
      },
    });
  });

  ipcMain.handle("asset:read", async (_e, rel: string) => {
    const p = resolve(assetRoot(), rel);
    if (!p.startsWith(assetRoot())) throw new Error("asset path escapes root");
    if (!existsSync(p)) return null;
    return new Uint8Array(await readFile(p));
  });

  // User-imported mat images persist per season in the user data folder.
  const matPath = (season: string) => join(app.getPath("userData"), "mats", `${season.replace(/[^\w.-]/g, "_")}.img`);
  ipcMain.handle("mat:load", async (_e, season: string) => (existsSync(matPath(season)) ? new Uint8Array(await readFile(matPath(season))) : null));
  ipcMain.handle("mat:save", async (_e, season: string, data: Uint8Array) => {
    await mkdir(join(app.getPath("userData"), "mats"), { recursive: true });
    await writeFile(matPath(season), data);
  });

  ipcMain.handle("file:open", async (_e, filters: Electron.FileFilter[]) => {
    const r = await dialog.showOpenDialog({ properties: ["openFile"], filters });
    if (r.canceled || !r.filePaths[0]) return null;
    const path = r.filePaths[0];
    return { path, name: basename(path), data: new Uint8Array(await readFile(path)) };
  });

  ipcMain.handle("file:save", async (_e, suggested: string, data: Uint8Array, filters: Electron.FileFilter[], path?: string) => {
    let target = path;
    if (!target) {
      const r = await dialog.showSaveDialog({ defaultPath: suggested, filters });
      if (r.canceled || !r.filePath) return null;
      target = r.filePath;
    }
    await writeFile(target, data);
    return { path: target, name: basename(target) };
  });

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
