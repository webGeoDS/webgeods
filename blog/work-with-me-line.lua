--[[
  work-with-me-line.lua
  =====================
  Quarto Lua filter: adds one quiet line to the bottom of every tool
  page (tools/*.html except the tools index) pointing to the Work with
  me page, and a GoatCounter event on its click ("work_with_me_click",
  title "from=<tool>"), so the weekly review can see which tools send
  visitors there.

  Done here rather than in each tools/*.qmd so the 14 pages can't
  drift apart. The line goes just before the newsletter embed script
  when the page has one (the Kit form renders where that script sits),
  otherwise at the very end.
]]

local function tool_slug()
  local rel = quarto.doc.project_output_file()
  if not rel then
    return nil
  end
  rel = rel:gsub("\\", "/")
  return rel:match("^tools/([^/]+)%.html$")
end

return {
  {
    Pandoc = function(doc)
      local slug = tool_slug()
      if not slug or slug == "index" then
        return nil
      end

      local line = pandoc.RawBlock("html", table.concat({
        "<p class=\"webgeods-work-line\">Need something like this built for your own data or workflow? "
          .. "I take on remote, fixed-price projects. "
          .. "<a href=\"/work-with-me.html\" data-work-from=\"" .. slug .. "\">Work with me →</a></p>",
        "<script>",
        "document.querySelector(\"[data-work-from]\").addEventListener(\"click\", (e) => {",
        "  window.WebGeoDS?.track?.(\"work_with_me_click\", { from: e.currentTarget.dataset.workFrom });",
        "});",
        "</script>"
      }, "\n"))

      local at = #doc.blocks + 1
      for i, block in ipairs(doc.blocks) do
        if block.t == "RawBlock" and block.text:find("webgeods.kit.com", 1, true) then
          at = i
        end
      end
      table.insert(doc.blocks, at, line)
      return doc
    end
  }
}
