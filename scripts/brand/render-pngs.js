// Renders the PNG app icons from the SVG logo files. Run build-logos.py first.
// Usage: node scripts/brand/render-pngs.js   (needs Playwright with Chromium)
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "../..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const jobs = [
  { svg: "icon.svg", out: "icon-192.png", size: 192 },
  { svg: "icon.svg", out: "icon-512.png", size: 512 },
  // Android crops maskable icons to its own shape; the mark sits well inside the 80% safe zone.
  { svg: "docs/brand/pennywise-mark-square.svg", out: "icon-maskable-512.png", size: 512 },
  // iOS rounds the corners itself, so the touch icon is square.
  { svg: "docs/brand/pennywise-mark-square.svg", out: "apple-touch-icon.png", size: 180 },
  { svg: "favicon.svg", out: "favicon-32.png", size: 32 },
  { svg: "docs/brand/pennywise-lockup.svg", out: "docs/brand/pennywise-lockup.png", width: 1200 },
];

(async () => {
  const browser = await chromium.launch();
  for (const job of jobs) {
    const source = read(job.svg);
    const [, , w, h] = source.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
    const width = job.width || job.size, height = job.size || Math.round(job.width * h / w);
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${width}px;height:${height}px}</style>${source}`);
    await page.screenshot({ path: path.join(root, job.out), omitBackground: true });
    await page.close();
    console.log(`wrote ${job.out} (${width}x${height})`);
  }
  await browser.close();
})();
