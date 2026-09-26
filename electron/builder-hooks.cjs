/**
 * Hook electron-builder (lihat `beforeBuild` di electron-builder.yml).
 *
 * Shell desktop Serbabisa TIDAK memakai node_modules sama sekali: backend-nya
 * sudah dipaket di `resources/server/` (Next.js standalone, hasil output trace)
 * dan UI-nya dimuat lewat HTTP. Satu-satunya dependency runtime adalah `electron`
 * yang memang bawaan runtime.
 *
 * electron-builder normally memindai seluruh dependency produksi project
 * (Next, React, Prisma, ExcelJS, … hundreds of packages) untuk Entitle into
 * `app.asar`. Selain memboroskan waktu build, itu juga menambah ~100 MB sia-sia
 * di dalam installer, karena file-file tersebut tidak pernah di-`require` oleh
 * main process.
 *
 * Return `false` → electron-builder berhenti di tahap install/rebuild DAN
 * melewati pengumpulan node_modules (areNodeModulesHandledExternally = true).
 * Sisa file aplikasi tetap dikumpulkan apa adanya sesuai pola di `files`.
 *
 * Catatan: `npmRebuild: false` TIDAK boleh dipakai bersama hook ini — electron-builder
 * kembali lebih dulu saat npmRebuild=false sehingga beforeBuild tidak pernah dipanggil.
 *
 * @returns {Promise<false>} false = "node_modules ditangani di luar electron-builder"
 */
module.exports.beforeBuild = async function beforeBuild() {
  console.log("  • beforeBuild: node_modules ditangani manual (resources/server) — lewati pengumpulan");
  return false;
};
