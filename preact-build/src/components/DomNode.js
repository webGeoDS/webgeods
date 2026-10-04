// Places a DOM node built by one of the site's existing helpers
// (WebGeoDS.statCard, legend, uploadStatusEl, resetButton,
// downloadButton, Upload.createControl...) inside a component, so those
// helpers are reused as they are: same markup, same CSS classes, nothing
// re-implemented in JSX.
//
// build() runs on mount and again whenever `deps` change; update(node),
// if given, runs after every render (for a property such as `disabled`
// on a node built once). The wrapper uses `display: contents`, so the
// node behaves as a direct child of the surrounding flex row.
import { useEffect, useRef } from "preact/hooks";

export function DomNode({ build, deps = [], update }) {

  const wrapper = useRef(null);
  const node = useRef(null);

  useEffect(() => {
    node.current = build();
    wrapper.current.replaceChildren(...(node.current ? [node.current] : []));
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (update && node.current) update(node.current);
  });

  return <div ref={wrapper} style={{ display: "contents" }} />;

}
