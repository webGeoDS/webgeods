--[[
  {{< webgeods-tool network-from-lines-tool id=nfl-root min-height=760px vega=true >}}

  The interactive part of a tool page: the mount point of its Preact page
  component (preact-build/src/pages/), the scripts it needs and the
  mount call. Replaces the same ~15 lines of HTML every tool page carried.

    first argument  the component's name in preact-build/src/index.js PAGES
    id              the mount element's id (default: <name>-root)
    min-height      reserves the component's space before the script
                    mounts it, so the page doesn't jump
    vega=true       also loads the Vega scripts, for a page with a chart:
                    page-local, not site-wide (see blog/_quarto.yml)
    d3=true         also loads d3 and graph-diagram.js, for a force
                    diagram (ForceGraph): page-local too

  The page's code cells stay in the Markdown; `.tool-cell` on each one
  hides it (styles.css).
]]

local function option(kwargs, name, default)
  local value = pandoc.utils.stringify(kwargs[name] or "")
  if value == "" then
    return default
  end
  return value
end

return {

  ["webgeods-tool"] = function(args, kwargs)

    local name = pandoc.utils.stringify(args[1] or "")
    if name == "" then
      error("webgeods-tool: the page component's name is required, e.g. {{< webgeods-tool network-from-lines-tool >}}")
    end

    local id = option(kwargs, "id", name .. "-root")
    local min_height = option(kwargs, "min-height", nil)
    local style = min_height and (" style=\"min-height: " .. min_height .. ";\"") or ""

    local scripts = {}
    if option(kwargs, "vega", "false") == "true" then
      for _, src in ipairs({ "/vega.min.js", "/vega-lite.min.js", "/vega-embed.min.js", "/vega-chart.js" }) do
        table.insert(scripts, "<script src=\"" .. src .. "\"></script>")
      end
    end
    if option(kwargs, "d3", "false") == "true" then
      table.insert(scripts, "<script src=\"/d3.min.js\"></script>")
      table.insert(scripts, "<script src=\"/graph-diagram.js\"></script>")
    end
    table.insert(scripts, "<script src=\"/webgeods-preact.js\"></script>")

    return pandoc.RawBlock("html", table.concat({
      "<div id=\"" .. id .. "\"" .. style .. "></div>",
      table.concat(scripts, "\n"),
      "<script>",
      "document.addEventListener(\"DOMContentLoaded\", () =>",
      "  WebGeoDS.Preact.mount(" .. pandoc.json.encode(name) .. ", " .. pandoc.json.encode("#" .. id) .. "));",
      "</script>"
    }, "\n"))

  end

}
