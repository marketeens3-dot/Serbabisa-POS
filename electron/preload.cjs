/**
 * Preload — jembatan minimal & aman.
 *
 * Renderer TIDAK diberi akses Node. Hanya fungsi eksplisit di bawah yang
 * diekspos lewat contextBridge. Semua input divalidasi ulang di main process.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("serbabisa", {
  /** Info runtime (versi, status koneksi, lokasi file config). */
  getRuntime: () => ipcRenderer.invoke("serbabisa:get-runtime"),

  /** Simpan string koneksi database baru ke file config user. */
  setDatabaseUrl: (url) => ipcRenderer.invoke("serbabisa:set-database-url", url),

  /** Kembalikan ke koneksi bawaan yang tertanam di .exe. */
  resetDatabaseUrl: () => ipcRenderer.invoke("serbabisa:reset-database-url"),

  /** Muat ulang aplikasi (server lokal + UI). */
  restart: () => ipcRenderer.invoke("serbabisa:restart-app"),

  /** Buka URL di browser default user. */
  openExternal: (url) => ipcRenderer.invoke("serbabisa:open-external", url),

  /** Dipanggil main process saat server sedang dimuat ulang. */
  onRestarting: (cb) => {
    const handler = () => cb();
    ipcRenderer.on("serbabisa:restarting", handler);
    return () => ipcRenderer.removeListener("serbabisa:restarting", handler);
  },
});
