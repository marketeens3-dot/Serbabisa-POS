// Pulihkan data Demo Store yang terhapus akibat bug schema + verifikasi hasilnya
const BASE = "http://localhost:3000";

async function login() {
  const res = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", Origin: BASE },
    body: JSON.stringify({ email: "kasir@demo.local", password: process.env.DEMO_KASIR_PASSWORD ?? "" }),
  });
  if (res.status !== 200) throw new Error("login gagal " + res.status);
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function main() {
  const cookie = await login();
  // PATCH parsial: HANYA phone + whatsappNumber — dengan fix, logo & lainnya tidak tersentuh
  const res = await fetch(BASE + "/api/settings", {
    method: "PATCH",
    headers: { "content-type": "application/json", Cookie: cookie, Origin: BASE },
    body: JSON.stringify({ phone: "08123456000", whatsappNumber: "08123456000" }),
  });
  const body = await res.json();
  console.log("status:", res.status);
  console.log("tenant setelah restore:", JSON.stringify({
    businessName: body.tenant?.businessName,
    phone: body.tenant?.phone,
    whatsappNumber: body.tenant?.whatsappNumber,
    address: body.tenant?.address,
    logoUrl: body.tenant?.logoUrl === null ? null : "(ada)",
  }));
  const ok =
    res.status === 200 &&
    body.tenant?.phone === "628123456000" &&
    body.tenant?.whatsappNumber === "628123456000" &&
    body.tenant?.address === "Jl. Contoh Alamat No. 1, Jakarta" &&
    body.tenant?.logoUrl === null;
  console.log(ok ? "RESTORE + VERIFIKASI: OK — data utuh, hanya field yang dikirim berubah" : "PERIKSA: ada yang tidak sesuai");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
