const { app, BrowserWindow, Menu, ipcMain } = require("electron");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const wppconnect = require("@wppconnect-team/wppconnect");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  dotenv.config({ path: filePath, override: true });
}

loadEnvFile(path.join(__dirname, ".env"));
loadEnvFile(path.join(__dirname, "whatsapp-bot", ".env"));

function normalizeMessageTemplate(template) {
  if (typeof template !== "string") return "";
  return template.replace(/\\n/g, "\n").trim();
}

function printHtmlSilently({ html, deviceName, silent = true } = {}) {
  return new Promise((resolve) => {
    if (!html || typeof html !== "string") {
      const error = "Invalid HTML payload for print";
      console.error("[printer]", error);
      resolve({ success: false, error });
      return;
    }

    const ownerWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const shouldShowWindow = silent === false;

    const printWindow = new BrowserWindow({
      show: shouldShowWindow,
      width: shouldShowWindow ? 520 : 1,
      height: shouldShowWindow ? 420 : 1,
      autoHideMenuBar: true,
      parent: ownerWindow || undefined,
      modal: Boolean(ownerWindow && shouldShowWindow),
      webPreferences: {
        sandbox: false,
      },
    });

    let finished = false;

    const cleanup = () => {
      try {
        if (!printWindow.isDestroyed()) {
          printWindow.close();
        }
      } catch (error) {
        console.error("[printer] cleanup error:", error);
      }
    };

    const finish = (result) => {
      if (finished) return;
      finished = true;
      resolve(result);
      cleanup();
    };

    printWindow.webContents.on("did-finish-load", () => {
      setTimeout(() => {
        try {
          printWindow.webContents.print(
            {
              silent: silent !== false,
              printBackground: true,
              deviceName: deviceName || undefined,
            },
            (success, failureReason) => {
              if (!success) {
                console.error("[printer] print failed:", failureReason);
              }
              finish({
                success,
                error: success ? undefined : failureReason || "No se pudo imprimir.",
              });
            },
          );
        } catch (error) {
          console.error("[printer] print error:", error);
          finish({
            success: false,
            error: error?.message || String(error),
          });
        }
      }, 150);
    });

    printWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
      console.error("[printer] failed to load print document:", errorCode, errorDescription);
      finish({
        success: false,
        error: errorDescription || `Error ${errorCode} al cargar el documento de impresion.`,
      });
    });

    printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch((error) => {
      console.error("[printer] loadURL error:", error);
      finish({
        success: false,
        error: error?.message || String(error),
      });
    });
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // Permite comunicación simple si no usas preload
    },
  });

  win.setMenu(null);

  // Detectar si estamos en desarrollo
  const isDev = !app.isPackaged;

  if (isDev) {
    // Desarrollo: Carga la URL de Vite limpiando caché previamente para evitar ERR_CACHE_READ_FAILURE
    win.webContents.session.clearCache().finally(() => {
      win.loadURL(process.env.VITE_DEV_SERVER_URL || "http://localhost:3000");
      win.webContents.openDevTools();
    });
  } else {
    // Producción: Carga el archivo compilado en la carpeta 'dist'
    // __dirname en producción apunta a recursos dentro del .exe
    win.loadFile(path.join(__dirname, "dist", "index.html"));
  }

  // Quitar menú de la aplicación por completo (no se muestra)
  try {
    Menu.setApplicationMenu(null);
  } catch (e) {
    // Si falla (por seguridad), forzamos que la barra del menú no sea visible
    try { win.setMenuBarVisibility(false); } catch (err) { }
  }
}

