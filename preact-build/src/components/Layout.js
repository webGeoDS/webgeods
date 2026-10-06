// Layout pieces: stat card, legend, map with an optional side panel,
// tabs, and Portal for article pages that place components between
// paragraphs. Classes from shared/styles.css.
import { createPortal } from "preact/compat";
import { useState } from "preact/hooks";

export const DEFAULT_MAP_HEIGHT = "clamp(320px, 55vh, 480px)";

// rows: [[label, value], ...], conditional rows already filtered out.
export function StatCard({ rows }) {
  return (
    <div class="webgeods-stat-grid">
      {rows.map(([label, value]) => (
        <>
          <div class="webgeods-stat-label">{label}</div>
          <div class="webgeods-stat-value">{value}</div>
        </>
      ))}
    </div>
  );
}

// items: [{ color, label, outline?, shape? }, ...] for discrete swatches,
// or { gradient: [[t, r, g, b], ...], minLabel, maxLabel } for a
// continuous bar (the colorRamp format setRasterImage() takes). Empty
// or null: the legend is hidden, not drawn empty.
// options.swatchWidth: px, default 24 (Buffer & Proximity uses 32).
//   outline: true/"dashed" draws a hollow swatch, for an entry about a
//   drawing style rather than a category; shape: "circle" a round one,
//   for how points are drawn.
export function Legend({ items, options = {} }) {
  const swatchWidth = options.swatchWidth ?? 24;
  const isGradient = items && !Array.isArray(items) && items.gradient;
  if (!items || (!isGradient && items.length === 0)) return <div class="webgeods-legend" hidden />;
  if (isGradient) {
    const stops = items.gradient.map(([t, r, g, b]) => `rgb(${r},${g},${b}) ${t * 100}%`).join(", ");
    return (
      <div class="webgeods-legend" style={{ flexWrap: "wrap", rowGap: "8px" }}>
        <span class="webgeods-legend-label">{items.minLabel ?? ""}</span>
        <div class="webgeods-legend-bar" style={{ background: `linear-gradient(to right, ${stops})` }} />
        <span class="webgeods-legend-label">{items.maxLabel ?? ""}</span>
      </div>
    );
  }
  return (
    <div class="webgeods-legend" style={{ flexWrap: "wrap", rowGap: "8px" }}>
      {items.map(({ color, label, outline, shape }) => {
        const circle = shape === "circle";
        const swatch = { flex: circle ? "0 0 14px" : `0 0 ${swatchWidth}px`, ...(circle ? { borderRadius: "50%" } : {}),
          ...(outline ? { background: "transparent", border: `2px ${outline === "dashed" ? "dashed" : "solid"} ${color}` } : { background: color }) };
        // Swatch and label in one flex item, so a wrap never separates them.
        return (
          <div style="display: inline-flex; align-items: center; gap: 12px; flex: 0 0 auto;">
            <div class="webgeods-legend-bar" style={swatch} />
            <span class="webgeods-legend-label">{label}</span>
          </div>
        );
      })}
    </div>
  );
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
