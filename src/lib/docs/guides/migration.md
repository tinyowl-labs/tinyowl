# Migration Guide

TinyOwl is the current platform for managing geospatial field data. This guide explains the architecture and how older systems map to the current model.

## Architecture

The TinyOwl platform consists of:

| Component | Role |
|---|---|
| **tinyowl-server** | Go HTTP API server handling push/pull sync, spatial search, column mappings, and media |
| **tinyowl-cli** | Command-line tool for importing data and syncing with the server |
| **tinyowl-frontend** | Web UI for browsing projects and data |
| **Supabase** | PostgreSQL + PostGIS database for spatial indexing, metadata, and auth |
| **go-geodiff** | Diff/patch library for GeoPackage changesets |

## Data Model

### Projects

Projects are the top-level organisational unit. Each project has:

- A unique slug (optionally namespaced under an org: `org/project`)
- A canonical GeoPackage file containing all entity data as SQLite tables
- A sequence of numbered diffs forming a version history
- Metadata stored in Supabase Postgres (title, description, bounding box, counts)

### Tables (Entity Types)

Each table in the GeoPackage represents an entity type (e.g., `Site_Points`, `Artefacts`, `Contexts`). Tables have:

- User-defined columns with names, types, and semantic annotations
- System columns: `source_id`, `_revision`, `_deleted`
- Optional geometry column for spatial features
- A TOML definition file that declares the table structure

### Column Mappings

Column mappings connect raw data columns to semantic concepts:

- **Vocabulary annotations** — Columns whose values reference a controlled vocabulary (e.g., PeriodO, Wikidata). Value-level concept URIs can be assigned.
- **CRM annotations** — Columns whose semantics are defined by a CIDOC CRM property (e.g., `crm:P3_has_note`).
- **References** — Columns that reference `source_id` values in other tables (foreign keys).

Mappings are populated automatically during push and can be refined manually via the API.

### Push/Pull Sync

Data synchronisation uses a diff-based protocol:

1. **Canonical** — The server's copy of the GeoPackage is the source of truth
2. **Diffs** — Changes are stored as sequentially numbered, SHA-256 hashed diff files
3. **Push** — Clients send diff changesets; the server applies them and increments the HEAD
4. **Pull** — Clients request all diffs since their last known HEAD
5. **First push** seeds the GeoPackage schema via a DDL header

## Upgrading from Older Systems

### If Coming from the Original Lamina Monolith

The Lamina monolith (SvelteKit + Supabase) has been replaced by the current architecture:

| Old | New |
|---|---|
| Single SvelteKit + Supabase repo | Separate server, CLI, and frontend repos |
| Auth and DB logic in one codebase | Auth via Supabase JWT, server has minimal auth logic |
| Server routes in `src/routes/api/` | Go HTTP API in `tinyowl-server` |
| Entities, relations, classifications, dates, properties | Table-based entity model with column mappings |
| CSV/GeoJSON import via web UI | CLI-based import with TOML table definitions |
| CZML streaming | Replaced by GeoJSON layers endpoint |
| OGC API Features | Replaced by flat GeoJSON endpoint |

### Data Migration

- Your existing Supabase database schema may differ from the current `tinyowl-server` schema
- The current server uses `projects`, `project_members`, `diffs`, `column_mappings`, `entity_spatial`, `media_index`, `validation_warnings`, and `cli_tokens` tables
- Entity data is now stored in GeoPackage files (SQLite), not as rows in Postgres
- Spatial indexing is via the `entity_spatial` PostGIS table, populated during push

## API Route Mapping

The current API is documented in the [API Reference](/docs/api/). Key differences from older versions:

- `/api/entities`, `/api/relations`, `/api/classifications`, `/api/dates` — No longer exist. Entities are in GeoPackage tables, accessed via `/tables` and `/rows`
- `/api/collections` — Replaced by the project-based `/projects` endpoints
- `/api/vocabularies` — Replaced by `/column-mappings`
- `/api/import/upload`, `/api/import/staging` — Replaced by CLI-based import with TOML config
- `/api/czml` — Replaced by `/layers/{table}/geojson`
- `/api/ogc` — Replaced by the flat GeoJSON endpoint
- `/api/groups` — Replaced by `/projects`

## CLI as Primary Import Tool

The CLI is the primary way to import data:

```bash
tinyowl import data.csv --org my-org --project my-project --table MyTable.toml
```

The server supports a push/pull protocol that the CLI uses for syncing. The CLI also supports:

- `tinyowl pull` — Download canonical and catch up on diffs
- `tinyowl validate` — Validate CSV/GeoJSON against TOML table definitions
- `tinyowl serve` — Run a local server with the embedded API

## Need Help?

- [API Reference](/docs/api/) — Full REST API documentation
- [TOML Config Reference](/docs/config/tinyowl-toml/) — Project and table TOML format
- [CSV Import Guide](/docs/guides/import-csv/) — Import tabular data
- [GeoJSON Import Guide](/docs/guides/import-geojson/) — Import spatial data
- [Docker Deployment](/docs/deployment/docker/) — Self-hosted deployment
