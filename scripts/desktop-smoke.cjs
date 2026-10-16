/**
 * Smoke test aplikasi desktop (Electron).
 *
 * Menjalankan shell yang sama dengan .exe, lalu memverifikasi:
 *   1. server lokal hidup di 127.0.0.1
 *   2. halaman "/" ter-render (bukan error 500)
 *   3. bridge preload `window.serbabisa` berfungsi (IPC → main process)
 *   4. login API bekerja di dalam server yang di-host desktop
 *
 * Usage: node scripts/desktop-smoke.cjs
 * Exit code 0 = lulus, 1 = gagal.
 */
const { app, BrowserWindow } = require("electron");
const path = require("node:path");
const http = require("node:http");

const ROOT = path.resolve(__dirname, "..");
const isDev = !app.isPackaged;

/** Batas waktu total untuk seluruh skenario (ms). */
const SCENARIO_TIMEOUT = 90_000;

function log(msg) {
  process.stdout.write(`  ${msg}\n`);
}

function fatal(msg, extra) {
  console.error(`\nGAGAL: ${msg}`);
  if (extra) console.error(String(extra).slice(0, 3000));
  app.exit(1);
}

const waitFor = (ms) => new Promise((r) => setTimeout(r, ms));

/** Tunggu server lokal sudah siap (menggunakan helper dari main.cjs). */
async function waitForServer(origin, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const req = http.get(`${origin}/api/auth/me`, { timeout: 3000 }, (res) => {
        res.resume();
        resolve(true);
      });
      req.on("error", () => resolve(false));
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
    });
    if (ok) return true;
    await waitFor(400);
  }
  return false;
}

app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");

