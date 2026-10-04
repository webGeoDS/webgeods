// Runs the page's hidden Python/R cells for a page component, the same
// way WebGeoDS.Dashboard does (shared/dashboard.js _cell() and
// _queue()), so a migrated tool behaves exactly like a Dashboard one:
//
// - one queue: a click arriving while a run is still in flight waits its
//   turn instead of hitting CodeCell's "already running" error;
// - a status line and a busy flag for the control panel;
// - a failure shows up in the status line ("⚠️ <label> failed: ...")
//   and the console, instead of an uncaught rejection.
import { useCallback, useRef, useState } from "preact/hooks";

// A cell is constructed by webgeods-cells.lua's own DOMContentLoaded
// listener, which can run after the page component mounts: resolved
// lazily, at first use, like Dashboard._cell().
export async function findCell(id) {

  let cell = window.WebGeoDS.CodeCell.find(id);

  if (!cell && document.readyState === "loading") {
    await new Promise((resolve) =>
      document.addEventListener("DOMContentLoaded", resolve, { once: true })
    );
    cell = window.WebGeoDS.CodeCell.find(id);
  }

  if (!cell) {
    throw new Error(`code cell "${id}" not found: check the {.webgeods-python #${id}} block exists in this page.`);
  }

  return cell;

}

// "⌛ Training..." -> "Training", for the failure message.
function actionName(label) {
  return label.replace(/^[^\p{L}]+/u, "").replace(/\.+$/, "") || label;
}

// A Python error arrives as its whole traceback (Pyodide's internal
// frames first): in a one-line status bar only its last line, the
// exception and its message, says anything to the reader. The full
// traceback still goes to the console above.
function readableError(err) {
  const message = String(err?.message ?? err);
  if (!/Traceback \(most recent call last\)/.test(message)) return message;
  const lines = message.split("\n").map((line) => line.trim()).filter(Boolean);
  return lines[lines.length - 1];
}

export function useCellRunner(initialStatus) {

  const chain = useRef(Promise.resolve());
  const [status, setStatus] = useState(initialStatus ?? window.WebGeoDS.Upload.defaultStatus);
  const [busy, setBusy] = useState(false);

  // fn may return a string: it becomes the status once fn succeeds.
  const queue = useCallback((label, fn) => {

    chain.current = chain.current.then(async () => {

      setBusy(true);
      setStatus(label);

      try {
        const done = await fn();
        if (typeof done === "string") setStatus(done);
      } catch (err) {
        console.error(`WebGeoDS.Preact: ${label} failed`, err);
        setStatus(`⚠️ ${actionName(label)} failed: ${readableError(err)}`);
      } finally {
        setBusy(false);
      }

    });

    return chain.current;

  }, []);

  // `inputs` become window[name] for the cell's `#| inject:` names: the
  // only window.* write left, because it is how cells receive values
  // (shared/code-cell.js buildInjectPreamble), not page glue.
  const runCell = useCallback(async (id, inputs = {}) => {

    for (const [name, value] of Object.entries(inputs)) {
      window[name] = value;
    }

    const cell = await findCell(id);
    return cell.run();

  }, []);

  return { status, setStatus, busy, queue, runCell };

}
