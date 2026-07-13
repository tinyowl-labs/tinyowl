# GeoJSON Import Guide

This guide walks through importing a GeoJSON file of archaeological features into TinyOwl. You'll learn how to handle complex geometries, define table structure with TOML, and push data to the server.

## Prerequisites

- A running TinyOwl server
- The TinyOwl CLI installed
- A GeoJSON file with your data

## Sample Data

We'll use this example GeoJSON file (`features.geojson`):

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "CTX-001",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[-1.5, 52.0], [-1.4, 52.0], [-1.4, 52.1], [-1.5, 52.1], [-1.5, 52.0]]]
      },
      "properties": {
        "name": "Pit Feature 1",
        "period": "Iron Age",
        "depth_cm": 85,
        "soil": "dark_loam",
        "overlies": "CTX-002",
        "cuts": "CTX-003"
      }
    },
    {
      "type": "Feature",
      "id": "CTX-002",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[-1.5, 52.0], [-1.45, 52.0], [-1.45, 52.05], [-1.5, 52.05], [-1.5, 52.0]]]
      },
      "properties": {
        "name": "Fill Layer",
        "period": "Iron Age;Roman",
        "depth_cm": 30,
        "soil": "silty_clay"
      }
    },
    {
      "type": "Feature",
      "id": "CTX-003",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[-1.55, 52.0], [-1.5, 52.0], [-1.5, 52.05], [-1.55, 52.05], [-1.55, 52.0]]]
      },
      "properties": {
        "name": "Natural Substrate",
        "period": "Prehistoric",
        "depth_cm": 120,
        "soil": "bedrock"
      }
    }
  ]
}
```

## Step 1: Create Table TOML

Create a `Contexts.toml` file that defines the entity type and its columns:

```toml
[table]
key = "Contexts"

[[columns]]
name = "name"
type = "text"

[[columns]]
name = "period"
type = "text"
vocabulary = "periodo"

[[columns]]
name = "depth_cm"
type = "integer"

[[columns]]
name = "soil"
type = "text"
vocabulary = "soil"

[[columns]]
name = "overlies"
type = "text"
references = "Contexts.source_id"

[[columns]]
name = "cuts"
type = "text"
references = "Contexts.source_id"
```

**Key differences from CSV import:**
- Geometry is taken directly from `feature.geometry` — no column mapping needed
- The Feature `id` becomes the `source_id`
- `references` on a column declares a foreign key to another table
- Set `vocabulary` on columns that contain controlled terminology

## Step 2: Create Project TOML

```toml
[project]
name = "My Excavation"
slug = "my-excavation"
machine = "archaeology"
```

## Step 3: Validate

```bash
tinyowl validate features.geojson --table Contexts.toml
```

Expected output:

```
✓ features.geojson — 3 records, 0 errors, 0 warnings
```

## Step 4: Run the Import

```bash
tinyowl import features.geojson \
  --as-new Contexts \
  --yes
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

## Step 5: Verify via the API

```bash
# View tables
curl http://localhost:8090/api/v1/projects/my-org/my-excavation/tables

# View rows
curl http://localhost:8090/api/v1/projects/my-org/my-excavation/tables/Contexts/rows

# View as GeoJSON
curl http://localhost:8090/api/v1/projects/my-org/my-excavation/layers/Contexts/geojson
```

## Handling Complex Geometries

GeoJSON supports `Polygon`, `MultiPolygon`, `Point`, `MultiPoint`, `LineString`, and `MultiLineString`. TinyOwl stores them as WKB geometry in the GeoPackage.

- **Polygon/MultiPolygon** — Stored with full ring fidelity
- **Point** — Single coordinate pair
- **LineString** — Ordered coordinate sequence

The GeoJSON layer endpoint decodes WKB back to GeoJSON on read.

## Importing Shapefiles

Shapefiles can be imported directly:

```bash
tinyowl import boundary.shp --as-new Boundaries --yes
```

Or convert to GeoJSON first using GDAL:

```bash
ogr2ogr -f GeoJSON features.geojson input.shp
```

Then import the resulting GeoJSON file as above.

## Import via the Web UI

If using the TinyOwl frontend:

1. Navigate to your project
2. Go to **Layers** or **Dashboard**
3. Use the CLI import command above — the web UI is for browsing, not data import

## Next Steps

- [CSV Import Guide](/docs/guides/import-csv/) — Import tabular data
- [TOML Config Reference](/docs/config/tinyowl-toml/) — Full mapping schema
- [Connecting QGIS](/docs/guides/ogc-qgis/) — Work with imported data in QGIS
- [API Reference](/docs/api/) — Programmatic access via the REST API
