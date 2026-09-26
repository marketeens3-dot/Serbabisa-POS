/**
 * Cek apakah modul native yang dipakai tersedia di dalam Expo Go.
 *
 * ATURAN MUTLAK: Expo Go hanya bisa memuat modul native yang sudah dibundel
 * di dalamnya. Modul native pihak ketiga yang tidak ada di Expo Go akan
 * langsung error saat dipakai ("native module not found"), dan tidak ada cara
 * untuk memasukkannya tanpa build sendiri.
 *
 * Script ini membandingkan daftar modul yang terpasang dengan allowlist
 * Expo Go, lalu gagal keras saat `npm run typecheck` / CI.
 *
 * Usage: node scripts/check-expo-go.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

/**
 * Modul yang AMAN di Expo Go: sudah jadi bagian dari Expo SDK.
 * everything else yang punya native code akan gagal.
 */
const EXPO_GO_SAFE = new Set([
  "expo",
  "expo-router",
  "expo-sqlite",
  "expo-secure-store",
  "expo-status-bar",
  "expo-print",
  "expo-sharing",
  "expo-constants",
  "expo-linking",
  "expo-crypto",
  "expo-font",
  "expo-splash-screen",
  "expo-system-ui",
  "expo-haptics",
  "expo-image",
  "expo-asset",
  "expo-file-system",
  "expo-clipboard",
  "expo-web-browser",
  "expo-updates",
  "@react-native-async-storage/async-storage",
  "react-native-safe-area-context",
  "react-native-screens",
  "react-native-gesture-handler",
  "react-native-reanimated",
  "react-native-svg",
  "react-native-webview",
  // Wajib oleh react-native-reanimated 4.x. Karena reanimated 4 sudah bagian
  // dari Expo SDK 57, worklets ikut terbundel di Expo Go — tanpa ini Expo Go
  // akan crash begitu saja saat memakai reanimated.
  "react-native-worklets",
]);

/**
 * Modul build-time: hanya dibaca saat `expo prebuild` / EAS build memproses
 * app.json. TIDAK pernah masuk bundel runtime, jadi tidak mungkin menyebabkan
 * "native module not found" — baik di Expo Go maupun di APK/IPA.
 */
const BUILD_TIME_ONLY = new Set(["expo-build-properties"]);

/** Modul web-only: dipakai hanya oleh target `expo start --web`. */
const WEB_ONLY = new Set(["react-dom"]);

/** Pustaka JS-murni: tidak punya native code, aman di Expo Go. */
const JS_ONLY = new Set(["zustand", "react", "react-native"]);

const deps = Object.keys(pkg.dependencies ?? {});
const unknown = deps.filter(
  (d) => !EXPO_GO_SAFE.has(d) && !JS_ONLY.has(d) && !BUILD_TIME_ONLY.has(d) && !WEB_ONLY.has(d),
);

const label = (d) => {
  if (EXPO_GO_SAFE.has(d)) return "Expo Go ✓";
  if (JS_ONLY.has(d)) return "JS-murni ✓";
  if (BUILD_TIME_ONLY.has(d)) return "build-time ✓";
  if (WEB_ONLY.has(d)) return "web-only ✓";
  return "TIDAK DIJAMIN ✗";
};

console.log(`\nModul terpasang: ${deps.length}`);
for (const d of deps) {
  console.log(`  ${d.padEnd(42)} ${label(d)}`);
}

if (unknown.length) {
  console.error(
    "\nGAGAL: modul berikut tidak ada di allowlist Expo Go:\n" +
      unknown.map((u) => `  - ${u}`).join("\n") +
      "\n\nModul native di luar Expo SDK akan GAGAL saat dijalankan di Expo Go " +
      '("native module not found"). Periksalah di https://reactnative.directory/ ' +
      "atau pindahkan ke devDependencies / hapus.\n",
  );
  process.exit(1);
}

console.log("\nOK — semua modul aman di Expo Go.\n");
