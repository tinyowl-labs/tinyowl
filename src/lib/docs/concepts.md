# Core Concepts

A deep dive into the building blocks of TinyOwl: projects, the dual-GPKG model, the push/pull sync protocol, tables, media, column mappings, roles, and authentication.

---

## Projects

A **project** is a self-contained directory that holds everything for one archaeological excavation, survey, or study. You can copy it, share it, or clone it from a server — all data lives in files, not in a database.

### Directory structure

```
my-excavation/
├── project.toml           # Project metadata (name, slug, tags, dates, machine)
├── project.gpkg           # Working copy — editable in QGIS / QField
├── README.md              # Optional Markdown overview rendered in the web UI
├── tables/                # TOML schema definitions, one per entity type
│   ├── Contexts.toml
│   └── Finds.toml
├── media/                 # Content-addressed media store
│   └── a1/                #   media/{hash-prefix}/{full-hash}
│       └── a1b2c3d4...
└── .tinyowl/              # Internal — never edit these directly
    ├── canonical.gpkg     # Append-only source of truth
    ├── ledger.db          # Sync state, commit history, entity tracking
    └── snapshots/         # Geodiff baselines for incremental sync
```

### `project.toml`

```toml
[project]
name = "Injalak Rock Art Survey"
slug = "injalak-rock-art"
description = "Western Arnhem Land rock art documentation"
machine = "arn1"

[project.tags]
manual = ["rock-art", "arnhem-land", "survey"]

[project.dates]
start_year = -20000
end_year = 2024
start_label = "Pleistocene"
end_label = "Present"
```

| Field | Purpose |
|---|---|
| `name` | Display title in the web UI |
| `slug` | URL-safe identifier (unique per server). Can include org prefix: `org/slug` |
| `machine` | Worker ID for `source_id` generation (e.g. `arn1`). Each field worker gets their own |
| `tags.manual` | Curator-defined tags for search and similarity |
| `dates.*` | Temporal extent in astronomical years (negative = BCE) |

---

## The dual-GPKG model

TinyOwl keeps **two** GeoPackage files, with a clear separation of concerns:

| File | Role | Edit directly? |
|---|---|---|
| `.tinyowl/canonical.gpkg` | Append-only source of truth | **Never.** All writes go through the revision engine |
| `project.gpkg` | Working copy for QGIS/QField | **Yes** — this is your day-to-day editing surface |

### How they interact

```
┌──────────────┐     revise      ┌───────────────┐     push      ┌──────────┐
│ project.gpkg │ ───────────────> │ canonical.gpkg │ ────────────> │  server  │
│  (editable)  │                  │  (immutable)   │               │          │
└──────────────┘                  └───────────────┘               └──────────┘
       ↑                                ↑                              │
       │         export                 │                              │
       └────────────────────────────────┘         pull (apply diffs)   │
                                                                       │
       ┌────────────────────────────────────────────────────────────────┘
```

1. **You edit** `project.gpkg` in QGIS, QField, or any GIS tool.
2. **`tinyowl push`** detects changes via the **revision engine**, applies them to `canonical.gpkg`, computes a binary diff, and uploads it.
3. **The server** applies the diff to its copy of canonical, saves it, and re-indexes metadata.
4. **`tinyowl pull`** downloads remote diffs, applies them to your canonical, and **rebases** any local changes to avoid ID conflicts.
5. **`tinyowl export`** regenerates `project.gpkg` from canonical after each sync (push/pull calls this automatically).

This model keeps data safe: canonical is never directly edited, every change is recorded in the ledger, and diffs form a verifiable chain.

---

## The ledger

`.tinyowl/ledger.db` is a local SQLite database that tracks:

- **Sync state** — server HEAD sequence number, last push, last pull
- **Commit history** — every push/pull/commit operation with timestamps and entity lists
- **Entity tracking** — which `source_id`s have been pushed (for incremental diffs)
- **Purge records** — hard-deleted entities that should never be re-pushed

The ledger is what makes incremental sync possible. Without it, every push would be a full dump.

---

## Push and pull sync

### Push (local → server)

```
tinyowl push [--message "Added new contexts"]
```

