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
// fitTo: a FeatureCollection to zoom to whenever a new one is passed.
// onReady(map): the WebGeoDS.Map instance, for anything not expressible
// as a layer.
import { useEffect, useRef, useState } from "preact/hooks";

const EMPTY = { type: "FeatureCollection", features: [] };

export function MapView({ tool, height, layers = [], fitTo, onReady, flushTop = false }) {

  const slot = useRef(null);
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);

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

    window.WebGeoDS.createSharedMap({ tool, height }).then((map) => {
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

  useEffect(() => {

    if (!ready) return;

    for (const layer of layers) {
      clickHandlers.current[layer.id] = layer.onClick;
    }

    syncChain.current = syncChain.current.then(async () => {

      const map = mapRef.current;
      if (!map) return;

      for (const layer of layers) {

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
          await map.setGeoJSON(id, EMPTY, { type: previous.type });
          pushed.current.set(id, { ...previous, data: null });
        }
      }

      // Bottom to top: moving each listed layer to the top, in order,
      // leaves them stacked exactly as listed.
      for (const layer of layers) {
        if (map.map.getLayer(layer.id)) map.map.moveLayer(layer.id);
      }

    }).catch((err) => console.error("WebGeoDS.Preact MapView: layer update failed", err));

  }, [ready, layers]);

  useEffect(() => {
    if (!ready || !fitTo?.features?.length) return;
    syncChain.current = syncChain.current.then(() => mapRef.current?.fitToData(fitTo));
  }, [ready, fitTo]);

  return <div ref={slot} />;

}
