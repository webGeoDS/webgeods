// A counter that increases 300 ms after the window stops resizing.
// Vega-Lite charts measure their container once, at render time, so a
// chart drawn in portrait stays sized for portrait after a phone is
// rotated. Components put this in their effect
// dependencies to redraw at the new size.
import { useEffect, useState } from "preact/hooks";

export function useResizeTick(delay = 300) {

  const [tick, setTick] = useState(0);

  useEffect(() => {

    let timer = null;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setTick((t) => t + 1), delay);
    };

    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };

  }, [delay]);

  return tick;

}