1. Loads `project.toml` and all `tables/*.toml`
2. **Revises** — compares `project.gpkg` against `canonical.gpkg` to detect inserts, updates, deletes
3. **Validates** — runs schema checks (advisory, never blocks)
4. **Cross-ref checks** — validates FK references across tables
5. **Computes diff** — generates a binary geodiff changeset
6. **Uploads** — sends the diff + TOML metadata to the server
7. **Records** — writes the operation to the ledger, saves a snapshot
8. **Re-exports** — regenerates `project.gpkg` from the updated canonical

First push sends a full dump + DDL schema. Subsequent pushes are incremental. Changes to TOML annotations or README.md are detected and uploaded separately.

### Pull (server → local)

```
tinyowl pull
```

1. Checks server HEAD against local ledger
2. Downloads all diffs since last known HEAD
3. Applies diffs to canonical
4. Rebases local changes (avoids PK conflicts)
5. Updates ledger, saves snapshot

### Clone (full download)

```
tinyowl clone my-excavation [target-dir]
```

Downloads the canonical GPKG, fetches all `tables/*.toml` schemas, fetches README.md, and initialises a fresh ledger pointing at the server HEAD.

---

## Tables (entity types)

Tables are defined as TOML files in `tables/`. Each file declares one entity type (one layer in the GeoPackage).

### Table TOML format

```toml
[table]
key = "Contexts"
label = "Stratigraphic Context"

[[columns]]
name = "context_id"
type = "string"
label = "Context ID"

[[columns]]
name = "period"
type = "string"
label = "Period"
vocabulary = "periodo"

[[columns]]
name = "depth_cm"
type = "integer"
label = "Depth (cm)"

[[columns]]
name = "soil_type"
type = "string"
label = "Soil Type"

[[columns]]
name = "description"
type = "string"
label = "Description"
property = "crm:P3_has_note"
range = "crm:E62_String"

[[columns]]
name = "overlies"
type = "string"
label = "Overlies"
references = "Contexts.source_id"

[[columns]]
name = "photos"
type = "array"
label = "Photos"
item = "media"
```

### Column types

| Type | Description |
|---|---|
| `string` | Free text |
| `integer` | Whole number |
| `double` | Decimal number |
| `boolean` | True/false |
| `date` | Calendar date |
| `datetime` | Date + time |
| `arch_date` | Archaeological date. Stored as JSON `{"start":-8000,"end":-6000,"label":"Early Holocene"}` or plain strings like `"Iron Age"`. Parsed years are unioned into the project temporal extent |
| `enum` | One of a fixed set (`values = ["loose","firm","compact"]`) |
| `array` | Multi-value column. Set `item` for element type, `delimiter`, and `wrapper` (`{}`, `[]`, `()`) |
| `media` | References a content-addressed media file |
| `geometry` | Spatial column (automatically present for geometry tables) |
| `id` | Reference to another entity |

### Annotations

Every column can carry optional annotations that enable data harmonisation:

| Annotation | Purpose | Example |
|---|---|---|
| `vocabulary` | Controlled terminology namespace | `"periodo"`, `"aat"`, `"crm"` |
| `property` | CIDOC CRM property URI | `"crm:P3_has_note"` |
| `range` | CIDOC CRM range class | `"crm:E62_String"` |
| `references` | Foreign key to another table's `source_id` | `"Contexts.source_id"` |

During push, the server upserts annotations into `column_annotations` (TOML-owned, `source: "toml"`), scans distinct values into `value_mappings` for vocabulary columns, and generates warnings for unmapped terms.

### System columns

Every entity row gets these automatically:

| Column | Purpose |
|---|---|
| `source_id` | Globally unique entity identifier (machine prefix + UUID) |
| `_revision` | Monotonically increasing revision number |
| `_deleted` | Soft-delete flag (`true` hides the entity from exports) |

---

## Media

Media files use **content-addressed storage**: each file is stored as `media/{hash-prefix-2}/{full-sha256}`, keyed by its SHA-256 hash. This means:

- **Deduplication** — identical files are stored once, even if referenced by multiple entities
- **Integrity** — the hash IS the address; corruption is detectable
- **Portability** — copy the `media/` directory and all references still work

### Media workflows

