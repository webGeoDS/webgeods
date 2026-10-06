# Generates kriging-soil-moisture.geojson, the Kriging Interpolator tool's
# example (blog/tools/kriging-interpolator.qmd). Run from this folder:
#   Rscript _make-kriging-soil-moisture.R
# The leading underscore keeps Quarto from treating this as a page.
library(sf)

# Deterministic synthetic soil-moisture survey: 45 sample points
# scattered across a roughly 800m x 600m field, with a real spatial
# trend (a band of higher moisture, as if following a shallow
# drainage line, plus a smaller ripple) and measurement noise on top
# -- gives the variogram real spatial structure to find, not just
# white noise a model could never fit meaningfully.
set.seed(42)
n <- 45

lon0 <- 12.4450
lat0 <- 41.8850
# Rough local meters-per-degree at this latitude -- only used to size
# the synthetic field in real-world terms, not a projection.
dlon <- 800 / (111320 * cos(lat0 * pi / 180))
dlat <- 600 / 110540

x <- runif(n, 0, dlon)
y <- runif(n, 0, dlat)

trend <- 22 + 10 * exp(-((x / dlon - y / dlat)^2) / 0.08) + 3 * sin(4 * pi * x / dlon)
moisture <- round(trend + rnorm(n, sd = 1.5), 1)

pts <- st_as_sf(
  data.frame(id = seq_len(n), soil_moisture_pct = moisture, lon = lon0 + x, lat = lat0 + y),
  coords = c("lon", "lat"), crs = 4326
)

st_write(pts, "kriging-soil-moisture.geojson", driver = "GeoJSON", delete_dsn = TRUE)

"example soil moisture sample points written"