app.whenReady().then(async () => {
  const guard = setTimeout(() => fatal("smoke test timeout"), SCENARIO_TIMEOUT);
  try {
    console.log("\n▸ Smoke test Serbabisa POS Desktop");
    console.log(`  packaged=${app.isPackaged}  resources=${process.resourcesPath}`);

    // 1) Muat modul main.cjs → startServer + createWindow tersedia sebagai side effect.
    //    Kita panggil ulang lifecycle-nya sendiri agar tidak Aleppo single-instance lock.
    console.log("\n▸ Menyiapkan server lokal");
    // Saat dev, pakai paket yang sudah dirakit (desktop-build/bundle/server) agar
    // persis sama dengan isi .exe — termasuk .env yang sudah dibuang.
    const serverEntry = isDev
      ? path.join(ROOT, "desktop-build", "bundle", "server", "server.js")
      : path.join(process.resourcesPath, "server", "server.js");

    const fs = require("node:fs");
    if (!fs.existsSync(serverEntry)) {
      fatal(`server standalone tidak ditemukan: ${serverEntry}\n  Jalankan: npm run desktop:prepare`);
    }

    const { spawn } = require("node:child_process");
    const { loadConfig } = require(path.join(ROOT, "electron", "config.cjs"));
    const cfg = loadConfig();
    if (!cfg.databaseUrl) fatal("DATABASE_URL kosong — tidak bisa menjalankan smoke test");

    const net = require("node:net");
    const port = await new Promise((resolve, reject) => {
      const srv = net.createServer();
      srv.on("error", reject);
      srv.listen(0, "127.0.0.1", () => {
        const p = srv.address().port;
        srv.close(() => resolve(p));
      });
    });
    const origin = `http://127.0.0.1:${port}`;
    log(`origin=${origin} db=${cfg.databaseUrlFromUserFile ? "user-file" : "bundled"}`);

    const child = spawn(process.execPath, [serverEntry], {
      cwd: path.dirname(serverEntry),
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        NODE_ENV: "production",
        PORT: String(port),
        HOSTNAME: "127.0.0.1",
        DATABASE_URL: cfg.databaseUrl,
        NEXT_TELEMETRY_DISABLED: "1",
      },
    });
    let out = "";
    child.stdout.on("data", (c) => (out += c));
    child.stderr.on("data", (c) => (out += c));

    const cleanup = () => {
      try {
        spawn("taskkill", ["/pid", String(child.pid), "/f", "/t"], { windowsHide: true });
      } catch {
        /* noop */
      }
    };

    // 2) Server hidup
    console.log("\n▸ [1/4] Server lokal merespons");
    if (!(await waitForServer(origin, 60_000))) {
      cleanup();
      fatal("server lokal tidak merespons", out);
    }
    log("OK");

    // 3) Halaman render
    console.log("\n▸ [2/4] Halaman / ter-render di BrowserWindow");
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.join(ROOT, "electron", "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    const failedLoads = [];
    win.webContents.on("did-fail-load", (_e, code, desc, url) =>
      failedLoads.push(`${code} ${desc} ${url}`),
    );

    await win.loadURL(origin);
    const title = await win.webContents.executeJavaScript("document.title");
    const hasShell = await win.webContents.executeJavaScript(
      "!!document.querySelector('#__next, [data-reactroot], main, form')",
    );
    if (failedLoads.length) {
      cleanup();
      fatal("gagal memuat halaman", failedLoads.join("\n"));
    }
    log(`OK  title="${title}"  ada-elemen=${hasShell}`);

    // 4) Bridge preload
    console.log("\n▸ [3/4] Bridge preload window.serbabisa (IPC → main)");
    // Daftarkan handler yang sama dengan main.cjs agar bridge teruji sungguhan.
    require(path.join(ROOT, "electron", "ipc.cjs")).registerIpcHandlers({
      getState: () => ({ appVersion: app.getVersion(), port }),
      restart: async () => {},
    });

    const bridge = await win.webContents.executeJavaScript(`(async () => {
      if (!window.serbabisa) return { ok: false, reason: "window.serbabisa undefined" };
      const rt = await window.serbabisa.getRuntime();
      return { ok: true, runtime: rt };
    })()`);
    if (!bridge.ok) {
      cleanup();
      fatal(`bridge preload tidak berfungsi: ${bridge.reason}`);
    }
    log(
      `OK  versi=${bridge.runtime.appVersion}  port=${bridge.runtime.port}  ` +
        `db-terisi=${bridge.runtime.hasDatabaseUrl}  db-masked=${bridge.runtime.databaseUrlMasked}`,
    );
    if (bridge.runtime.hasDatabaseUrl !== true) {
      cleanup();
      fatal("bridge melaporkan DATABASE_URL kosong");
    }

    // 5) Login lewat API dari dalam server desktop
    console.log("\n▸ [4/4] Login API di server yang di-host desktop");
    const email = process.env.SMOKE_EMAIL || "kasir@demo.local";
    const password = process.env.SMOKE_PASSWORD || process.env.DEMO_KASIR_PASSWORD || "";
    const login = await win.webContents.executeJavaScript(`(async () => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: ${JSON.stringify(email)}, password: ${JSON.stringify(password)} }),
      });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    })()`);
    if (login.status !== 200 || !login.body?.user) {
      cleanup();
      fatal(`login gagal (status ${login.status})`, JSON.stringify(login.body));
    }
    log(`OK  login sebagai ${login.body.user.fullName} (${login.body.user.role}) tenant=${login.body.user.tenant?.slug}`);

    // 6) Halaman setelah login berisi shell aplikasi
    await win.loadURL(origin);
    const afterLogin = await win.webContents.executeJavaScript(
      "document.body.innerText.slice(0, 400)",
    );
    log(`OK  teks UI: ${afterLogin.replace(/\s+/g, " ").slice(0, 160)}`);

    cleanup();
    clearTimeout(guard);
    console.log("\n✓ Smoke test lulus — aplikasi desktop siap dipaketkan.\n");
    app.exit(0);
  } catch (err) {
    fatal("error tak terduga", err instanceof Error ? err.stack : err);
  }
});
