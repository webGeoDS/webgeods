// Interactive parts of the article blog/posts/buffer-proximity.qmd,
// around its Python and R cells (which the reader runs). An ArticleLab
// config with the standard slots.
//
// The map shows Python's result only: both languages draw the same
// shapes in the same places (they differ in area by a few m², which the
// cards show and the map couldn't), so a second layer would only hide
// the first.
import { ArticleLab } from "../components/ArticleLab.js";

const BUFFER_PAINT = { "fill-color": "#42583c", "fill-opacity": 0.35, "fill-outline-color": "#2a2117" };

const FAMILIES = {
  point: ["Point", "MultiPoint"],
  line: ["LineString", "MultiLineString"],
  polygon: ["Polygon", "MultiPolygon"]
};

// One map layer draws one geometry type, and the built-in fallback
// mixes all three on purpose: one layer per family, so none is dropped.
function originalLayers(collection) {
  return Object.entries(FAMILIES).map(([family, types]) => {
    const features = collection.features.filter((f) => types.includes(f.geometry.type));
    return {
      id: `buffer-proximity-py-original-${family}`,
      data: features.length ? { type: "FeatureCollection", features } : null
    };
  });
}

const CONFIG = {
  cells: { py: "buffer-proximity-py", r: "buffer-proximity-r" },
  map: {
    center: [12.47, 41.9], zoom: 12, mode: "py",
    layers: (result) => [
      ...originalLayers(result.originalFeatures),
      { id: "buffer-proximity-py", type: "fill", data: result.features, paint: BUFFER_PAINT }
    ],
    fit: (result) => result.features
  },
  stats: (s) => {
    if (!s) return [["Calculation CRS", "—"]];
    return [
      ["Calculation CRS", s.calculationCrs],
      ...(s.excludedCount > 0 ? [["Excluded from buffering", `${s.excludedCount} (too far from the calculation UTM zone to project)`]] : []),
      ["Input geometry", s.geometryTypes.join(", ")],
      ["Buffer geometry", s.bufferGeometryTypes.join(", ")],
      ["Buffer areas (m²)", s.bufferAreas.join(", ")]
    ];
  }
};

export const BufferProximityLab = () => <ArticleLab config={CONFIG} />;
