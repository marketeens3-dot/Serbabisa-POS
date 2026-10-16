// Replikasi persis pipeline upload route untuk melihat ukuran webp vs png
const sharp = require("sharp");

async function main() {
  // Input sama seperti tes: PNG flat 600x400 + teks putih
  const input = await sharp({
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
  console.log("input PNG-9 600x400:", input.length, "bytes");

  const pipeline = sharp(input, { failOn: "error", limitInputPixels: 12_000_000 });
  const meta = await pipeline.metadata();
  const useLossless = meta.format === "png";
  const resized = pipeline.resize(512, 512, { fit: "inside", withoutEnlargement: true });
  const [webpOut, pngOut] = await Promise.all([
    resized.clone().webp(useLossless ? { lossless: true, effort: 5 } : { quality: 82, effort: 5 }).toBuffer(),
    resized.clone().png({ compressionLevel: 9 }).toBuffer(),
  ]);
  console.log("setelah resize:", meta.width + "x" + meta.height, "→ 512 x", Math.round((400 / 600) * 512));
  console.log("webp lossless :", webpOut.length, "bytes");
  console.log("png level-9   :", pngOut.length, "bytes");
  console.log("pilihan       :", webpOut.length <= pngOut.length ? "WEBP" : "PNG");
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
