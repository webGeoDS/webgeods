--[[
  webgeods-cells.lua
  ===================
  Quarto Lua filter: transforms a fenced code block

      ```{.webgeods-python}
      <initialCode>
      ```

  or

      ```{.webgeods-r}
      <initialCode>
      ```

  into a `<div>` + `<script>` that instantiates `WebGeoDS.CodeCell`.

  **Dot-prefixed class is mandatory** — `.webgeods-python`/
  `.webgeods-r`, never the bare `{python}`/`{r}` form. Quarto
  recognizes those bare forms as registered execution engines
  (Jupyter/knitr), a dispatch mechanism a user Lua filter has no
  access to; without the dot, Pandoc never assigns the class to
  `el.classes` and CodeBlock() below never sees the cell at all.

  **Reading a cell's value from page code:**
  `WebGeoDSCodeCell.run()` (code-cell.js) unconditionally sets
  `this.element.value` and fires an "input" event after every Run, for
  any cell — hand-built or filter-generated. Preact pages read it with
  useCellValue (preact-build/src/hooks/useCellValue.js).

  **Packages to load (`#| package:`):** the cell body's leading lines
  can declare packages to load before execution, using the same `#|`
  comment syntax as Quarto's native cell options — but interpreted by
  this filter itself, since Quarto doesn't touch `#|` lines for a
  class it doesn't recognize as an engine; they arrive intact in
  `el.text`.

      ```{.webgeods-r #my-cell}
      #| package: sf
      sf::st_as_sf(data.frame(x = 0, y = 0), coords = c("x", "y"))
      ```

  These are equivalent, and freely composable: multiple `#| package:`
  lines (one per package), a comma-separated list on the same line,
  or a YAML-style bracketed list — all three forms below produce the
  same `["sf", "dplyr"]` list:

      #| package: sf
      #| package: dplyr

      #| package: sf, dplyr

      #| package: [sf, dplyr]

  `packages:` (plural) is accepted as an alias, matching the option
  name in `WebGeoDS.Python.run`/`WebGeoDS.R.run` (python.js/r.js),
  where the resulting list is passed through as-is as
  `{ packages: [...] }` — this filter never installs anything itself.

  `#| micropip: ...` (or `micropips:`, same alias pattern) works the
  same way, for packages not in Pyodide's own curated index — passed
  through as `{ micropip: [...] }`, matching `WebGeoDS.Python.run`'s
  `micropip` option (python.js's MICROPIP_PACKAGES resolves the named
  entries to explicit vendored wheel URLs; this filter, like with
  `package:`, only forwards the list, it doesn't know what's inside
  it). Not meaningful for `.webgeods-r` cells (`WebGeoDS.R.run` has no
  such option) but not rejected either — an R cell declaring one just
  gets an option `window.WebGeoDS.R.run` ignores.

  **Injecting a JS value (`#| inject:`):** names a global — read as
  `window[name]` at RUN time, every time, not baked in once at render
  time — to make available inside the executed code under that same
  name, as a plain data value (`json.loads(...)` in Python,
  `jsonlite::fromJSON(..., simplifyVector = FALSE)` in R — R cells declaring this also need
  `#| package: jsonlite`, not added automatically). The actual
  serialization happens in code-cell.js's run(), not here: this filter
  only forwards the list of names, exactly like `package:`.

      ```{.webgeods-python #my-cell}
      #| inject: someJsGlobal
      print(someJsGlobal["zoom"])
      ```

  Composable the same way as `package:` (multiple lines, comma list,
  or bracketed list); `injects:` accepted as a plural alias.

  Three real limitations, inherent to the mechanism, not this filter:

  - The name becomes a real variable in the target language, so it
    must be a valid identifier THERE — verified empirically that a
    leading underscore, fine in Python, is a syntax error in R
    ("unexpected input"; R's own docs call `_abc` invalid). Pick a
    name valid in whichever language(s) actually use it.
  - Only values reachable as `window[name]`.
  - Only JSON-serializable DATA — a live object instance with methods
    (a `WebGeoDSMap`, say) will either serialize to a near-empty `{}`
    (own enumerable data properties only, no methods) or throw on a
    circular reference — this is for passing values, not instances.

  **Shared helper code (`#| helper:`):** `#| helper: read_upload`
  puts shared/python/read_upload.py in front of the cell's code, at
  render time (`helpers:` accepted too). For tool pages, whose cells
  are hidden: an article keeps that code written out for the reader.

  Recognized `#|` lines are stripped from the code shown in the
  editor. Parsing stops at the first line not in `#| key: value` form;
  no other cell option (`echo`, `eval`, ...) is recognized or
  stripped, only the id (`{.webgeods-r #my-id}`) and
  package/packages/micropip/micropips/inject/injects/helper/helpers.

  A package loaded by one cell stays available to a later cell on the
  same page (`WebGeoDS.Runtime` is a page-level singleton) — declaring
  it explicitly in every cell that needs it is still clearer to read.

  Mechanism: the filter produces a single `pandoc.RawBlock("html", ...)`
  containing both the `<div id="...">` and the `<script>` that
  populates it, passed through Pandoc/Quarto with no need for any
  special recognition — a raw HTML block targeting `html` is always
  reproduced verbatim, the same mechanism that already makes every
  hand-written `<script>` block work. There is therefore no dependency on filter
  ordering.
]]

local LANGUAGES = {
  ["webgeods-python"] = {
    language = "python",
    runner = "WebGeoDS.Python.run"
  },
  ["webgeods-r"] = {
    language = "r",
    runner = "WebGeoDS.R.run"
  }
}

-- Module-level counter: persists for the whole processing of ONE
-- document (Pandoc's Lua filters get reloaded for each rendered
-- document, so no explicit reset is needed).
local cell_counter = 0

-- Splits a string into lines, handling both the case with a trailing
-- \n and without (Pandoc's el.text normally doesn't have one, but we
-- don't rely on that assumption). A simple text:gmatch("([^\n]*)\n?")
-- produces one spurious extra empty line when the text already ends
-- with \n — this explicit loop avoids that problem.
local function split_lines(text)
  local lines = {}
  local start = 1
  while true do
    local nl_pos = text:find("\n", start, true)
    if not nl_pos then
      table.insert(lines, text:sub(start))
      break
    end
    table.insert(lines, text:sub(start, nl_pos - 1))
    start = nl_pos + 1
  end
  return lines
end

-- Trims whitespace at the edges and any quotes (single or double)
-- wrapping the whole value — "sf" and 'sf' become sf, same as sf
-- without quotes.
local function clean_token(token)
  token = token:match("^%s*(.-)%s*$")
  token = token:gsub('^"(.*)"$', "%1")
  token = token:gsub("^'(.*)'$", "%1")
  return token
end

-- Parses a comma-separated or YAML-bracketed `#| key: value` value
-- into a list of cleaned tokens — shared by every `#|` option this
-- filter recognizes (package/packages, micropip/micropips).
local function parse_option_list(value, into)
  local inner = value:match("^%[(.*)%]$")
  if inner then
    value = inner
  end
  for token in value:gmatch("[^,]+") do
    token = clean_token(token)
    if token ~= "" then
      table.insert(into, token)
    end
  end
end

-- Extracts any `#| package: ...` / `#| micropip: ...` declarations
-- (or their `packages`/`micropips` plural aliases) from the cell
-- body's leading lines, and returns both lists plus the remaining
-- code (without those lines). Stops at the first line that isn't in
-- the `#| key: value` form — see the comment in the docstring at the
-- top of the file for details and the supported syntax forms.
local function parse_cell_options(text)

  local lines = split_lines(text)
  local packages = {}
  local micropip_packages = {}
  local inject_names = {}
  local helper_names = {}
  local i = 1

  while i <= #lines do

    local key, value = lines[i]:match("^#|%s*([%w_%-]+)%s*:%s*(.*)$")

    if not key then
      break
    end

    if key == "package" or key == "packages" then
      parse_option_list(value, packages)
    elseif key == "micropip" or key == "micropips" then
      parse_option_list(value, micropip_packages)
    elseif key == "inject" or key == "injects" then
      parse_option_list(value, inject_names)
    elseif key == "helper" or key == "helpers" then
      parse_option_list(value, helper_names)
    end

    i = i + 1

  end

  local remaining = {}
  for j = i, #lines do
    table.insert(remaining, lines[j])
  end

  return packages, micropip_packages, inject_names, helper_names, table.concat(remaining, "\n")

end

-- `#| helper: read_upload` puts the source of shared/python/read_upload.py
-- in front of the cell's code, at render time: one copy of code every
-- tool repeated, nothing new for the Python engine to load. Found next
-- to the repository's shared/ folder, from wherever the synced copy of
-- this filter runs (blog/ or lessons/).
local function helper_source(name)
  local filter_dir = pandoc.path.directory(PANDOC_SCRIPT_FILE)
  local path = pandoc.path.join({ filter_dir, "..", "shared", "python", name .. ".py" })
  local file = io.open(path, "r")
  if not file then
    error("webgeods-cells.lua: #| helper: " .. name .. " -- no file " .. path)
  end
  local source = file:read("a")
  file:close()
  return source
end

function CodeBlock(el)

  local lang_spec = nil
  for _, class in ipairs(el.classes) do
    if LANGUAGES[class] then
      lang_spec = LANGUAGES[class]
      break
    end
  end

  if not lang_spec then
    -- Not one of our classes: leave the block untouched, whatever it
    -- is (a real Quarto {r}/{python}/{ojs}, a plain code block, etc.).
    return el
  end

  cell_counter = cell_counter + 1

  -- If the author passed an explicit id (`{.webgeods-r #my-id}`),
  -- we respect it for the HTML container; otherwise we generate a
  -- stable, predictable one (also useful for an automated smoke
  -- test).
  local container_id = el.identifier
  if container_id == "" then
    container_id = "webgeods-cell-" .. cell_counter
  end

  -- Any other class (`{.webgeods-python #id .tool-cell}`) goes onto the
  -- container, e.g. .tool-cell, which hides a tool's cells (styles.css).
  -- No class attribute at all when there are none, so other pages'
  -- HTML is unchanged.
  local extra_classes = {}
  for _, class in ipairs(el.classes) do
    if not LANGUAGES[class] then
      table.insert(extra_classes, class)
    end
  end
  local class_attribute = ""
  if #extra_classes > 0 then
    class_attribute = " class=\"" .. table.concat(extra_classes, " ") .. "\""
  end

  local packages, micropip_packages, inject_names, helper_names, code = parse_cell_options(el.text)
  if #helper_names > 0 then
    local sources = {}
    for _, name in ipairs(helper_names) do
      table.insert(sources, helper_source(name))
    end
    table.insert(sources, code)
    code = table.concat(sources, "\n\n")
  end

  local initial_code_json = pandoc.json.encode(code)
  local container_id_json = pandoc.json.encode(container_id)

  -- pandoc.json.encode of an EMPTY Lua table is ambiguous (it could
  -- come out as the object "{}" instead of the array "[]"): instead
  -- of relying on that edge case, an option is omitted entirely when
  -- its list is empty — consistent with the existing
  -- run(code, { packages, micropip } = {}) signature in python.js
  -- (r.js only has `packages`), where an absent key is equivalent to
  -- no explicit loading.
  local option_entries = {}
  if #packages > 0 then
    table.insert(option_entries, "packages: " .. pandoc.json.encode(packages))
  end
  if #micropip_packages > 0 then
    table.insert(option_entries, "micropip: " .. pandoc.json.encode(micropip_packages))
  end

  local run_options_json
  if #option_entries > 0 then
    run_options_json = "{ " .. table.concat(option_entries, ", ") .. " }"
  else
    run_options_json = "{}"
  end

  -- `inject` is a WebGeoDSCodeCell CONSTRUCTOR option (sibling of
  -- language/initialCode/onRun), not part of run_options_json above:
  -- it doesn't go to python.js's/r.js's own run(code, {packages,
  -- micropip}) — it's consumed by code-cell.js itself, which reads
  -- window[name] for each declared name and prepends a small
  -- json.loads()/jsonlite::fromJSON() preamble to the code before
  -- ever calling onRun. See the comment on the `inject` destructuring
  -- in code-cell.js's _initialize() for the full explanation and the
  -- (real) limitations — plain JSON-serializable data only, no live
  -- object instances.
  local inject_entry = ""
  if #inject_names > 0 then
    inject_entry = "    inject: " .. pandoc.json.encode(inject_names) .. ",\n"
  end

  local html = table.concat({
    "<div id=\"" .. container_id .. "\"" .. class_attribute .. "></div>",
    "<script>",
    "document.addEventListener(\"DOMContentLoaded\", () => {",
    "  new window.WebGeoDS.CodeCell(" .. container_id_json .. ", {",
    "    language: " .. pandoc.json.encode(lang_spec.language) .. ",",
    "    initialCode: " .. initial_code_json .. ",",
    inject_entry .. "    preload: " .. run_options_json .. ",",
    "    onRun: async (code, output) => {",
    "      output.waiting(\"Running...\");",
    "      return output.result(await window." .. lang_spec.runner .. "(code, " .. run_options_json .. "));",
    "    }",
    "  });",
    "});",
    "</script>"
  }, "\n")

  return pandoc.RawBlock("html", html)

