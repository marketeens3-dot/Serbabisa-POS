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
]);

/** Pustaka JS-murni: tidak punya native code, aman di Expo Go. */
const JS_ONLY = new Set(["zustand", "react", "react-native"]);

const deps = Object.keys(pkg.dependencies ?? {});
const unknown = deps.filter((d) => !EXPO_GO_SAFE.has(d) && !JS_ONLY.has(d));

console.log(`\nModul terpasang: ${deps.length}`);
for (const d of deps) {
  const kind = EXPO_GO_SAFE.has(d) ? "Expo Go ✓" : JS_ONLY.has(d) ? "JS-murni ✓" : "TIDAK DIJAMIN ✗";
  console.log(`  ${d.padEnd(42)} ${kind}`);
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
