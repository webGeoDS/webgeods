# Generates gap-filler-two-bands.tif, the Raster Gap Filler tool's example
# (blog/tools/raster-gap-filler.qmd). Run from this folder:
#   Rscript _make-gap-filler-two-bands.R
# The leading underscore keeps Quarto from treating this as a page.
library(terra)

# Two bands, deliberately with two DIFFERENT gaps, not "one gap in the
# target, nothing missing in the covariate" -- the covariate having a
# gap of its own (a shorter revisit on one satellite band, a different
# cloud mask, anything a real multi-band product commonly has) is the
# case this tool actually needs to handle correctly, not a corner case
# to gloss over in its own example.
set.seed(42)
n <- 25
xs <- 0:(n - 1)
ys <- 0:(n - 1)

# Same Gaussian-hill shape reused across this project's raster examples
# (raster-inspector.qmd, viewshed-calculator.qmd) -- a reader who's
# already seen one recognizes it here too. The covariate is a scaled,
# shifted, independently-noised version of the SAME underlying trend,
# not a copy of the target -- real enough correlation for cokriging to
# find, not a giveaway.
trend <- outer(ys, xs, function(y, x) 100 + 40 * exp(-((x - 12)^2 + (y - 12)^2) / 40))

target <- trend + matrix(rnorm(n * n, sd = 1.5), nrow = n)
covariate <- 0.6 * trend + 20 + matrix(rnorm(n * n, sd = 2), nrow = n)

# The target's own gap: one contiguous block (rows/cols 8-16), the
# shape a real gap-filling problem actually looks like -- not pixels
# scattered at random, which would be a much easier, unrealistic case.
target[9:17, 9:17] <- NA

# The covariate's own gap: smaller, and only PARTLY inside the
# target's -- rows/cols 12-14 sit inside the target's 9-17 block, but
# most of the target's gap still has the covariate available. This
# gives the example three real regions at once: covariate available
# where the target isn't (cokriging's actual job), both missing at
# once (nothing to predict from, stays empty), and both present
# (where the model gets fit).
covariate[12:14, 12:14] <- NA

band_target <- rast(target, crs = "EPSG:4326")
band_covariate <- rast(covariate, crs = "EPSG:4326")
ext(band_target) <- c(12.40, 12.40 + n * 0.004, 41.90, 41.90 + n * 0.004)
ext(band_covariate) <- ext(band_target)
names(band_target) <- "target"
names(band_covariate) <- "covariate"

r <- c(band_target, band_covariate)
writeRaster(r, "gap-filler-two-bands.tif", overwrite = TRUE, filetype = "GTiff")

"example 2-band raster written"
