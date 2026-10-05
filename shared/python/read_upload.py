# read_upload(): the uploaded file, read the way every tool reads it.
#
# Inlined at render time into a tool cell that declares
#   #| helper: read_upload
# (webgeods-cells.lua), for TOOL pages only: in an article this code is
# part of what the reader is learning, so it stays written out there.
import geopandas as gpd

NO_CRS_WARNING = "No CRS found in the uploaded file — assuming WGS84 (EPSG:4326)."


def read_upload(geometry=None):
    """Read /uploaded.geojson, .shp or .zip (Upload.load writes one).

    geometry: geometry types to keep, e.g. ["LineString", "MultiLineString"];
    the rest are dropped and counted.

    Returns (gdf, original_crs, crs_warning, dropped). gdf is in WGS84
    (GeoJSON and MapLibre assume it) or None if nothing was readable;
    original_crs is the CRS the file was uploaded in, for reprojecting
    downloads back to it; a file without a CRS is taken as WGS84, with
    crs_warning saying so.
    """
    gdf = None
    for path in ["/uploaded.geojson", "/uploaded.shp", "/vsizip//uploaded.zip"]:
        try:
            gdf = gpd.read_file(path)
            break
        except Exception:
            pass
    if gdf is None:
        return None, None, None, 0

    crs_warning = None
    if gdf.crs is None:
        gdf = gdf.set_crs("EPSG:4326")
        crs_warning = NO_CRS_WARNING
    original_crs = gdf.crs
    if str(original_crs) != "EPSG:4326":
        gdf = gdf.to_crs("EPSG:4326")

    dropped = 0
    if geometry is not None:
        keep = gdf.geometry.geom_type.isin(geometry)
        dropped = int((~keep).sum())
        gdf = gdf[keep].reset_index(drop=True)

    return gdf, original_crs, crs_warning, dropped
