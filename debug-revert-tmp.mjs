import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("http://127.0.0.1:8917/posts/topology-fix.html", { waitUntil: "load" });
await page.waitForTimeout(8000);
const ok = await page.evaluate(() => !!window.__sharedTopologyMap);
console.log(ok ? "SUCCESS" : "FAILED");
await browser.close();
