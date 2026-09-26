/**
 * Handler IPC desktop — dipisah dari main.cjs agar bisa didaftarkan ulang oleh
 * smoke test (scripts/desktop-smoke.cjs) sehingga kedua entry point memakai
 * implementasi yang sama persis.
 *
 * Semua input dari renderer divalidasi ulang di sini; renderer tidak pernah
 * diberi akses Node.
 */
const { ipcMain, shell } = require("electron");
const { loadConfig, saveUserConfig, userConfigPath } = require("./config.cjs");

/** Sembunyikan password di string koneksi sebelum dikirim ke renderer. */
function maskDatabaseUrl(url) {
  if (!url) return "";
  return url.replace(/(:\/\/[^:]+:)([^@]+)@/, (_m, head, pwd) => {
    const tail = pwd.length <= 4 ? "****" : `****${pwd.slice(-2)}`;
    return `${head}${tail}@`;
  });
}

/**
 * @param {object} deps
 * @param {() => {appVersion: string, port: number}} deps.getState  status runtime
 * @param {() => Promise<void>|void} deps.restart                  restart server + UI
 * @param {(msg: string, level?: string) => void} [deps.log]
 */
function registerIpcHandlers(deps) {
  const { getState, restart, log = () => {} } = deps;

  ipcMain.handle("serbabisa:get-runtime", () => {
    const cfg = loadConfig();
    const state = getState();
    return {
      appVersion: state.appVersion,
      configPath: userConfigPath(),
      hasDatabaseUrl: !!cfg.databaseUrl,
      databaseUrlMasked: maskDatabaseUrl(cfg.databaseUrl),
      databaseUrlFromUserFile: cfg.databaseUrlFromUserFile,
      port: state.port,
    };
  });

  ipcMain.handle("serbabisa:set-database-url", (_event, newUrl) => {
    if (typeof newUrl !== "string" || !newUrl.trim()) {
      return { ok: false, message: "String koneksi tidak boleh kosong." };
    }
    if (!/^postgres(ql)?:\/\//i.test(newUrl.trim())) {
      return { ok: false, message: "String koneksi harus diawali postgresql:// atau postgres://" };
    }
    saveUserConfig({ databaseUrl: newUrl.trim() });
    log("INFO", "DATABASE_URL diganti dari UI → simpan di config user");
    return { ok: true, message: "Tersimpan. Aplikasi akan dimuat ulang." };
  });

  ipcMain.handle("serbabisa:reset-database-url", () => {
    saveUserConfig({ databaseUrl: "" });
    log("INFO", "DATABASE_URL dikembalikan ke nilai bawaan");
    return { ok: true, message: "Koneksi dikembalikan ke nilai bawaan. Aplikasi akan dimuat ulang." };
  });

  ipcMain.handle("serbabisa:restart-app", async () => {
    await restart();
    return { ok: true };
  });

  ipcMain.handle("serbabisa:open-external", (_event, url) => {
    if (typeof url === "string" && /^(https?|mailto|tel):/i.test(url)) {
      shell.openExternal(url);
      return { ok: true };
    }
    return { ok: false };
  });
}

module.exports = { registerIpcHandlers, maskDatabaseUrl };
