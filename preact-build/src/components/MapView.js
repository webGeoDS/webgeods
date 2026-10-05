// Declarative wrapper around WebGeoDS.Map: the page describes WHAT is on
// the map, this component works out the setGeoJSON calls.
//
// layers: [{ id, data, type, paint, onClick }] in drawing order, bottom
// first. On every change a layer whose data or paint changed is pushed
// with setGeoJSON (creates or updates, and re-applies paint on an
// existing layer: shared/map.js setGeoJSON()), a layer no longer listed
// is emptied, and all listed layers are re-stacked in array order.
// MapLibre puts every NEW layer on top, so without that a layer created
// later (the class grid after the inspect points, say) would cover the
// ones listed after it.
//
// A raster layer is { id, type: "raster", raster, render } instead:
// `raster` is what WebGeoDS.Map's raster methods take (shared/
// map-raster.js) and `render` picks one: "ramp" (default,
// setRasterImage: { bounds, width, height, values, min, max, colorRamp }),
// "rgb" (setRasterRGBImage: red/green/blue channels) or "bicolor"
// (setRasterBicolorImage: channelA/channelB). Pushed again when the
// `raster` object changes, removed when the layer is no longer listed
// or its raster is null; stacked and switched on/off like any other.
//
// label: a layer that has one gets an on/off checkbox in a box over the
// map's top-left corner, shown once two or more labeled layers have
// data. Hidden layers keep their data and come back as they were.
// startHidden: the layer starts switched off, the first time it appears.
//
// fitTo: a FeatureCollection to zoom to whenever a new one is passed.
// onReady(map): the WebGeoDS.Map instance, for anything not expressible
// as a layer.
import { createPortal } from "preact/compat";
import { useEffect, useRef, useState } from "preact/hooks";

const EMPTY = { type: "FeatureCollection", features: [] };

const RASTER_METHODS = { ramp: "setRasterImage", rgb: "setRasterRGBImage", bicolor: "setRasterBicolorImage" };

// Whether a layer has anything to draw (and so a checkbox).
export const hasData = (layer) =>
  layer.type === "raster" ? !!layer.raster : !!layer.data?.features?.length;

// tool: set on tool pages only. It goes through WebGeoDS.createSharedMap,
// which also records the "tool_loaded" event; an article passes no tool
// and gets a plain WebGeoDS.Map.
export function MapView({ tool, height, center, zoom, layers = [], fitTo, onReady, flushTop = false }) {

  const slot = useRef(null);
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(() => new Set());
  const seen = useRef(new Set());

  // Last pushed { data, paintKey, type } per layer id.
  const pushed = useRef(new Map());
  // Latest onClick per layer id, read at click time: the MapLibre
  // listener is bound once per layer, the handler can change.
  const clickHandlers = useRef({});
  const boundClicks = useRef(new Set());
  // setGeoJSON is async; syncs run one after another so a fast series of
  // renders can't interleave their calls.
  const syncChain = useRef(Promise.resolve());

  useEffect(() => {

    let cancelled = false;

    const view = { ...(center ? { center } : {}), ...(zoom !== undefined ? { zoom } : {}) };
    const created = tool
      ? window.WebGeoDS.createSharedMap({ tool, height, ...view })
      : (async () => {
        const map = new window.WebGeoDS.Map({ height, ...view });
        await map.ready();
        return map;
      })();

    created.then((map) => {
      if (cancelled) {
        map.destroy();
        return;
      }
      mapRef.current = map;
      slot.current.appendChild(map.element);
      // Beside a side panel the row itself provides the spacing; the
      // map's own top margin would misalign the two (same fix as
      // Dashboard._init()).
      if (flushTop) map.element.style.marginTop = "0";
      setReady(true);
      onReady?.(map);
    });

    return () => {
      cancelled = true;
      mapRef.current?.destroy();
      mapRef.current = null;
    };

  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A layer marked startHidden is switched off the first time it shows up.
  useEffect(() => {
    const fresh = layers.filter((l) => l.startHidden && !seen.current.has(l.id));
    layers.forEach((l) => seen.current.add(l.id));
    if (fresh.length) setHidden((current) => new Set([...current, ...fresh.map((l) => l.id)]));
  }, [layers]);

  useEffect(() => {

    if (!ready) return;

    for (const layer of layers) {
      clickHandlers.current[layer.id] = layer.onClick;
    }

    syncChain.current = syncChain.current.then(async () => {

      const map = mapRef.current;
      if (!map) return;

      for (const layer of layers) {

        if (layer.type === "raster") {
          const previous = pushed.current.get(layer.id);
          if (previous?.data !== layer.raster) {
            if (layer.raster) {
              const method = RASTER_METHODS[layer.render ?? "ramp"];
              if (!method) throw new Error(`MapView: unknown raster render "${layer.render}" (ramp, rgb or bicolor).`);
              await map[method](layer.id, layer.raster);
            } else {
              await map.removeRasterImage(layer.id);
            }
            pushed.current.set(layer.id, { data: layer.raster ?? null, type: "raster" });
          }
          continue;
        }

        const paintKey = layer.paint ? JSON.stringify(layer.paint) : "";
        const previous = pushed.current.get(layer.id);

        if (!previous || previous.data !== layer.data || previous.paintKey !== paintKey) {
          await map.setGeoJSON(layer.id, layer.data ?? EMPTY, {
            type: layer.type,
            ...(layer.paint ? { paint: layer.paint } : {})
          });
          pushed.current.set(layer.id, { data: layer.data, paintKey, type: layer.type });
        }

        if (layer.onClick && !boundClicks.current.has(layer.id)) {
          boundClicks.current.add(layer.id);
          map.map.on("click", layer.id, (e) => {
            if (e.features[0]) clickHandlers.current[layer.id]?.(e.features[0]);
          });
        }

      }

      const listed = new Set(layers.map((l) => l.id));
      for (const [id, previous] of pushed.current) {
        if (!listed.has(id) && previous.data !== null) {
          if (previous.type === "raster") await map.removeRasterImage(id);
          else await map.setGeoJSON(id, EMPTY, { type: previous.type });
          pushed.current.set(id, { ...previous, data: null });
        }
      }

      // Bottom to top: moving each listed layer to the top, in order,
      // leaves them stacked exactly as listed.
      for (const layer of layers) {
        if (!map.map.getLayer(layer.id)) continue;
        map.map.moveLayer(layer.id);
        map.map.setLayoutProperty(layer.id, "visibility", hidden.has(layer.id) ? "none" : "visible");
      }

    }).catch((err) => console.error("WebGeoDS.Preact MapView: layer update failed", err));

  }, [ready, layers, hidden]);

  useEffect(() => {
    if (!ready || !fitTo?.features?.length) return;
    syncChain.current = syncChain.current.then(() => mapRef.current?.fitToData(fitTo));
  }, [ready, fitTo]);

  const toggle = (id) => setHidden((current) => {
    const next = new Set(current);
    if (!next.delete(id)) next.add(id);
    return next;
  });
  const switchable = layers.filter((layer) => layer.label && hasData(layer));

  return (
    <div ref={slot}>
      {ready && switchable.length > 1 && createPortal(
        <div class="webgeods-layer-control">
          {switchable.map((layer) => (
            <label>
              <input type="checkbox" checked={!hidden.has(layer.id)} onChange={() => toggle(layer.id)} />
              {layer.label}
            </label>
          ))}
        </div>,
        mapRef.current.element
      )}
    </div>
  );

}
