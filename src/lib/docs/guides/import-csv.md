# CSV / GeoJSON / Shapefile Import

Import tabular or spatial files into a TinyOwl project with the CLI. Interactive by default (like `sv create`); use flags for scripts.

## Prerequisites

- TinyOwl CLI installed (`go install …/tinyowl-cli/cmd/tinyowl@latest`)
- An existing project (`tinyowl create ./my-excavation`) or create one first

## Quick path

```bash
cd my-excavation

# New table from CSV (lat/lon → Point geometry when present)
tinyowl import sites.csv --as-new Site_Points

# GeoJSON FeatureCollection
tinyowl import finds.geojson --as-new Finds

# Shapefile (.shp + .dbf)
tinyowl import boundary.shp --as-new Boundaries --yes

# Append into an existing table
tinyowl import more_sites.csv --into Site_Points --map "SiteName=name,Period=period"

tinyowl push
```

## What import does

1. Detects format (`.csv`, `.geojson`/`.json`, `.shp`, `.gpkg`)
2. For **`--as-new`**: writes `tables/{key}.toml` with CRM/vocab suggestions (`property` / `range` / `vocabulary`), creates the layer, inserts rows
3. For **`--into`**: maps source columns → target columns (`--map` or auto-match by name), appends rows
4. Prints a **gap summary** for columns still missing annotations
5. On `tinyowl push`, annotations land in Postgres `column_annotations.crm_*`

## Sample CSV

```csv
SiteID,SiteName,Latitude,Longitude,Period,StartDate,EndDate,Depth_cm,SoilType
SITE-001,Hill Fort Alpha,52.1234,-1.5678,Roman,-100,400,45,sandy_loam
SITE-002,Valley Settlement,52.2345,-1.6789,Medieval,1066,1500,30,clay
```

```bash
tinyowl import sites.csv --as-new Site_Points --yes
```

Column names with spaces are sanitized (`recorded by` → `recorded_by`). UTF-8 BOM is stripped.

## GeoPackage bootstrap

Full legacy QField/QGIS GeoPackage → new project (previous `tinyowl import gpkg dir` behaviour):

```bash
tinyowl import survey.gpkg --project ./my-survey --name "My Survey"
# or legacy two-arg form:
tinyowl import survey.gpkg ./my-survey
```

## Review gaps

After import, edit `tables/*.toml` if needed, then push. In the web app: **Settings → Mappings** for value→concept cleanup and column annotation review.

## Flags

| Flag | Meaning |
|------|---------|
| `--as-new KEY` | Create table `KEY` |
| `--into KEY` | Append to existing table |
| `--map a=b,c=d` | Source→target column map |
| `--project DIR` | Project root |
| `--no-suggest` | Skip CRM/vocab suggestions |
| `--yes` | Non-interactive |
