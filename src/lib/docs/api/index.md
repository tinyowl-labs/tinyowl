# API Overview

The TinyOwl server provides a RESTful HTTP API for managing geospatial data projects. Projects store data as GeoPackage SQLite files, with a diff-based push/pull sync model, column-level concept mappings, and full-text semantic search.

## Base URL

```
http://localhost:8080
```

All API routes are prefixed with `/api/v1`.

## Authentication

The API supports three authentication methods:

- **Static token** — Set `TINYOWL_AUTH_TOKEN` env var for dev/service accounts.
- **Supabase JWT** — For the web UI and authenticated `/api/v1` routes, pass a Supabase-issued JWT as a Bearer token. The server validates HS256 (`SUPABASE_JWT_SECRET`) or ES256 (JWKS from `SUPABASE_URL`) tokens.
- **CLI PAT** — `tol_` prefix tokens issued via `tinyowl login` (device-code OAuth) or the web UI (Settings → API Tokens). SHA-256 hashed and stored in `cli_tokens` table.

```
Authorization: Bearer <token>
```

Public endpoints do not require authentication. Authenticated endpoints verify project membership and role before allowing operations.

### Roles

| Role | Permissions |
|---|---|
| `owner` | Full control |
| `admin` | Full control |
| `collaborator` | Read/write (push, mappings, media upload) |
| `viewer` | Read-only |

## Response Format

All responses are JSON. Successful responses use standard HTTP status codes:

| Code | Meaning |
|---|---|
| `200` | Success (GET, PUT, PATCH) |
| `201` | Created (POST) |
| `204` | No content (DELETE) |
| `304` | Not modified (conditional GET) |
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
| `GET` | `/api/v1/search` | Full-text + semantic search across projects. `?q=, bbox=, date_from=, date_to=, tags=, semantic=0\|1, limit=` |
| `GET` | `/api/v1/search/lexicon` | List periods from PeriodO vocabulary |
| `GET` | `/api/v1/search/lexicon/tags?prefix=` | Tag autocomplete |
| `GET` | `/api/v1/search/lexicon/terms?prefix=` | Mapped value autocomplete |
| `GET` | `/api/v1/vocab/search?q=&vocab=periodo\|aat\|crm&limit=` | Search external vocabularies |
| `GET` | `/api/v1/projects/centroids` | List all projects with centroid coords (map overview) |
| `GET` | `/api/v1/projects/{slug}` | Get project detail (title, description, bbox, dates, tags, counts, visibility, licence, embargo) |
| `GET` | `/api/v1/projects/{slug}/tables` | List tables (entity types) in a project |
| `GET` | `/api/v1/projects/{slug}/schema` | DB graph: tables + FK/relation edges (from GPKG FK, QGIS relations, TOML, inferred) |
| `GET` | `/api/v1/projects/{slug}/tables/{table}/rows` | List rows from a project table |
| `GET` | `/api/v1/projects/{slug}/media` | List media items; `?type=image\|pdf\|...`, newest first |
| `GET` | `/api/v1/projects/{slug}/media/integrity` | Missing blob / orphan file report |
| `GET` | `/api/v1/projects/{slug}/tilesets` | List documentary tileset media rows |
| `GET` | `/api/v1/projects/{slug}/tilesets/{hash}` | Get one tileset detail |
| `GET` | `/api/v1/projects/{slug}/tilesets/{hash}/*` | Serve extracted 3D Tiles assets; supports `?token=` |
| `GET` | `/api/v1/projects/{slug}/gpkg` | Download canonical GPKG (respects licence/embargo); supports `?token=` |
| `GET` | `/api/v1/projects/{slug}/layers/{table}/geojson` | GeoJSON export of a table layer |
| `GET` | `/api/v1/projects/{slug}/readme` | Get project README.md |
| `GET` | `/api/v1/projects/{slug}/similar?limit=` | Similar projects by tags + temporal/spatial overlap |
| `GET` | `/api/v1/media/{hash}/similar?limit=&bbox=&date_from=&date_to=&tag=` | OpenCLIP nearest neighbours for a media hash |
| `GET` | `/api/v1/projects/{slug}/search-entities?q=` | Full-text search within a project's entities |
| `GET` | `/media/{hash}` | Serve media file by content hash (content-type detection, cache headers) |

