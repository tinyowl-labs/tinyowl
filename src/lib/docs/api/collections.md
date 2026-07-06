# Projects API

Endpoints for managing projects — listing, creating, reading, and updating project metadata.

## List Projects

```
GET /api/v1/projects
```

List all projects the authenticated user is a member of.

**Authenticated** — requires Bearer token.

### Response

```json
[
  {
    "slug": "my-excavation",
    "role": "owner",
    "title": "My Excavation Project"
  },
  {
    "slug": "org/other-project",
    "role": "viewer",
    "title": "Other Project"
  }
]
```

| Field | Type | Description |
|---|---|---|
| `slug` | string | Project slug (may include `org/` prefix) |
| `role` | string | User's role: `owner`, `admin`, or `viewer` |
| `title` | string | Human-readable project title |

### Example

```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:8090/api/v1/projects
```

---

## Create Project

```
POST /api/v1/projects
```

Create a new project.

**Authenticated** — requires Bearer token. The creating user is automatically assigned the `owner` role.

### Request Body

```json
{
  "org": "my-org",
  "slug": "new-project",
  "title": "New Excavation",
  "description": "Summer 2026 field season"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `org` | string | No | Organisation namespace |
| `slug` | string | Yes | URL-safe project identifier |
| `title` | string | Yes | Display title |
| `description` | string | No | Project description |

If `org` is provided, the full slug becomes `org/slug`.

### Response

`201 Created`

```json
{
  "slug": "my-org/new-project",
  "title": "New Excavation",
  "status": "created"
}
```

### Example

```bash
curl -X POST http://localhost:8090/api/v1/projects \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"slug": "new-project", "title": "New Excavation"}'
```

---

## Get Project

```
GET /api/v1/projects/{slug}
```

Retrieve project details including metadata, counts, and bounding box.

**Public** — no authentication required.

### Response

```json
{
  "slug": "my-excavation",
  "title": "My Excavation Project",
  "description": "Summer 2026 field season",
  "gpkg_uri": "s3://tinyowl-projects/projects/my-excavation/canonical.gpkg",
  "media_uri": "s3://tinyowl-projects/projects/my-excavation/media/",
  "entity_count": 142,
  "table_count": 5,
  "updated_at": "2026-07-01T12:00:00Z",
  "bbox": "{\"type\":\"Polygon\",\"coordinates\":[[[133.0,-12.5],[133.2,-12.5],[133.2,-12.3],[133.0,-12.3],[133.0,-12.5]]]}"
}
```

| Field | Type | Description |
|---|---|---|
| `slug` | string | Project slug |
| `title` | string | Display title |
| `description` | string\|null | Project description |
| `gpkg_uri` | string\|null | S3 URI of the canonical GeoPackage |
| `media_uri` | string\|null | S3 URI of the media directory |
| `entity_count` | int\|null | Number of spatial entities |
| `table_count` | int\|null | Number of entity type tables |
| `updated_at` | string\|null | Last update timestamp (ISO 8601) |
| `bbox` | string\|null | GeoJSON bounding box polygon |

### Example

```bash
curl http://localhost:8090/api/v1/projects/my-excavation
```

---

## Update Project

```
PATCH /api/v1/projects/{slug}
```

Update a project's title and/or description.

**Authenticated** — requires Bearer token. Only `owner` or `admin` role can update.

### Request Body

```json
{
  "title": "Updated Project Title",
  "description": "Updated description"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `title` | string | No | New display title |
| `description` | string | No | New description |

### Response

```json
{
  "slug": "my-excavation",
  "title": "Updated Project Title"
}
```

### Example

```bash
curl -X PATCH http://localhost:8090/api/v1/projects/my-excavation \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"title": "Updated Project Title"}'
```
