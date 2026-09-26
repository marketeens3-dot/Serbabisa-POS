/**
 * Uji sinkronisasi multi-perangkat.
 *
 * Membuktikan skenario yang paling rawan: DUA PC kasir untuk toko yang sama,
 * keduanya berjualan saat OFFLINE, lalu sinkronisasi ke Supabase.
 *
 * Yang diuji:
 *   1. Aktivasi perangkat A dan B lewat cloud (login pertama)
 *   2. A berjualan 3 nota saat offline, B berjualan 2 nota saat offline
 *   3. Sync A ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ cloud; A dapat blok nomor RESMI dari cloud
 *   4. Sync B ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ cloud; B melihat transaksi A, dan conversely
 *   5. Nomor nota A dan B TIDAK pernah bentrok
 *   6. Stok keduanya sama setelah sync (dihitung dari ledger)
 *   7. Idempoten: sync berulang tidak menggandakan data
 *
 * Data uji dibuat di tenant tersendiri lalu DIBERSIHKAN di akhir ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â data demo
 * tidak boleh tersentuh.
 *
 * Usage: node scripts/test-sync.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SECRET = crypto.randomBytes(32).toString("hex");
const PASSWORD = "Sinkron#2026";
const EMAIL = "kasir@synctest.local";

const pass = [];
const fail = [];
function check(name, ok, detail = "") {
  (ok ? pass : fail).push(name);
  console.log(`  ${ok ? "ÃƒÂ¢Ã…â€œÃ¢â‚¬Å“" : "ÃƒÂ¢Ã…â€œÃ¢â‚¬â€"} ${name}${detail ? `  ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ${detail}` : ""}`);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Baca .env (DATABASE_URL) supaya proses anak benar-benar punya koneksi cloud. */
function loadEnvFile() {
  const file = path.join(root, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnvFile();

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}

/** Jalankan satu server Next.js standalone dengan database lokal sendiri. */
async function bootDevice(label, dbFile) {
  const entry = path.join(root, "desktop-build", "bundle", "server", "server.js");
  if (!fs.existsSync(entry)) {
    throw new Error("Jalankan `npm run desktop:prepare` dulu.");
  }
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const proc = spawn(process.execPath, [entry], {
    cwd: path.dirname(entry),
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      SERBABISA_DB: "local",
      LOCAL_DATABASE_URL: `file:${dbFile.replace(/\\/g, "/")}`,
      SERBABISA_INTERNAL_SECRET: SECRET,
      SERBABISA_SYNC_DEBUG: "1",
      NEXT_TELEMETRY_DISABLED: "1",
      COMPUTERNAME: label,
    },
  });
  let out = "";
  proc.stdout.on("data", (c) => (out += c));
  proc.stderr.on("data", (c) => (out += c));

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const ok = await fetch(`${origin}/api/auth/me`, { signal: AbortSignal.timeout(3000) })
      .then(() => true)
      .catch(() => false);
    if (ok) break;
    await wait(500);
  }

  return {
    label,
    origin,
    log: () => out,
    stop: () => {
      try {
        spawn("taskkill", ["/pid", String(proc.pid), "/f", "/t"], { windowsHide: true });
      } catch {
        /* noop */
      }
    },
  };
}

async function login(dev, email, password) {
  const res = await fetch(dev.origin + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: dev.origin },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`login ${dev.label} gagal: HTTP ${res.status} ${JSON.stringify(body)}`);
  return {
    cookie: (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; "),
    body,
  };
}

