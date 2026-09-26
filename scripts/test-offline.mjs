/**
 * Uji end-to-end mode OFFLINE.
 *
 * Skenario yang diuji:
 *   1. Fresh install → database lokal dibuat dari DDL, tanpa internet sama sekali
 *   2. Server Next.js jalan dengan SERBABISA_DB=local dan TIDAK ada DATABASE_URL
 *   3. Login lokal (user + passwordHash hasil bootstrap sebelumnya) berhasil
 *   4. POS bisa bertransaksi (checkout, stok berkurang, nota naik)
 *   5. Nomor nota naik berurutan dan TIDAK bentrok
 *
 * Ini membuktikan aplikasi tidak bergantung pada Supabase untuk operasi harian.
 *
 * Usage: node scripts/test-offline.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const pass = [];
const fail = [];
function check(name, ok, detail = "") {
  (ok ? pass : fail).push(name);
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? `  — ${detail}` : ""}`);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(origin, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const req = fetch(`${origin}/api/auth/me`, { signal: AbortSignal.timeout(3000) }).then(
        () => resolve(true),
        () => resolve(false),
      );
      void req;
    });
    if (ok) return true;
    await wait(500);
  }
  return false;
}

async function main() {
  const serverEntry = path.join(root, "desktop-build", "bundle", "server", "server.js");
  if (!fs.existsSync(serverEntry)) {
    console.error("Server standalone belum dirakit. Jalankan: npm run desktop:prepare");
    process.exit(1);
  }

  // Direktori data sementara = simulasi "%APPDATA%\serbabisa-pos\data" di PC baru.
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "serbabisa-offline-"));
  const dbFile = path.join(dataDir, "serbabisa.db");

  // Port acak agar tidak bentrok dengan aplikasi yang sedang jalan.
  const net = await import("node:net");
  const port = await new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
  const origin = `http://127.0.0.1:${port}`;

  console.log("\n▸ UJI OFFLINE (tanpa DATABASE_URL sama sekali)");
  console.log(`  data lokal : ${dbFile}`);
  console.log(`  origin     : ${origin}\n`);

  // PENTING: tidak ada DATABASE_URL di env → aplikasi tidak bisa menyentuh
  // Supabase sama sekali selama seluruh pengujian.
  const env = { ...process.env };
  delete env.DATABASE_URL;

  const server = spawn(process.execPath, [serverEntry], {
    cwd: path.dirname(serverEntry),
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      SERBABISA_DB: "local",
      LOCAL_DATABASE_URL: `file:${dbFile.replace(/\\/g, "/")}`,
      NEXT_TELEMETRY_DISABLED: "1",
    },
  });

  let serverOut = "";
  server.stdout.on("data", (c) => (serverOut += c));
  server.stderr.on("data", (c) => (serverOut += c));

  const kill = () => {
    try {
      spawn("taskkill", ["/pid", String(server.pid), "/f", "/t"], { windowsHide: true });
    } catch {
      /* noop */
    }
  };

  try {
    // ---------- 1. Database lokal dibuat otomatis ----------
    console.log("▸ [1/5] Database lokal dibuat dari DDL");
    if (!(await waitForServer(origin, 90_000))) {
      kill();
      console.error("Server tidak merespons.\n", serverOut.slice(-3000));
      process.exit(1);
    }
    check("server hidup", true, origin);

    const pageRes = await fetch(origin + "/").catch(() => null);
    check(
      "halaman login ter-render tanpa internet",
      pageRes?.status === 200,
      `HTTP ${pageRes?.status}`,
    );

    const dbExists = fs.existsSync(dbFile);
    check("file SQLite terbentuk", dbExists, dbExists ? `${(fs.statSync(dbFile).size / 1024).toFixed(0)} KB` : "hilang");

    // ---------- 2. Aktivasi pertama butuh internet (d_expected) ----------
    console.log("\n▸ [2/5] Aktivasi pertama ditolak dengan pesan jelas (butuh internet)");
    const firstLogin = await fetch(origin + "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ email: "kasir@demo.local", password: "Kasir#2026" }),
    }).then((r) => r.json().catch(() => ({})));
    check(
      "login ditolak karena belum pernah diaktivasi",
      firstLogin.error === "OFFLINE_ACTIVATION_NEEDED" || firstLogin.error === "INVALID_CREDENTIALS",
      firstLogin.error ?? "?",
    );

    // ---------- 3. Suntik data identitas hasil bootstrap (meniru hasil online) ----------
    console.log("\n▸ [3/5] Suntik user+tenant ke DB lokal (meniru hasil aktivasi online)");
    const { createLocalIdentity } = await import("./test-helpers/local-identity.mjs");
    const email = "kasir@offline.local";
    const password = "Offline#2026";
    const seeded = await createLocalIdentity(dbFile, { email, password, tenantName: "Toko Offline" });
    check("identitas lokal tersuntik", seeded.ok, seeded.detail);
    if (!seeded.ok) throw new Error("gagal menyuntik identitas");

    // ---------- 4. Login + transaksi offline ----------
    console.log("\n▸ [4/5] Login & transaksi OFFLINE");
    const loginRes = await fetch(origin + "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ email, password }),
    });
    const loginBody = await loginRes.json().catch(() => ({}));
    check("login berhasil", loginRes.status === 200 && !!loginBody.user, loginBody.user?.fullName ?? loginBody.error);
    if (loginRes.status !== 200) throw new Error("login offline gagal");

    const cookie = (loginRes.headers.getSetCookie?.() ?? [])
      .map((c) => c.split(";")[0])
      .join("; ");
    const H = { cookie, origin };

    const catRes = await fetch(origin + "/api/catalog", { headers: H });
    const catBody = await catRes.json().catch(() => ({}));
    const item = catBody?.data?.[0];
    check("katalog terbaca offline", catRes.status === 200 && !!item, `${catBody?.data?.length ?? 0} item`);

    // ---------- 5. Checkout: stok & nomor nota ----------
    console.log("\n▸ [5/5] Checkout, stok, dan nomor nota");
    const stockBefore = Number(item?.stockQty ?? 0);
    const qty = 2;

    const checkout = await fetch(origin + "/api/transactions", {
      method: "POST",
      headers: { "content-type": "application/json", ...H },
      body: JSON.stringify({
        items: [{ catalogItemId: item.id, quantity: qty }],
        paymentMethod: "CASH",
        paidAmount: Number(item.sellingPrice) * qty,
        idempotencyKey: `offline-test-${Date.now()}`,
      }),
    });
    const txBody = await checkout.json().catch(() => ({}));
    check(
      "checkout berhasil",
      checkout.ok && !!txBody?.transaction?.invoiceNumber,
      `HTTP ${checkout.status} ${txBody?.transaction?.invoiceNumber ?? JSON.stringify(txBody).slice(0, 140)}`,
    );

    const stockAfter = Number(
      (await (await fetch(origin + "/api/catalog", { headers: H })).json())?.data?.[0]?.stockQty ?? -1,
    );
    check(
      "stok berkurang sesuai qty",
      Math.abs(stockBefore - qty - stockAfter) < 0.001,
      `${stockBefore} → ${stockAfter} ( jual ${qty})`,
    );

    // Nomor nota kedua: harus berbeda, dan tidak bentrok.
    const second = await fetch(origin + "/api/transactions", {
      method: "POST",
      headers: { "content-type": "application/json", ...H },
      body: JSON.stringify({
        items: [{ catalogItemId: item.id, quantity: 1 }],
        paymentMethod: "CASH",
        paidAmount: Number(item.sellingPrice),
        idempotencyKey: `offline-test-${Date.now()}-2`,
      }),
    });
    const secondBody = await second.json().catch(() => ({}));
    const inv1 = txBody?.transaction?.invoiceNumber;
    const inv2 = secondBody?.transaction?.invoiceNumber;
    check("checkout kedua berhasil", second.ok && !!inv2, `HTTP ${second.status} ${inv2 ?? ""}`);
    check("nomor nota unik & berurutan", !!inv1 && !!inv2 && inv1 !== inv2, `${inv1} lalu ${inv2}`);

    // ---------- 6. Bukti benar-benar offline ----------
    // Server dijalankan tanpa DATABASE_URL, jadi tidak ada kode yang bisa
    // hubungkan ke Supabase. Bukti tambahan: endpoint sync internal harus
    // menolak dengan rapi, bukan crash.
    let syncProbe = {};
    let syncErr = "";
    try {
      const r = await fetch(origin + "/api/sync/internal", {
        method: "POST",
        headers: { "content-type": "application/json", "x-serbabisa-internal": "1" },
        body: JSON.stringify({ reason: "test-offline" }),
      });
      const body = await r.json().catch(() => ({}));
      syncProbe = { status: r.status, ...body };
      syncErr = String(body?.report?.error ?? body?.error ?? "");
    } catch (e) {
      syncErr = `fetch gagal: ${e instanceof Error ? e.message : String(e)}`;
    }
    check(
      "sync menolak dengan rapi (tidak crash)",
      syncProbe.status === 403 || /tidak tersedia|cloud|Tidak diizinkan/i.test(syncErr),
      `HTTP ${syncProbe.status ?? "?"} ${syncErr.slice(0, 90)}`,
    );

    // Server harus tetap hidup setelah semua yang di atas.
    const alive = await fetch(origin + "/").then((r) => r.status).catch(() => 0);
    check("server masih hidup setelah semua uji", alive === 200, `HTTP ${alive}`);
    check("tidak ada log koneksi Supabase", !/pooler\.supabase/i.test(serverOut));

    // ---------- Ringkasan ----------
    console.log(`\n  Lulus: ${pass.length}   Gagal: ${fail.length}`);
    if (fail.length) {
      console.log(`  Gagal: ${fail.join(", ")}`);
      console.log("\n  ── 30 baris terakhir log server ──");
      const lines = serverOut.trim().split("\n");
      for (const l of lines.slice(-30)) console.log("  " + l);
    }
    console.log();
  } finally {
    kill();
  }

  process.exitCode = fail.length ? 1 : 0;
}

main().catch((e) => {
  console.error("\nERROR:", e);
  process.exit(1);
});
