/**
 * Review & Regression â€” Serbabisa POS
 *
 * Menguji area yang paling merusak kalau gagal: integrity uang, stok, nomor
 * nota, isolasi tenant, dan keamanan. Script ini dibuat karena aplikasi akan
 * dipakai sungguhan, jadi harus ada bukti repeatable bahwa angka dan batas
 * aksesnya benar.
 *
 * Setiap cek	print Lulus/Gagal. Exit code 1 bila ada yang gagal.
 *
 * Usage: node scripts/review.mjs
 * Env:  REVIEW_EMAIL / REVIEW_PASSWORD (default: akun demo kasir)
 */
const O = process.env.REVIEW_ORIGIN ?? "http://localhost:3100";
const EMAIL = process.env.REVIEW_EMAIL ?? "kasir@demo.local";
const PASSWORD = process.env.REVIEW_PASSWORD ?? "Kasir#2026";
const ADMIN_EMAIL = process.env.REVIEW_ADMIN_EMAIL ?? "admin@serbabisa.local";
const ADMIN_PASSWORD = process.env.REVIEW_ADMIN_PASSWORD ?? "Serbabisa#2026";

const pass = [];
const fail = [];
const notes = [];

function check(name, ok, detail = "") {
  (ok ? pass : fail).push(name);
  console.log(`  ${ok ? "OK  " : "GAGAL"} ${name}${detail ? `  â€” ${detail}` : ""}`);
}
function note(msg) {
  notes.push(msg);
  console.log(`  ..    ${msg}`);
}
function section(t) {
  console.log(`\nâ–¸ ${t}`);
}

const H = (cookie) => ({ Cookie: cookie, Origin: O });

