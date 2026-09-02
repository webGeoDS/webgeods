import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto("http://127.0.0.1:8918/display-test-tmp.html", { waitUntil: "load" });
await page.waitForTimeout(2000);
const divCount = await page.evaluate(() => document.querySelectorAll("div").length);
const redDiv = await page.evaluate(() => {
  const d = [...document.querySelectorAll("div")].find(d => d.textContent.includes("hello from display()"));
  return d ? d.outerHTML : null;
});
console.log("red div found:", redDiv);
const cellOutputHtml = await page.evaluate(() => {
  const cells = document.querySelectorAll(".cell-output-display");
  return [...cells].map(c => c.innerHTML.slice(0, 500));
});
console.log("cell outputs:", JSON.stringify(cellOutputHtml, null, 2));
const bodyText = await page.evaluate(() => document.body.innerText);
console.log("contains 'bar':", bodyText.includes("bar"));
await browser.close();
