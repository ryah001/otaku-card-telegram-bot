import { chromium } from "playwright";

const baseURL = process.env.RENDERER_URL || "http://127.0.0.1:4173/renderer.html";
const outputPath = process.env.RENDER_OUTPUT || "/tmp/otaku-card-render.png";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 580 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseURL, { waitUntil: "networkidle", timeout: 45000 });
  await page.evaluate(() => document.fonts.ready);
  const card = page.locator(".card-artboard");
  await card.waitFor({ state: "visible", timeout: 15000 });
  const box = await card.boundingBox();
  if (!box || Math.round(box.width) !== 957 || Math.round(box.height) !== 536) {
    throw new Error(`Unexpected card dimensions: ${JSON.stringify(box)}`);
  }
  if (errors.length) throw new Error(`Browser errors: ${errors.join("; ")}`);
  await card.screenshot({ path: outputPath, type: "png", animations: "disabled" });
  console.log(`Official OtakuCard component rendered: ${outputPath} (${Math.round(box.width)}x${Math.round(box.height)})`);
} finally {
  await browser.close();
}
