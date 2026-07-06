# Tables & Rows API

Endpoints for listing the tables in a project's canonical GeoPackage and querying row data.

## List Project Tables

```
GET /api/v1/projects/{slug}/tables
```

Retrieve all user-facing tables (entity types) in a project's GeoPackage, along with their non-system columns.

**Public** — no authentication required.

### Response

```json
{
  "tables": {
    "Site_Points": ["name", "period", "depth_cm", "soil_type"],
    "Artefacts": ["material", "condition", "weight_g"]
  }
}
```

Each key is a table name (entity type), and each value is an array of column names. System columns (prefixed with `_`), `source_id`, and `entity_type` are excluded.

### Example

```bash
curl http://localhost:8090/api/v1/projects/my-excavation/tables
```

---

## List Table Rows

```
GET /api/v1/projects/{slug}/tables/{table}/rows
```

Retrieve up to 500 rows from a specific table in the canonical GeoPackage. Only the latest non-deleted revision of each entity is returned.

**Public** — no authentication required.

### Path Parameters

| Parameter | Type | Description |
|---|---|---|
| `slug` | string | Project slug |
| `table` | string | Table (entity type) name |

### Response

```json
{
  "rows": [
    {
      "source_id": "SITE-001",
      "name": "Hill Fort Alpha",
      "period": "Iron Age",
      "depth_cm": "45",
      "soil_type": "sandy_loam"
    },
    {
      "source_id": "SITE-002",
      "name": "Valley Settlement",
      "period": "Medieval",
      "depth_cm": "30",
      "soil_type": "clay"
    }
  ]
}
```

System columns (`_revision`, `_deleted`, etc.), `source_id`, and `entity_type` are excluded from output. `source_id` is always included for row identification.

### Example

```bash
curl http://localhost:8090/api/v1/projects/my-excavation/tables/Site_Points/rows
```

---

## Get Table as GeoJSON

```
GET /api/v1/projects/{slug}/layers/{table}/geojson
```

Return all entities in a table as a GeoJSON FeatureCollection, with WKB geometry decoded to GeoJSON geometry objects.

**Public** — no authentication required.

### Response

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [133.06, -12.33]
      },
      "properties": {
        "entity_type": "Site_Points",
        "entity_id": "SITE-001"
      }
    }
  ]
}
```

Supported geometry types: Point, LineString, and Polygon.

### Example

```bash
curl http://localhost:8090/api/v1/projects/my-excavation/layers/Site_Points/geojson
```
