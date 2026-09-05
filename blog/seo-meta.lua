--[[
  seo-meta.lua
  ============
  Quarto Lua filter: injects <link rel="canonical">, the OG/Twitter
  tags open-graph:true doesn't cover (og:url, og:image, og:type,
  twitter:card), and a small JSON-LD block (Article for posts,
  WebSite for the homepage) -- none of this has a native `_quarto.yml`
  option (checked the installed schema directly: no `canonical` key
  anywhere in it), and `open-graph: true` on its own only emits
  og:title/og:description/og:site_name. See roadmap-acquisizione.md's
  SEO/navigability audit, 2026-09-06.

  SITE_URL is a literal here, not read from `website.site-url` --
  quarto.doc doesn't expose project website metadata to a filter (only
  quarto.doc.project_output_file() for the current page's own relative
  path), and every other cross-reference in this project already
  hardcodes the same literal (e.g. the cheatsheet PDF's CTA links).
]]

local SITE_URL = "https://webgeods.com"

local function canonical_url()
  local rel = quarto.doc.project_output_file()
  if not rel then
    return nil
  end
  rel = rel:gsub("\\", "/")
  -- "index.html" (bare, or as a directory's own listing page) drops
  -- its filename in the canonical URL -- the clean "/" or "/tools/"
  -- form, not "/index.html": sitemap.xml already lists the .html
  -- form (a separate, lower-effort fix would be changing that too,
  -- not attempted here), but the canonical tag is squarely this
  -- project's own choice to make, and the clean form is the
  -- conventional one search engines expect.
  if rel == "index.html" then
    return SITE_URL .. "/"
  end
  local dir = rel:match("^(.*)/index%.html$")
  if dir then
    return SITE_URL .. "/" .. dir .. "/"
  end
  return SITE_URL .. "/" .. rel
end

local function escape_html_attr(s)
  return (s or ""):gsub("&", "&amp;"):gsub('"', "&quot;"):gsub("<", "&lt;"):gsub(">", "&gt;")
end

local function escape_json(s)
  return (s or ""):gsub("\\", "\\\\"):gsub('"', '\\"'):gsub("\n", "\\n")
end

function Meta(meta)
  local url = canonical_url()
  if not url then
    return meta
  end

  local rel = quarto.doc.project_output_file():gsub("\\", "/")
  local is_post = rel:match("^posts/") ~= nil
  local og_type = is_post and "article" or "website"

  local title = pandoc.utils.stringify(meta.title or "webGeoDs")
  local description = meta.description and pandoc.utils.stringify(meta.description) or ""

  local tags = {
    '<link rel="canonical" href="' .. escape_html_attr(url) .. '">',
    '<meta property="og:url" content="' .. escape_html_attr(url) .. '">',
    '<meta property="og:type" content="' .. og_type .. '">',
    '<meta property="og:image" content="' .. SITE_URL .. '/og-image.png">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:image" content="' .. SITE_URL .. '/og-image.png">'
  }

  -- JSON-LD: Article for posts (headline/description/url, plus
  -- datePublished when the page sets a date -- most do), WebSite only
  -- for the actual homepage (a Person/Organization block would need
  -- real entity data this project doesn't have yet, so left out
  -- rather than filled with placeholders).
  local jsonld
  if is_post then
    local date_line = ""
    if meta.date then
      local date_str = pandoc.utils.stringify(meta.date)
      if date_str ~= "" then
        date_line = ',\n  "datePublished": "' .. escape_json(date_str) .. '"'
      end
    end
    jsonld = '{\n  "@context": "https://schema.org",\n  "@type": "Article",\n  "headline": "'
      .. escape_json(title) .. '",\n  "description": "' .. escape_json(description)
      .. '",\n  "url": "' .. escape_json(url) .. '"' .. date_line .. '\n}'
  elseif rel == "index.html" then
    jsonld = '{\n  "@context": "https://schema.org",\n  "@type": "WebSite",\n  "name": "webGeoDs",\n  "url": "'
      .. escape_json(SITE_URL) .. '/"\n}'
  end
  if jsonld then
    table.insert(tags, '<script type="application/ld+json">\n' .. jsonld .. '\n</script>')
  end

  quarto.doc.include_text("in-header", table.concat(tags, "\n"))

  return meta
end