let whatsappClient;
let whatsappReady = false;
let whatsappQr = null;
let whatsappInitializing = false;
let whatsappSyncing = false;
let whatsappProgress = null;
let whatsappReconnectTimer = null;
let whatsappInitializationTimer = null;
let whatsappReconnectAttempt = 0;
let whatsappGeneration = 0;
let appIsQuitting = false;
const WHATSAPP_RECONNECT_BASE_MS = 5_000;
const WHATSAPP_RECONNECT_MAX_MS = 60_000;
const WHATSAPP_INITIALIZATION_TIMEOUT_MS = 210_000;
const WHATSAPP_SEND_INTERVAL_MS = Number.parseInt(
  process.env.WHATSAPP_SEND_INTERVAL_MS || String(4 * 60 * 1000),
  10,
);
let whatsappSendQueue = Promise.resolve();
let lastWhatsAppSendAt = 0;
const FALLBACK_REMINDER_MESSAGE_TEMPLATE =
  "Hola {{name}}, buenos días.\n\nLe escribimos de 049Movil para informarle que tiene una deuda pendiente de {{debt}} con nosotros. Le solicitamos que pase por una de nuestras sucursales para saldarla o realizar un abono.\n\nGracias por su atención.";

function getDefaultReminderMessageTemplate() {
  return normalizeMessageTemplate(process.env.REMINDER_MESSAGE_TEMPLATE) || FALLBACK_REMINDER_MESSAGE_TEMPLATE;
}

function getWhatsAppStatus() {
  return {
    ready: whatsappReady,
    qr: whatsappQr,
    connecting: whatsappInitializing,
    syncing: whatsappSyncing,
    progress: whatsappProgress,
  };
}

function broadcastWhatsAppStatus() {
  const status = getWhatsAppStatus();
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send("whatsapp:status", status);
  });
}

function findChromeExecutable() {
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const localAppData = process.env.LOCALAPPDATA;
  const candidates = [
    process.env.CHROME_EXECUTABLE_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
    localAppData && path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
    localAppData && path.join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe"),
  ].filter(Boolean);

  return candidates.find((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch (err) {
      return false;
    }
  });
}

function clearWhatsAppReconnect() {
  if (whatsappReconnectTimer) clearTimeout(whatsappReconnectTimer);
  whatsappReconnectTimer = null;
}

function clearWhatsAppInitializationTimeout() {
  if (whatsappInitializationTimer) clearTimeout(whatsappInitializationTimer);
  whatsappInitializationTimer = null;
}

function scheduleWhatsAppReconnect(reason) {
  if (whatsappReconnectTimer || appIsQuitting) return;
  clearWhatsAppInitializationTimeout();
  whatsappReady = false;
  whatsappQr = null;
  whatsappInitializing = false;
  whatsappSyncing = false;
  whatsappProgress = null;
  const attempt = whatsappReconnectAttempt++;
  const delayMs = Math.min(WHATSAPP_RECONNECT_BASE_MS * 2 ** attempt, WHATSAPP_RECONNECT_MAX_MS);
  console.warn(`[whatsapp] Reconnecting in ${Math.round(delayMs / 1000)}s (${reason || "connection lost"})`);
  broadcastWhatsAppStatus();
  whatsappReconnectTimer = setTimeout(async () => {
    whatsappReconnectTimer = null;
    await resetWhatsAppClient();
    initWhatsAppClient();
  }, delayMs);
}

