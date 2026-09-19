/**
 * WebGeoDS.Map — raster rendering
 *
 * Extends `WebGeoDSMap` (shared/map.js) with everything specific to
 * single-band raster overlays: the color ramp, the off-DOM canvas
 * renderer, the preview downsampler, and setRasterImage()/
 * removeRasterImage() themselves. Split out of map.js (2026-09-14,
 * see check-file-size-budget.mjs's own long-standing note that map.js
 * had accumulated unrelated concerns) because this block is fully
 * self-contained — verified before splitting: it references no
 * module-private helper of map.js's own IIFE (designToken,
 * _tableSelections, the MapLibre bootstrap), only `this.*` and its own
 * parameters — so plain prototype augmentation is enough, no new
 * shared state to expose.
 *
 * Must load AFTER shared/map.js (extends its class) and before any
 * page code calls setRasterImage()/removeRasterImage() — in practice,
 * anywhere in the same site-wide script list, since all of these are
 * blocking <script> tags that finish long before DOMContentLoaded.
 *
 * No ES module syntax is used so the file can be included
 * directly by Quarto in the generated HTML.
 */

(() => {

  "use strict";

  const WebGeoDSMap =
    window.WebGeoDS.Map;


  // ----------------------------------------------------------
  // Default color ramp for setRasterImage() — see
  // _sampleRasterRamp()'s doc comment further down.
  // ----------------------------------------------------------

  WebGeoDSMap.DEFAULT_RASTER_RAMP = [
    [0.00, 68, 1, 84],
    [0.25, 59, 82, 139],
    [0.50, 33, 144, 140],
    [0.75, 94, 201, 98],
    [1.00, 253, 231, 37]
  ];


  // ----------------------------------------------------------
  // Max long-side dimension for setRasterImage()'s canvas preview
  // — see _downsampleRasterForPreview()'s doc comment. Confirmed
  // necessary (not just a hypothetical cap) against a real
  // 2560x2560 GeoTIFF: an un-downsampled 6.5M-pixel synchronous
  // canvas loop visibly froze the tab for tens of seconds.
  // ----------------------------------------------------------

  WebGeoDSMap.MAX_RASTER_PREVIEW_DIM = 1024;


  // ==========================================================
  // Raster color ramp — internal, used by setRasterImage() below.
  //
  // A fixed 5-stop viridis-like ramp (dark purple -> teal -> yellow),
  // perceptually sequential and colorblind-safe, matching no
  // particular domain (NDVI-style green ramps etc. are a decision
  // for whichever tool needs them — pass `colorRamp` to override).
  // Stops are [t, r, g, b] with t in [0, 1]; linear interpolation
  // between the two nearest stops.
  // ==========================================================

  WebGeoDSMap.prototype._sampleRasterRamp = function (
    t,
    colorRamp
  ) {

    const stops =
      colorRamp ??
      WebGeoDSMap.DEFAULT_RASTER_RAMP;

    const clamped =
      Math.min(
        1,
        Math.max(0, t)
      );

    for (
      let i = 0;
      i < stops.length - 1;
      i++
    ) {

      const [t0, r0, g0, b0] =
        stops[i];

      const [t1, r1, g1, b1] =
        stops[i + 1];

      if (
        clamped >= t0 &&
        clamped <= t1
      ) {

        const f =
          (clamped - t0) /
          ((t1 - t0) || 1);

        return [
          Math.round(r0 + (r1 - r0) * f),
          Math.round(g0 + (g1 - g0) * f),
          Math.round(b0 + (b1 - b0) * f)
        ];

      }

    }

    const [, r, g, b] =
      stops[stops.length - 1];

    return [r, g, b];

  };


  // ==========================================================
  // Renders a flat array of pixel values (row-major, NaN = NoData)
  // into an off-DOM <canvas> — one RGB triple per finite value via
  // _sampleRasterRamp(), alpha 0 for NaN (NoData shows through to
  // whatever's under the layer instead of a bogus color). Opacity of
  // the VALID pixels is a layer paint property (raster-opacity in
  // setRasterImage() below), not baked into the pixel alpha here —
  // keeps the two concerns independent.
  // ==========================================================

  WebGeoDSMap.prototype._renderRasterCanvas = function ({
    width,
    height,
    values,
    min,
    max,
    colorRamp
  }) {

    const canvas =
      document.createElement(
        "canvas"
      );

    canvas.width = width;
    canvas.height = height;

    const ctx =
      canvas.getContext("2d");

    const imageData =
      ctx.createImageData(
        width,
        height
      );

    const range =
      (max - min) || 1;

    for (
      let i = 0;
      i < values.length;
      i++
    ) {

      const v =
        values[i];

      const offset =
        i * 4;

      if (!Number.isFinite(v)) {

        imageData.data[offset + 3] =
          0;

        continue;

      }

      const [r, g, b] =
        this._sampleRasterRamp(
          (v - min) / range,
          colorRamp
        );

      imageData.data[offset] = r;
      imageData.data[offset + 1] = g;
      imageData.data[offset + 2] = b;
      imageData.data[offset + 3] = 255;

    }

    ctx.putImageData(
      imageData,
      0,
      0
    );

    return canvas;

  };


  // ==========================================================
  // Downsample for preview — internal, used by setRasterImage()
  // below. Nearest-neighbor sampling (adequate for a preview
  // overlay, not the authoritative data — the caller's own
  // downloadable file, if any, is computed separately at full
  // resolution) so a large real-world raster (tested against an
  // actual 2560x2560, 4-band GeoTIFF) doesn't force a 6.5M-iteration
  // synchronous canvas loop that visibly freezes the tab for tens of
  // seconds. A no-op when the raster is already small enough.
  // ==========================================================

  WebGeoDSMap.prototype._downsampleRasterForPreview = function ({
    width,
    height,
    values,
    maxDim
  }) {

    if (
      width <= maxDim &&
      height <= maxDim
    ) {

      return { width, height, values };

    }


    const scale =
      Math.max(width, height) / maxDim;

    const outWidth =
      Math.max(1, Math.round(width / scale));

    const outHeight =
      Math.max(1, Math.round(height / scale));

    const out =
      new Float32Array(outWidth * outHeight);

    for (
      let y = 0;
      y < outHeight;
      y++
    ) {

      const srcY =
        Math.min(
          height - 1,
          Math.floor(y * scale)
        );

      for (
        let x = 0;
        x < outWidth;
        x++
      ) {

        const srcX =
          Math.min(
            width - 1,
            Math.floor(x * scale)
          );

        out[y * outWidth + x] =
          values[srcY * width + srcX];

      }

    }


    return {
      width: outWidth,
      height: outHeight,
      values: out
    };

  };


  // ==========================================================
  // Adds/updates the MapLibre `image` source + `raster` layer a
  // rendered canvas is displayed through — the part setRasterImage()
  // and setRasterRGBImage() below share verbatim (georeferencing to
  // `bounds`' axis-aligned WGS84 bounding box, create-if-absent /
  // update-if-present via MapLibre's own updateImage()). Split out
  // once a second real caller (the RGB composite below) needed the
  // exact same wiring around a differently-rendered canvas — the one
  // thing that varies between the two is how the canvas's pixels get
  // decided, not how they reach the map.
  // ==========================================================

  WebGeoDSMap.prototype._setImageSourceCanvas = function (
    sourceId,
    canvas,
    bounds,
    opacity,
    layerId
  ) {

    const [minx, miny, maxx, maxy] =
      bounds;

    const coordinates = [
      [minx, maxy],
      [maxx, maxy],
      [maxx, miny],
      [minx, miny]
    ];

    const url =
      canvas.toDataURL();


    const source =
      this.map.getSource(
        sourceId
      );


    if (source) {

      source.updateImage({
        url,
        coordinates
      });

    }

    else {

      this.map.addSource(
        sourceId,
        {

          type:
            "image",

          url,

          coordinates

        }
      );


      this.map.addLayer({

        id:
          layerId,

        type:
          "raster",

        source:
          sourceId,

        paint: {

          "raster-opacity":
            opacity

        }

      });

    }

  };


  // ==========================================================
  // Set raster image
  //
  // Displays a computed single-band raster (e.g. Band Math/NDVI
  // output — there is no per-pixel color rendering anywhere else on
  // this site, the Inspector tool deliberately shows only a
  // footprint) as a colored overlay via MapLibre's `image` source
  // type, georeferenced to `bounds`' axis-aligned WGS84 bounding box
  // — the SAME reprojected-bbox approximation the footprint feature
  // already uses elsewhere (not a new source of imprecision).
  //
  // `values` — a flat, row-major Float32Array/Array (NaN = NoData).
  // `bounds` — [minx, miny, maxx, maxy] in WGS84.
  // `options.opacity` — layer opacity, default 0.85.
  // `options.colorRamp` — override _sampleRasterRamp()'s default.
  //
  // Create-if-absent / update-if-present, same shape as setGeoJSON:
  // an existing image source is updated via MapLibre's own
  // updateImage() (no remove/re-add churn) rather than recreated.
  // ==========================================================

  WebGeoDSMap.prototype.setRasterImage = async function (
    sourceId,
    {
      bounds,
      width,
      height,
      values,
      min,
      max,
      opacity = 0.85,
      colorRamp
    } = {},
    options = {}
  ) {

    await this.ready();

    const preview =
      this._downsampleRasterForPreview({
        width,
        height,
        values,
        maxDim: WebGeoDSMap.MAX_RASTER_PREVIEW_DIM
      });

    const canvas =
      this._renderRasterCanvas({
        width: preview.width,
        height: preview.height,
        values: preview.values,
        min,
        max,
        colorRamp
      });

    this._setImageSourceCanvas(
      sourceId,
      canvas,
      bounds,
      opacity,
      options.layerId ?? sourceId
    );

    return this;

  };


  // ==========================================================
  // Renders three independently-stretched bands into one off-DOM
  // <canvas> — an RGB composite (raster-inspector.qmd's "one band per
  // channel" preview), not a value-ramp mapping: each channel's own
  // min/max stretches ITS values to 0-255 (the conventional way to
  // preview an arbitrary band triple, since the three bands rarely
  // share a common value range), and the three stretched values
  // become that pixel's actual R/G/B — no _sampleRasterRamp()
  // involved, there is no single "value" to look up a color for. A
  // pixel is fully transparent if ANY of its three channels is
  // NoData there (a color built from only two real channels isn't a
  // real color).
  // ==========================================================

  WebGeoDSMap.prototype._renderRasterRGBCanvas = function ({
    width,
    height,
    red,
    green,
    blue
  }) {

    const canvas =
      document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    const ctx =
      canvas.getContext("2d");

    const imageData =
      ctx.createImageData(width, height);

    const stretch = (channel) => {

      const range =
        (channel.max - channel.min) || 1;

      return (v) =>
        Math.round(
          Math.min(255, Math.max(0, ((v - channel.min) / range) * 255))
        );

    };

    const toR = stretch(red);
    const toG = stretch(green);
    const toB = stretch(blue);

    for (let i = 0; i < red.values.length; i++) {

      const r = red.values[i];
      const g = green.values[i];
      const b = blue.values[i];

      const offset =
        i * 4;

      if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {

        imageData.data[offset + 3] =
          0;

        continue;

      }

      imageData.data[offset] = toR(r);
      imageData.data[offset + 1] = toG(g);
      imageData.data[offset + 2] = toB(b);
      imageData.data[offset + 3] = 255;

    }

    ctx.putImageData(imageData, 0, 0);

    return canvas;

  };


  // ==========================================================
  // Set raster RGB image
  //
  // Same overlay mechanics as setRasterImage() above (georeferenced
  // `image` source, create-if-absent/update-if-present), but for
  // three bands composited as one color image instead of a single
  // band mapped through a color ramp — raster-inspector.qmd's "RGB
  // composite" mode, picking any three of a file's bands as Red/
  // Green/Blue rather than always the first three.
  //
  // `red`/`green`/`blue` — each `{values, min, max}`, `values` a
  // flat, row-major Float32Array/Array for THAT band (NaN = NoData),
  // same shape setRasterImage() takes for its own single `values`.
  // All three must share `width`/`height` (the same raster's bands
  // always do).
  // ==========================================================

  WebGeoDSMap.prototype.setRasterRGBImage = async function (
    sourceId,
    {
      bounds,
      width,
      height,
      red,
      green,
      blue,
      opacity = 0.85
    } = {},
    options = {}
  ) {

    await this.ready();

    const maxDim =
      WebGeoDSMap.MAX_RASTER_PREVIEW_DIM;

    // Each channel is downsampled independently, but the scale is a
    // pure function of width/height/maxDim (see
    // _downsampleRasterForPreview()) -- never the data -- so all
    // three come back at the identical outWidth/outHeight, still
    // pixel-aligned with each other afterward.
    const previewRed =
      this._downsampleRasterForPreview({ width, height, values: red.values, maxDim });

    const previewGreen =
      this._downsampleRasterForPreview({ width, height, values: green.values, maxDim });

    const previewBlue =
      this._downsampleRasterForPreview({ width, height, values: blue.values, maxDim });

    const canvas =
      this._renderRasterRGBCanvas({
        width: previewRed.width,
        height: previewRed.height,
        red: { values: previewRed.values, min: red.min, max: red.max },
        green: { values: previewGreen.values, min: green.min, max: green.max },
        blue: { values: previewBlue.values, min: blue.min, max: blue.max }
      });

    this._setImageSourceCanvas(
      sourceId,
      canvas,
      bounds,
      opacity,
      options.layerId ?? sourceId
    );

    return this;

  };


  // ==========================================================
  // Remove raster image
  // ==========================================================

  WebGeoDSMap.prototype.removeRasterImage = async function (
    sourceId,
    layerId = sourceId
  ) {

    await this.ready();


    if (
      this.map.getLayer(
        layerId
      )
    ) {

      this.map.removeLayer(
        layerId
      );

    }


    if (
      this.map.getSource(
        sourceId
      )
    ) {

      this.map.removeSource(
        sourceId
      );

    }


    return this;

  };


})();
