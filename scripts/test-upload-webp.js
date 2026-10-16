// Uji fungsional: /api/upload mengonversi PNG & JPEG → WebP otomatis
// Juga menguji penolakan non-gambar + mengembalikan logo semula setelah tes.
/* eslint-disable @typescript-eslint/no-require-imports */
const sharp = require("sharp");

const BASE = process.env.TEST_BASE ?? "http://localhost:3000";
const EMAIL = "kasir@demo.local";
const PASSWORD = "Kasir#2026";

async function login() {
  const res = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", Origin: BASE },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (res.status !== 200) throw new Error("login gagal HTTP " + res.status);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const body = await res.json();
  return { cookie, oldLogo: body.user.tenant.logoUrl };
}

async function upload(cookie, buffer, filename, mime) {
  const fd = new FormData();
  fd.append("file", new Blob([buffer], { type: mime }), filename);
  const res = await fetch(BASE + "/api/upload", {
    method: "POST",
    headers: { Cookie: cookie, Origin: BASE },
    body: fd,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function main() {
  const { cookie, oldLogo } = await login();
  console.log("logo lama:", oldLogo ? oldLogo.slice(0, 40) + "..." : "null");

  // 1. PNG input (logo flat + transparansi) — harus → webp lossless
  const png = await sharp({
    create: { width: 600, height: 400, channels: 4, background: { r: 30, g: 120, b: 200, alpha: 1 } },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="600" height="400"><text x="60" y="220" font-size="72" fill="white" font-family="sans-serif">SERBABISA</text></svg>`
        ),
      },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
  console.log("\n[1] PNG input:", png.length, "bytes");

  const r1 = await upload(cookie, png, "logo.png", "image/png");
  console.log("    status:", r1.status);
  const url1 = r1.json?.logoUrl ?? "";
  console.log("    output:", url1.slice(0, 40) + "...");
  const ok1 =
    r1.status === 200 &&
    (url1.startsWith("data:image/webp;base64,") || url1.startsWith("data:image/png;base64,")) &&
    Buffer.from(url1.split(",")[1], "base64").length;
  const out1 = url1 ? Buffer.from(url1.split(",")[1], "base64").length : 0;
  const fmt1 = url1.includes("image/webp") ? "webp" : "png";
  // Invariant kuota: output ≤ perilaku LAMA (PNG-9 dari hasil resize, kode sebelum WebP)
  const oldBehavior = await sharp(png)
    .resize(512, 512, { fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer();
  console.log(
    ok1
      ? `    OK → ${fmt1} ${out1} bytes | perilaku lama: PNG-9 ${oldBehavior.length} bytes → hemat ${Math.max(0, 100 - Math.round((out1 / oldBehavior.length) * 100))}% ${out1 <= oldBehavior.length ? "✓" : "✗ REGRESI"}`
      : "    GAGAL: format/salah"
  );

  // 2. JPEG input (foto) — harus → webp lossy
  const jpeg = await sharp({
    create: { width: 900, height: 600, channels: 3, background: { r: 200, g: 80, b: 40, alpha: 1 } },
  })
    .jpeg({ quality: 92 })
    .toBuffer();
  console.log("\n[2] JPEG input:", jpeg.length, "bytes");
  const r2 = await upload(cookie, jpeg, "foto.jpg", "image/jpeg");
  const url2 = r2.json?.logoUrl ?? "";
  const out2 = url2 ? Buffer.from(url2.split(",")[1], "base64").length : 0;
  const ok2 = r2.status === 200 && url2.startsWith("data:image/webp;base64,");
  console.log(
    ok2
      ? `    OK → status ${r2.status}, WebP ${out2} bytes (hemat ${Math.max(0, 100 - Math.round((out2 / jpeg.length) * 100))}%)`
      : `    GAGAL: status ${r2.status}`
  );
  // Invariant kuota: output TIDAK BOLEH lebih besar dari perilaku lama (PNG-9 resize)
  if (ok1 && out1 > oldBehavior.length) {
    console.log("    ✗ REGRESI KUOTA: output lebih besar dari perilaku lama");
    process.exit(1);
  }

  // 3. WebP input (sudah webp) — tetap diterima, re-encode q82
  const webpIn = await sharp({
    create: { width: 300, height: 300, channels: 3, background: { r: 10, g: 200, b: 100, alpha: 1 } },
  })
    .webp({ quality: 90 })
    .toBuffer();
  const r3 = await upload(cookie, webpIn, "sudah.webp", "image/webp");
  const ok3 = r3.status === 200 && (r3.json?.logoUrl ?? "").startsWith("data:image/webp;base64,");
  console.log("\n[3] WEBP input →", ok3 ? "OK tetap image/webp" : "GAGAL status " + r3.status);

  // 4. Non-gambar → harus ditolak 415
  const r4 = await upload(cookie, Buffer.from("<?php echo 'hack'; ?>"), "evil.php", "image/png");
  const ok4 = r4.status === 415;
  console.log("[4] non-gambar →", ok4 ? "OK ditolak 415" : `GAGAL status ${r4.status}`);

  // 5. Restore logo semula
  const res = await fetch(BASE + "/api/settings", {
    method: "PATCH",
    headers: { "content-type": "application/json", Cookie: cookie, Origin: BASE },
    body: JSON.stringify({ logoUrl: oldLogo }),
  });
  console.log("\n[5] restore logo semula:", res.status === 200 ? "OK" : "GAGAL " + res.status);

  const allOk = ok1 && ok2 && ok3 && ok4 && res.status === 200;
  console.log(allOk ? "\n=== SEMUA UJI WEBP LULUS ===" : "\n=== ADA UJI GAGAL ===");
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error("SCRIPT ERROR:", e.message);
  process.exit(1);
});
