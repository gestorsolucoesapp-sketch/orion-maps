const path = require("node:path");
const { app, BrowserWindow, dialog, session, shell } = require("electron");

if (require("electron-squirrel-startup")) app.quit();

const APP_ORIGIN = "https://orion-maps.vercel.app";
const START_URL = `${APP_ORIGIN}/entrar`;
const EXTERNAL_HOSTS = new Set([
  "www.esri.com",
  "www.openstreetmap.org",
  "support.pix4d.com",
  "unsplash.com",
  "zxmhpkcxwlpvkelqapbf.supabase.co",
]);

function parsedUrl(value) {
  try { return new URL(value); } catch { return null; }
}

function isAppUrl(value) {
  return parsedUrl(value)?.origin === APP_ORIGIN;
}

function isExternalUrl(value) {
  const url = parsedUrl(value);
  return url?.protocol === "https:" && EXTERNAL_HOSTS.has(url.hostname);
}

function offlineHtml() {
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Orion Maps</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0c251d;color:#f3f7f2;font:16px system-ui,sans-serif}.card{max-width:420px;margin:24px;padding:32px;border:1px solid #4d7765;border-radius:18px;background:#173529}h1{margin:0 0 12px;font-size:26px}p{line-height:1.55}a{display:inline-block;margin-top:12px;padding:12px 18px;border-radius:9px;background:#06845d;color:white;text-decoration:none;font-weight:700}</style><main class="card"><h1>Orion Maps</h1><p>Não foi possível conectar ao serviço. Verifique sua internet e tente novamente.</p><a href="${START_URL}">Tentar novamente</a></main></html>`;
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    show: false,
    title: "Orion Maps",
    backgroundColor: "#0c251d",
    icon: path.join(__dirname, "assets", "orion-maps.ico"),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    },
  });

  window.once("ready-to-show", () => {
    if (process.env.ORION_DESKTOP_SMOKE !== "1") window.show();
  });
  window.webContents.on("did-fail-load", (_event, code, _description, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) {
      void window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(offlineHtml())}`);
    }
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (isAppUrl(url)) return;
    event.preventDefault();
    if (isExternalUrl(url)) void shell.openExternal(url);
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url) || url === "about:blank" || url.startsWith(`${APP_ORIGIN.replace("https:", "blob:https:")}/`)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false },
        },
      };
    }
    if (isExternalUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  void window.loadURL(START_URL).catch(() => {});
  return window;
}

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });

  app.whenReady().then(() => {
    app.setAppUserModelId("br.com.orionmaps.desktop");
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
      if (permission !== "geolocation" || !isAppUrl(details.requestingUrl) || !contents.getOwnerBrowserWindow()) {
        callback(false);
        return;
      }
      void dialog.showMessageBox(contents.getOwnerBrowserWindow(), {
        type: "question",
        buttons: ["Permitir", "Bloquear"],
        defaultId: 1,
        cancelId: 1,
        title: "Localização",
        message: "Permitir que o Orion Maps use sua localização neste computador?",
      }).then(({ response }) => callback(response === 0), () => callback(false));
    });
    createWindow();
  });

  app.on("window-all-closed", () => app.quit());
}
