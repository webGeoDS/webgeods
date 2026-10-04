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
import * as hooks from "preact/hooks";
import { SelfTest } from "./pages/SelfTest.js";
import { SpatialClassifierTool } from "./pages/SpatialClassifierTool.js";
import { SpatialClassificationLab } from "./pages/SpatialClassificationLab.js";
import { NetworkFromLinesTool } from "./pages/NetworkFromLinesTool.js";
import { NetworkFromLinesLab } from "./pages/NetworkFromLinesLab.js";
import { DomNode } from "./components/DomNode.js";
import { MapView } from "./components/MapView.js";
import { DataTable, featureRows, featureKey } from "./components/DataTable.js";
import { VegaChart } from "./components/VegaChart.js";
import { ForceGraph } from "./components/ForceGraph.js";
import { ToolDashboard } from "./components/ToolDashboard.js";
import { ControlPanel, SelectInput, SliderInput, ComputeButton } from "./components/ControlPanel.js";
import { StatCard, Legend, MapWithSidePanel, Tabs, Portal, DEFAULT_MAP_HEIGHT } from "./components/Layout.js";
import { useCellRunner, findCell } from "./hooks/useCellRunner.js";
import { useToolData } from "./hooks/useToolData.js";
import { useCellValue } from "./hooks/useCellValue.js";
import { useResizeTick } from "./hooks/useResizeTick.js";

const PAGES = {
  // Used only by verify-bundle.mjs: exercises state, effects and a
  // portal, the three things every real page component relies on.
  "self-test": SelfTest,
  "spatial-classifier-tool": SpatialClassifierTool,
  "spatial-classification-lab": SpatialClassificationLab,
  "network-from-lines-tool": NetworkFromLinesTool,
  "network-from-lines-lab": NetworkFromLinesLab
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
  pages: Object.keys(PAGES),
  // The building blocks, for component tests and for debugging from the
  // console; pages themselves import them directly.
  lib: {
    h, render, hooks,
    DomNode, MapView, DataTable, featureRows, featureKey, VegaChart, ForceGraph, ToolDashboard,
    ControlPanel, SelectInput, SliderInput, ComputeButton,
    StatCard, Legend, MapWithSidePanel, Tabs, Portal, DEFAULT_MAP_HEIGHT,
    useCellRunner, findCell, useToolData, useCellValue, useResizeTick
  }
};
