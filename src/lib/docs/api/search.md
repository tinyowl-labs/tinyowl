# Search API

Project discovery across the coordination index. Combines full-text search, optional spatial proximity, and optional temporal overlap.

## Search projects

```
GET /api/v1/search
```

Returns projects the caller can access (public + membership), ranked by text score (and distance when spatial).

**Public** — no authentication required (authenticated users also see their private projects).

### Query Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `q` | string | One of q / lat+lng / date_* | Full-text query (title, description, README, tags, value mappings) |
| `lat` | number | with `lng` | Latitude (WGS84) for spatial filter |
| `lng` | number | with `lat` | Longitude (WGS84) |
| `radius` | number | No | Search radius in metres (default: `100000`) |
| `date_from` | integer | No | Inclusive lower year (negative = BCE). Overlaps project temporal extent |
| `date_to` | integer | No | Inclusive upper year |

At least one of `q`, (`lat`+`lng`), or (`date_from`/`date_to`) is required.

### Response

```json
[
  {
    "slug": "injalak-hill",
    "title": "Injalak Rock Art Survey",
    "description": "Western Arnhem Land survey",
    "entity_count": 420,
    "table_count": 4,
    "bbox": "{\"type\":\"Polygon\",...}",
    "match_detail": "title",
    "distance_m": 120.5
  }
]
```

| Field | Type | Description |
|---|---|---|
| `slug` | string | Project slug |
| `title` | string | Display title |
| `description` | string\|null | Project description |
| `entity_count` | number | Indexed entity count |
| `table_count` | number | Indexed table count |
| `bbox` | string\|null | GeoJSON envelope when available |
| `match_detail` | string | Why it matched (title / description / vocab / readme) |
| `distance_m` | number\|null | Present when spatial filter used |

Limited to 50 projects.

### Examples

```bash
# Text
curl "http://localhost:8080/api/v1/search?q=roman+bronze"

# Spatial (50 km)
curl "http://localhost:8080/api/v1/search?lat=-12.33&lng=133.06&radius=50000"

# Temporal: Iron Age-ish BCE through early CE
curl "http://localhost:8080/api/v1/search?date_from=-800&date_to=400"

# Combined
curl "http://localhost:8080/api/v1/search?q=pottery&date_from=-500&date_to=200"
```

---

## Entity search within a project

```
GET /api/v1/projects/{slug}/search-entities?q=&limit=
```

Opens the project canonical GPKG and searches text columns (Stage 2). Requires project access.

---

## How temporal filter works

On push/reindex the server unions:

1. `[project.dates]` `start_year` / `end_year` from TOML
2. Parsed years from every `arch_date` column in the canonical GPKG

into `projects.date_start` / `date_end`. A query overlaps when:

`date_start <= date_to AND date_end >= date_from`

(open-ended if only one bound is supplied). Projects with no temporal extent are excluded from date-filtered results.
