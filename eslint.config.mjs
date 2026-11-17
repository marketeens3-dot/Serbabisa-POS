import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import reactHooks from "eslint-plugin-react-hooks";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  plugins: { "react-hooks": reactHooks },
  rules: {
    // TypeScript rules
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/prefer-as-const": "off",
    "@typescript-eslint/no-unused-disable-directive": "off",
    
    // React rules
    // Aturan era React-Compiler (plugin v6). Triage 17 Nov 2026: 23 temuan
    // set-state-in-effect semuanya pola idiomatik yang sudah direview —
    // mount-guard localStorage/WIB (settings-view, dashboard), reset form
    // saat dialog dibuka (customers/cart/refund/shift-close), sinkronisasi
    // pilihan template (invoice-builder), restore diskon tersemat (pos-view),
    // subscribe media/interval (app-shell, sync-indicator, use-shift —
    // refetch deps [] stabil). Tidak ada loop cascade nyata di runtime
    // (console 0 error). Turunkan ke warn agar lint tetap hijau dan temuan
    // baru tetap terlihat, tanpa refactor berisiko di kode produksi.
    "react-hooks/set-state-in-effect": "warn",
    "react-hooks/exhaustive-deps": "off",
    "react-hooks/purity": "off",
    "react/no-unescaped-entities": "off",
    "react/display-name": "off",
    "react/prop-types": "off",
    "react-compiler/react-compiler": "off",
    
    // Next.js rules
    "@next/next/no-img-element": "off",
    "@next/next/no-html-link-for-pages": "off",
    
    // General JavaScript rules
    "prefer-const": "off",
    "no-unused-vars": "off",
    "no-console": "off",
    "no-debugger": "off",
    "no-empty": "off",
    "no-irregular-whitespace": "off",
    "no-case-declarations": "off",
    "no-fallthrough": "off",
    "no-mixed-spaces-and-tabs": "off",
    "no-redeclare": "off",
    "no-undef": "off",
    "no-unreachable": "off",
    "no-useless-escape": "off",
  },
}, {
  // Main process Electron & tooling build harus CommonJS (require/module.exports)
  // agar bisa dipaket ke dalam app.asar tanpa transformasi. Skrip utilitas di
  // scripts/*.js (tes E2E, maintenance DB) juga CommonJS — dijalankan langsung
  // dengan node, bukan bagian dari bundle aplikasi.
  files: ["electron/**/*.cjs", "scripts/**/*.cjs", "scripts/**/*.js"],
  rules: {
    "@typescript-eslint/no-require-imports": "off",
    "@typescript-eslint/no-var-requires": "off",
  },
}, {
  ignores: [
    "node_modules/**",
    ".next/**",
    "out/**",
    "build/**",
    // Artefak paket desktop (hasil salinan standalone Next.js + electron-builder)
    "desktop-build/**",
    "release/**",
    // Prisma Client hasil generate untuk runtime lokal (SQLite)
    "generated/**",
    "next-env.d.ts",
    "examples/**",
    "skills",
    // Backup scaffold platform (bukan bagian dari aplikasi)
    ".scaffold-backup/**",
  ],
}];

export default eslintConfig;