## Authenticated Endpoints

Require a valid Bearer token.

### Projects

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/projects` | List user's projects (memberships) |
| `POST` | `/api/v1/projects` | Create project; body: `{Org, Slug, Title, Description}` — auto-grants owner role |
| `PATCH` | `/api/v1/projects/{slug}` | Update project: title, description, visibility, licence, embargo_until, embargo_note, location_precision, table_visibility |
| `GET` | `/api/v1/projects/{slug}/diffs` | List diff metadata (seq, SHA-256, parent SHA, entity count, byte size, timestamp) |
| `POST` | `/api/v1/projects/{slug}/recount` | Recount entities/tables from canonical |
| `POST` | `/api/v1/projects/{slug}/reindex` | Reindex project: enqueues missing embeddings (owner/admin) |
| `GET` | `/api/v1/projects/{slug}/warnings` | List validation warnings (unmapped vocabularies, etc.) |

### Members

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/projects/{slug}/members` | List members with roles |
| `POST` | `/api/v1/projects/{slug}/members` | Add member; body: `{Email, Role}` |
| `PATCH` | `/api/v1/projects/{slug}/members/{userId}` | Update member role |
| `DELETE` | `/api/v1/projects/{slug}/members/{userId}` | Remove member |

### Readme

| Method | Path | Description |
|---|---|---|
| `PUT` | `/api/v1/projects/{slug}/readme` | Set project README.md |

### Media

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/projects/{slug}/media` | Upload media (collaborator+). Headers: `X-TinyOwl-Media-Hash`, `X-TinyOwl-Entity-Type`, `X-TinyOwl-Entity-Id`, `X-TinyOwl-Media-Type` |
| `PATCH` | `/api/v1/projects/{slug}/media/{hash}/care` | Update CARE/consent flags; body: `{care_allow_public_view, care_allow_embed, care_note}` |

### Sync (Push/Pull)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/{org}/{project}/head` | Current server HEAD (diff sequence number) |
| `GET` | `/api/v1/{org}/{project}/pull?since_head=N` | Download diffs since sequence N |
| `POST` | `/api/v1/{org}/{project}/push` | Upload a binary diff. Headers: `X-TinyOwl-DDL` (base64, first push), `X-TinyOwl-Toml` (base64 JSON), `X-TinyOwl-Meta-Only: true` (metadata-only). Collaborator+ required |
| `POST` | `/api/v1/{org}/{project}/push-full` | Upload complete canonical GPKG (force push). Owner/admin required |
| `POST` | `/api/v1/{org}/{project}/media` | Upload media (CLI path). Headers: `X-TinyOwl-Media-Hash`, `X-TinyOwl-Entity-Type`, `X-TinyOwl-Entity-Id`, `X-TinyOwl-Media-Type` |
| `GET` | `/api/v1/{org}/{project}/gpkg` | Download canonical (org-scoped variant) |
| `GET` | `/api/v1/{org}/{project}/stub/{table}/{columns}?since_head=N` | Generate flat SQLite stub for cross-GPKG refs. Only from public projects. Returns `304` if no changes |
| `GET` | `/api/v1/{org}/{project}/layers/{table}/geojson` | GeoJSON export (org-scoped variant) |