function initWhatsAppClient() {
  if (whatsappClient || whatsappInitializing || appIsQuitting) return;
  whatsappInitializing = true;
  whatsappSyncing = false;
  whatsappProgress = null;
  const generation = ++whatsappGeneration;
  broadcastWhatsAppStatus();

  whatsappInitializationTimer = setTimeout(() => {
    if (generation !== whatsappGeneration || whatsappReady || whatsappQr) return;
    const message = "WhatsApp tardó demasiado en iniciar. Comprueba tu conexión y que Chrome o Edge estén instalados.";
    console.error(`[whatsapp] ${message}`);
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send("whatsapp:error", message);
    });
    scheduleWhatsAppReconnect("initialization timeout");
  }, WHATSAPP_INITIALIZATION_TIMEOUT_MS);

  const authPath = path.join(app.getPath("userData"), "whatsapp-auth");
  const chromeExecutablePath = findChromeExecutable();
  if (!chromeExecutablePath) {
    console.warn("[whatsapp] Chrome/Edge not found; Puppeteer will use its configured browser.");
  } else {
    console.log(`[whatsapp] Using browser: ${chromeExecutablePath}`);
  }

  const clientOptions = {
    session: "arkham-whatsapp",
    headless: true,
    useChrome: true,
    logQR: false,
    updatesLog: false,
    disableWelcome: true,
    autoClose: 0,
    deviceSyncTimeout: 0,
    injectionTimeout: 120_000,
    waitForLogin: false,
    catchQR: (qrImage) => {
      if (generation !== whatsappGeneration) return;
      console.log("[whatsapp] QR callback received:", Boolean(qrImage), qrImage?.length || 0);
      clearWhatsAppReconnect();
      clearWhatsAppInitializationTimeout();
      whatsappInitializing = false;
      whatsappQr = qrImage;
      whatsappReady = false;
      whatsappSyncing = false;
      whatsappProgress = null;
      broadcastWhatsAppStatus();
    },
    statusFind: (status) => {
      if (generation !== whatsappGeneration) return;
      console.log("[whatsapp] Session status:", status);
      if (["qrReadSuccess", "isLogged", "inChat"].includes(status)) {
        whatsappQr = null;
        whatsappInitializing = false;
        whatsappSyncing = true;
        broadcastWhatsAppStatus();
      } else if (["disconnectedMobile", "browserClose", "serverClose"].includes(status)) {
        scheduleWhatsAppReconnect(status);
      }
    },
    onLoadingScreen: (percent) => {
      if (generation !== whatsappGeneration) return;
      const parsedPercent = Number(percent);
      if (!Number.isFinite(parsedPercent)) return;
      whatsappSyncing = true;
      whatsappProgress = Math.min(100, Math.max(0, parsedPercent));
      broadcastWhatsAppStatus();
    },
    folderNameToken: path.join(authPath, "tokens"),
    puppeteerOptions: {
      headless: true,
      protocolTimeout: 300_000,
      userDataDir: path.join(authPath, "session"),
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
      ...(chromeExecutablePath ? { executablePath: chromeExecutablePath } : {}),
    },
  };

  wppconnect.create(clientOptions)
    .then((client) => {
      if (generation !== whatsappGeneration || appIsQuitting) return client.close();
      whatsappClient = client;
      whatsappInitializing = false;
      whatsappSyncing = true;
      broadcastWhatsAppStatus();
      client.onStateChange((state) => {
        if (generation !== whatsappGeneration) return;
        console.log("[whatsapp] Connection state:", state);
        if (whatsappReady && state !== "CONNECTED") scheduleWhatsAppReconnect(state);
      });
      client.waitForLogin()
        .then(() => {
          if (generation !== whatsappGeneration) return;
          clearWhatsAppReconnect();
          clearWhatsAppInitializationTimeout();
          whatsappReconnectAttempt = 0;
          whatsappInitializing = false;
          whatsappReady = true;
          whatsappQr = null;
          whatsappSyncing = false;
          whatsappProgress = null;
          broadcastWhatsAppStatus();
        })
        .catch((error) => {
          if (generation !== whatsappGeneration || appIsQuitting) return;
          console.error("[whatsapp] login wait error:", error);
          scheduleWhatsAppReconnect(error?.message || String(error));
        });
    })
    .catch((error) => {
      if (generation !== whatsappGeneration || appIsQuitting) return;
      console.error("[whatsapp] init error:", error);
      const errMsg = error?.message || String(error);
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send("whatsapp:error", errMsg);
      });
      scheduleWhatsAppReconnect(errMsg);
    });
}

