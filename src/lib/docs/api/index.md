# API Overview

The TinyOwl server provides a RESTful HTTP API for managing geospatial data projects. Projects store data as GeoPackage SQLite files, with a diff-based push/pull sync model, column-level concept mappings, and spatial search.

## Base URL

```
http://localhost:8090
```

All API routes are prefixed with `/api/v1`.

## Authentication

The API supports two authentication modes:

- **CLI device-code flow** — Used by the TinyOwl CLI. Start an auth session via `POST /auth/cli/start`, verify in the browser, and poll for a token.
- **Supabase JWT** — For the authenticated `/api/v1` routes, pass a Supabase-issued JWT as a Bearer token. The server validates the JWT and extracts the user ID.

```
Authorization: Bearer <supabase-access-token>
```

Public endpoints do not require authentication. Authenticated endpoints verify project membership and role (owner/admin/viewer) before allowing operations.

## Response Format

All responses are JSON. Successful responses use standard HTTP status codes:

| Code | Meaning |
|---|---|
| `200` | Success (GET, PUT, PATCH) |
| `201` | Created (POST) |
| `204` | No content (DELETE) |
| `400` | Bad request — invalid input |
| `401` | Unauthorised — missing or invalid token |
| `403` | Forbidden — insufficient role |
| `404` | Not found |
| `500` | Internal server error |

Error responses follow this shape:

```json
{
  "error": "Human-readable message"
}
```

## Public Endpoints

No authentication required.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/search` | Spatial search across public projects |
| `GET` | `/api/v1/projects/{slug}` | Get project details |
| `GET` | `/api/v1/projects/{slug}/tables` | List tables in a project |
| `GET` | `/api/v1/projects/{slug}/tables/{table}/rows` | List rows in a table |
| `GET` | `/api/v1/projects/{slug}/media` | List media files in a project |
| `GET` | `/api/v1/projects/{slug}/readme` | Get project README |
| `GET` | `/api/v1/projects/{slug}/layers/{table}/geojson` | Get table features as GeoJSON |
| `GET` | `/media/{hash}` | Serve a media file by content hash |

## Authenticated Endpoints

Require a valid Bearer token and project membership.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/projects` | List user's projects |
| `POST` | `/api/v1/projects` | Create a new project |
| `PATCH` | `/api/v1/projects/{slug}` | Update project title/description |
| `GET` | `/api/v1/projects/{slug}/members` | List project members |
| `POST` | `/api/v1/projects/{slug}/members` | Add a member to a project |
| `PATCH` | `/api/v1/projects/{slug}/members/{userId}` | Update member role |
| `DELETE` | `/api/v1/projects/{slug}/members/{userId}` | Remove a member |
| `PUT` | `/api/v1/projects/{slug}/readme` | Upload project README |
| `GET` | `/api/v1/profile/diffs` | List recent diffs across projects |

## Push/Pull Sync Endpoints

Authenticated per-project endpoints for syncing canonical GeoPackage data:

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/{org}/{project}/head` | Get current server HEAD sequence number |
| `GET` | `/api/v1/{org}/{project}/pull` | Pull diffs since a given HEAD |
| `GET` | `/api/v1/{org}/{project}/gpkg` | Download the full canonical GeoPackage |
| `POST` | `/api/v1/{org}/{project}/push` | Push a diff to apply to canonical |
| `POST` | `/api/v1/{org}/{project}/media` | Upload media files for a project |
| `GET` | `/api/v1/{org}/{project}/stub/{table}/{columns}` | Download a SQLite stub for cross-reference |
| `GET` | `/api/v1/{org}/{project}/layers/{table}/geojson` | Get table features as GeoJSON |
| `GET` | `/api/v1/{org}/{project}/column-mappings` | List column mappings |
| `PUT` | `/api/v1/{org}/{project}/column-mappings` | Create/update a column mapping |

## CLI Auth Endpoints

Device-code flow for CLI authentication:

| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/cli/start` | Start a device-code auth session |
| `GET` | `/auth/cli/token` | Poll for token (pass `?code=`) |
| `POST` | `/auth/cli/verify` | Verify and link a token to a code |
| `GET` | `/api/auth/cli-token` | List CLI tokens (prefix, label, timestamps) |
| `POST` | `/api/auth/cli-token` | Create a long-lived CLI token |
| `DELETE` | `/api/auth/cli-token` | Revoke a CLI token |

## API Sections

| Section | Description |
|---|---|
| [Projects](/docs/api/projects/) | Create, read, update projects |
| [Tables & Rows](/docs/api/tables/) | List tables and query rows |
| [Members](/docs/api/members/) | Manage project membership and roles |
| [Column Mappings](/docs/api/column-mappings/) | Link columns to vocabularies and CRM properties |
| [Search](/docs/api/search/) | Spatial search across projects |
| [Readme](/docs/api/readme/) | Project README (Markdown) |
| [Media](/docs/api/media/) | List and serve project media files |
| [Push & Pull](/docs/api/push-pull/) | Diff-based sync for GeoPackage data |
| [Diff & Clone](/docs/api/diff-clone/) | Download canonical, pull diffs, stubs |

## Health Check

```
GET /health
```

Returns `200 OK` with `{"status": "ok"}` when the server is running.
