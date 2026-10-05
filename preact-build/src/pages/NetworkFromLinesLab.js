// Interactive parts of the article blog/posts/network-from-lines.qmd,
// around its Python and R cells (which the reader runs). An ArticleLab
// config: the standard slots plus #lab-graphs, the graph at 0 m and at
// 5 m as two force diagrams.
//
// Map and diagrams show the language that ran last: Python and R build
// the same graph, so a second run only redraws the same picture.
import { ArticleLab, SideBySide, LabeledBox } from "../components/ArticleLab.js";
import { ForceGraph } from "../components/ForceGraph.js";

const LINE_PAINT = { "line-color": "#3d5a73", "line-width": 3 };

// One color per connected component, so "how many colors" answers "how
// many pieces" (same palette as the standalone tool).
const componentColor = (f) =>
  window.WebGeoDS.DEFAULT_PALETTE[(f.properties.component ?? 0) % window.WebGeoDS.DEFAULT_PALETTE.length];

const CONFIG = {
  cells: { py: "network-from-lines-py", r: "network-from-lines-r" },
  upload: { languages: ["python", "r"] },
  map: {
    center: [12.49, 41.905], zoom: 13, mode: "latest",
    layers: (value) => [{ id: "network-from-lines-map", type: "line", data: value.features, paint: LINE_PAINT }],
    fit: (value) => value.features
  },
  stats: (s) => {
    if (!s) return [["Calculation CRS", "—"]];
    const triple = (g) => `${g.nodes} / ${g.edges} / ${g.components}`;
    return [
      ["Calculation CRS", s.calculationCrs],
      ["At 0m — nodes / edges / components", triple(s.at0m)],
      ["At 5m — nodes / edges / components", triple(s.at5m)]
    ];
  },
  slots: {
    "#lab-graphs": ({ latest }) => (
      <SideBySide>
        {[["Graph at 0m", latest?.at0m], ["Graph at 5m", latest?.at5m]].map(([label, graph]) => (
          <LabeledBox label={label}>
            <div style="height: 220px; border: 1px solid #d8cdb8; border-radius: 4px;">
              <ForceGraph nodes={graph?.nodeFeatures ?? null} links={graph?.edgeFeatures ?? null}
                nodeColor={componentColor} linkColor={componentColor} />
            </div>
          </LabeledBox>
        ))}
      </SideBySide>
    )
  }
};

export const NetworkFromLinesLab = () => <ArticleLab config={CONFIG} />;
