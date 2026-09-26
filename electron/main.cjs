/**
 * Main process — Serbabisa POS Desktop.
 *
 * Strategi: aplikasi desktop ini adalah "cangkang" (shell). Backend Next.js
 * (App Router route handlers + Prisma + PostgreSQL) tetap berjalan utuh di
 * dalam proses Node anak, lalu renderer (BrowserWindow) memuat UI dari
 * http://127.0.0.1:<port>. Dengan begitu seluruh fitur yang sudah ada
 * (auth, session cookie, kasir, laporan, export, admin) bekerja tanpa
 * perubahan kode aplikasi.
 *
 * Prinsip:
 *  - contextIsolation: true, nodeIntegration: false, sandbox: true
 *  - satu jendela aplikasi, satu server lokal
 *  - single instance lock (membuka instance kedua → fokus ke jendela pertama)
 *  - children OS-level: izinkan hanya localhost, blokir navigasi keluar
 */

const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require("electron");
const { spawn } = require("node:child_process");
const net = require("node:net");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const { loadConfig, saveUserConfig, userConfigPath, userConfigDir } = require("./config.cjs");
const { registerIpcHandlers, maskDatabaseUrl } = require("./ipc.cjs");

const APP_NAME = "Serbabisa POS";
const APP_ID = "local.serbabisa.pos";
const isDev = !app.isPackaged;

// ---------------------------------------------------------------------------
// Log diagnostik → %APPDATA%/serbabisa-pos/desktop.log
// Proses GUI di Windows tidak punya stdout yang terlihat, jadi log ditulis ke file.
// ---------------------------------------------------------------------------
const LOG_MAX_BYTES = 1024 * 1024; // 1 MB

function logLine(level, message) {
  try {
    const dir = userConfigDir();
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "desktop.log");
    // Putar log bila sudah terlalu besar.
    try {
      if (fs.statSync(file).size > LOG_MAX_BYTES) {
        fs.renameSync(file, path.join(dir, "desktop.log.1"));
      }
    } catch {
      /* belum ada */
    }
    const stamp = new Date().toISOString();
    fs.appendFileSync(file, `${stamp} [${level}] ${message}\n`, "utf8");
  } catch {
    /* logging tidak boleh menggagalkan aplikasi */
  }
}


// ---------------------------------------------------------------------------
// Server Next.js (standalone) sebagai proses anak
// ---------------------------------------------------------------------------

/** Lokasi entry server standalone: saat dev -> .next/standalone, saat packed -> resources/server. */
function serverEntryPath() {
  return isDev
    ? path.join(__dirname, "..", ".next", "standalone", "server.js")
    : path.join(process.resourcesPath, "server", "server.js");
}

let serverProcess = null;
let serverPort = 0;
let serverOrigin = "";
let serverLog = "";

/** Cari port TCP bebas (mulai dari 3210). */
function findFreePort(preferred, host) {
  return new Promise((resolve, reject) => {
    const tryPort = (p) => {
      const srv = net.createServer();
      srv.once("error", (err) => {
        if (err.code === "EADDRINUSE" && p < preferred + 50) tryPort(p + 1);
        else reject(err);
      });
      srv.once("listening", () => srv.close(() => resolve(p)));
      srv.listen(p, host);
    };
    tryPort(preferred);
  });
}

/** Tunggu sampai server menjawab HTTP (maks ~60 detik). */
function waitForServer(origin, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(`${origin}/api/auth/me`, { timeout: 4000 }, (res) => {
        res.resume();
        // 401 = server hidup (belum login) → cukup.
        resolve(true);
      });
      req.on("error", () => {
        if (Date.now() > deadline) reject(new Error("Server tidak merespons dalam batas waktu."));
        else setTimeout(attempt, 400);
      });
      req.on("timeout", () => req.destroy());
    };
    attempt();
  });
}

