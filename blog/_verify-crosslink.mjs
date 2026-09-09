import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("http://127.0.0.1:4448/posts/geometry-validity.html", { waitUntil: "domcontentloaded" });
await page.locator('a:has-text("strumento standalone")').click();
await page.waitForLoadState("domcontentloaded");
console.log("Landed on:", page.url());
await browser.close();
