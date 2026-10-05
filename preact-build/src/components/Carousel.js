// One chart at a time out of several (a histogram per band, a chart per
// column), with ◀ ▶ to step through them: what the Dashboard tools'
// side-panel carousels did. items: [{ title, spec }] (Vega-Lite specs);
// back to the first one whenever the items change.
import { useEffect, useState } from "preact/hooks";
import { VegaChart } from "./VegaChart.js";

export function Carousel({ items }) {

  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [items]);

  if (!items?.length) return null;
  const current = items[Math.min(index, items.length - 1)];
  const step = (delta) => setIndex((i) => (i + delta + items.length) % items.length);

  return (
    <div style="display: flex; flex-direction: column; gap: 8px; height: 100%;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <button type="button" class="webgeods-panel-btn" data-variant="outline" aria-label="Previous chart"
          disabled={items.length < 2} onClick={() => step(-1)}>◀</button>
        <span class="webgeods-panel-status" style="flex: 1; text-align: center;">
          {current.title} ({Math.min(index, items.length - 1) + 1}/{items.length})
        </span>
        <button type="button" class="webgeods-panel-btn" data-variant="outline" aria-label="Next chart"
          disabled={items.length < 2} onClick={() => step(1)}>▶</button>
      </div>
      <div style="flex: 1 1 auto; min-height: 0;">
        {/* Not selectable: these charts describe the data, nothing to pick. */}
        <VegaChart spec={current.spec} style={{ height: "100%" }} />
      </div>
    </div>
  );

}