function stopServer() {
  if (!serverProcess) return;
  const p = serverProcess;
  serverProcess = null;
  try {
    if (process.platform === "win32") {
      // Bun/Node di Windows: kill proses tree agar tidak ada yatim.
      spawn("taskkill", ["/pid", String(p.pid), "/f", "/t"], { windowsHide: true });
    } else {
      p.kill("SIGTERM");
    }
  } catch {
    /* proses sudah mati */
  }
}

async function startServer() {
  const cfg = loadConfig();
  logLine("INFO", `startServer: host=${cfg.host} port=${cfg.port || "auto"} db=${cfg.databaseUrlFromUserFile ? "user-file" : "bundled/ENV"}`);

  if (!cfg.databaseUrl) {
    const err = new Error(
      "Belum ada string koneksi database. Tempelkan string koneksi PostgreSQL " +
        "lewat dialog Koneksi Database (menu Aplikasi → Koneksi Database…).",
    );
    err.code = "NO_DATABASE_URL";
    throw err;
  }

  const entry = serverEntryPath();
  if (!fs.existsSync(entry)) {
    throw new Error(
      `Berkas server tidak ditemukan:\n${entry}\n\nJalankan "npm run desktop:prepare" lebih dulu.`,
    );
  }

  const port = await findFreePort(cfg.port > 0 ? cfg.port : 3210, cfg.host);
  serverPort = port;
  serverOrigin = `http://${cfg.host}:${port}`;
  logLine("INFO", `serverOrigin=${serverOrigin} entry=${entry} execPath=${process.execPath}`);

  // ELECTRON_RUN_AS_NODE → process.execPath (Serbabisa POS.exe) berjalan sebagai
  // Node.js biasa, sehingga bisa menjalankan server Next.js standalone.
  //
  // LOCAL DATABASE_URL = sumber kebenaran runtime (SQLite di %APPDATA%).
  // DATABASE_URL       = koneksi Supabase, HANYA dibuka saat sinkronisasi.
  serverProcess = spawn(process.execPath, [entry], {
    cwd: path.dirname(entry),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: cfg.host,
      // Local-first: runtime aplikasi memakai SQLite.
      SERBABISA_DB: "local",
      LOCAL_DATABASE_URL: localDatabaseUrl(),
      DATABASE_URL: cfg.databaseUrl,
      // Secret untuk endpoint sinkronisasi internal (loopback saja).
      SERBABISA_INTERNAL_SECRET: internalSecret(),
      // Nonaktifkan telemetry/CLI Next bila ada.
      NEXT_TELEMETRY_DISABLED: "1",
    },
  });

  serverProcess.on("error", (err) => {
    logLine("ERROR", `gagal spawn server: ${err.message}`);
  });

  const capture = (chunk) => {
    const s = chunk.toString();
    serverLog += s;
    if (serverLog.length > 40000) serverLog = serverLog.slice(-40000);
    logLine("SERVER", s.trimEnd());
    if (isDev) process.stdout.write(`[server] ${s}`);
  };
  serverProcess.stdout.on("data", capture);
  serverProcess.stderr.on("data", capture);

  serverProcess.on("exit", (code) => {
    logLine("WARN", `proses server keluar dengan kode ${code}`);
    serverProcess = null;
    if (code !== 0 && !app.isQuitting) {
      dialog.showErrorBox(
        `${APP_NAME} — server berhenti`,
        `Proses server lokal berhenti dengan kode ${code}.\n\n${serverLog.slice(-2000)}`,
      );
    }
  });

  try {
    await waitForServer(serverOrigin);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logLine("ERROR", `server tidak merespons: ${msg}\n--- output server ---\n${serverLog.slice(-4000)}`);
    stopServer();
    throw new Error(`${msg}\n\n${serverLog.slice(-1500) || "(tidak ada output server)"}`);
  }
  logLine("INFO", `server siap di ${serverOrigin}`);
  return serverOrigin;
}

