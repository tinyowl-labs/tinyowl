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
| `q` | string | One of q / lat+lng / bbox / date_* | Full-text query (title, description, README, tags, value mappings) |
| `lat` | number | with `lng` | Latitude (WGS84) for point+radius filter |
| `lng` | number | with `lat` | Longitude (WGS84) |
| `radius` | number | No | Search radius in metres (default: `100000`) |
| `bbox` | string | No | Map-view rectangle `west,south,east,north` (WGS84). Preferred over lat/lng when set |
| `date_from` | integer | No | Inclusive lower year (negative = BCE). Overlaps project temporal extent |
| `date_to` | integer | No | Inclusive upper year |

At least one of `q`, (`lat`+`lng`), `bbox`, or (`date_from`/`date_to`) is required.

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
    "distance_m": 120.5,
    "tags_manual": ["rock-art", "arnhem-land"],
    "tags_auto": ["survey"],
    "date_start": -20000,
    "date_end": 2024,
    "date_start_label": "Pleistocene",
    "date_end_label": "Present"
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
| `tags_manual` | string[] | Curator tags from `project.toml` |
| `tags_auto` | string[] | Server-derived tags |
| `date_start` / `date_end` | integer\|null | Project temporal extent (astronomical years) |
| `date_start_label` / `date_end_label` | string\|null | Curator labels when set |

Limited to 50 projects.

### Examples

```bash
# Text
curl "http://localhost:8080/api/v1/search?q=roman+bronze"

# Spatial (map view bbox: west,south,east,north)
curl "http://localhost:8080/api/v1/search?bbox=132.8,-12.6,133.3,-12.1"

# Spatial (50 km point+radius)
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
