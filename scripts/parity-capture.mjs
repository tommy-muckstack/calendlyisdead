#!/usr/bin/env node
import { parseArgs } from "node:util";
import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const { values } = parseArgs({ options: {
  help: { type: "boolean" },
  url: { type: "string" },
  label: { type: "string" },
  phase: { type: "string" },
  out: { type: "string", default: ".data/parity-captures" },
  executable: { type: "string" },
  ready: { type: "string" },
} });

if (values.help) {
  console.log(`Capture initial-page evidence at 1440x1000 and 390x844.

node scripts/parity-capture.mjs --url https://calendly.com/login --label login --phase original
node scripts/parity-capture.mjs --url http://localhost:3000/login --label login --phase before

Required: --url, --label (letters/digits/dashes), --phase (original|before|after)
Optional: --out DIR, --executable CHROMIUM_PATH, --ready CSS_SELECTOR

Install the project's Playwright browser with npx playwright install chromium if needed.
Captures include full-page PNG, viewport PNG, accessibility snapshot, computed styles,
keyboard focus samples and request/console failures. Each width uses a fresh context.
Animations are disabled for screenshots; animation behavior needs a separate check.
No accounts are created, forms submitted or persistent browser sessions read.
This only captures initial page state. Menus, dialogs and complete flows need interactive QA.
Raw output stays in ignored .data by default. Review/redact before publishing evidence.
Existing capture directories are never overwritten.`);
  process.exit(0);
}

if (!values.url || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.label ?? "") ||
    !["original", "before", "after"].includes(values.phase)) {
  throw new Error("Provide --url, --label and --phase; see --help.");
}
const target = new URL(values.url);
if (!["http:", "https:"].includes(target.protocol) || target.username || target.password) {
  throw new Error("Use an HTTP(S) URL without credentials.");
}
const captureDir = path.resolve(values.out, `${values.label}-${values.phase}`);
try {
  await access(captureDir);
  throw new Error(`Capture already exists: ${captureDir}. Choose a different --out directory.`);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const browser = await chromium.launch({ headless: true, ...(values.executable ? { executablePath: values.executable } : {}) });
const manifest = {
  capturedAt: new Date().toISOString(), browser: browser.version(),
  requestedUrl: target.href, label: values.label, phase: values.phase,
  readySelector: values.ready ?? null, screenshotAnimations: "disabled", captures: [],
};
try {
  await mkdir(captureDir, { recursive: true });
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, locale: "en-US", timezoneId: "America/New_York" });
    try {
      const page = await context.newPage();
      const failures = [];
      page.on("pageerror", error => failures.push({ type: "pageerror", message: error.message }));
      page.on("console", message => {
        if (message.type() === "error") failures.push({ type: "console", message: message.text() });
      });
      page.on("requestfailed", request => failures.push({ type: "request", url: request.url(), message: request.failure()?.errorText }));
      const response = await page.goto(target.href, { waitUntil: "load", timeout: 45000 });
      if (values.ready) await page.locator(values.ready).waitFor({ state: "visible", timeout: 15000 });
      const fontsLoaded = await page.evaluate(() => Promise.race([
        document.fonts.ready.then(() => true),
        new Promise(resolve => setTimeout(() => resolve(false), 10000)),
      ]));
      const prefix = String(viewport.width);
      await page.screenshot({ path: path.join(captureDir, `${prefix}-viewport.png`), animations: "disabled" });
      await page.screenshot({ path: path.join(captureDir, `${prefix}-full.png`), fullPage: true, animations: "disabled" });
      await writeFile(path.join(captureDir, `${prefix}-accessibility.txt`), await page.locator("body").ariaSnapshot());
      const styles = await page.evaluate(() => {
        const properties = ["font-family", "font-size", "font-weight", "line-height", "letter-spacing", "color", "background-color",
          "display", "gap", "padding", "margin", "border", "border-radius", "box-shadow", "outline", "width", "height"];
        return [...document.querySelectorAll("header,nav,main,section,footer,h1,h2,h3,p,a,button,label,input,select,textarea,[role=dialog]")]
          .filter(element => element.getClientRects().length && getComputedStyle(element).visibility !== "hidden")
          .map(element => {
            const computed = getComputedStyle(element), rect = element.getBoundingClientRect();
            return {
              tag: element.tagName.toLowerCase(), id: element.id,
              role: element.getAttribute("role"), ariaLabel: element.getAttribute("aria-label"),
              // Never extract form values, hidden input fields or application state.
              text: ["INPUT", "SELECT", "TEXTAREA"].includes(element.tagName) || element.children.length > 0
                ? null : element.textContent?.trim().slice(0, 160),
              rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
              styles: Object.fromEntries(properties.map(property => [property, computed.getPropertyValue(property)])),
            };
          });
      });
      const dimensions = await page.evaluate(() => ({ viewportWidth: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
      const focus = [];
      for (let step = 0; step < 20; step++) {
        await page.keyboard.press("Tab");
        focus.push(await page.evaluate(() => {
          const element = document.activeElement, computed = getComputedStyle(element);
          return { tag: element.tagName.toLowerCase(), id: element.id, label: element.getAttribute("aria-label"),
            text: element.matches("input,select,textarea") ? null : element.textContent?.trim().slice(0, 100),
            outline: computed.outline, boxShadow: computed.boxShadow };
        }));
      }
      const evidence = { viewport, finalUrl: page.url(), status: response?.status(), title: await page.title(), fontsLoaded,
        dimensions, styles, keyboardFocusSamples: focus, failures };
      await writeFile(path.join(captureDir, `${prefix}-evidence.json`), JSON.stringify(evidence, null, 2) + "\n");
      manifest.captures.push({ width: viewport.width, height: viewport.height, status: evidence.status, fontsLoaded, failures: failures.length });
      console.log(`${values.label}/${values.phase}: ${viewport.width}px captured (HTTP ${evidence.status}, ${failures.length} failures).`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  await writeFile(path.join(captureDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
}
