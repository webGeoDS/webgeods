// Layout pieces matching WebGeoDS.Dashboard's DOM (shared/dashboard-dom.js),
// so a migrated tool looks the same: stat card, map with an optional side
// panel, legend, tabs, and Portal for article pages that place components
// between paragraphs.
import { createPortal } from "preact/compat";
import { useState } from "preact/hooks";
import { DomNode } from "./DomNode.js";

export const DEFAULT_MAP_HEIGHT = "clamp(320px, 55vh, 480px)";

export function StatCard({ rows }) {
  return <DomNode build={() => window.WebGeoDS.statCard(rows)} deps={[JSON.stringify(rows)]} />;
}

export function Legend({ items }) {
  return <DomNode build={() => window.WebGeoDS.legend(items)} deps={[JSON.stringify(items)]} />;
}

// Map and side panel side by side, wrapping on narrow screens: same
// styles as Dashboard's layout.sidePanel (row with the spacing, side
// panel as tall as the map and scrolling vertically, muted background).
export function MapWithSidePanel({ map, side, placeholder, height = DEFAULT_MAP_HEIGHT, sideFlex = "1 1 280px", sideMinWidth = "260px", sideId }) {
  return (
    <div style="display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-start; margin-top: 20px;">
      <div style={{ flex: "2 1 480px" }}>{map}</div>
      <div id={sideId}
        style={`flex: ${sideFlex}; min-width: ${sideMinWidth}; height: ${height}; overflow-x: hidden; overflow-y: auto; border: 1px solid #d8cdb8; border-radius: 4px; background-color: var(--surface-muted);`}>
        {side ?? <div class="webgeods-sidepanel-placeholder">{placeholder ?? "Results appear here after you run Compute."}</div>}
      </div>
    </div>
  );
}

// Minimal tabs, styled with the classes Quarto's own panel-tabset uses
// (Bootstrap nav-tabs), so they look like the tabsets elsewhere on the
// page. All panes stay mounted (a table keeps its scroll position).
export function Tabs({ tabs }) {
  const [active, setActive] = useState(0);
  return (
    <div class="panel-tabset">
      <ul class="nav nav-tabs" role="tablist">
        {tabs.map((tab, i) => (
          <li class="nav-item" role="presentation">
            <button type="button" role="tab" aria-selected={i === active}
              class={`nav-link${i === active ? " active" : ""}`} onClick={() => setActive(i)}>{tab.label}</button>
          </li>
        ))}
      </ul>
      <div class="tab-content">
        {tabs.map((tab, i) => (
          <div role="tabpanel" class={`tab-pane${i === active ? " active show" : ""}`} style={i === active ? "" : "display: none;"}>
            {tab.content}
          </div>
        ))}
      </div>
    </div>
  );
}

// Renders children into an element elsewhere on the page (an empty
// `::: {#slot}` div in the article's Markdown). One component tree, one
// state, many places in the prose.
export function Portal({ target, children }) {
  const element = typeof target === "string" ? document.querySelector(target) : target;
  if (!element) {
    console.error(`WebGeoDS.Preact Portal: no element matches ${target}.`);
    return null;
  }
  return createPortal(children, element);
}
