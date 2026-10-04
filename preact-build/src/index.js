// Entry point bundled by esbuild into ../shared/webgeods-preact.js —
// see build.sh. Exposes one global, window.WebGeoDS.Preact, with a
// mount() that renders a named page component into an element, so a
// Quarto page needs only a placeholder <div> and one line of script:
//
//   <div id="sc-root"></div>
//   <script src="/webgeods-preact.js"></script>
//   <script>
//   document.addEventListener("DOMContentLoaded", () =>
//     WebGeoDS.Preact.mount("spatial-classifier-tool", "#sc-root"));
//   </script>
//
// Page components live in src/pages/ and are registered in PAGES below.
// Everything else the components need from the site (WebGeoDS.Map,
// CodeCell, Upload, Table, renderVegaChart...) is the existing shared/
// JavaScript, read from window.WebGeoDS at runtime, not bundled here.
import { h, render } from "preact";
import { SelfTest } from "./pages/SelfTest.js";

const PAGES = {
  // Used only by verify-bundle.mjs: exercises state, effects and a
  // portal, the three things every real page component relies on.
  "self-test": SelfTest
};

function mount(name, target, props = {}) {

  const element =
    typeof target === "string" ? document.querySelector(target) : target;

  if (!element) {
    throw new Error(`WebGeoDS.Preact.mount: no element matches ${target}.`);
  }

  const Page = PAGES[name];

  if (!Page) {
    throw new Error(
      `WebGeoDS.Preact.mount: unknown page "${name}" (known: ${Object.keys(PAGES).join(", ")}).`
    );
  }

  render(h(Page, props), element);

  // Returned so a caller (or a test) can tear the page down cleanly.
  return () => render(null, element);

}

window.WebGeoDS = window.WebGeoDS || {};

window.WebGeoDS.Preact = {
  mount,
  pages: Object.keys(PAGES)
};