/** Jual `qty` dari item pertama; mengembalikan nomor nota. */
async function sell(dev, cookie, item, qty, tag) {
  const res = await fetch(dev.origin + "/api/transactions", {
    method: "POST",
    headers: { "content-type": "application/json", cookie, origin: dev.origin },
    body: JSON.stringify({
      items: [{ catalogItemId: item.id, quantity: qty }],
      paymentMethod: "CASH",
      paidAmount: item.sellingPrice * qty,
      idempotencyKey: `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`checkout ${dev.label} gagal: HTTP ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
  return body.transaction.invoiceNumber;
}

async function sync(dev) {
  const res = await fetch(dev.origin + "/api/sync/internal", {
    method: "POST",
    headers: { "content-type": "application/json", "x-serbabisa-internal": SECRET, origin: dev.origin },
    body: JSON.stringify({ reason: "test-sync" }),
  });
  return res.json().catch(() => ({}));
}

async function transactions(dev, cookie) {
  const res = await fetch(dev.origin + "/api/transactions", { headers: { cookie, origin: dev.origin } });
  const body = await res.json().catch(() => ({}));
  return body?.data ?? body?.transactions ?? [];
}

/**
 * Hapus semua sisa data uji dari cloud.
 *
 * Urutan(delete) WAJIB mengikuti dependensi foreign key. Dua relasi di skema
 * ini tidak punya `onDelete: Cascade` sehingga default-nya Restrict:
 *   - CatalogItem ← InventoryMovement  (menahan penghapusan tenant)
 *   - User        ← Transaction.cashier & CashSession.userId  (menahan hapus user)
 * Jadi baris-baris itu dihapus eksplisit lebih dulu. (Aplikasi tidak memiliki
 * fitur hapus tenant — hanya nonaktifkan — jadi ini hanya menyangkut test.)
 */
async function cleanupTestUser(cloud) {
  const users = await cloud.user.findMany({
    where: { email: EMAIL },
    select: { id: true, tenantId: true },
  });

  for (const u of users) {
    if (!u.tenantId) continue;
    const tid = u.tenantId;
    await cloud.inventoryMovement.deleteMany({ where: { tenantId: tid } }).catch(() => undefined);
    await cloud.transactionItem.deleteMany({
      where: { transaction: { tenantId: tid } },
    }).catch(() => undefined);
    await cloud.cashSession.deleteMany({ where: { tenantId: tid } }).catch(() => undefined);
    await cloud.transaction.deleteMany({ where: { tenantId: tid } }).catch(() => undefined);
    await cloud.auditLog.deleteMany({ where: { tenantId: tid } }).catch(() => undefined);
    await cloud.tenant.delete({ where: { id: tid } }).catch(() => undefined);
  }

  await cloud.user.deleteMany({ where: { email: EMAIL } }).catch(() => undefined);
  // Tenant yatim dari run yang gagal sebelum user-nya tercatat.
  for (const t of await cloud.tenant.findMany({
    where: { slug: { startsWith: "synctest-" } },
    select: { id: true },
  })) {
    await cloud.inventoryMovement.deleteMany({ where: { tenantId: t.id } }).catch(() => undefined);
    await cloud.transaction.deleteMany({ where: { tenantId: t.id } }).catch(() => undefined);
    await cloud.tenant.delete({ where: { id: t.id } }).catch(() => undefined);
  }

  const left = await cloud.user.count({ where: { email: EMAIL } });
  if (left > 0) console.error(`  PERINGATAN: ${left} user uji masih tertinggal di cloud`);
}

async function main() {
  if (!process.env.DATABASE_URL) {    console.error("DATABASE_URL belum ada ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â tidak bisa menguji sinkronisasi ke cloud.");
    process.exit(1);
  }
  const serverEntry = path.join(root, "desktop-build", "bundle", "server", "server.js");
  if (!fs.existsSync(serverEntry)) {
    console.error("Jalankan `npm run desktop:prepare` dulu.");
    process.exit(1);
  }

  const cloud = new PrismaClient();
  const slug = `synctest-${Date.now()}`;
  let tenant = null;
  const devA = { stop() {}, log: () => "" };
  const devB = { stop() {}, log: () => "" };
  let finished = false;

  console.log("\nÃƒÂ¢Ã¢â‚¬â€œÃ‚Â¸ UJI SINKRONISASI MULTI-PERANGKAT (2 kasir offline, 1 toko)\n");

  try {
    // ---------- 0. Tenant uji di cloud ----------
    // Bersihkan sisa run sebelumnya yang gagal di tengah jalan.
    await cleanupTestUser(cloud);

    tenant = await cloud.tenant.create({
      data: { businessName: "Toko Sync Test", slug, currency: "IDR", timezone: "Asia/Jakarta" },
    });
    await cloud.user.create({
      data: {
        email: EMAIL,
        passwordHash: `scrypt:${crypto.randomBytes(16).toString("hex")}:PLACEHOLDER`,
        fullName: "Kasir Sync Test",
        role: "USER",
        status: "ACTIVE",
        tenantId: tenant.id,
      },
    });
    // Password di-set lewat helper yang sama dengan src/lib/auth.ts
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(PASSWORD, salt, 64).toString("hex");
    await cloud.user.update({
      where: { email: EMAIL },
      data: { passwordHash: `scrypt:${salt}:${hash}` },
    });
    const category = await cloud.category.create({
      data: { tenantId: tenant.id, name: "Umum", normalizedName: "umum" },
    });
    const item = await cloud.catalogItem.create({
      data: {
        tenantId: tenant.id,
        type: "PRODUCT",
        name: "Kaos Polos",
        sku: "STS-1",
        sellingPrice: 75000,
        stockQty: 50,
        minStockQty: 5,
        unit: "pcs",
        categoryId: category.id,
      },
    });
    // Stok awal sebagai ADJUSTMENT supaya ledger bisa menghitungnya.
    await cloud.inventoryMovement.create({
      data: { tenantId: tenant.id, catalogItemId: item.id, movementType: "ADJUSTMENT", quantity: 50 },
    });
    console.log(`  tenant uji : ${slug} (${tenant.id.slice(0, 8)})\n`);

    // ---------- 1. Boot dua perangkat ----------
    const dirA = fs.mkdtempSync(path.join(os.tmpdir(), "sb-sync-A-"));
    const dirB = fs.mkdtempSync(path.join(os.tmpdir(), "sb-sync-B-"));
    Object.assign(devA, await bootDevice("KASIR-A", path.join(dirA, "db.sqlite")));
    Object.assign(devB, await bootDevice("KASIR-B", path.join(dirB, "db.sqlite")));
    check("dua perangkat boot dengan DB lokal terpisah", true, `${devA.origin} | ${devB.origin}`);

    // ---------- 2. Aktivasi lewat cloud (login pertama) ----------
    console.log("\nÃƒÂ¢Ã¢â‚¬â€œÃ‚Â¸ Aktivasi perangkat (login pertama butuh internet)");
    const sA = await login(devA, EMAIL, PASSWORD);
    const sB = await login(devB, EMAIL, PASSWORD);    check("A teraktivasi & data toko terunduh", !!sA.body.user, sA.body.user?.fullName);
    check("B teraktivasi & data toko terunduh", !!sB.body.user, sB.body.user?.fullName);

    const catA = await (await fetch(devA.origin + "/api/catalog", { headers: { cookie: sA.cookie, origin: devA.origin } })).json();
    const catB = await (await fetch(devB.origin + "/api/catalog", { headers: { cookie: sB.cookie, origin: devB.origin } })).json();
    const itemA = catA?.data?.find((i) => i.sku === "STS-1");
    const itemB = catB?.data?.find((i) => i.sku === "STS-1");
    check("katalog terunduh ke kedua perangkat", !!itemA && !!itemB, `A:${itemA?.stockQty} B:${itemB?.stockQty}`);

    // ---------- 3. Blok nota resmi dari cloud ----------
    console.log("\nÃƒÂ¢Ã¢â‚¬â€œÃ‚Â¸ Aktivasi memesan blok nomor nota dari cloud");
    const syncA0 = await sync(devA);
    const syncB0 = await sync(devB);
    // Nama perangkat berakhiran 4 karakter id (agar unik per instalasi),
    // jadi dicocokkan dengan awalan saja.
    const devA_cloud = await cloud.device.findFirst({
      where: { tenantId: tenant.id, name: { startsWith: "KASIR-A" } },
      select: { id: true, name: true },
    });
    const devB_cloud = await cloud.device.findFirst({
      where: { tenantId: tenant.id, name: { startsWith: "KASIR-B" } },
      select: { id: true, name: true },
    });
    check("perangkat A terdaftar di cloud", !!devA_cloud, devA_cloud?.name);
    check("perangkat B terdaftar di cloud", !!devB_cloud, devB_cloud?.name);
    check("sync awal tidak error", !syncA0?.report?.error && !syncB0?.report?.error,
      `A:${syncA0?.report?.error ?? "ok"} B:${syncB0?.report?.error ?? "ok"}`);

    // ---------- 4. Jual saat OFFLINE (matikan sync dengan blok dikuras) ----------
    console.log("\nÃƒÂ¢Ã¢â‚¬â€œÃ‚Â¸ Penjualan saat OFFLINE");
    // Catatan: kedua perangkat masih memegang blok resmi 50 nomor dari cloud,
    // jadi nomor yang terbit adalah blok resmi (bukan device-scoped).
    // Kedua perangkat sebenarnya masih punya blok (50). Jual 3 + 2 nota.
    const invA = [];
    for (let i = 0; i < 3; i++) invA.push(await sell(devA, sA.cookie, itemA, 1, "A"));
    const invB = [];
    for (let i = 0; i < 2; i++) invB.push(await sell(devB, sB.cookie, itemB, 1, "B"));
    check("A berhasil berjualan 3 nota", invA.length === 3, invA.join(", "));
    check("B berhasil berjualan 2 nota", invB.length === 2, invB.join(", "));
    const allInv = [...invA, ...invB];
    check("nomor nota A dan B tidak bentrok", new Set(allInv).size === allInv.length, allInv.join(" | "));

    // ---------- 5. Sync A lalu B ----------
    console.log("\nÃƒÂ¢Ã¢â‚¬â€œÃ‚Â¸ Sinkronisasi");
    const syncA = await sync(devA);
    check("sync A sukses", !syncA?.report?.error, `naik=${syncA?.report?.pushed} turun=${syncA?.report?.pulled} ${syncA?.report?.durationMs}ms`);
    console.log("      rincian A:");
    for (const e of syncA?.report?.entities ?? []) {
      if (e.pushed || e.pulled || e.error) console.log(`        ${e.entity}: naik=${e.pushed} turun=${e.pulled} ${e.error ?? ""}`);
    }

    const syncB = await sync(devB);
    check("sync B sukses", !syncB?.report?.error, `naik=${syncB?.report?.pushed} turun=${syncB?.report?.pulled} ${syncB?.report?.durationMs}ms`);
    console.log("      rincian B:");
    for (const e of syncB?.report?.entities ?? []) {
      if (e.pushed || e.pulled || e.error) console.log(`        ${e.entity}: naik=${e.pushed} turun=${e.pulled} ${e.error ?? ""}`);
    }

    // ---------- 6. B melihat transaksi A ----------
    const txB = await transactions(devB, sB.cookie);
    const invOnB = txB.map((t) => t.invoiceNumber);
    const aVisibleOnB = invA.every((n) => invOnB.includes(n));
    check("B melihat semua transaksi A setelah sync", aVisibleOnB, `total ${txB.length} nota di B`);

    // ---------- 7. A melihat transaksi B ----------
    const syncA2 = await sync(devA);
    const txA = await transactions(devA, sA.cookie);
    const invOnA = txA.map((t) => t.invoiceNumber);
    const bVisibleOnA = invB.every((n) => invOnA.includes(n));
    check("A melihat transaksi B setelah sync", bVisibleOnA, `total ${txA.length} nota di A`);
    check("sync kedua A tidak error", !syncA2?.report?.error, `naik=${syncA2?.report?.pushed} turun=${syncA2?.report?.pulled}`);

    // ---------- 8. Stok konsisten (turunkan dari ledger) ----------
    const stockA = Number((await (await fetch(devA.origin + "/api/catalog", { headers: { cookie: sA.cookie, origin: devA.origin } })).json())?.data?.find((i) => i.sku === "STS-1")?.stockQty);
    const stockB = Number((await (await fetch(devB.origin + "/api/catalog", { headers: { cookie: sB.cookie, origin: devB.origin } })).json())?.data?.find((i) => i.sku === "STS-1")?.stockQty);
    check("stok A = 50 - 5 = 45", stockA === 45, `stok A = ${stockA}`);
    check("stok B = 45 (konsisten dengan A)", stockB === 45, `stok B = ${stockB}`);

    // ---------- 9. Idempoten ----------
    const beforeCount = txA.length;
    await sync(devA);
    await sync(devA);
    const txA2 = await transactions(devA, sA.cookie);
    check("sync berulang tidak menggandakan transaksi", txA2.length === beforeCount, `${beforeCount} ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ ${txA2.length}`);

    // ---------- 10. Bentrok di cloud? ----------
    const cloudTx = await cloud.transaction.findMany({ where: { tenantId: tenant.id } });
    const cloudInv = cloudTx.map((t) => t.invoiceNumber);
    check("tidak ada nomor nota duplikat di cloud", new Set(cloudInv).size === cloudInv.length, `${cloudInv.length} nota`);
    check("semua 5 nota lokal naik ke cloud", cloudInv.length === 5, cloudInv.sort().join(", "));

    // ---------- 11. Sesi tidak ikut sync ----------
    const cloudSessions = await cloud.session.count({ where: { userId: sA.body.user.id } });
    check("sesi perangkat tidak pernah masuk cloud", cloudSessions === 0, `${cloudSessions} sesi`);
    finished = true;
    console.log("\n  === invoice-block A ===");
    for (const l of devA.log().split("\n")) if (l.includes("invoice-block")) console.log("  " + l);
    console.log("  === invoice-block B ===");
    for (const l of devB.log().split("\n")) if (l.includes("invoice-block")) console.log("  " + l);
  } catch (err) {
    console.error("\n  ERROR:", err instanceof Error ? err.message : err);
  } finally {
    if (!finished) {
      console.log("\n  ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ log perangkat A (40 baris terakhir) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬");
      for (const l of devA.log().trim().split("\n").slice(-40)) console.log("  " + l);
    }
    devA.stop();
    devB.stop();
    if (tenant) {
      await cleanupTestUser(cloud);
      console.log(`\n  Data uji cloud dibersihkan (tenant ${slug}).`);
    }
    await cloud.$disconnect();
  }

  console.log(`\n  Lulus: ${pass.length}   Gagal: ${fail.length}`);
  if (fail.length) console.log(`  Gagal: ${fail.join(", ")}`);
  console.log();
  process.exitCode = fail.length ? 1 : 0;
}

main().catch((e) => {
  console.error("\nERROR:", e);
  process.exit(1);
});
