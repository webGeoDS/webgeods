// How the Topology Checker tool and the topology-errors article draw a
// check's result: features red with an error, blue without (as a fill, a
// line or circles, whatever geometry the file has), gaps in ochre.

export const ERROR = "#e05252";
export const OK = "#3d5a73";
export const GAP = "#c48a2e";

const byError = ["case", ["==", ["get", "has_error"], true], ERROR, OK];

// { type, paint } for a layer of the checked features.
export function featuresStyle(collection) {
  const type = collection?.features?.find((f) => f?.geometry?.type)?.geometry?.type ?? "";
  if (/LineString/.test(type)) return { type: "line", paint: { "line-color": byError, "line-width": 4 } };
  if (/Point/.test(type)) return { type: "circle", paint: { "circle-color": byError, "circle-radius": 6 } };
  return { type: "fill", paint: { "fill-color": byError, "fill-opacity": 0.55 } };
}

export const GAP_PAINT = { "fill-color": GAP, "fill-opacity": 0.45 };

export const errorRowClass = (row) => (row.has_error === "true" ? "webgeods-row-invalid" : "");