// ---------------------------------------------------------------------------
// Database lokal (SQLite) + scheduler sinkronisasi
//
// Aplikasi berjalan LOCAL-FIRST: seluruh POS membaca/menulis ke SQLite di
// %APPDATA%\serbabisa-pos\data. Supabase adalah salinan bersama antar perangkat
// dan hanya dibutuhkan saat sinkronisasi — koneksi cloud hanya dibuka oleh
// proses server ketika ada yang benar-benar perlu sync.
// ---------------------------------------------------------------------------

const LOCAL_DB_FILENAME = "serbabisa.db";

/** Folder data lokal: %APPDATA%\serbabisa-pos\data (dibuat bila belum ada). */
function localDataDir() {
  const dir = path.join(userConfigDir(), "data");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Path absolut file SQLite. Prisma SQLite menerima `file:` + path Windows. */
function localDatabaseUrl() {
  const abs = path.join(localDataDir(), LOCAL_DB_FILENAME);
  return `file:${abs.replace(/\\/g, "/")}`;
}

/**
 * Secret untuk /api/sync/internal. Dibuat sekali per instalasi dan disimpan di
 * config user, sehingga hanya proses lokal milik instalasi ini yang bisa
 * memanggilnya — bukan aplikasi lain di komputer atau jaringan.
 */
function internalSecret() {
  const file = path.join(userConfigDir(), "internal.secret");
  try {
    if (fs.existsSync(file)) {
      const v = fs.readFileSync(file, "utf8").trim();
      if (v.length >= 32) return v;
    }
    const secret = require("node:crypto").randomBytes(32).toString("hex");
    fs.mkdirSync(userConfigDir(), { recursive: true });
    fs.writeFileSync(file, secret, "utf8");
    return secret;
  } catch {
    // Kalau gagal disimpan, pakai nilai sementara: endpoint tetap terlindungi
    // karena juga dibatasi loopback.
    return require("node:crypto").randomBytes(32).toString("hex");
  }
}

// Jadwal sync otomatis. Cukup jarang: POS biasanya dipakai berjam-jam, dan
// setiap siklus menahan satu koneksi ke Supabase.
const SYNC_INTERVAL_MS = 5 * 60 * 1000;
let syncTimer = null;

/**
 * Paksa server melakukan satu siklus sinkronisasi lewat endpoint internal.
 *
 * Sengaja memakai HTTP (bukan IPC) supaya scheduler berada di DALAM proses
 * Next.js: dengan begituia memakai Prisma Client yang sama, single-instance lock
 * SQLite, dan seluruh logika sync — tidak ada implementasi ganda.
 *
 * Cookie sesi tidak diperlukan karena pemicu memakai endpoint internal
 * /api/sync/internal yang dilindungi secret lokal (lihat route-nya).
 */
async function triggerSync(reason) {
  try {
    const res = await fetch(`${serverOrigin}/api/sync/internal`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // WAJIB secret yang sama dengan yang disuntik ke server anak. Versi
        // pertama mengirim literal "1" sehingga endpoint selalu membalas 403
        // dan sinkronisasi otomatis tidak pernah jalan sama sekali.
        "x-serbabisa-internal": internalSecret(),
      },
      body: JSON.stringify({ reason }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      logLine("WARN", `sync (${reason}) HTTP ${res.status}`);
      return;
    }
    const body = await res.json().catch(() => ({}));
    const r = body?.report;
    if (r?.error) logLine("WARN", `sync (${reason}) gagal: ${r.error}`);
    else logLine("INFO", `sync (${reason}) naik=${r?.pushed ?? 0} turun=${r?.pulled ?? 0} konflik=${r?.conflicts ?? 0} ${r?.durationMs ?? 0}ms`);
  } catch (err) {
    // Offline adalah kondisi NORMAL, bukan error. Jangan spam log.
    logLine("INFO", `sync (${reason}) dilewati: ${err?.message ?? err}`);
  }
}

function startSyncScheduler() {
  stopSyncScheduler();
  syncTimer = setInterval(() => triggerSync("timer"), SYNC_INTERVAL_MS);
  syncTimer.unref?.();
  logLine("INFO", `scheduler sync aktif setiap ${SYNC_INTERVAL_MS / 60000} menit`);
}

function stopSyncScheduler() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Jendela
// ---------------------------------------------------------------------------

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: "#0b1013",
    autoHideMenuBar: false,
    icon: path.join(__dirname, "build", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      webviewTag: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools({ mode: "detach" });
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Navigasi keluar aplikasi → buka di browser default user, jangan di dalam
  // shell (deep-link wa.me / mailto / http eksternal).
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:|^mailto:|^tel:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url !== serverOrigin && !url.startsWith(serverOrigin)) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  // Tolak semua permintaan permission (kamera/mic/geolokasi) — POS tidak membutuhkannya.
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, _perm, callback) => callback(false));

  mainWindow.loadURL(serverOrigin);
  return mainWindow;
}