async function resetWhatsAppClient() {
  clearWhatsAppReconnect();
  clearWhatsAppInitializationTimeout();
  whatsappGeneration += 1;
  if (whatsappClient) {
    try {
      await whatsappClient.close();
    } catch (error) {
      console.error("[whatsapp] destroy error:", error);
    }
  }
  whatsappClient = null;
  whatsappReady = false;
  whatsappQr = null;
  whatsappInitializing = false;
  whatsappSyncing = false;
  whatsappProgress = null;
  broadcastWhatsAppStatus();
}

function normalizePhone(raw, defaultCountryCode = "1") {
  if (!raw) return "";
  let digits = raw.replace(/[^\d]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.replace(/^0+/, "");
  if (defaultCountryCode && digits.length <= 10) {
    digits = `${defaultCountryCode}${digits}`;
  }
  return digits;
}

function formatDebt(value) {
  const num = Number(value || 0);
  if (Number.isNaN(num)) return "0";
  return num.toFixed(2);
}

function buildMessage(customer) {
  const template = getDefaultReminderMessageTemplate();
  return template
    .replaceAll("{{name}}", customer.name || "Cliente")
    .replaceAll("{{debt}}", formatDebt(customer.debt))
    .replaceAll("{{phone}}", customer.phone || "");
}

function resolveMessage(customer) {
  if (typeof customer?.message === "string") {
    const trimmed = customer.message.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return buildMessage(customer);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendWhatsAppMessage(client, chatId, message) {
  const send = whatsappSendQueue.then(async () => {
    const remaining = WHATSAPP_SEND_INTERVAL_MS - (Date.now() - lastWhatsAppSendAt);
    if (lastWhatsAppSendAt > 0 && remaining > 0) await delay(remaining);
    try {
      return await client.sendText(chatId, message);
    } finally {
      lastWhatsAppSendAt = Date.now();
    }
  });
  whatsappSendQueue = send.catch(() => {});
  return send;
}

app.whenReady().then(() => {
  createWindow();

  ipcMain.handle("whatsapp:init", async () => {
    if (whatsappClient && !whatsappReady && !whatsappQr && !whatsappInitializing) {
      await resetWhatsAppClient();
    }
    initWhatsAppClient();
    return getWhatsAppStatus();
  });

  ipcMain.handle("whatsapp:get-config", () => ({
    defaultReminderMessageTemplate: getDefaultReminderMessageTemplate(),
  }));

  ipcMain.handle("whatsapp:status", () => getWhatsAppStatus());

  ipcMain.handle("whatsapp:send", async (_event, customers = []) => {
    if (!whatsappClient || !whatsappReady) {
      return { error: "not_ready" };
    }

    const defaultCountryCode = process.env.DEFAULT_COUNTRY_CODE || "1";
    const results = [];

    for (let index = 0; index < customers.length; index += 1) {
      const customer = customers[index];
      const normalized = normalizePhone(customer.phone, defaultCountryCode);
      if (!normalized) {
        results.push({ id: customer.id, ok: false, reason: "missing_phone" });
        continue;
      }

      const chatId = `${normalized}@c.us`;
      const numberStatus = await whatsappClient.checkNumberStatus(chatId);
      if (!numberStatus?.numberExists) {
        results.push({
          id: customer.id,
          ok: false,
          reason: "not_on_whatsapp",
          normalized,
        });
        continue;
      }

      try {
        const message = resolveMessage(customer);
        await sendWhatsAppMessage(whatsappClient, chatId, message);
        results.push({ id: customer.id, ok: true });
      } catch (error) {
        results.push({
          id: customer.id,
          ok: false,
          reason: "send_failed",
          error: error?.message || String(error),
        });
      }

    }

    return { results };
  });

  ipcMain.on("printer:print-html", (_event, payload = {}) => {
    void printHtmlSilently(payload);
  });

  ipcMain.handle("printer:print-html", async (_event, payload = {}) => {
    return await printHtmlSilently(payload);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  appIsQuitting = true;
  clearWhatsAppReconnect();
  clearWhatsAppInitializationTimeout();
});
