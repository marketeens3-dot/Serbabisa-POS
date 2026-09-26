/**
 * Konfigurasi runtime untuk aplikasi desktop (Electron).
 *
 * Sumber nilai (urutan prioritas):
 *   1. File user  : %APPDATA%/serbabisa-pos/config.json  (hasil simpan dari dialog Pengaturan)
 *   2. File build  : <resources>/default-config.json      (nilai .env saat build → tertanam di .exe)
 *   3. Env proses : DATABASE_URL                         (override manual saat launch)
 *
 * Nilai di dalam .exe dianggap "default bawaan"; user bisa menggantinya tanpa rebuild.
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const APP_DIR_NAME = "serbabisa-pos"; // nama folder di %APPDATA%

function userConfigDir() {
  const base = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  return path.join(base, APP_DIR_NAME);
}

function userConfigPath() {
  return path.join(userConfigDir(), "config.json");
}

/**
 * Kandidat lokasi default-config.json.
 *  - saat dipaket:  <resources>/default-config.json
 *  - saat dev (electron .): desktop-build/default-config.json
 */
function defaultConfigCandidates() {
  return [
    // saat dipaket: <resources>/default-config.json
    path.join(process.resourcesPath || "", "default-config.json"),
    // saat dev (electron .): desktop-build/bundle/default-config.json
    path.join(__dirname, "..", "desktop-build", "bundle", "default-config.json"),
  ];
}

function readJsonSafe(file) {
  try {
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, "utf8").trim();
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Konfigurasi hasil merge. Tidak pernah melempar error. */
function loadConfig() {
  const candidates = defaultConfigCandidates();
  let bundled = null;
  let bundledFrom = null;
  for (const c of candidates) {
    const v = readJsonSafe(c);
    if (v) {
      bundled = v;
      bundledFrom = c;
      break;
    }
  }
  bundled = bundled || {};
  const user = readJsonSafe(userConfigPath()) || {};

  const databaseUrl =
    (typeof user.databaseUrl === "string" && user.databaseUrl.trim()) ||
    (typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.trim()) ||
    (typeof bundled.databaseUrl === "string" && bundled.databaseUrl.trim()) ||
    "";

  return {
    databaseUrl,
    /** true bila DATABASE_URL berasal dari file user (bukan tertanam di .exe). */
    databaseUrlFromUserFile: !!(user.databaseUrl && user.databaseUrl.trim()),
    host: user.host || bundled.host || "127.0.0.1",
    port: Number(user.port || bundled.port || 0), // 0 = pilih port bebas otomatis
    defaultConfigPath: bundledFrom,
  };
}

/** Simpan override user (dipanggil dari dialog Pengaturan di dalam aplikasi). */
function saveUserConfig(patch) {
  const dir = userConfigDir();
  fs.mkdirSync(dir, { recursive: true });
  const current = readJsonSafe(userConfigPath()) || {};
  const next = { ...current };

  if (typeof patch.databaseUrl === "string") {
    const v = patch.databaseUrl.trim();
    if (v) next.databaseUrl = v;
    else delete next.databaseUrl; // kembali ke nilai tertanam
  }
  if (patch.port !== undefined) {
    const n = Number(patch.port);
    if (Number.isInteger(n) && n >= 0 && n <= 65535) next.port = n;
  }
  if (patch.host !== undefined && typeof patch.host === "string") {
    next.host = patch.host.trim() || "127.0.0.1";
  }

  fs.writeFileSync(userConfigPath(), JSON.stringify(next, null, 2) + "\n", "utf8");
  return { ok: true, path: userConfigPath() };
}

module.exports = {
  APP_DIR_NAME,
  userConfigDir,
  userConfigPath,
  defaultConfigCandidates,
  loadConfig,
  saveUserConfig,
};
