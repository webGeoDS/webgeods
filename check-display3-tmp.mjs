import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("http://127.0.0.1:8918/display-test-tmp.html", { waitUntil: "load" });
await page.waitForTimeout(2000);
const outputs = await page.evaluate(() => {
  return [...document.querySelectorAll(".cell")].map(cell => {
    const src = cell.querySelector(".sourceCode")?.innerText.slice(0, 60);
    const outDiv = cell.querySelector(".cell-output-display");
    return { src, hasOutputDiv: !!outDiv, outputText: outDiv?.innerText?.trim() };
  });
});
console.log(JSON.stringify(outputs, null, 2));
await browser.close();