end

--[[
  "Load this example" buttons, written in the article's own Markdown:

    ::: {.webgeods-example py="geometry-diagnose-py" r="geometry-diagnose-r" label="📋 Load this example"}
    ```python
    ...the code the Python cell gets...
    ```
    ```r
    ...the code the R cell gets...
    ```
    :::

  becomes a WebGeoDS.loadExampleButton (shared/code-cell.js) that puts
  each block's code into its cell. Either language may be left out. The
  code stays readable in the .qmd instead of living in a JavaScript
  string; the blocks themselves aren't shown on the page.
]]

local example_counter = 0

function Div(el)

  if not el.classes:includes("webgeods-example") then
    return nil
  end

  local codes = {}
  for _, block in ipairs(el.content) do
    if block.t == "CodeBlock" then
      if block.classes:includes("python") then
        codes.py = block.text
      elseif block.classes:includes("r") then
        codes.r = block.text
      end
    end
  end

  example_counter = example_counter + 1
  local slot_id = "webgeods-example-" .. example_counter
  local label = el.attributes["label"] or "📋 Load this example"

  local options = {}
  if el.attributes["py"] then
    table.insert(options, "pyId: " .. pandoc.json.encode(el.attributes["py"]))
    table.insert(options, "pyCode: " .. pandoc.json.encode(codes.py or ""))
  end
  if el.attributes["r"] then
    table.insert(options, "rId: " .. pandoc.json.encode(el.attributes["r"]))
    table.insert(options, "rCode: " .. pandoc.json.encode(codes.r or ""))
  end

  return pandoc.RawBlock("html", table.concat({
    "<div id=\"" .. slot_id .. "\"></div>",
    "<script>",
    "document.addEventListener(\"DOMContentLoaded\", () => {",
    "  document.getElementById(" .. pandoc.json.encode(slot_id) .. ").appendChild(",
    "    window.WebGeoDS.loadExampleButton(" .. pandoc.json.encode(label) .. ", { " .. table.concat(options, ", ") .. " }));",
    "});",
    "</script>"
  }, "\n"))

end
