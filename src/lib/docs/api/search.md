# Search API

Spatial search across all projects. Finds entities within a given radius of a point.

## Search

```
GET /api/v1/search
```

Search for entities near a geographic point. Returns results from public projects and projects the authenticated user is a member of, ordered by distance.

**Public** — no authentication required (but authenticated users see results from their private projects too).

### Query Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `lat` | number | Yes | Latitude (WGS84) |
| `lng` | number | Yes | Longitude (WGS84) |
| `radius` | number | No | Search radius in metres (default: `100000` i.e. 100 km) |

### Response

```json
[
  {
    "project_slug": "injalak/rock-art-survey",
    "project_title": "Injalak Rock Art Survey",
    "entity_type": "RockArt_Points",
    "entity_id": "RAP-0042",
    "lat": -12.33456,
    "lng": 133.06123,
    "distance_m": 120.5
  },
  {
    "project_slug": "my-excavation",
    "project_title": "My Excavation Project",
    "entity_type": "Site_Points",
    "entity_id": "SITE-001",
    "lat": -12.33200,
    "lng": 133.05800,
    "distance_m": 450.3
  }
]
```

| Field | Type | Description |
|---|---|---|
| `project_slug` | string | Slug of the containing project |
| `project_title` | string | Project display title |
| `entity_type` | string | Entity type (table name) |
| `entity_id` | string | Entity source_id |
| `lat` | number | Latitude of the entity centroid |
| `lng` | number | Longitude of the entity centroid |
| `distance_m` | number | Distance from search point in metres |

Results are limited to 100 entities, ordered by distance ascending.

### Example

```bash
# Search within 50 km of Injalak Hill
curl "http://localhost:8090/api/v1/search?lat=-12.33&lng=133.06&radius=50000"
```

### Authenticated Search

Pass a Bearer token to include results from private projects you are a member of:

```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8090/api/v1/search?lat=-12.33&lng=133.06&radius=10000"
```

---

## How It Works

Spatial search uses PostGIS `ST_DWithin` against the `entity_spatial` table, which is populated during push indexing. Each entity's geometry centroid is used for the distance calculation.

The search returns entities from:
- **Public projects** — always visible
- **User's projects** — visible when authenticated, based on `project_members` membership
