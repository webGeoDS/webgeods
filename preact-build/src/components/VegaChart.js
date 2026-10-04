// Controlled Vega-Lite chart over WebGeoDS.renderVegaChart
// (shared/vega-chart.js): `selected` drives the chart's external param,
// a click inside the chart is reported through onSelect. Re-rendered
// when the spec changes and after a window resize (Vega-Lite measures
// its container once; see useResizeTick).
//
// spec: a Vega-Lite spec, or null to show nothing.
import { useEffect, useRef } from "preact/hooks";
import { useResizeTick } from "../hooks/useResizeTick.js";

export function VegaChart({ spec, selectParams, externalParam, keyField, selected, onSelect }) {

  const container = useRef(null);
  const chart = useRef(null);
  const latest = useRef({});
  latest.current = { selected, onSelect };
  const resizeTick = useResizeTick();

  useEffect(() => {

    let alive = true;

    if (!spec) {
      container.current.replaceChildren();
      return undefined;
    }

    window.WebGeoDS.renderVegaChart(container.current, spec, {
      selectParams,
      externalParam,
      keyField,
      onSelect: (key) => latest.current.onSelect?.(key)
    }).then((rendered) => {
      if (!alive) {
        rendered.destroy();
        return;
      }
      chart.current = rendered;
      rendered.setSelected(latest.current.selected ?? null);
    }).catch((err) => console.error("WebGeoDS.Preact VegaChart: render failed", err));

    return () => {
      alive = false;
      chart.current?.destroy();
      chart.current = null;
    };

  }, [spec, resizeTick]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    chart.current?.setSelected(selected ?? null);
  }, [selected]);

  // width: 100%, explicitly: vega-embed adds class "vega-embed" to this
  // element, which makes it inline-block, i.e. as wide as its content.
  // A spec with `width: "container"` then measures a 0px-wide box and
  // draws 0px-wide bars (found by the component test: the bar was
  // there, 0 pixels wide, so clicks landed on the panel behind it).
  return <div ref={container} style={{ width: "100%" }} />;

}