async function req(path, { method = "GET", cookie, body, headers = {} } = {}) {
  const res = await fetch(O + path, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const ct = res.headers.get("content-type") ?? "";
  const data = ct.includes("json") ? await res.json().catch(() => null) : await res.text();
  return { status: res.status, data, headers: res.headers };
}

async function login(email, password) {
  const r = await req("/api/auth/login", { method: "POST", body: { email, password } });
  if (r.status !== 200) throw new Error(`login ${email} gagal: HTTP ${r.status} ${JSON.stringify(r.data)}`);
  const setCookie = r.headers.getSetCookie?.() ?? [];
  return {
    cookie: setCookie.map((c) => c.split(";")[0]).join("; "),
    user: r.data.user,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`\nâ•â•â• REVIEW & REGRESSION â•â•â•\norigin: ${O}\n`);

  let kasir;
  let admin;
  try {
    kasir = await login(EMAIL, PASSWORD);
    admin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  } catch (e) {
    console.error("GAGAL: tidak bisa login â€”", e.message);
    process.exit(1);
  }
  check("login kasir & admin berhasil", true, `${kasir.user.email} / ${admin.user.email}`);

  const tenantId = kasir.user.tenant?.id;
  const KC = kasir.cookie;
  const AC = admin.cookie;

  // ---------------------------------------------------------------- AUTH ---
  section("Autentikasi & sesi");
  {
    const me = await req("/api/auth/me", { cookie: KC });
    check("session valid", me.status === 200 && me.data.user?.id === kasir.user.id);

    const noAuth = await req("/api/auth/me");
    check("tanpa cookie -> 401", noAuth.status === 401, `HTTP ${noAuth.status}`);

    const fake = await req("/api/auth/me", { cookie: "sb_session=" + "0".repeat(64) });
    check("cookie palsu -> 401", fake.status === 401, `HTTP ${fake.status}`);

    const wrongPwd = await req("/api/auth/login", {
      method: "POST",
      body: { email: EMAIL, password: "password-salah-123" },
    });
    check("password salah -> 401 INVALID_CREDENTIALS",
      wrongPwd.status === 401 && wrongPwd.data?.error === "INVALID_CREDENTIALS",
      `HTTP ${wrongPwd.status} ${wrongPwd.data?.error}`);

    // Pesan error tidak boleh membocorkan apakah email terdaftar.
    const noSuchUser = await req("/api/auth/login", {
      method: "POST",
      body: { email: "tidak-ada@x.local", password: "apa-saja-123" },
    });
    check("email tak terdaftar -> pesan sama dengan password salah",
      noSuchUser.data?.error === "INVALID_CREDENTIALS" && noSuchUser.data?.message === wrongPwd.data?.message,
      noSuchUser.data?.message);

    const sqlish = await req("/api/auth/login", {
      method: "POST",
      body: { email: "' OR 1=1 --", password: "apa-saja-123" },
    });
    check("input SQL injection tidak SUCCESS",
      sqlish.status !== 200, `HTTP ${sqlish.status} ${sqlish.data?.error}`);

    // Logout harus mencabut sesi.
    const tmp = await login(EMAIL, PASSWORD);
    await req("/api/auth/logout", { method: "POST", cookie: tmp.cookie });
    const after = await req("/api/auth/me", { cookie: tmp.cookie });
    check("logout mencabut sesi", after.status === 401, `HTTP ${after.status}`);

    // Sesi TIDAK boleh dicabut oleh login gagal (serangan: coba-coba password).
    const before2 = await req("/api/auth/me", { cookie: KC });
    check("sesi lain tidak terganggu login gagal", before2.status === 200, `HTTP ${before2.status}`);
  }

  // ------------------------------------------------- TENANT ISOLATION ---
  // Snapshot katalog. Deklarasi sengaja DI LUAR blok section supaya bisa dipakai
  // lagi oleh cek invarian di bagian paling akhir. `const` di dalam blok `{ }`
  // hanya hidup di blok itu — bug scoping seperti itu sudah sempat menimpa sekali
  // di skrip ini, jadi bentuknya dikunci di sini.
  const snapshot = new Map();
  section("Isolasi tenant (tenantId selalu dari session)");
  {
    // /api/catalog/[id] hanya punya PATCH, jadi IDOR diuji lewat PATCH.
    const idor = await req("/api/catalog/00000000-0000-0000-0000-000000000000", {
      method: "PATCH",
      cookie: KC,
      body: { name: "x" },
    });
    check("IDOR -> 404 (bukan 403/500)", idor.status === 404, `HTTP ${idor.status}`);

    // Snapshot katalog sendiri. Dipakai dua kali: sebagai bahan pembuktian
    // bahwa request yang tidak rightful tidak mengubah apa pun, dan sebagai
    // baseline invariant "nama & harga tidak pernah berubah selama review"
    // yang dicek di bagian paling akhir.
    const snapRes = await req("/api/catalog?pageSize=100", { cookie: KC });
    for (const p of snapRes.data?.data ?? []) snapshot.set(p.id, `${p.name}|${p.sellingPrice}`);
    check("katalog terbaca untuk baseline", snapshot.size > 0, `${snapshot.size} produk`);

    // IDOR: id yang bukan milik tenant ini harus 404 dan tidak boleh mengubah
    // apa pun. Dua id diuji: UUID nol (selalu tidak ada) dan UUID acak dengan
    // bentuk sah — meniru request yang menebak id milik tenant lain.
    //
    // CATATAN: dulu blok ini mencoba menguji dengan `products[0]`, yang (a)
    // dideklarasikan SESUDAH blok ini sehingga memicu ReferenceError, dan
    // (b) tanpa assertion sama sekali — jadi kalau sempat jalan, ia hanya
    // menamai ulang produk demo menjadi "x" tanpa pernah diperiksa hasilnya.
    for (const [label, id] of [
      ["UUID nol", "00000000-0000-0000-0000-000000000000"],
      ["UUID acak (bentuk sah)", "11111111-2222-4333-8444-555555555555"],
    ]) {
      const r = await req(`/api/catalog/${id}`, { method: "PATCH", cookie: KC, body: { name: "x" } });
      check(`IDOR PATCH ${label} -> 404`, r.status === 404, `HTTP ${r.status}`);
    }
    const afterIdor = await req("/api/catalog?pageSize=100", { cookie: KC });
    const idorChanged = (afterIdor.data?.data ?? []).filter(
      (p) => snapshot.get(p.id) !== `${p.name}|${p.sellingPrice}`,
    );
    check("percobaan IDOR tidak mengubah katalog sendiri", idorChanged.length === 0,
      idorChanged.length ? `${idorChanged.length} produk berubah` : "tidak berubah");

    const other = await req("/api/admin/tenants", { cookie: AC });
    const otherTenant = (other.data?.data ?? [])[0];
    if (otherTenant && otherTenant.id !== tenantId) {
      note(`tenant kedua tersedia: ${otherTenant.businessName} — id produknya tidak bisa diambil tanpa kredensial user tenant itu, jadi IDOR diuji lewat id non-existent (404)`);
    }

    // Akses endpoint admin sebagai USER harus 403.
    for (const p of ["/api/admin/users", "/api/admin/tenants", "/api/admin/audit", "/api/admin/dashboard"]) {
      const r = await req(p, { cookie: KC });
      check(`USER tidak bisa ${p}`, r.status === 403, `HTTP ${r.status}`);
    }

    // Endpoint admin sebagai SUPER_ADMIN harus boleh.
    const ok = await req("/api/admin/users", { cookie: AC });
    check("SUPER_ADMIN boleh /api/admin/users", ok.status === 200, `HTTP ${ok.status}`);
  }

  // ------------------------------------------------------------- CSRF ---
  section("Proteksi same-origin (CSRF)");
  {
    const crossSite = await req("/api/auth/login", {
      method: "POST",
      body: { email: EMAIL, password: PASSWORD },
      headers: { "sec-fetch-site": "cross-site" },
    });
    check("Sec-Fetch-Site: cross-site -> 403", crossSite.status === 403, `HTTP ${crossSite.status}`);

    const evilOrigin = await req("/api/auth/login", {
      method: "POST",
      body: { email: EMAIL, password: PASSWORD },
      headers: { origin: "https://penyerang.example" },
    });
    check("Origin asing -> 403", evilOrigin.status === 403, `HTTP ${evilOrigin.status}`);

    // Klien native (React Native) tidak mengirim Origin sama sekali -> harus LOLOS.
    const native = await fetch(O + "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    check("klien native (tanpa Origin) -> boleh", native.status === 200, `HTTP ${native.status}`);
  }

  // ------------------------------------------------- INTEGRITAS UANG ---
  section("Integritas uang (checkout)");
  const catalog = await req("/api/catalog?pageSize=100", { cookie: KC });
  const products = (catalog.data?.data ?? []).filter((p) => p.type === "PRODUCT" && p.stockQty > 3);
  check("ada produk untuk diuji", products.length > 0, `${products.length} produk`);

  if (products.length > 0) {
    const item = products[0];

    // 1) Harga & total dihitung server, bukan dari input client.
    const qty = 2;
    const total = item.sellingPrice * qty;

    // Bayar kurang dari total harus DITOLAK â€” diuji eksplisit supaya
    // regresi pada validasi pembayaran ketahuan.
    const underpay = await req("/api/transactions", {
      method: "POST",
      cookie: KC,
      body: {
        items: [{ catalogItemId: item.id, quantity: qty }],
        paymentMethod: "CASH",
        paidAmount: 10,
        idempotencyKey: `review-${Date.now()}-under`,
      },
    });
    check("bayar kurang dari total -> ditolak INVALID_PAYMENT",
      underpay.status === 400 && underpay.data?.error === "INVALID_PAYMENT",
      `HTTP ${underpay.status} ${underpay.data?.error}`);

    // Kunci idempotency disimpan di variabel supaya request kedua benar-benar
    // memakai kunci yang SAMA. Versi sebelumnya memanggil Date.now() lagi,
    // sehingga yang diuji bukan idempotency sama sekali — dan stok berkurang
    // dua kali sehingga tes stok ikut gagal.
    const idemKey = `review-${Date.now()}-a`;

    const r1 = await req("/api/transactions", {
      method: "POST",
      cookie: KC,
      body: {
        items: [{ catalogItemId: item.id, quantity: qty }],
        paymentMethod: "CASH",
        paidAmount: total,
        idempotencyKey: idemKey,
      },
    });
    check("checkout berhasil", r1.status === 201, `HTTP ${r1.status} ${r1.data?.error ?? ""}`);
    const t1 = r1.data?.transaction;
    if (t1) {
      const expectSub = item.sellingPrice * qty;
      check("subtotal = harga Ã— qty (dihitung server)", t1.subtotal === expectSub,
        `${t1.subtotal} vs ${expectSub}`);
      check("total = subtotal saat tanpa diskon/pajak", t1.totalAmount === expectSub,
        `${t1.totalAmount} vs ${expectSub}`);
      check("kembalian = bayar âˆ’ total", t1.changeAmount === t1.paidAmount - t1.totalAmount,
        `${t1.changeAmount} vs ${t1.paidAmount - t1.totalAmount}`);

      // 2) Idempotency: kirim ulang DENGAN KUNCI YANG SAMA PERSIS.
      //    D body's paidAmount sengaja diubah (999999999): kalau replay-nya
      //    benar, nilai itu TIDAK boleh terpakai dan transaksi tetap sama.
      const replay = await req("/api/transactions", {
        method: "POST",
        cookie: KC,
        body: {
          items: [{ catalogItemId: item.id, quantity: qty }],
          paymentMethod: "CASH",
          paidAmount: 999999999,
          idempotencyKey: idemKey,
        },
      });
      const replayTx = replay.data?.transaction;
      // Replay sengaja mengembalikan 200 (bukan 201): 201 berarti "dibuat",
      // sedangkan di sini tidak ada yang dibuat.
      check("idempotency: kunci sama -> replay transaksi yang sama (200, bukan 201)",
        replay.status === 200 && replayTx?.id === t1.id,
        `HTTP ${replay.status} id=${replayTx?.id?.slice(0, 8) ?? "-"} (asli ${t1.id.slice(0, 8)})`);
      check("idempotency: nilai body yang berbeda DIABAIKAN saat replay",
        replayTx?.paidAmount === t1.paidAmount,
        `replay paid=${replayTx?.paidAmount} vs asli ${t1.paidAmount}`);
      check("idempotency: penanda replay dikembalikan",
        replay.data?.idempotentReplay === true,
        String(replay.data?.idempotentReplay));

      // 3) Stok berkurang sesuai qty.
      const after = await req("/api/catalog?pageSize=100", { cookie: KC });
      const itemAfter = (after.data?.data ?? []).find((p) => p.id === item.id);
      check("stok berkurang tepat sesuai qty",
        Math.abs(item.stockQty - qty - itemAfter.stockQty) < 0.001,
        `${item.stockQty} â†’ ${itemAfter.stockQty}`);

      // 4) Stok tidak cukup harus DITOLAK.
      const tooMany = await req("/api/transactions", {
        method: "POST",
        cookie: KC,
        body: {
          items: [{ catalogItemId: item.id, quantity: 999999 }],
          paymentMethod: "CASH",
          paidAmount: 999999999,
          idempotencyKey: `review-${Date.now()}-b`,
        },
      });
      check("stok tidak cukup -> ditolak (409/400)", tooMany.status >= 400, `HTTP ${tooMany.status} ${tooMany.data?.error}`);

      // 5) Void mengembalikan stok.
      const stockBeforeVoid = itemAfter.stockQty;
      const voidRes = await req(`/api/transactions/${t1.id}/void`, {
        method: "POST",
        cookie: KC,
        body: { reason: "review-otomatis" },
      });
      check("void berhasil", voidRes.status === 200, `HTTP ${voidRes.status} ${voidRes.data?.error ?? ""}`);
      const afterVoid = (await req("/api/catalog?pageSize=100", { cookie: KC })).data?.data?.find((p) => p.id === item.id);
      check("void mengembalikan stok",
        Math.abs(afterVoid.stockQty - stockBeforeVoid - qty) < 0.001,
        `${stockBeforeVoid} â†’ ${afterVoid.stockQty} (harus +${qty})`);

      // 6) Transaksi VOID tidak bisa di-void lagi.
      const voidAgain = await req(`/api/transactions/${t1.id}/void`, {
        method: "POST",
        cookie: KC,
        body: { reason: "review-kedua" },
      });
      check("void dua kali -> ditolak", voidAgain.status >= 400, `HTTP ${voidAgain.status} ${voidAgain.data?.error}`);

      // 7) Void tanpa alasan harus ditolak.
      const noReason = await req("/api/transactions/00000000-0000-0000-0000-000000000000/void", {
        method: "POST",
        cookie: KC,
        body: {},
      });
      check("void tanpa alasan -> ditolak", noReason.status >= 400, `HTTP ${noReason.status}`);
    }
  }

  // -------------------------------------------------- RACE CONDITION ---
  section("Concurrency (dua kasir checkout bersamaan)");
  if (products.length > 0) {
    const target = products[0];
    const stockNow = target.stockQty;
    // 5 checkout paralel, masing-masing ambil 1 unit. Kalau decrement-nya
    // tidak atomik, total terjual akan melebihi stok yang tersedia.
    const n = 5;
    const results = await Promise.all(
      Array.from({ length: n }, (_, i) =>
        req("/api/transactions", {
          method: "POST",
          cookie: KC,
          body: {
            items: [{ catalogItemId: target.id, quantity: 1 }],
            paymentMethod: "CASH",
            paidAmount: target.sellingPrice,
            idempotencyKey: `review-race-${Date.now()}-${i}`,
          },
        }),
      ),
    );
    const created = results.filter((r) => r.status === 201).length;
    const rejected = results.filter((r) => r.status >= 400).length;
    check("checkout paralel: semua request tertangani", created + rejected === n,
      `dibuat ${created}, ditolak ${rejected}`);

    const afterRace = (await req("/api/catalog?pageSize=100", { cookie: KC })).data?.data
      ?.find((p) => p.id === target.id);
    const expected = Math.max(0, stockNow - created);
    check("stok tidak pernah minus setelah race",
      afterRace.stockQty >= 0, `${stockNow} → ${afterRace.stockQty} (dibuat ${created})`);
    check("stok konsisten dengan jumlah transaksi sukses",
      afterRace.stockQty === expected, `${afterRace.stockQty} vs ${expected}`);

    // Bersihkan transaksi race supaya data demo tidak kotor.
    for (const r of results) {
      const id = r.data?.transaction?.id;
      if (id) {
        await req(`/api/transactions/${id}/void`, {
          method: "POST",
          cookie: KC,
          body: { reason: "review-race-cleanup" },
        });
      }
    }
  }

  // ------------------------------------------------------------ REFUND ---
  section("Refund");
  if (products.length > 0) {
    const item = products[0];
    const made = await req("/api/transactions", {
      method: "POST",
      cookie: KC,
      body: {
        items: [{ catalogItemId: item.id, quantity: 2 }],
        paymentMethod: "CASH",
        paidAmount: item.sellingPrice * 2,
        idempotencyKey: `review-refund-${Date.now()}`,
      },
    });
    const tx = made.data?.transaction;
    if (tx) {
      // Refund bersifat per-item: server menghitung ulang nilainya dari
      // transactionItem, jadi client TIDAK boleh mengirim `amount` sendiri.
      const detail = await req(`/api/transactions/${tx.id}`, { cookie: KC });
      const tItems = detail.data?.transaction?.items ?? detail.data?.items ?? [];
      const line = tItems[0];
      check("detail transaksi mengembalikan items", !!line?.id,
        `${tItems.length} item`);

      const before = (await req("/api/catalog?pageSize=100", { cookie: KC })).data?.data
        ?.find((p) => p.id === item.id)?.stockQty;

      // Refund melebihi qty yang dibeli harus ditolak.
      const tooMuch = await req(`/api/transactions/${tx.id}/refund`, {
        method: "POST",
        cookie: KC,
        body: {
          items: [{ transactionItemId: line.id, quantity: 99 }],
          reason: "review-kebanyakan",
        },
      });
      check("refund melebihi qty terbeli -> ditolak",
        tooMuch.status >= 400, `HTTP ${tooMuch.status} ${tooMuch.data?.error}`);

      // Refund sebagian: 1 dari 2.
      const partial = await req(`/api/transactions/${tx.id}/refund`, {
        method: "POST",
        cookie: KC,
        body: {
          items: [{ transactionItemId: line.id, quantity: 1 }],
          reason: "review-otomatis",
        },
      });
      check("refund sebagian berhasil",
        partial.status === 200, `HTTP ${partial.status} ${partial.data?.error ?? ""}`);

      const refunded = partial.data?.transaction?.refundedAmount ?? 0;
      check("refundedAmount = nilai 1 unit (dihitung server)",
        refunded === item.sellingPrice, `${refunded} vs ${item.sellingPrice}`);

      const afterRefund = (await req("/api/catalog?pageSize=100", { cookie: KC })).data?.data
        ?.find((p) => p.id === item.id)?.stockQty;
      check("refund mengembalikan 1 unit ke stok",
        Math.abs(afterRefund - before - 1) < 0.001, `${before} → ${afterRefund} (refund 1)`);

      // Sisa yang boleh direfund masih 1 (dari 2 yang dibeli), jadi refund 1 lagi
      // itu LEGAL. Yang baru salah adalah refund KETIGA.
      const second = await req(`/api/transactions/${tx.id}/refund`, {
        method: "POST",
        cookie: KC,
        body: {
          items: [{ transactionItemId: line.id, quantity: 1 }],
          reason: "review-sisa-terakhir",
        },
      });
      check("refund sisa terakhir (1 dari 2) -> boleh",
        second.status === 200, `HTTP ${second.status} ${second.data?.error ?? ""}`);

      const fullyRefunded = second.data?.transaction?.refundedAmount ?? 0;
      check("refundedAmount kumulatif = seluruh nilai transaksi",
        fullyRefunded === item.sellingPrice * 2,
        `${fullyRefunded} vs ${item.sellingPrice * 2}`);

      // Sekarang tidak boleh ada sisa sama sekali.
      const over = await req(`/api/transactions/${tx.id}/refund`, {
        method: "POST",
        cookie: KC,
        body: {
          items: [{ transactionItemId: line.id, quantity: 0.5 }],
          reason: "review-kelebihan",
        },
      });
      check("refund melebihi sisa -> ditolak", over.status >= 400,
        `HTTP ${over.status} ${over.data?.error}`);

      // Void transaksi yang sudah di-refund tidak boleh bisa.
      const voidRefunded = await req(`/api/transactions/${tx.id}/void`, {
        method: "POST",
        cookie: KC,
        body: { reason: "review-void-setelah-refund" },
      });
      check("void setelah refund -> ditolak", voidRefunded.status >= 400,
        `HTTP ${voidRefunded.status} ${voidRefunded.data?.error}`);
    }
  }

  // -------------------------------------------------------- SESI KASIR ---
  section("Sesi kasir (shift)");
  {
    const cur = await req("/api/cash-sessions/current", { cookie: KC });
    check("status shift berjalan", cur.status === 200, `HTTP ${cur.status}`);

    // Shift yang tidak ada tidak boleh bisa ditutup.
    const closeGhost = await req("/api/cash-sessions/00000000-0000-0000-0000-000000000000/close", {
      method: "POST",
      cookie: KC,
      body: { closingCash: 0, notes: "review" },
    });
    check("tutup shift yang tidak ada -> 404/400", closeGhost.status >= 400, `HTTP ${closeGhost.status}`);
  }

  // ------------------------------------------------------------ UPLOAD ---
  section("Upload logo (validasi berkas)");
  {
    // Bytes acak: bukan gambar -> harus ditolak.
    const junk = Buffer.from("ini bukan gambar sama sekali");
    const fd = new FormData();
    fd.append("file", new Blob([junk], { type: "image/png" }), "logo.png");
    const up = await fetch(O + "/api/upload", {
      method: "POST",
      headers: { cookie: KC, origin: O },
      body: fd,
    });
    check("berkas non-gambar -> ditolak", up.status >= 400, `HTTP ${up.status}`);
  }

  // ---------------------------------------------------- NOMOR NOTA ---
  section("Nomor nota");
  {
    const tx = await req("/api/transactions?pageSize=20", { cookie: KC });
    const list = tx.data?.data ?? tx.data?.transactions ?? [];
    const numbers = list.map((t) => t.invoiceNumber);
    const dupes = numbers.filter((n, i) => numbers.indexOf(n) !== i);
    check("tidak ada nomor nota duplikat", dupes.length === 0, dupes.length ? dupes.join(", ") : `${numbers.length} nota`);

    const badFormat = numbers.filter((n) => !/^INV-\d{4}-\d{6}(-[A-Z0-9]{4,8})?$/.test(n));
    check("format nota konsisten (INV-YYYY-NNNNNN)", badFormat.length === 0, badFormat.join(", ") || "ok");
  }

  // ------------------------------------------------------- VALIDASI ---
  section("Validasi input");
  {
    const negQty = await req("/api/transactions", {
      method: "POST",
      cookie: KC,
      body: {
        items: [{ catalogItemId: products[0]?.id ?? "x", quantity: -5 }],
        paymentMethod: "CASH",
        paidAmount: 0,
        idempotencyKey: `review-${Date.now()}-neg`,
      },
    });
    check("qty negatif -> ditolak", negQty.status >= 400, `HTTP ${negQty.status}`);

    const badEmail = await req("/api/auth/login", {
      method: "POST",
      body: { email: "bukan-email", password: "x".repeat(12) },
    });
    check("email tidak valid -> 422", badEmail.status === 422, `HTTP ${badEmail.status}`);

    const shortPwd = await req("/api/auth/login", {
      method: "POST",
      body: { email: EMAIL, password: "pendek" },
    });
    check("password terlalu pendek -> ditolak", shortPwd.status >= 400, `HTTP ${shortPwd.status}`);

    const hugePage = await req("/api/catalog?pageSize=99999", { cookie: KC });
    const size = (hugePage.data?.data ?? []).length;
    check("pageSize dibatasi server", size <= 100, `diminta 99999, dikembalikan ${size}`);
  }

  // -------------------------------------------------------- LAPORAN ---
  section("Laporan & export");
  {
    const today = new Date();
    const from = new Date(today.getTime() - 30 * 864e5).toISOString().slice(0, 10);
    const to = today.toISOString().slice(0, 10);

    const rep = await req(`/api/reports?dateFrom=${from}&dateTo=${to}`, { cookie: KC });
    check("laporan 30 hari -> 200", rep.status === 200, `HTTP ${rep.status} ${rep.data?.error ?? ""}`);

    const badRange = await req(`/api/reports?dateFrom=${to}&dateTo=${from}`, { cookie: KC });
    check("rentang tanggal terbalik -> ditolak", badRange.status >= 400, `HTTP ${badRange.status}`);

    // Magic bytes lengkap, bukan hanya 2 byte pertama.
    for (const [f, expect] of [["csv", null], ["xlsx", "504b0304"], ["pdf", "25504446"]]) {
      const r = await fetch(`${O}/api/export?format=${f}`, { headers: { cookie: KC, origin: O } });
      const buf = Buffer.from(await r.arrayBuffer());
      const magic = buf.subarray(0, 4).toString("hex");
      check(`export ${f} valid`, r.status === 200 && (expect === null || magic === expect),
        `HTTP ${r.status} magic=${magic} ${buf.length}B`);
    }

    const badFmt = await fetch(`${O}/api/export?format=sql`, { headers: { cookie: KC, origin: O } });
    check("format tak dikenal -> ditolak", badFmt.status >= 400, `HTTP ${badFmt.status}`);
  }

  // ------------------------------------------------------ HEADER KEAMANAN ---
  section("Header keamanan");
  {
    const r = await fetch(O + "/", { headers: { cookie: KC } });
    const need = [
      "x-content-type-options",
      "referrer-policy",
      "content-security-policy",
      "permissions-policy",
    ];
    const missing = need.filter((h) => !r.headers.get(h));
    check("header keamanan lengkap", missing.length === 0, missing.length ? "hilang: " + missing.join(", ") : "lengkap");
  }

  // ------------------------------------------------------- INVARIAN DATA ---
  section("Invarian: review tidak boleh merusak data");
  {
    // Stock memang berubah (checkout, void, race, refund) — itu disengaja dan
    // sudah dibuktikan oleh cek masing-masing di atas. Yang TIDAK boleh berubah
    // tanpa alasan adalah nama & harga produk. Inilah yang menangkap regresi
    // fatal seperti request tanpa assertion yang menimpa data demo.
    const after = await req("/api/catalog?pageSize=100", { cookie: KC });
    const now = new Map((after.data?.data ?? []).map((p) => [p.id, `${p.name}|${p.sellingPrice}`]));
    const drift = [];
    for (const [id, v] of snapshot) {
      const nowV = now.get(id);
      if (nowV === undefined) drift.push(`${id.slice(0, 8)}: hilang`);
      else if (nowV !== v) drift.push(`${id.slice(0, 8)}: ${v} -> ${nowV}`);
    }
    for (const id of now.keys()) if (!snapshot.has(id)) drift.push(`${id.slice(0, 8)}: muncul baru`);
    check("nama & harga produk tidak berubah selama review", drift.length === 0,
      drift.length ? drift.join("; ") : `${snapshot.size} produk utuh`);
  }

  // ------------------------------------------------------------- RINGKAS ---
  console.log("\nâ•â•â• RINGKASAN â•â•â•");
  console.log(`  Lulus : ${pass.length}`);
  console.log(`  Gagal : ${fail.length}`);
  if (fail.length) {
    console.log("\n  Perlu diperbaiki:");
    for (const f of fail) console.log(`   - ${f}`);
  }
  if (notes.length) {
    console.log("\n  Catatan:");
    for (const n of notes) console.log(`   - ${n}`);
  }
  console.log();
  process.exit(fail.length ? 1 : 0);
}

main().catch((e) => {
  console.error("\nERROR:", e);
  process.exit(1);
});
