// GeoSpatial File Inspector (blog/tools/geospatial-file-inspector.qmd):
// the interactive layer around the page's hidden Python cells, which
// summarize an uploaded file. A ToolDashboard config with no compute
// step: the summary, the map and a chart per attribute column all come
// from the inspection.
import { ToolDashboard } from "../components/ToolDashboard.js";

const VALID = "#2ea44f";
const INVALID = "#e05252";
const byValidity = ["case", ["==", ["get", "valid"], true], VALID, INVALID];
const EMPTY_STATS = [["Features", "0"], ["—", "Upload a file or load the example above"]];

// Chart labels stay short whatever the data's own category names or bin
// edges; the tooltip has the full value.
const truncateLabel = (text, max = 12) => {
  const str = String(text);
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
};

/** @type {import("../components/ToolDashboard.js").ToolConfig} */
const CONFIG = {
  tool: "geospatial-file-inspector",
  // 20 parcels plus one exact duplicate and one self-intersecting
  // "bowtie", one missing population, a low-cardinality column (zone)
  // and a unique one (name): every stat and every kind of column chart
  // has something to show.
  example: "/examples/file-inspector-parcels.geojson",
  cells: { inspect: "inspect-py", exportShp: "inspect-export-shp-py" },
  exampleStatus: "✓ example data loaded — browse a chart per attribute column in the side panel.",
  fit: { inspect: (v) => v.mapFeatures },

  // A self-intersecting polygon fills to zero area in MapLibre: the
  // outline layer is what shows it.
  layers: ({ inspect }) => [
    { id: "inspect-py", label: "Features", type: "fill", data: inspect?.mapFeatures ?? null,
      paint: { "fill-color": byValidity, "fill-opacity": 0.55 } },
    { id: "inspect-py-outline", type: "line", data: inspect ? window.WebGeoDS.toOutlineFeatures(inspect.mapFeatures) : null,
      paint: { "line-color": byValidity, "line-width": 2.5 } }
  ],

  side: {
    id: "gfi-column-chart",
    placeholder: "A chart per attribute column appears here after you upload a file or load the example.",
    panels: [{ kind: "chart", spec: ({ inspect }) => columnChartSpec(inspect) }]
  },

  stats: {
    empty: EMPTY_STATS,
    inspect: ({ summary: s }) => {
      if (!s || s.total === 0) return EMPTY_STATS;
      const geometry = s.geometryTypes.length > 1 ? `Mixed (${s.geometryTypes.join(", ")})` : (s.geometryTypes[0] ?? "—");
      return [
        ["Features", s.total.toLocaleString()],
        ["Geometry", geometry],
        ["CRS", s.crsWarning ? `${s.crs} ⚠️ ${s.crsWarning}` : (s.crs ?? "Unknown")],
        ["Bounds", s.bounds ? s.bounds.join(", ") : "—"],
        ["Attributes", `${s.attributeNames.length}${s.attributeNames.length > 0 ? ` (${s.attributeNames.join(", ")})` : ""}`],
        ["Invalid", String(s.invalid)],
        ["Empty", String(s.empty)],
        ["Duplicates", String(s.duplicates)]
      ];
    }
  },
  legend: ({ inspect }) => (inspect?.summary?.total > 0 ? [{ color: VALID, label: "Valid" }, { color: INVALID, label: "Invalid" }] : null),

  download: {
    after: "inspect",
    enabled: ({ inspect }) => inspect?.summary?.total > 0,
    getFeatures: (inspect) => inspect.features,
    filenameSuffix: "-inspected.geojson",
    defaultFilename: "inspected.geojson",
    shapefile: { filenameSuffix: "-inspected.zip", defaultFilename: "inspected-shapefile.zip" }
  }
};

// One Vega-Lite spec for every column; its own "Column" select (a
// Vega param bound to an input) picks which one shows. A column that
// can't be charted (empty, constant, too many distinct values) shows a
// one-line note instead.
function columnChartSpec(inspect) {
  const profiles = inspect?.summary?.total > 0 ? (inspect.columnProfiles ?? []) : [];
  if (profiles.length === 0) return null;

  const notes = {
    empty: () => "No data in this column.",
    constant: (p) => `Every value is "${p.value}".`,
    highCardinality: (p) => `${p.distinctCount} distinct values — too many for a readable chart.`
  };
  const rows = profiles.flatMap((profile) => {
    const column = profile.name;
    if (notes[profile.kind]) return [{ column, type: "note", message: notes[profile.kind](profile) }];
    if (profile.kind === "numeric") {
      return profile.counts.map((count, j) => {
        const [from, to] = [profile.binEdges[j], profile.binEdges[j + 1]];
        const whole = (n) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
        return { column, type: "bar", bin: truncateLabel(`${whole(from)}–${whole(to)}`), binFull: `${from.toLocaleString()}–${to.toLocaleString()}`, count, order: j };
      });
    }
    return profile.categories.map((category, j) => ({
      column, type: "bar", bin: truncateLabel(category), binFull: category, count: profile.counts[j], order: j
    }));
  });

  const maxRows = Math.max(1, ...profiles.map((p) => (p.kind === "numeric" ? p.counts.length : p.kind === "categorical" ? p.categories.length : 1)));
  const noteColor = getComputedStyle(document.documentElement).getPropertyValue("--etichetta").trim() || "#766851";

  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    width: "container",
    height: Math.max(140, maxRows * 26),
    autosize: { type: "fit-x", contains: "padding" },
    data: { values: rows },
    params: [{ name: "gfiColumn", value: profiles[0].name, bind: { input: "select", options: profiles.map((p) => p.name), name: "Column  " } }],
    layer: [
      {
        transform: [{ filter: "datum.column === gfiColumn && datum.type === 'bar'" }],
        mark: { type: "bar", color: "#42583c" },
        encoding: {
          y: { field: "bin", type: "nominal", sort: { field: "order" }, title: null, axis: { labelFontSize: 10 } },
          // Counts: whole-number ticks only.
          x: { field: "count", type: "quantitative", title: "Count", axis: { tickMinStep: 1, format: "d" } },
          tooltip: [{ field: "binFull", title: "Value" }, { field: "count" }]
        }
      },
      {
        transform: [{ filter: "datum.column === gfiColumn && datum.type === 'note'" }],
        mark: { type: "text", align: "center", baseline: "middle", fontSize: 12, color: noteColor },
        encoding: { x: { value: { expr: "width / 2" } }, y: { value: { expr: "height / 2" } }, text: { field: "message" } }
      }
    ]
  };
}

export const FileInspectorTool = () => <ToolDashboard config={CONFIG} />;