function showErrorAndExit(message) {
  dialog.showErrorBox(`${APP_NAME} — gagal dijalankan`, message);
  app.quit();
}

// ---------------------------------------------------------------------------
// Dialog Koneksi Database
//
// Jendela native kecil (HTML sendiri) untuk melihat/mengganti string koneksi
// PostgreSQL tanpa perlu masuk ke aplikasi — penting karena saat koneksi salah
// atau kosong, UI aplikasi justru tidak bisa dimuat.
// ---------------------------------------------------------------------------

let connectionWindow = null;

function openConnectionDialog(parent) {
  if (connectionWindow && !connectionWindow.isDestroyed()) {
    connectionWindow.focus();
    return;
  }

  connectionWindow = new BrowserWindow({
    width: 620,
    height: 520,
    parent: parent || undefined,
    modal: !!parent,
    show: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: "Koneksi Database",
    backgroundColor: "#0b1013",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "connection-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  connectionWindow.setMenuBarVisibility(false);
  connectionWindow.once("ready-to-show", () => connectionWindow.show());
  connectionWindow.on("closed", () => {
    connectionWindow = null;
  });

  // Cegah navigasi keluar (dialog tidak boleh memuat URL eksternal).
  connectionWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  connectionWindow.webContents.on("will-navigate", (e) => e.preventDefault());

  connectionWindow.loadFile(path.join(__dirname, "connection.html"));
}

ipcMain.handle("connection:get-config", () => {
  const cfg = loadConfig();
  return {
    configPath: userConfigPath(),
    hasDatabaseUrl: !!cfg.databaseUrl,
    databaseUrlMasked: maskDatabaseUrl(cfg.databaseUrl),
    databaseUrlFromUserFile: cfg.databaseUrlFromUserFile,
  };
});

ipcMain.handle("connection:save", (_event, url) => {
  if (typeof url !== "string" || !url.trim()) {
    return { ok: false, message: "String koneksi tidak boleh kosong." };
  }
  if (!/^postgres(ql)?:\/\//i.test(url.trim())) {
    return { ok: false, message: "String koneksi harus diawali postgresql:// atau postgres://" };
  }
  saveUserConfig({ databaseUrl: url.trim() });
  logLine("INFO", "koneksi diubah lewat dialog → restart aplikasi");
  setTimeout(() => reloadWithNewConfig(), 250);
  return { ok: true, message: "Tersimpan." };
});

ipcMain.handle("connection:reset", () => {
  saveUserConfig({ databaseUrl: "" });
  logLine("INFO", "koneksi dikembalikan ke bawaan lewat dialog → restart aplikasi");
  setTimeout(() => reloadWithNewConfig(), 250);
  return { ok: true, message: "Dikembalikan ke nilai bawaan." };
});

ipcMain.handle("connection:close", () => {
  connectionWindow?.close();
  return { ok: true };
});

// ---------------------------------------------------------------------------
// Menu aplikasi
// ---------------------------------------------------------------------------

function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    {
      label: "&Aplikasi",
      submenu: [
        {
          label: "Muat Ulang",
          accelerator: "F5",
          click: () => mainWindow?.reload(),
        },
        {
          label: "Koneksi Database…",
          click: () => openConnectionDialog(mainWindow),
        },
        {
          label: "Buka Folder Data",
          click: () => shell.openPath(path.dirname(userConfigPath())),
        },
        {
          label: "Buka Log Diagnostik",
          click: () => shell.openPath(path.join(userConfigDir(), "desktop.log")),
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit", label: "Keluar" },
      ],
    },
    {
      label: "&Tampilan",
      submenu: [
        { role: "resetZoom", label: "Zoom Normal" },
        { role: "zoomIn", label: "Perbesar" },
        { role: "zoomOut", label: "Perkecil" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Layar Penuh" },
      ],
    },
    {
      label: "&Bantuan",
      submenu: [
        {
          label: "Tentang Serbabisa POS",
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: "info",
              title: "Tentang",
              message: APP_NAME,
              detail:
                `Versi ${app.getVersion()}\n` +
                `Server lokal: ${serverOrigin}\n\n` +
                `Aplikasi kasir POS untuk UMKM Indonesia.`,
              buttons: ["Tutup"],
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------------------
// IPC — pengaturan runtime (koneksi database)
// ---------------------------------------------------------------------------

/**
 * Muat ulang server + UI setelah konfigurasi berubah.
 * Aman dipanggil saat jendela utama belum pernah dibuat (mis. setelah user
 * mengisi koneksi database untuk pertama kali lewat dialog).
 */
async function reloadWithNewConfig() {
  const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
  stopServer();
  if (win) {
    win.webContents.send("serbabisa:restarting");
    win.setTitle(`${APP_NAME} — memuat ulang…`);
  }
  try {
    await startServer();
  } catch (err) {
    if (err && err.code === "NO_DATABASE_URL") {
      // User menutup dialog tanpa mengisi → tetap di dialog, jangan keluar.
      openConnectionDialog(win || undefined);
      return;
    }
    showErrorAndExit(err instanceof Error ? err.message : String(err));
    return;
  }

  // Koneksi sudah valid → tutup dialog (bila ada) dan pastikan jendela utama ada.
  // Penting untuk alur first-run: dialog adalah satu-satunya jendela saat itu,
  // sehingga setelah ditutup aplikasi tidak boleh keluar.
  if (connectionWindow && !connectionWindow.isDestroyed()) connectionWindow.close();

  buildMenu();
  if (win) win.loadURL(serverOrigin);
  else createWindow();
}

registerIpcHandlers({
  getState: () => ({ appVersion: app.getVersion(), port: serverPort }),
  restart: reloadWithNewConfig,
  log: logLine,
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  logLine("INFO", "instance lain sudah berjalan → keluar");
  app.quit();
} else {
  process.on("uncaughtException", (err) => {
    logLine("FATAL", `uncaughtException: ${err?.stack || err}`);
  });

  app.on("second-instance", () => {
    logLine("INFO", "instance kedua diminta → fokus ke jendela utama");
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    logLine("INFO", `app siap · packaged=${app.isPackaged} version=${app.getVersion()} resources=${process.resourcesPath}`);
    app.setAppUserModelId(APP_ID);
    buildMenu();

    try {
      await startServer();
    } catch (err) {
      // Tanpa koneksi database, jangan keluar: buka dialog agar user bisa
      // mengisinya. UI aplikasi sendiri tidak akan termuat tanpa server.
      if (err && err.code === "NO_DATABASE_URL") {
        logLine("WARN", "tidak ada DATABASE_URL → buka dialog Koneksi Database");
        openConnectionDialog();
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      logLine("FATAL", `gagal start: ${msg}`);
      showErrorAndExit(msg);
      return;
    }

    createWindow();
    // Sinkronisasi otomatis: offline adalah kondisi normal, jadi koneksi cloud
    // dicoba berjadwal tanpa mengganggu kasir.
    startSyncScheduler();
    // Percobaan pertama setelah start (server baru siap → koneksi DB baru siap).
    setTimeout(() => triggerSync("startup"), 5_000).unref?.();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    app.isQuitting = true;
    logLine("INFO", "keluar → stop server");
    stopSyncScheduler();
    stopServer();
  });
}
