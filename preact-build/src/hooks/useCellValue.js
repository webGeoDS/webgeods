// The latest value of a code cell the READER runs (article pages), not
// one a component runs itself (tools use useCellRunner().runCell and
// its return value instead).
//
// Every cell sets element.value and dispatches a bubbling "input" event
// after each run (shared/code-cell.js run()); the same signal OJS's
// getCellValue() listens to, read here without OJS. The value can also
// be cleared from outside (a Reset button), hence the setter.
//
// ids: one cell id, or several (a diagnose and a repair cell for the same
// language): the value is then whichever of them ran last, and `source`
// says which. No id (an article with only an R cell, say): stays null.
//
//   const [value, setValue, source] = useCellValue(ids);
import { useEffect, useState } from "preact/hooks";

export function useCellValue(ids) {

  const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
  const [state, setState] = useState({ value: null, source: null });

  useEffect(() => {

    if (list.length === 0) return undefined;

    const listeners = [];

    const attach = () => {
      for (const id of list) {
        const element = document.getElementById(id);
        if (!element) {
          console.error(`WebGeoDS.Preact: useCellValue: no element #${id}.`);
          continue;
        }
        const onInput = () => setState({ value: element.value ?? null, source: id });
        element.addEventListener("input", onInput);
        listeners.push([element, onInput]);
      }
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", attach, { once: true });
    } else {
      attach();
    }

    return () => {
      document.removeEventListener("DOMContentLoaded", attach);
      for (const [element, onInput] of listeners) element.removeEventListener("input", onInput);
    };

  }, [list.join(" ")]); // eslint-disable-line react-hooks/exhaustive-deps

  const setValue = (value) => setState((current) => ({ value, source: value == null ? null : current.source }));
  return [state.value, setValue, state.source];

}
