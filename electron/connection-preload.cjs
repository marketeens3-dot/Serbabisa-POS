/**
 * Preload untuk dialog "Koneksi Database".
 *
 * Jendelanya standalone (bukan renderer aplikasi utama), jadi bridge-nya
 * terpisah dari preload.cjs. Tetap contextIsolation + sandbox: renderer hanya
 * bisa memanggil empat fungsi di bawah, dan semua validasi ulang terjadi di
 * main process.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("connection", {
  getConfig: () => ipcRenderer.invoke("connection:get-config"),
  save: (url) => ipcRenderer.invoke("connection:save", url),
  reset: () => ipcRenderer.invoke("connection:reset"),
  close: () => ipcRenderer.invoke("connection:close"),
});
