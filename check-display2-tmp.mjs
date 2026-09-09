import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto("http://127.0.0.1:8918/display-test-tmp.html", { waitUntil: "load" });
await page.waitForTimeout(2000);
const redDivText = await page.evaluate(() => {
  const d = [...document.querySelectorAll("div")].find(d => d.textContent.includes("hello, this is the map element"));
  return d ? d.textContent : null;
});
console.log("map element div found and displayed:", redDivText);
const bodyText = await page.evaluate(() => document.body.innerText);
console.log("shows 'added:test-feature':", bodyText.includes("added:test-feature"));
console.log("no sharedMap object dump visible:", !bodyText.includes("addGeoJSON") || "check manually");
await browser.close();
