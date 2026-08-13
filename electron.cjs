const { app, BrowserWindow, Menu, ipcMain } = require("electron");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { Client, LocalAuth } = require("whatsapp-web.js");

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
      win.loadURL("http://localhost:8080");
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
const SEND_DELAY_MS = 2 * 60 * 1000;
const FALLBACK_REMINDER_MESSAGE_TEMPLATE =
  "Hola {{name}}, buenos días.\n\nLe escribimos de 049Movil para informarle que tiene una deuda pendiente de {{debt}} con nosotros. Le solicitamos que pase por una de nuestras sucursales para saldarla o realizar un abono.\n\nGracias por su atención.";

function getDefaultReminderMessageTemplate() {
  return normalizeMessageTemplate(process.env.REMINDER_MESSAGE_TEMPLATE) || FALLBACK_REMINDER_MESSAGE_TEMPLATE;
}

function getWhatsAppStatus() {
  return { ready: whatsappReady, qr: whatsappQr };
}

function broadcastWhatsAppStatus() {
  const status = getWhatsAppStatus();
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send("whatsapp:status", status);
  });
}

function findChromeExecutable() {
  const candidates = [
    process.env.CHROME_EXECUTABLE_PATH,
    "C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe",
    "C:\\\\Program Files (x86)\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe",
    "C:\\\\Program Files\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe",
    "C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe",
  ].filter(Boolean);

  return candidates.find((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch (err) {
      return false;
    }
  });
}

function killOrphanedChromeProcesses() {
  if (process.platform !== "win32") return;
  try {
    const { execSync } = require("child_process");
    const command = `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name = 'chrome.exe'\\" | Where-Object { $_.CommandLine -like '*whatsapp-auth*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"`;
    execSync(command, { stdio: "ignore" });
    console.log("[whatsapp] Stale chrome processes killed");
  } catch (error) {
    console.error("[whatsapp] Error killing stale chrome processes:", error);
  }
}

function initWhatsAppClient() {
  if (whatsappClient || whatsappInitializing) return;
  whatsappInitializing = true;

  killOrphanedChromeProcesses();

  const authPath = path.join(app.getPath("userData"), "whatsapp-auth");
  const chromeExecutablePath = findChromeExecutable();

  whatsappClient = new Client({
    authStrategy: new LocalAuth({ dataPath: authPath }),
    puppeteer: {
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-extensions",
        "--disable-popup-blocking",
        "--no-first-run",
        "--no-default-browser-check",
        "--window-position=-32000,-32000",
      ],
      ...(chromeExecutablePath ? { executablePath: chromeExecutablePath } : {}),
    },
  });

  whatsappClient.on("qr", (qr) => {
    whatsappQr = qr;
    whatsappReady = false;
    broadcastWhatsAppStatus();
  });

  whatsappClient.on("ready", () => {
    whatsappReady = true;
    whatsappQr = null;
    broadcastWhatsAppStatus();
  });

  whatsappClient.on("auth_failure", () => {
    whatsappReady = false;
    whatsappQr = null;
    whatsappInitializing = false;
    broadcastWhatsAppStatus();
  });

  whatsappClient.on("disconnected", () => {
    whatsappReady = false;
    whatsappQr = null;
    whatsappInitializing = false;
    broadcastWhatsAppStatus();
  });

  whatsappClient
    .initialize()
    .catch((error) => {
      console.error("[whatsapp] init error:", error);
      const errMsg = error?.message || String(error);
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send("whatsapp:error", errMsg);
      });
    })
    .finally(() => {
      whatsappInitializing = false;
    });
}

async function resetWhatsAppClient() {
  if (whatsappClient) {
    try {
      await whatsappClient.destroy();
    } catch (error) {
      console.error("[whatsapp] destroy error:", error);
    }
  }
  whatsappClient = null;
  whatsappReady = false;
  whatsappQr = null;
  whatsappInitializing = false;
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

      const numberId = await whatsappClient.getNumberId(normalized);
      if (!numberId) {
        results.push({
          id: customer.id,
          ok: false,
          reason: "not_on_whatsapp",
          normalized,
        });
        continue;
      }

      let attemptedSend = false;
      try {
        const chatId = numberId._serialized || `${normalized}@c.us`;
        const message = resolveMessage(customer);
        attemptedSend = true;
        await whatsappClient.sendMessage(chatId, message);
        results.push({ id: customer.id, ok: true });
      } catch (error) {
        attemptedSend = true;
        results.push({
          id: customer.id,
          ok: false,
          reason: "send_failed",
          error: error?.message || String(error),
        });
      }

      if (attemptedSend && index < customers.length - 1) {
        await delay(SEND_DELAY_MS);
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
