/**
 * WebGeoDS.CodeCell
 *
 * Bilingual (Python/R) code editor built on CodeMirror 6: syntax
 * highlighting, autocompletion, execution delegated to an external
 * runtime (Pyodide, webR, ...) via the onRun callback.
 *
 * Exposes:
 *
 *   window.WebGeoDS.CodeCell
 *
 * No ES module syntax is used so the file can be included
 * directly by Quarto in the generated HTML.
 */

(() => {

  "use strict";


  // ============================================================
  // Namespace
  // ============================================================

  window.WebGeoDS =
    window.WebGeoDS || {};


  // ============================================================
  // Configuration
  // ============================================================

  // Vendored locally as a single pre-bundled file (codemirror-bundle.js)
  // instead of loaded as 6 separate ESM packages from esm.sh at
  // runtime: same reasoning as MapLibre in map.js (an esm.sh outage
  // or resolution change would otherwise break every code cell on
  // every page — the single biggest point of failure in the whole
  // stack). Built with esbuild from an entry file that imports and
  // re-exports exactly these 6 packages at these exact pinned
  // versions (codemirror@6.0.2, @codemirror/state@6.7.1,
  // @codemirror/lang-python@6.1.6, codemirror-lang-r@0.1.1,
  // @codemirror/theme-one-dark@6.1.2, @codemirror/autocomplete@6.20.3)
  // as `window.WebGeoDSCodeMirror`. Rebuilding it (e.g. to bump a
  // version) means re-running that same esbuild step, not editing
  // this file.
  //
  // codemirror-lang-r is a community-maintained package with very
  // low adoption (few known dependents, no recent updates): check
  // its activity on GitHub before relying on it long-term.
  // See the matching comment on ASSET_BASE in map.js: a page not at
  // the project root (e.g. a nested blog post) needs
  // `window.WEBGEODS_ASSET_BASE` set to resolve this vendored asset
  // correctly; lessons/ never sets it and must keep the plain
  // relative path.
  const CODEMIRROR_BUNDLE_URL = (window.WEBGEODS_ASSET_BASE || "") + "codemirror-bundle.js";


  // ============================================================
  // CodeMirror ecosystem loader
  // ============================================================

  let editorEcosystemPromise = null;


  function loadCodeMirrorBundle() {

    if (window.WebGeoDSCodeMirror) {
      return Promise.resolve(window.WebGeoDSCodeMirror);
    }

    return new Promise((resolve, reject) => {

      const script =
        document.createElement("script");

      script.src =
        CODEMIRROR_BUNDLE_URL;

      script.onload =
        () => resolve(window.WebGeoDSCodeMirror);

      script.onerror =
        () => reject(
          new Error(`WebGeoDS.CodeCell: failed to load ${CODEMIRROR_BUNDLE_URL}.`)
        );

      document.head.appendChild(script);

    });

  }


  async function loadEditorEcosystem() {

    if (!editorEcosystemPromise) {

      editorEcosystemPromise = (async () => {

        // Loaded only when the first CodeCell instance is actually
        // created, not at script parse time — avoids the cost on
        // pages with no code cells.
        const {
          EditorView, basicSetup, EditorState, python, r, oneDark, autocompletion
        } =
          await loadCodeMirrorBundle();

        return {
          EditorView, basicSetup, EditorState, python, r, oneDark, autocompletion
        };

      })().catch(error => {

        // Allows a retry after a network/loading error.
        editorEcosystemPromise = null;

        throw error;

      });

    }

    return editorEcosystemPromise;

  }


  // ============================================================
  // CellOutput
  //
  // Helper passed to onRun instead of the raw DOM node: covers the
  // three already-styled log states (waiting/success/error) without
  // having to recreate span + className + append on every call.
  // `.element` stays available for custom output (tables, images,
  // ...).
  // ============================================================

  class CellOutput {

    constructor(element, { language } = {}) {

      this._element =
        element;

      // Used by result() to decide the default for
      // skipValueIfPrinted based on the cell's language, instead of
      // requiring every onRun call site to declare it explicitly —
      // see the comment on result() further below.
      this._language =
        language;

    }

    clear() {

      this._element.textContent =
        "";

    }

    log(text, className, detail) {

      this.clear();

      const span =
        document.createElement("span");

      if (className) {
        span.className = className;
      }

      span.textContent =
        text;

      this._element.appendChild(
        span
      );

      // `detail` goes on a separate block-level element (not a
      // span): it wraps by construction, without depending on a
      // "\n" character and the parent element's CSS white-space —
      // more robust even if the output layout changes in the
      // future.
      if (detail !== undefined) {

        const detailLine =
          document.createElement("div");

        detailLine.className =
          "webgeods-log-detail";

        detailLine.textContent =
          detail;

        this._element.appendChild(
          detailLine
        );

      }

      return span;

    }

    waiting(text) {

      return this.log(
        text,
        "webgeods-log-waiting"
      );

    }

    success(text, detail) {

      return this.log(
        text,
        "webgeods-log-success",
        detail
      );

    }

    error(text, detail) {

      return this.log(
        text,
        "webgeods-log-error",
        detail
      );

    }

    // Formats the { result, stdout, stderr } shape returned by the
    // execution wrappers (WebGeoDS.Python.run, WebGeoDS.R.run) —
    // stdout in order, then (if present) a separate stderr block,
    // then (usually) the last expression's value. Returns `result`
    // (not the whole formatted string), enabling:
    //   return output.result(await WebGeoDS.Python.run(code));
    //
    // { skipValueIfPrinted } normally shouldn't be passed — it
    // defaults per-language from this._language:
    //
    //   R:      true  — R auto-prints most top-level expressions, so
    //                   its readable output is already in stdout; an
    //                   extra "Output: <JSON>" line would just repeat
    //                   the same value in a less readable form.
    //   Python: false — stdout (print()) and the last expression's
    //                   value are usually independent, so the value
    //                   should always show.
    //
    // The parameter stays available as an explicit override for the
    // rare case that needs it.
    result(runResult = {}, { skipValueIfPrinted } = {}) {

      const {
        result,
        displayText,
        stdout = [],
        stderr = [],
        message = "✓ Executed successfully!"
      } = runResult;

      const resolvedSkipValueIfPrinted =
        skipValueIfPrinted !== undefined
          ? skipValueIfPrinted
          : this._language === "r";

      const formatValue = (value) => {

        if (value === undefined || value === null) {
          return "No value returned";
        }

        // A Python value not automatically converted by Pyodide into
        // a native JS type (e.g. a NumPy ndarray) arrives here as a
        // PyProxy: JSON.stringify() on a PyProxy produces "{}",
        // because its real properties aren't enumerable in JS.
        // .toJs() converts it (when possible) into a native
        // structure — dict_converter forces Python dicts into plain
        // JS objects instead of Map (which would still give "{}"
        // with JSON.stringify). WebR instead already converts on the
        // r.js side before returning the result, so this is only
        // needed here for Python.
        if (
          typeof value === "object" &&
          typeof value.toJs === "function"
        ) {

          try {

            value =
              value.toJs({ dict_converter: Object.fromEntries });

            // A TypedArray (typical of a NumPy ndarray) has
            // enumerable indices but isn't a "real" Array:
            // JSON.stringify would serialize it as an object
            // ({"0":1,"1":2,...}) instead of [1,2,...].
            if (ArrayBuffer.isView(value)) {
              value = Array.from(value);
            }

          } catch (err) {

            // Conversion failed: still show something readable via
            // toString() (invokes str()/repr() on the Python side on
            // a PyProxy).
            return String(value);

          }

        }

        if (typeof value === "object") {

          let json =
            JSON.stringify(value, null, 2);

          // JSON.stringify returns `undefined` (not a string) for
          // values that aren't JSON-serializable — avoid showing the
          // literal string "undefined".
          if (json === undefined) {
            return String(value);
          }

          if (json.length > 4000) {
            json =
              json.slice(0, 4000) +
              "\n... [output truncated for performance — the full data is still available to onRun]";
          }

          return json;

        }

        return String(value);

      };

      const lines = [
        ...stdout
      ];

      // Separate stderr block (message()/warning() in R — Python
      // doesn't populate this field yet, see r.js): kept distinct
      // from the normal lines instead of being merged with stdout,
      // so the output expected from the code doesn't get confused
      // with warnings/diagnostics.
      if (stderr.length > 0) {

        lines.push(
          "",
          "⚠ stderr:",
          ...stderr
        );

      }

      // We suppress the "Output: ..." line only if the cell's
      // language auto-prints values (automatic default per
      // language, or explicit override via skipValueIfPrinted — see
      // above), AND stdout isn't empty — when stdout is empty (e.g.
      // R with invisible(), or simply no auto-print in that context)
      // it remains the only way to show something.
      const shouldSkipValue =
        resolvedSkipValueIfPrinted &&
        stdout.length > 0;

      if (!shouldSkipValue) {

        // displayText (WebGeoDS.Python.run() only — see
        // captureDisplayText() in runtime.js): for
        // pandas.DataFrame/geopandas.GeoDataFrame, this is Python's
        // own str() text — the aligned table a real REPL would print
        // — captured before `result` was converted to its JS-usable
        // form. Only changes what this box displays; `result` itself
        // (returned below, used by onRun/OJS) stays the converted
        // value.
        lines.push(
          `Output: ${
            displayText !== undefined
              ? displayText
              : formatValue(result)
          }`
        );

      }

      this.success(
        message,
        lines.join("\n")
      );

      return result;

    }

    // For custom output (tables, images, charts) without going
    // through the textual log methods above. Doesn't call clear() on
    // its own: call it explicitly first if you want to replace the
    // content instead of appending to it.
    append(node) {

      this._element.appendChild(
        node
      );

    }

    get element() {

      return this._element;

    }

  }


  // ============================================================
  // Instance registry — same role as WebGeoDSMap's _instances/find()
  // in map.js: lets other code look up "the cell with id X" (e.g. to
  // programmatically replace its code, see setCode() below) without
  // needing a direct JS reference to the instance that created it.
  // ============================================================

  const _instances = new Map();

  let _autoIdCounter = 0;


  // ============================================================
  // buildInjectPreamble(language, names)
  //
  // For each name in `names`, reads window[name] (freshly, at CALL
  // time — this runs once per run(), never cached) and emits one line
  // that reconstructs it as a same-named variable inside the executed
  // code, via a JSON round-trip: `JSON.stringify` twice — once to
  // serialize the value, once more to turn THAT string into a
  // language-safe string literal (Python/R double-quoted-string
  // escaping rules for \, ", and newlines coincide with JSON's) —
  // then json.loads()/jsonlite::fromJSON() inside the target language
  // turns it back into real data. See the `#| inject:` doc comment at
  // the top of webgeods-cells.lua (the filter that reads this option
  // from a fenced cell's pragma lines and passes it through here) for
  // the two real limitations: window-reachable names only, and plain
  // JSON-serializable data only (no live object instances).
  //
  // Prepended to the student's own code in run() below — invisible in
  // the editor, but genuinely executed before it.
  // ============================================================

  function buildInjectPreamble(language, names) {

    if (
      !names ||
      names.length === 0
    ) {

      return "";

    }

    const assignments =
      names.map((name) => {

        if (
          !(name in window)
        ) {

          throw new Error(
            `WebGeoDS.CodeCell: inject "${name}" — window.${name} is undefined.`
          );

        }

        const literal =
          JSON.stringify(
            JSON.stringify(window[name])
          );

        // simplifyVector = FALSE, matching every other jsonlite::fromJSON
        // call in this project: the default (TRUE) can collapse a flat
        // scalar object into something $name-style list access doesn't
        // expect — a named list (the FALSE behavior) is unsurprising
        // regardless of what shape the injected value has.
        return language === "r" ?
          `${name} <- jsonlite::fromJSON(${literal}, simplifyVector = FALSE)` :
          `${name} = json.loads(${literal})`;

      });

    const lines =
      language === "r" ?
        assignments :
        ["import json", ...assignments];

    return lines.join("\n") + "\n";

  }


  // ============================================================
  // WebGeoDSCodeCell
  // ============================================================

  class WebGeoDSCodeCell {


    // ----------------------------------------------------------
    // find(id) — look up a live instance by container id
    // ----------------------------------------------------------

    static find(id) {

      return _instances.get(id);

    }


    // ----------------------------------------------------------
    // Constructor
    // ----------------------------------------------------------

    constructor(
      containerOrOptions = {},
      options = {}
    ) {

      let container;
      let cellOptions;


      // --------------------------------------------------------
      // Existing container by ID
      // --------------------------------------------------------

      if (
        typeof containerOrOptions === "string"
      ) {

        container =
          document.getElementById(
            containerOrOptions
          );


        if (!container) {

          throw new Error(
            `WebGeoDS.CodeCell: element "${containerOrOptions}" not found.`
          );

        }


        cellOptions = {
          ...options
        };

      }


      // --------------------------------------------------------
      // Existing HTMLElement
      // --------------------------------------------------------

      else if (
        containerOrOptions instanceof HTMLElement
      ) {

        container =
          containerOrOptions;

        cellOptions = {
          ...options
        };

      }


      // --------------------------------------------------------
      // Automatic container
      //
      // new WebGeoDS.CodeCell({
      //   language: "python",
      //   initialCode: "sum(range(10))",
      //   onRun: async (code, output) => { ... }
      // })
      // --------------------------------------------------------

      else {

        cellOptions = {
          ...containerOrOptions
        };


        container =
          document.createElement("div");

      }


      // --------------------------------------------------------
      // Store
      // --------------------------------------------------------

      this.options =
        cellOptions;


      this.element =
        container;


      this.element.classList.add(
        "webgeods-editor-container"
      );


      if (!this.element.id) {

        this.element.id =
          `webgeods-code-cell-${++_autoIdCounter}`;

      }


      _instances.set(
        this.element.id,
        this
      );


      this._running =
        false;


      // --------------------------------------------------------
      // Start asynchronously
      // --------------------------------------------------------

      this.isReady =
        this._initialize();

    }


    // ==========================================================
    // Initialization
    // ==========================================================

    async _initialize() {

      const {
        EditorView,
        basicSetup,
        EditorState,
        python,
        r,
        oneDark,
        autocompletion
      } =
        await loadEditorEcosystem();


      const {

        language =
          "python",

        initialCode =
          "",

        // "light" matches the paper/ink "Field Atlas" palette in
        // styles.css. "dark" (oneDark) is available as an explicit
        // option — see the theme branch below.
        theme =
          "light",

        // Names of window globals to inject as data before every
        // run() — see buildInjectPreamble() above and the `#| inject:`
        // doc comment in webgeods-cells.lua.
        inject =
          [],

        onRun

      } =
        this.options;


      if (
        typeof onRun !== "function"
      ) {

        throw new TypeError(
          "WebGeoDS.CodeCell requires an onRun(code, output) function."
        );

      }


      const normalizedLanguage =
        language.toLowerCase();


      if (
        normalizedLanguage !== "python" &&
        normalizedLanguage !== "r"
      ) {

        throw new TypeError(
          `WebGeoDS.CodeCell: language must be "python" or "r" (received "${language}").`
        );

      }


      this._onRun =
        onRun;

      // Passed to every CellOutput built in run(), so result() knows
      // which default to pick for skipValueIfPrinted without onRun
      // having to declare it — see the comment on result().
      this._language =
        normalizedLanguage;

      this._inject =
        inject;


      // --------------------------------------------------------
      // Toolbar
      // --------------------------------------------------------
      //
      // Plain "webgeods-*" classes only, styled entirely by
      // styles.css — no Bootstrap dependency. smoke-test.mjs selects
      // these same classes directly (e.g. `#{cellId} .webgeods-run-btn`).

      const toolbar =
        document.createElement("div");

      toolbar.className =
        "webgeods-toolbar";


      const label =
        document.createElement("span");

      label.className =
        "webgeods-label";

      // textContent avoids `language` being interpreted as markup,
      // unlike innerHTML.
      label.textContent =
        language;


      const runBtn =
        document.createElement("button");

      runBtn.className =
        "webgeods-run-btn";

      runBtn.type =
        "button";

      runBtn.textContent =
        "▶ Run";


      toolbar.append(
        label,
        runBtn
      );


      // --------------------------------------------------------
      // Editor wrapper and output area
      // --------------------------------------------------------

      const editorWrapper =
        document.createElement("div");


      const outputArea =
        document.createElement("div");

      outputArea.className =
        "webgeods-output";

      // .webgeods-output's background/border/text color is fully
      // defined in styles.css (fixed "GitHub dark" palette, no
      // Bootstrap dependency) because the output area hosts
      // multi-line text with custom log classes
      // (.webgeods-log-success/-error/-waiting) that have no direct
      // Bootstrap equivalent at the container level.


      const waitingLog =
        document.createElement("span");

      waitingLog.className =
        "webgeods-log-waiting";

      waitingLog.textContent =
        "# Waiting to run...";

      outputArea.appendChild(
        waitingLog
      );


      this.element.append(
        toolbar,
        editorWrapper,
        outputArea
      );


      // --------------------------------------------------------
      // CodeMirror initialization
      // --------------------------------------------------------

      const langSupport =
        normalizedLanguage === "python"
          ? python()
          : r();


      const extensions = [
        basicSetup,
        langSupport,
        autocompletion(),
        EditorView.lineWrapping,
      ];


      if (theme === "dark") {

        extensions.push(oneDark);

      } else {

        // "light" theme: no explicit HighlightStyle, so syntax
        // coloring falls back to basicSetup's own baseline
        // (defaultHighlightStyle). This EditorView.theme() only
        // strips CodeMirror's own border/background so the box's
        // color comes from .webgeods-editor-container in styles.css
        // instead of being duplicated here.
        extensions.push(
          EditorView.theme({
            "&": {
              backgroundColor: "transparent"
            },
            ".cm-gutters": {
              backgroundColor: "transparent",
              border: "none"
            },
            "&.cm-focused": {
              outline: "none"
            }
          }, { dark: false })
        );

      }


      this.view =
        new EditorView({

          state:
            EditorState.create({
              doc: initialCode,
              extensions
            }),

          parent:
            editorWrapper

        });


      this._runBtn =
        runBtn;

      this._outputArea =
        outputArea;


      // --------------------------------------------------------
      // Execution logic
      // --------------------------------------------------------

      runBtn.onclick = () => {

        void this.run().catch(() => {});

      };


      return this;

    }


    // ==========================================================
    // Ready
    // ==========================================================

    async ready() {

      return await this.isReady;

    }


    // ==========================================================
    // Run
    //
    // Exposed (not only reachable via click) so execution can also
    // be triggered programmatically, e.g. from an OJS cell tied to
    // an external trigger.
    // ==========================================================

    async run() {

      await this.ready();


      if (this._running) {

        throw new Error(
          "WebGeoDS.CodeCell: the cell is already running."
        );

      }


      this._running =
        true;

      this._runBtn.disabled =
        true;

      this._runBtn.textContent =
        "⌛ ...";

      window.WebGeoDS.track?.("code_run_started", {
        cellId: this.element.id,
        language: this._language
      });


      // No generic "running" message here — the loading/execution
      // phases are onRun's responsibility via output.waiting(...),
      // which knows the details (e.g. "loading runtime" vs "running
      // code") better than this method does.
      const output =
        new CellOutput(
          this._outputArea,
          { language: this._language }
        );


      try {

        // The preamble (if any `inject` names are configured) is
        // built fresh on every run — it reads window[name] at THIS
        // moment, not once at construction — and prepended ahead of
        // the student's own code; onRun/run() never see it separately,
        // it's just more code to execute. See buildInjectPreamble().
        const code =
          buildInjectPreamble(this._language, this._inject) +
          this.view.state.doc.toString();


        const result =
          await this._onRun(
            code,
            output
          );


        // Observable/OJS convention: an element with a .value that
        // emits "input" can be wired to a reactive variable with
        // Generators.input(...). Unconditional: if a new execution
        // produces undefined (e.g. code that now only prints, with
        // no final expression), the OJS graph must know about it
        // regardless — otherwise the previous run's now-stale
        // reactive value would stay visible.
        this.element.value =
          result;

        this.element.dispatchEvent(
          new Event("input", { bubbles: true })
        );

        window.WebGeoDS.track?.("code_run_completed", {
          cellId: this.element.id,
          language: this._language
        });


        return result;

      } catch (err) {

        // Automatic fallback: if onRun doesn't handle the error on
        // its own, it's still shown consistently with the rest of
        // the cell's style.
        output.error(
          `! Error: ${err.message}`
        );

        console.error(
          "WebGeoDS Execution Error:",
          err
        );

        window.WebGeoDS.track?.("code_run_error", {
          cellId: this.element.id,
          language: this._language
        });

        throw err;

      } finally {

        this._running =
          false;

        this._runBtn.disabled =
          false;

        this._runBtn.textContent =
          "▶ Run";

      }

    }


    // ==========================================================
    // Value (for viewof/Generators.input in OJS)
    // ==========================================================

    get value() {

      return this.element.value;

    }


    // ==========================================================
    // setCode(code) — replace the editor's source text
    //
    // Used by pages that offer several ready-made examples for a
    // single reusable cell (e.g. "load this example" buttons):
    // replaces the CodeMirror document in place via a transaction,
    // leaving execution to the student's own "Run" click rather
    // than auto-running.
    // ==========================================================

    async setCode(code) {

      await this.isReady;


      this.view.dispatch({
        changes: {
          from: 0,
          to: this.view.state.doc.length,
          insert: code
        }
      });

    }


    // ==========================================================
    // Destroy
    // ==========================================================

    destroy() {

      if (this.view) {

        this.view.destroy();

        this.view =
          null;

      }


      _instances.delete(
        this.element.id
      );


      this.element.remove();

    }

  }


  // ============================================================
  // getCellValue(cellId, Generators)
  //
  // Makes a cell reactive toward OJS without hand-writing the
  // Generators.observe() bridge each time. Works because run() above
  // always sets this.element.value and dispatches a real "input"
  // event on the container after every execution — for any cell,
  // hand-built or Lua-filter-generated, since that code lives inside
  // run(), not at construction. This is just a wrapper over that
  // existing `.value` + "input" convention (the same one `viewof`
  // relies on), useful when the caller has only the cell's id, not a
  // direct reference to the CodeCell instance.
  //
  // Use in an OJS cell (`Generators` is only available there — an
  // implicit identifier Quarto/Observable injects into {ojs} cells,
  // not a global — so it must be passed explicitly):
  //
  //   myValue = WebGeoDS.getCellValue("my-id", Generators)
  //
  // Uses Generators.observe(), not viewof/Generators.input: without
  // an explicit initial value (even undefined), the OJS graph would
  // stay stuck until the first real "input" event — i.e. until the
  // first Run.
  // ============================================================

  function getCellValue(cellId, Generators) {

    if (
      !Generators ||
      typeof Generators.observe !== "function"
    ) {

      throw new TypeError(
        "WebGeoDS.getCellValue: missing or invalid second argument Generators — pass the Generators available in the calling {ojs} cell, e.g. WebGeoDS.getCellValue(\"my-id\", Generators)."
      );

    }

    return Generators.observe(function(change) {

      const el =
        document.getElementById(cellId);

      if (!el) {

        throw new Error(
          `WebGeoDS.getCellValue: element "${cellId}" not found.`
        );

      }

      change(el.value);

      const handler =
        () => change(el.value);

      el.addEventListener(
        "input",
        handler
      );

      return () =>
        el.removeEventListener("input", handler);

    });

  }


  // ============================================================
  // Public WebGeoDS API
  // ============================================================

  window.WebGeoDS.CodeCell =
    WebGeoDSCodeCell;


  window.WebGeoDS.getCellValue =
    getCellValue;


})();