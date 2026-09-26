/**
 * Build ikon Windows (.ico) dari public/icon-512.png.
 *
 * Electron-builder membutuhkan build/icon.ico untuk target Windows. File .ico
 * disusun sendiri berisi beberapa ukuran (16–256) yang masing-masing berupa
 * PNG — format ini valid untuk Windows Vista ke atas dan didukung penuh oleh
 * shell/taskbar Windows.
 *
 * Paket: PNG dirakit lewat sharp (tidak perlu dependensi tambahan).
 *
 * Usage: node scripts/make-icon.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "public", "icon-512.png");
const outDir = path.join(root, "build");
const outFile = path.join(outDir, "icon.ico");

/** Ukuran yang diikutsertakan dalam .ico. */
const SIZES = [16, 24, 32, 48, 64, 128, 256];

/**
 * Susun header + direktori + payload ICO.
 * @param {Array<{size:number, data:Buffer}>} images
 */
function packIco(images) {
  const count = images.length;
  // ICONDIR: reserved(2) type(2) count(2)
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = 1 (icon)
  header.writeUInt16LE(count, 4);

  // ICONDIRENTRY (16 bytes per entri): w, h, colorCount, reserved, planes, bpp, bytesInRes, imageOffset
  const dir = Buffer.alloc(16 * count);
  let offset = header.length + dir.length;

  images.forEach((img, i) => {
    const e = 16 * i;
    dir.writeUInt8(img.size >= 256 ? 0 : img.size, e + 0); // 0 = 256
    dir.writeUInt8(img.size >= 256 ? 0 : img.size, e + 1);
    dir.writeUInt8(0, e + 2); // palet = 0 (truecolor)
    dir.writeUInt8(0, e + 3); // reserved
    dir.writeUInt16LE(1, e + 4); // color planes
    dir.writeUInt16LE(32, e + 6); // bit per pixel
    dir.writeUInt32LE(img.data.length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += img.data.length;
  });

  return Buffer.concat([header, dir, ...images.map((i) => i.data)]);
}

async function main() {
  if (!fs.existsSync(src)) {
    throw new Error(`Sumber ikon tidak ditemukan: ${src}`);
  }
  fs.mkdirSync(outDir, { recursive: true });

  const images = [];
  for (const size of SIZES) {
    const data = await sharp(src)
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    images.push({ size, data });
  }

  fs.writeFileSync(outFile, packIco(images));
  const kb = (fs.statSync(outFile).size / 1024).toFixed(1);
  console.log(`OK  ${path.relative(root, outFile)}  (${SIZES.join("/")})  ${kb} KB`);
}

main().catch((err) => {
  console.error("GAGAL membuat ikon:", err);
  process.exit(1);
});
