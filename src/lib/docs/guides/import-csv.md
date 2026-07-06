# CSV Import Guide

This guide walks through importing a CSV file of archaeological sites into TinyOwl. You'll learn how to prepare your data, create a column mapping, run the import, and review the results.

## Prerequisites

- A running TinyOwl server (see [Docker Deployment](/docs/deployment/docker/) or [Cloud Run Deployment](/docs/deployment/cloud-run/))
- The TinyOwl CLI installed
- A CSV file with your data

## Sample Data

We'll use this example CSV (`sites.csv`):

```csv
SiteID,SiteName,Latitude,Longitude,Period,StartDate,EndDate,Depth_cm,SoilType
SITE-001,Hill Fort Alpha,52.1234,-1.5678,Roman;Iron Age,-100,400,45,sandy_loam
SITE-002,Valley Settlement,52.2345,-1.6789,Medieval,1066,1500,30,clay
SITE-003,Ridge Enclosure,52.3456,-1.7890,Bronze Age,-2000,-700,60,chalk
```

## Step 1: Create Project Configuration

Create a `project.toml` at the root of your data directory:

```toml
[project]
name = "My Excavation"
slug = "my-excavation"
machine = "archaeology"
```

Then create a table TOML file (e.g., `Site_Points.toml`) to define the entity type and column mappings:

```toml
[table]
key = "Site_Points"

[[columns]]
name = "SiteID"
type = "text"

[[columns]]
name = "SiteName"
type = "text"

[[columns]]
name = "Latitude"
type = "real"

[[columns]]
name = "Longitude"
type = "real"

[[columns]]
name = "Period"
type = "text"
vocabulary = "periodo"

[[columns]]
name = "StartDate"
type = "integer"

[[columns]]
name = "EndDate"
type = "integer"

[[columns]]
name = "Depth_cm"
type = "integer"

[[columns]]
name = "SoilType"
type = "text"
vocabulary = "soil"
```

**Key points:**
- `key` in `[table]` becomes the entity type (table name in the GeoPackage)
- `vocabulary` on a column triggers automatic value-level indexing during push
- `property` on a column links it to a CRM property
- `references` on a column declares a foreign key to another table's `source_id`

## Step 2: Validate the File

Before importing, validate your CSV against the TOML schema:

```bash
tinyowl validate sites.csv --table Site_Points.toml
```

Expected output:

```
✓ sites.csv — 3 records, 0 errors, 0 warnings
```

## Step 3: Run the Import

The CLI converts your CSV to a GeoPackage and pushes it to the server:

```bash
tinyowl import sites.csv \
  --org my-org \
  --project my-excavation \
  --table Site_Points.toml \
  --project-toml project.toml
```

Expected output:

```
Import Summary
━━━━━━━━━━━━━━━━━━━━━━━━
Total rows:       3
New entities:     3
━━━━━━━━━━━━━━━━━━━━━━━━
Push complete: seq=1
```

## Step 4: Verify via the API

```bash
curl http://localhost:8090/api/v1/projects/my-org/my-excavation/tables/Site_Points/rows
```

## Updating Existing Data

Edit your CSV and run the import again. The CLI diffs against the current state and only sends changed rows. The server tracks revision history — old values are preserved and can be retrieved from previous diffs.

## Handling Conflicts

Conflicts occur when an entity was modified in the database after your last pull. Before pushing, always pull the latest state:

```bash
tinyowl pull --org my-org --project my-excavation
```

This updates your local canonical with any remote changes. The CLI will flag conflicts during import for manual resolution.

## Next Steps

- [GeoJSON Import Guide](/docs/guides/import-geojson/) — Import spatial data with complex geometries
- [TOML Config Reference](/docs/config/tinyowl-toml/) — Full mapping schema documentation
- [Connecting QGIS](/docs/guides/ogc-qgis/) — Work with imported data in QGIS
