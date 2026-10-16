// Local export of the user-supplied mark; no network or generated replacement artwork.
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp"; // Included by Next.js; use the installed, locked version.

const root = new URL("../", import.meta.url);
const source = await readFile(new URL("assets/brand/tombstone-source.png", root));
const color = "#006BFF";
// Use only the original alpha: this preserves the silhouette and transparent X.
const artwork = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1254" height="1254" viewBox="0 0 1254 1254"><defs><filter id="blue" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feFlood flood-color="${color}"/><feComposite in2="SourceAlpha" operator="in"/></filter></defs><image width="1254" height="1254" filter="url(#blue)" xlink:href="data:image/png;base64,${source.toString("base64")}"/></svg>`);
const render = (size) => sharp(artwork).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
const save = (path, bytes) => writeFile(new URL(`public/${path}`, root), bytes);

// An SVG container keeps the existing shared-logo URL. Its embedded bitmap is
// self-contained, so <img> and SVG favicon loads need no external subresources.
const full = await render(512);
await save("logo.svg", `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="512" height="512" viewBox="0 0 512 512"><image width="512" height="512" xlink:href="data:image/png;base64,${full.toString("base64")}"/></svg>\n`);
await save("icon-512.png", full);
await save("icon-192.png", await render(192));
await save("apple-touch-icon.png", await sharp(artwork).resize(180, 180).flatten({ background: "#ffffff" }).png({ compressionLevel: 9 }).toBuffer());

// ICO entries contain PNGs, supported by current desktop browsers and Windows.
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map(render));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
for (let i = 0; i < sizes.length; i++) {
  const entry = 6 + 16 * i;
  header[entry] = sizes[i];
  header[entry + 1] = sizes[i];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(images[i].length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += images[i].length;
}
await save("favicon.ico", Buffer.concat([header, ...images]));
console.log("Exported shared logo, 16/32/48px favicon, 180px Apple and 192/512px app icons.");
