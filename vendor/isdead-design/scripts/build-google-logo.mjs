// Regenerates src/google.tsx's GOOGLE_G_SVG constant from assets/google/google-g.svg (the official logo, cropped from Google's asset bundle).
import fs from "node:fs";
const root = new URL("..", import.meta.url).pathname;
const svg = fs.readFileSync(`${root}assets/google/google-g.svg`, "utf8").trim();
const f = `${root}src/google.tsx`;
fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace(/export const GOOGLE_G_SVG = `[\s\S]*?`;/, () => `export const GOOGLE_G_SVG = \`${svg}\`;`));
console.log("updated GOOGLE_G_SVG", svg.length);
