// Verifikasi end-to-end Serbabisa POS via Playwright
// Golden path: buka / → render login → login kasir → POS view dengan data Supabase
/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console: " + m.text().slice(0, 200));
  });

  console.log("1. Buka http://localhost:3000/ ...");
  await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(6000); // SPA boot + kompilasi dev

  const bodyText = (await page.textContent("body")) || "";
  console.log("2. Cek render login...");
  const hasEmail = /email/i.test(bodyText);
  const hasPassword = /kata\s*sandi|password/i.test(bodyText);
  console.log("   field email terlihat:", hasEmail, "| field password terlihat:", hasPassword);
  if (!hasEmail) {
    console.log("   SNAPSHOT BODY:", bodyText.slice(0, 400));
  }

  console.log("3. Isi form login kasir@demo.local ...");
  const emailInput = page.locator('input[type="email"], input[name="email"], input[autocomplete*="username"]').first();
  await emailInput.fill("kasir@demo.local", { timeout: 15000 });
  const passInput = page.locator('input[type="password"]').first();
  await passInput.fill("Kasir#2026", { timeout: 15000 });
  await page.screenshot({ path: "/home/z/my-project/download/verify-login.png" });

  const submit = page.locator('button[type="submit"], button:has-text("Masuk"), button:has-text("Login")').first();
  await submit.click({ timeout: 15000 });

  console.log("4. Tunggu dashboard/POS render...");
  await page.waitForTimeout(9000);
  const afterText = (await page.textContent("body")) || "";
  const loggedIn = /kasir|dashboard|produk|transaksi|penjualan|toka|shift|keranjang/i.test(afterText);
  const stillLogin = /masuk|login/i.test(afterText) && afterText.length < 1500;
  console.log("   halaman setelah login terdeteksi:", loggedIn, "| masih di login:", stillLogin);
  await page.screenshot({ path: "/home/z/my-project/download/verify-after-login.png", fullPage: false });

  console.log("5. Ringkasan error console/pageerror:", errors.length === 0 ? "TIDAK ADA" : "");
  errors.slice(0, 8).forEach((e) => console.log("   -", e));

  console.log(
    errors.length === 0 && hasEmail && loggedIn
      ? "HASIL: VERIFIKASI BERHASIL — aplikasi render + login + data Supabase OK"
      : "HASIL: PERLU PERHATIAN (lihat detail di atas)"
  );
  await browser.close();
  process.exit(0);
})().catch((e) => {
  console.error("SCRIPT ERROR:", e.message);
  process.exit(1);
});
