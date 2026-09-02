// Entry point bundled by esbuild into ../shared/codemirror-bundle.js —
// see build.sh. Imports and re-exports exactly what code-cell.js needs,
// as a single global (window.WebGeoDSCodeMirror), so the page can load
// it via a plain <script> tag instead of 6 separate ESM imports from
// esm.sh at runtime. See the "Vendored locally..." comment in
// shared/code-cell.js for why.
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { python } from "@codemirror/lang-python";
import { r } from "codemirror-lang-r";
import { oneDark } from "@codemirror/theme-one-dark";
import { autocompletion } from "@codemirror/autocomplete";

window.WebGeoDSCodeMirror = {
  EditorView,
  basicSetup,
  EditorState,
  python,
  r,
  oneDark,
  autocompletion,
};
