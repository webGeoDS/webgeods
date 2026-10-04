// Controlled force-directed diagram over WebGeoDS.renderForceGraph
// (shared/graph-diagram.js): the graph's topology next to a map that shows
// its geography. Redrawn when nodes/links change; `selectedIds` drives the
// highlighted nodes; a click on a node is reported through onNodeClick.
//
// The diagram measures its container once, at render time, so a
// ResizeObserver re-fits it whenever the box changes size (a sibling
// appearing, a window resize, a phone rotating) — the job
// Dashboard._renderDiagram() did for Dashboard tools.
//
// nodes / links: GeoJSON FeatureCollections (or null for an empty box).
import { useEffect, useRef } from "preact/hooks";

export function ForceGraph({ nodes, links, nodeColor, linkColor, nodeId, selectedIds, onNodeClick, style }) {

  const container = useRef(null);
  const diagram = useRef(null);
  const latest = useRef({});
  latest.current = { onNodeClick, selectedIds };

  useEffect(() => {

    if (!nodes || !links) {
      container.current.replaceChildren();
      return undefined;
    }

    diagram.current = window.WebGeoDS.renderForceGraph(
      container.current,
      { nodes, links },
      {
        ...(nodeColor ? { nodeColor } : {}),
        ...(linkColor ? { linkColor } : {}),
        ...(nodeId ? { nodeId } : {}),
        onNodeClick: (id, feature) => latest.current.onNodeClick?.(id, feature)
      }
    );
    diagram.current.setSelectedMany(latest.current.selectedIds ?? []);

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) diagram.current?.resize(width, height);
    });
    observer.observe(container.current);

    return () => {
      observer.disconnect();
      diagram.current?.destroy();
      diagram.current = null;
    };

  }, [nodes, links]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    diagram.current?.setSelectedMany(selectedIds ?? []);
  }, [selectedIds]);

  return <div ref={container} style={{ width: "100%", height: "100%", ...style }} />;

}
