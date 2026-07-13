# Diff & Clone API

Endpoints for downloading project data and creating cross-reference stubs.

## Download Canonical GeoPackage

```
GET /api/v1/{org}/{project}/gpkg
```

Download the full canonical GeoPackage for a project. This is a complete SQLite/GeoPackage file containing all entity tables with their latest (non-deleted) revisions.

**Authenticated** — requires Bearer token and project membership.

### Response

The raw GeoPackage file with `Content-Type: application/octet-stream` and a `Content-Disposition` header suggesting a `.gpkg` filename.

### Example

```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:8090/api/v1/my-org/my-project/gpkg \
  -o project.gpkg
```

The server first checks for a local file, then falls back to downloading from S3/Supabase Storage.

---

## Download Stub

```
GET /api/v1/{org}/{project}/stub/{table}/{columns}
```

Download a minimal SQLite stub file containing only specific non-system columns from a table. Stubs are designed for cross-project referencing — you can attach a stub as a virtual table in another project's GeoPackage.

**Authenticated** — requires Bearer token and project membership.

### Path Parameters

| Parameter | Type | Description |
|---|---|---|
| `org` | string | Organisation namespace (can be empty) |
| `project` | string | Project slug |
| `table` | string | Table name (entity type) |
| `columns` | string | Comma-separated column names to include |

### Query Parameters

| Parameter | Type | Description |
|---|---|---|
| `since_head` | string | If matches current HEAD, returns `304 Not Modified` |

### Security

- Only projects with `visibility = "public"` can serve stubs
- Only columns with a vocabulary or CRM property annotation in `column_annotations` are exposed
- System columns (prefixed with `_`) and geometry columns are excluded

### Response

A SQLite database file with:
- A table containing only the requested non-system, non-geometry columns
- Rows from the latest non-deleted revision of each entity
- A `_stub_meta` table with source tracking fields

```
Content-Type: application/octet-stream
Content-Disposition: attachment; filename="Site_Points_stub.db"
```

### Metadata Table

The stub includes a `_stub_meta` table:

| Key | Value |
|---|---|
| `source_project` | Project slug |
| `source_table` | Source table name |
| `source_columns` | Comma-separated requested columns |
| `last_fetch_head` | Server HEAD at time of generation |
| `fetched_at` | ISO 8601 timestamp |

### Caching

Stubs are cached server-side for 1 hour, keyed by `(slug, table, columns, head)`. Repeated requests within the hour return the cached file. Use `since_head` for conditional requests to avoid re-downloading unchanged stubs.

### Example

```bash
# Get a stub of the Site_Points table with name and period columns
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8090/api/v1/my-org/my-project/stub/Site_Points/name,period" \
  -o Site_Points_stub.db
```

### Error Responses

| Status | Meaning |
|---|---|
| `304` | Not modified (when `since_head` matches current HEAD) |
| `403` | Project is not public, or no accessible columns requested |
| `404` | Project or table not found |

---

## Profile Diffs

```
GET /api/v1/profile/diffs
```

List recent diffs across all projects the authenticated user is a member of.

**Authenticated** — requires Bearer token.

### Query Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `limit` | int | `30` | Maximum number of diffs to return (max 100) |

### Response

```json
[
  {
    "id": 142,
    "project_slug": "my-excavation",
    "project_title": "My Excavation Project",
    "seq": 42,
    "sha256": "a1b2c3d4e5f6789012345678abcdef01a1b2c3d4e5f6789012345678abcdef01",
    "parent_sha": "f1e2d3c4b5a6789012345678abcdef02f1e2d3c4b5a6789012345678abcdef02",
    "entity_count": 15,
    "byte_size": 4096,
    "created_at": "2026-07-01T12:00:00Z"
  }
]
```

| Field | Type | Description |
|---|---|---|
| `id` | int | Diff record ID |
| `project_slug` | string | Project slug |
| `project_title` | string | Project display title |
| `seq` | int | Sequence number |
| `sha256` | string | SHA-256 hash of the diff data |
| `parent_sha` | string | SHA-256 of the parent diff (empty for first diff) |
| `entity_count` | int | Approximate number of entities changed |
| `byte_size` | int | Size of the diff in bytes |
| `created_at` | string | ISO 8601 timestamp |

Results are ordered by `created_at DESC`.

### Example

```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8090/api/v1/profile/diffs?limit=10"
```
