// The selection overlay shared by ToolDashboard and ArticleLab: the
// selected features drawn on top in the selection yellow, as a fill, a
// line or circles depending on their geometry.

export const SELECTION_YELLOW = "#ffeb3b";

const PAINT = {
  fill: { "fill-color": SELECTION_YELLOW, "fill-opacity": 0.6, "fill-outline-color": "#2a2117" },
  line: { "line-color": SELECTION_YELLOW, "line-width": 5 },
  circle: { "circle-color": SELECTION_YELLOW, "circle-radius": 8, "circle-stroke-color": "#2a2117", "circle-stroke-width": 1.5 }
};

// paint: overrides for the circle style (a tool that marks something on
// its points, say).
export function selectionLayer(id, features, paint) {
  const type = features[0]?.geometry?.type ?? "";
  const kind = /Polygon/.test(type) ? "fill" : /LineString/.test(type) ? "line" : "circle";
  return {
    id,
    type: kind,
    data: { type: "FeatureCollection", features },
    paint: kind === "circle" ? { ...PAINT.circle, ...(paint ?? {}) } : PAINT[kind]
  };
}