### Mappings & Column Annotations

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/{org}/{project}/column-mappings` | List value→concept mappings. `?unmapped=true`, `?needs_review=true`, `?table=`, `?column=` |
| `GET` | `/api/v1/projects/{slug}/column-mappings` | Same, by project slug |
| `PUT` | `/api/v1/{org}/{project}/column-mappings` | Upsert a value-level concept mapping |
| `POST` | `/api/v1/projects/{slug}/column-mappings/bulk` | Bulk apply value mappings |
| `GET` | `/api/v1/{org}/{project}/column-annotations` | List column vocabulary / CRM annotations |
| `GET` | `/api/v1/projects/{slug}/column-annotations` | Same, by project slug |
| `PUT` | `/api/v1/{org}/{project}/column-annotations` | Upsert column annotation |
| `GET` | `/api/v1/projects/{slug}/mappings.toml` | Export confirmed mappings as TOML |

> Compat aliases: `/value-mappings` (+ `/bulk`) → same handlers as `/column-mappings`.

### Profile

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/profile/diffs` | List recent diffs across all user's projects |

### Admin

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/admin/reindex-all` | Reindex every project with a local canonical (admin only) |

## CLI Auth Endpoints

Device-code flow for CLI authentication:

| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/cli/start` | Start a device-code auth session; returns `{code, expires_at, verify_url}` |
| `GET` | `/auth/cli/token?code=X` | Poll for token; returns `{status:"pending"}` or `{status:"complete", token, token_type:"pat"}` |
| `POST` | `/auth/cli/verify` | Frontend exchanges browser JWT for CLI PAT; body: `{code, token}` |
| `GET` | `/api/auth/cli-token` | List PATs (id, label, prefix, created_at, expires_at, last_used_at) |
| `POST` | `/api/auth/cli-token` | Create PAT; body: `{Label}`. Returns `tol_` prefixed token |
| `DELETE` | `/api/auth/cli-token` | Revoke PAT; body: `{ID}` |

## QFieldCloud Bridge

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/integrations/qfieldcloud/connect` | Connect QFieldCloud account |
| `GET` | `/api/v1/integrations/qfieldcloud/accounts` | List connected QFieldCloud accounts |
| `DELETE` | `/api/v1/integrations/qfieldcloud/accounts/{id}` | Disconnect a QFieldCloud account |
| `GET` | `/api/v1/integrations/qfieldcloud/accounts/{id}/projects` | List remote QFieldCloud projects |
| `GET` | `/api/v1/integrations/qfieldcloud/links` | List QFieldCloud project links |
| `GET` | `/api/v1/integrations/qfieldcloud/links/{slug}/jobs` | List sync jobs for a link |
| `GET` | `/api/v1/integrations/qfieldcloud/links/{slug}/files` | List files for a link |
| `PATCH` | `/api/v1/integrations/qfieldcloud/links/{slug}/cursor` | Update sync cursor |
| `GET` | `/api/v1/projects/{slug}/qfieldcloud-link` | Get QFieldCloud link for a project |
| `PUT` | `/api/v1/projects/{slug}/qfieldcloud-link` | Create/update QFieldCloud link |
| `POST` | `/api/v1/projects/{slug}/qfieldcloud-link/sync` | Request immediate QFieldCloud sync |
| `DELETE` | `/api/v1/projects/{slug}/qfieldcloud-link` | Remove QFieldCloud link |

## API Sections

| Section | Description |
|---|---|
| [Projects](/docs/api/projects/) | Create, read, update projects |
| [Tables & Rows](/docs/api/tables/) | List tables and query rows |
| [Members](/docs/api/members/) | Manage project membership and roles |
| [Mappings](/docs/api/column-mappings/) | Value mappings + column annotations (vocab / CRM) |
| [Search](/docs/api/search/) | Spatial, temporal, and semantic search |
| [Readme](/docs/api/readme/) | Project README (Markdown) |
| [Media](/docs/api/media/) | List, upload, and serve project media files |
| [Push & Pull](/docs/api/push-pull/) | Diff-based sync for GeoPackage data |
| [Diff & Clone](/docs/api/diff-clone/) | Download canonical, pull diffs, stubs |

## Health Check

```
GET /health
```

Returns `200 OK` with `{"status": "ok"}` when the server is running.
