// The latest value of a code cell the READER runs (article pages), not
// one a component runs itself (tools use useCellRunner().runCell and
// its return value instead).
//
// Every cell sets element.value and dispatches a bubbling "input" event
// after each run (shared/code-cell.js run()); the same signal OJS's
// getCellValue() listens to, read here without OJS. The value can also
// be cleared from outside (a Reset button), hence the setter.
import { useEffect, useState } from "preact/hooks";

export function useCellValue(id) {

  const [value, setValue] = useState(null);

  useEffect(() => {

    let element = null;
    const onInput = () => setValue(element.value ?? null);

    const attach = () => {
      element = document.getElementById(id);
      if (!element) {
        console.error(`WebGeoDS.Preact: useCellValue: no element #${id}.`);
        return;
      }
      element.addEventListener("input", onInput);
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", attach, { once: true });
    } else {
      attach();
    }

    return () => {
      document.removeEventListener("DOMContentLoaded", attach);
      element?.removeEventListener("input", onInput);
    };

  }, [id]);

  return [value, setValue];

}