| Command | What it does |
|---|---|
| `tinyowl media add <entity_type> <entity_id> <column> <file>` | Register a media file for a specific entity |
| `tinyowl media import-dir <directory>` | Import all files from a directory (registered as "unknown" for later linking) |
| `tinyowl media sync-from <other-project>` | Copy media files and entity links from another project |
| `tinyowl media push` | Upload all media to the server |
| `tinyowl media status` | Show count and total size in `media/` |
| `tinyowl gc` | Find and remove orphaned media files (not referenced in canonical) |

### CARE metadata

Each media item can carry consent flags, managed via the web UI (Artefacts → click an item):

| Flag | Purpose |
|---|---|
| `care_allow_public_view` | Can unauthenticated users see this media? |
| `care_allow_embed` | Can this media appear in embeds/thumbnails? |
| `care_note` | Free-text provenance or consent note |

---

## Column mappings

Column mappings connect your local data values to external standard vocabularies. This is the key to making data **discoverable** and **interoperable** across projects.

### How it works

1. **You declare** a column with `vocabulary = "periodo"` in the TOML
2. **On push**, the server scans distinct values in that column and creates `value_mappings` rows
3. **In the web UI** (Settings → Values tab), you link local values to concept URIs:
   - `"Iron Age"` → `periodo:p0v8k4r`
   - `"Roman"` → `periodo:roman`
4. **Bulk-apply** — map the same value across multiple tables at once
5. **Export** — download confirmed mappings as `mappings.toml` for offline review or sharing

### Mapping sources

| Source | Meaning |
|---|---|
| `auto` | Server-scanned during push (no concept URI yet) |
| `toml` | Seeded from `mappings.toml` |
| `manual` | Set by a user via the API or web UI |

Manual mappings are never overwritten by auto-scans. TOML annotations skip rows with `source: "manual"`.

### Column annotations vs value mappings

| Table | What it holds | Example |
|---|---|---|
| `column_annotations` | Per-column vocabulary + CRM property/range | `Contexts.period` → `vocabulary: "periodo"` |
| `value_mappings` | Per-value concept links | `Contexts.period = "Iron Age"` → `concept_uri: "periodo:p0v8k4r"` |

---

## Authentication

### Web UI users

Sign in with email/password via Supabase Auth. The web UI sends the Supabase JWT as a `Bearer` token to the server, which validates it and extracts the user ID.

### CLI users

Two options:

1. **Device-code OAuth** — `tinyowl login` opens a browser to a verification page. After authorising, the CLI polls for a long-lived Personal Access Token (PAT) with a `tol_` prefix. Stored in `~/.config/tinyowl/config.json`.

2. **Direct PAT** — Create a token from the web UI (Settings → API Tokens → Create Token), then pass it via `--token` flag or `TINYOWL_TOKEN` environment variable.

### Server-side

The server (`tinyowl-server`) resolves tokens in order: static token (`TINYOWL_AUTH_TOKEN` env var) → Supabase JWT → PAT lookup (SHA-256 hash from `cli_tokens` table). All push/pull operations require authentication + project membership.

---

## Members and roles

Four-tier per-project access control, managed via the web UI or API:

| Role | Can view data | Can push/pull | Can manage media | Can manage members | Can change settings |
|---|---|---|---|---|---|
| **Owner** | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Admin** | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Collaborator** | ✓ | ✓ | ✓ | ✗ | ✗ |
| **Viewer** | ✓ | ✗ | ✗ | ✗ | ✗ |

Additional controls:

- **Project visibility** — `public` or `private`. Private projects require membership.
- **Table visibility** — Override visibility per-table (e.g. hide sensitive tables from public).
- **Embargo** — Set an `embargo_until` date to block all access until lifted.
- **Licence** — Choose a licence (`CC-BY-4.0`, `ALL_RIGHTS`, etc.). `ALL_RIGHTS` blocks public GPKG downloads.

---

## Spatial search

The server indexes entity geometries into a PostGIS `entity_spatial` table during push. Combined with Postgres full-text search on titles, descriptions, READMEs, and mapped values, the search endpoint supports:

```
GET /api/v1/search?q=roman+pottery&bbox=132.8,-12.6,133.3,-12.1&date_from=-500&date_to=400
```

An OpenCLIP ViT-B/32 model generates vector embeddings for images and project text, powering **semantic search** — find visually similar artefacts or conceptually related projects even when text doesn't match.
