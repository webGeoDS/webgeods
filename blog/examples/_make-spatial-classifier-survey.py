# Generates spatial-classifier-survey.geojson, the Spatial Classifier
# tool's example (blog/tools/spatial-classifier.qmd). Run from this
# folder: python _make-spatial-classifier-survey.py
# The leading underscore keeps Quarto from treating this as a page.
import json

# Deterministic synthetic survey, the same one the companion article
# (Predicting Spatial Classes with Random Forest) builds from the same
# rule: 30 survey sites, 5 points recorded close together at each,
# three bands whose boundaries undulate across the area, and one site
# in five sitting on a local patch of a different class.
#
# Sampled in SITES on purpose, because that's how field surveys are
# usually collected and it's what makes the validation choice matter.
# An earlier version put the points on an even lattice with
# independent label noise, one point in nine flipped on its own. On
# that layout random and spatial-block validation scored the same
# (measured: 5-fold CV 0.61-0.63 vs 0.57-0.67), so the Held out
# selector had nothing to show. Here a random holdout keeps each test
# point's site-mates in training, and the patches make those
# site-mates informative in a way the model can't know from anywhere
# else: measured live, 5-fold CV 0.76 random vs 0.57 in blocks.
NEXT_CLASS = {"south": "centre", "centre": "north", "north": "south"}
SITE_OFFSETS = [(0, 0), (1, 0.4), (-0.6, 0.9), (-0.8, -0.7), (0.5, -1)]

features = []
for s in range(30):
    col, row = s % 6, s // 6
    cx = (col + 0.5) / 6 + ((s * 37) % 11 - 5) / 110
    cy = (row + 0.5) / 5 + ((s * 53) % 13 - 6) / 130
    for k, (dx, dy) in enumerate(SITE_OFFSETS):
        x, y = cx + dx * 0.02, cy + dy * 0.02
        # Triangular wave along x: the band boundaries rise and fall,
        # so no single horizontal cut separates the classes.
        u, v = x * 15, y * 10
        tri = abs((2 * u) % 8 - 4) - 2
        cls = "south" if v < 3 + tri else ("centre" if v < 6 + tri else "north")
        if s % 5 == 2:
            cls = NEXT_CLASS[cls]
        features.append({
            "type": "Feature",
            "properties": {"name": f"site {s + 1} point {k + 1}", "class": cls},
            "geometry": {"type": "Point", "coordinates": [12.4450 + x * 0.0150, 41.8850 + y * 0.0120]}
        })

lines = ",\n".join("  " + json.dumps(f, ensure_ascii=False) for f in features)
with open("spatial-classifier-survey.geojson", "w", encoding="utf-8", newline="\n") as f:
    f.write('{"type": "FeatureCollection", "features": [\n' + lines + "\n]}\n")
