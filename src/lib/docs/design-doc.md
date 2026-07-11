# TinyOwl Design Document

**What's built, what's next. A forward-looking reference for the remaining work.**

---

## Architecture Overview

TinyOwl is a collaborative archaeological data platform. It lets field teams work offline in QField/QGIS, sync changes through a coordination server, and search across projects using shared vocabularies and vector embeddings — without ever leaving their existing tools.

### Three-Layer Model

```
┌─────────────────────────────────────────────────────────────────────┐
│  1. CANONICAL GPKG (append-only)                                    │
│     Every entity row is immutable. _revision tracks versions.       │
│     Source IDs are globally unique across disconnected workers.     │
│     Media is content-addressed (SHA-256).                           │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ diff engine (go-geodiff)
┌──────────────────────────────▼──────────────────────────────────────┐
│  2. DIFF SYNC                                                       │
│     Changes are computed as binary diffs against a base snapshot.   │
│     Pushed to server as sequential .diff files. Pulled and rebased  │
│     locally. Conflict resolution at the entity level.               │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ push/pull
┌──────────────────────────────▼──────────────────────────────────────┐
│  3. COORDINATION INDEX (Postgres)                                   │
│     No entity data. No file storage. Just enough metadata to        │
│     answer "which projects have Roman bronze coins near my site?"   │
│     Pre-computed at push time. Column mappings, spatial index,      │
│     media index, embeddings vectors.                                │
└─────────────────────────────────────────────────────────────────────┘
```

### What's Already Built

The core engine is complete and functional. The following is a summary for context; detailed specs for these components live in the codebase, not here.

| Component | Status | Key facts |
|-----------|--------|-----------|
| TOML format & schema generation | ✅ | `project.toml` + `tables/*.toml` → GPKG DDL. All column types, relations, ontologies, `machine` field. JSON Schema validation in `tinyowl-toml`. |
| Canonical GPKG | ✅ | Append-only, `source_id` + `_revision` PK, `_deleted`, `_timestamp`, `entity_type`. `_media`, `_relations`, `_sequences` tables. |
| project.gpkg (current view) | ✅ | Regenerated from canonical via `Export()`. Collision-aware display IDs (machine suffix only surfaces when two workers create the same sequence). |
| Ledger DB | ✅ | Commit graph, `commit_entities` (populated on push), purges, sync_state. TOML hash tracking triggers meta-only re-index on server. |
| Diff engine | ✅ | `go-geodiff` wrapper. `DiffAgainstSnapshot`, `SaveSnapshot`, `ApplyChangeset`, `createFullDump`. Good enough for archaeology concurrency — not a focus area. |
| Revision engine | ✅ | `Revise` (detect changes, write canonical), `Export` (generate project.gpkg), `Delete`/`Restore` (soft), `PurgeCheck`/`PurgeExecute` (hard, strict/sever/cascade modes), `RebaseForPull` (conflict resolution). |
| Validation (`pkg/validate`) | ✅ | Schema conformance, required fields, enum values, media file existence. Advisory only — never blocks push. |
| Cross-GPKG references (`pkg/resolve`) | ⚠️ | Stub loading, installation, validation. Server stub endpoint exists; CLI does not yet fetch stubs into `.tinyowl/remotes`. |
| Media storage & GC | ✅ | Content-addressed SHA-256. `media_add` command. GC for orphaned blobs. Media push is a separate CLI step (`tinyowl media push`). |
| CLI commands | ✅ | push, pull, status, init, import, login, logout, delete, restore, purge (--sever, --cascade), gc, validate, export, commit, log, diff, media (add/status/push), project (create/list/push), mappings (list/map), warnings, template list. |
| Server API | ✅ | Push (with meta-only support), pull, head, media upload, projects CRUD, column-mappings CRUD, stub generation, spatial + FTS search, auth (device-code + PAT + **verified** Supabase JWT). |
| Postgres index | ✅ | `projects`, `column_mappings` (column-level stubs with `local_value=''` + value-level rows), `entity_spatial`, `media_index`, `validation_warnings`, `diffs`, `project_members`, `cli_tokens`. |
| Source IDs | ✅ | `{prefix}-{sequence:04d}-{machine}` format. `_sequences` table for durable counters. Collision detection in Export. Imported projects get `machine="imp"`. |
| S3 storage backup | ✅ | Server-side media backup. |
| TOML annotation parsing | ✅ | Value scanning with entity counts. Meta-only re-index push. Column-level TOML annotations upserted separately from value mappings. |
| JS SDK (`@tinyowl/js`) | ❌ Removed | Frontend uses raw `fetch` against `/api/v1`. Do not reintroduce until the API surface is stable. |

---

## What's Left to Build

**Priority order, with rationale:**

| Priority | Workstream | Rationale |
|----------|-----------|----------|
| 0 | **Production harden** | Auth JWT verification, dead-code removal, mapping index correctness, ledger entity tracking. Do this before new features. |
| 1 | **Mappings model cleanup** | Split column vs value mapping (table and UI). Keep TOML ↔ DB in sync. |
| 2 | **Dates + project metadata + tags** | Native archaeological date type, temporal bbox, `tags_manual` / `tags_auto`. |
| 3 | **Import Wizard** (§3) | Conversion funnel for non-CLI archaeologists. |
| 4 | **Enum/array TOML types → QGZ FKs** | Cleaner value mapping + preserve QGIS implicit FKs. |
| 5 | **QField plugin** | After the above is stable. |
| 6 | **Media embeddings pipeline** (§1) | Speculative — ship wizard first, observe behaviour. |

The backend is feature-complete for the sync/coordination layer. The frontend has search, overview, dashboard, layers, media viewer, settings, and auth all built.

---

### 1. Media Embeddings Pipeline

**Goal:** reverse image search — "find coins visually similar to this one" — powered by CLIP embeddings stored in pgvector.

**What exists:**
- `media_embeddings` table with a `vector(512)` column and an HNSW index (`m=16, ef_construction=64`) for cosine similarity search. Created in the Postgres migrations, ready to receive data.
- `media_index` table tracking which media hashes belong to which projects/entities/concepts.

**What needs to be built:**

1. **CLIP embedding generation service.** A standalone process (Python, likely using `open-clip-torch` or `transformers`) that:
   - Polls `media_index` for newly uploaded images that have no corresponding row in `media_embeddings`
   - Downloads the image from S3 or the local media store
   - Runs a CLIP ViT-B/32 (or similar) forward pass to produce a 512-dimensional embedding
   - Inserts `(media_hash, embedding)` into `media_embeddings`
   - Should be horizontally scalable — stateless workers fed by a queue

2. **Async queue.** A job queue (Redis-backed or Postgres `LISTEN`/`NOTIFY`) between the push handler and the embedding workers. When a push includes new media, the server enqueues embedding jobs rather than doing it synchronously (CLIP inference takes ~50ms/image on GPU, longer on CPU).

3. **Search API endpoint.** `POST /api/v1/search/similar` accepting:
   - An uploaded image (multipart) — run through CLIP to get query embedding
   - Optional filters: `project_slug`, `concept_uri`, `bbox`
   - Returns ranked results with media hash, project, entity context, and similarity score
   - Uses the pre-filter → vector-score pattern described in the query flow: filter to candidate hashes via `media_index` + `column_mappings`, then exact k-NN on the survivors

4. **Re-indexing support.** When embeddings model is upgraded (e.g. ViT-B/32 → ViT-L/14), a mechanism to re-embed all existing media. Could be a CLI command on the server or a migration script.

**Design constraint:** The embedding pipeline should be a separate deployable unit — not bundled into the Go server binary. It has different scaling characteristics (GPU-bound vs. I/O-bound), different dependencies (Python/ML vs. Go), and different update cadences.

---

### 2. Frontend Application

**Current state:** SvelteKit app in the `tinyowl` repo with complete auth flow (device-code + Supabase JWT), unified header, and several built-out routes. Server-side data loading via `TINYOWL_CORE_URL` + Supabase access tokens.

**Pages built and remaining:**

#### 2a. Search Page ✅ BUILT (engine upgrade in progress)

Two-stage search: project discovery (Stage 1) then entity search within GPKGs (Stage 2).

**Stage 1 — Postgres Full-Text Search (`tsvector`/`tsquery`):**
- `GET /api/v1/search?q=&lat=&lng=&radius=` — matches project titles, descriptions, and `column_mappings` vocabulary terms via weighted `tsvector` indexes. Optional spatial filter via `entity_spatial`. Returns projects ranked by `ts_rank` score + proximity.
- Generated `search_vector` columns on both `projects` and `column_mappings` with a four-tier weight hierarchy:
  - **A (1.0):** `local_value` — the term the user is actually searching for.
  - **B (0.4):** `concept_uri`, `entity_type` — standardized URIs and entity disambiguation.
  - **C (0.2):** `column_name` — column context ("period", "fabric", "type").
  - **D (0.1):** `vocabulary` — vocabulary name ("AAT", "PeriodO").
- Uses the `english` text search configuration: stems natural language, tokenizes structured URIs on colons, and preserves exact codes.
- `ts_rank` (not `ts_rank_cd`): cover density would penalize matches spanning concatenated fields; term frequency rewards every token match unconditionally.
- `GENERATED ALWAYS AS ... STORED` columns mean zero application-side maintenance — the database recomputes on every write.

**Stage 2 — SQLite LIKE across GPKG text columns:**
- `GET /api/v1/projects/{slug}/search-entities?q=&limit=` — opens the project canonical GPKG from local disk and does `LIKE` across all text columns via `UNION ALL`. Returns matching entities with snippets.
- Upgrade path: FTS5 virtual tables (see §4) replace full scans with index lookups.

**Frontend:**
- `/search` SvelteKit route with server-side loader that fans out Stage 2 to the top 3 projects. Results show as project cards with expandable entity previews, match details, and entity/table counts.
- Handler has dialect detection (Postgres vs SQLite) for testability.
- Tests cover text-only, spatial, access control, entity search, and edge cases.

**Not yet built:** Image upload slot for reverse image search (blocked on embeddings pipeline). Spatial map picker on search is shipped.

**Search engine upgrade path (see §4):** Postgres FTS (done) → FTS5 in GPKGs → HTTP Range VFS for remote GPKG reads → text embeddings + pgvector → RRF hybrid fusion.

#### 2b. Project Dashboard ✅ BUILT

Separate route at `/[project]/dashboard`, visible only to collaborators and above.

**Data loading** (`+page.server.ts`):
- Fetches tables, warnings, diffs, and column mappings from the server API.
- Enforces collaborator+ access (`role !== "viewer"` → redirect to overview).
- All data server-loaded — no spinners on initial render.

**UI sections** (`+page.svelte`):

| Section | Content |
|---------|---------|
| **Summary bar** | Table count, entity count, visibility badge (public/private) |
| **Bbox map** | Theme-aware Leaflet map via reusable `BboxMap.svelte` component. Clicking opens layers view. |
| **Entity breakdown** | Cards per entity type (linked to layers view with `?layer=` filter) |
| **Warnings panel** | Side-by-side with activity feed. Shows all validation warnings (non-collapsed). |
| **Activity feed** | Last 10 pushes with commit SHA, date, entity count, and byte size |
| **Mappings summary** | Vocabularies in use, mapped vs unmapped term counts |
| **Quick actions** | GitHub-style "Code" dropdown: copy `tinyowl clone` command, download GPKG link |
| **Updated timestamp** | "Updated [date]" under the dashboard title |

**New server endpoint:**
- `GET /api/v1/projects/{slug}/warnings?limit=50` — returns validation warnings from the `validation_warnings` Postgres table.

**Shared component:**
- `BboxMap.svelte` — theme-aware Leaflet map used on both overview and dashboard. Handles dark/light tile inversion via CSS filter, bbox color adaptation, and optional link wrapping.

#### 2c. Mapping Editor ✅ PARTIALLY BUILT

Settings page has a Mappings tab that lists existing mappings with entity counts and allows inline editing of concept URIs. Backed by `GET/PUT /column-mappings` endpoints.

**What needs to be built — these three features are the connective tissue between the import wizard and the shared vocabulary layer:**

1. **Vocabulary search with external API lookup.** A search input that queries PeriodO (time periods) and AAT (Getty Art & Architecture Thesaurus) APIs, fuzzy-matches results against local values, and presents top matches with confidence indicators. The user selects a match, and the concept URI is written to the `column_mappings` row. Needs:
   - Backend proxy endpoints for PeriodO and AAT (avoid CORS issues, add caching)
   - Fuzzy matching (Levenshtein / trigram) between the local value and API result labels
   - UI: inline search results with "map this term" button per result

2. **Bulk mapping actions.** When multiple rows share the same `local_value` (e.g. "Roman" appearing across multiple entity types), mapping one should offer to map all. Needs:
   - Group-by on `local_value` + `column_name` with distinct `entity_type` counts
   - "Apply to all N instances" confirmation with preview of affected rows
   - Bulk `PUT` endpoint or repeated single-row updates batched client-side

3. **Unmapped term browser.** A dedicated view showing only unmapped terms (`concept_uri IS NULL`), sorted by entity count descending, filterable by entity type. This is where users land after deferring vocabulary mapping during the import wizard. Needs:
   - Server endpoint: `GET /column-mappings?project_slug=X&unmapped=true&sort=entity_count`
   - UI: table with local_value, entity_type, entity_count, and a "map" action column
   - Progress indicator: "12 of 87 terms mapped (14%)"

**Dependency chain:** The import wizard's vocabulary mapping step (step 4) is designed to be deferrable. These three features close the loop — users skip vocab mapping during import, then clean up post-import in a purpose-built UI rather than being forced inline during onboarding. The wizard's step 4 also reuses the same PeriodO/AAT API clients and fuzzy-matching logic built here.

#### 2d. Spatial Viewer ✅ BUILT

Layers page (`/[project]/layers`) has a Leaflet map showing entity geometries, table selector tabs, and entity highlighting. `BboxMap.svelte` provides a reusable theme-aware map component used on both overview and dashboard.

Media page (`/[project]/media`) has a lightbox with zoom (scroll), pan (mouse drag), double-click to reset zoom, keyboard navigation (arrow keys), and icon buttons for zoom/pan controls.

**Not yet built:** draw-to-search on search page, multi-project overlay.

#### 2e. Import Wizard (see section 3)

#### 2f. Auth & Account Pages ✅ BUILT

- Login flow via Supabase (device-code for CLI, email/password for web). `+layout.server.ts` handles session + access token.
- Project member management at Settings → Members: invite by email, change roles, remove members.
- Visibility controls at Settings → Visibility: global toggle (public/private) + per-table overrides.
- Licence picker at Settings → Licence.

---

### 3. Import Wizard

**Priority: 3.** Depends on the Mapping UI (§2c) for the vocabulary mapping cleanup loop.

**Goal:** Let an archaeologist with zero technical knowledge import an existing GPKG, CSV, or shapefile into TinyOwl. The wizard writes the TOML; the user answers plain-language questions.

**Current state:** The CLI `tinyowl import` does basic GPKG introspection (schema detection, row counts, geometry types). The full wizard UI is not built.

**Design (from `import-flow.md`):**

The wizard has five steps, designed as a single-page flow with clear progress indication:

| Step | What happens | Backend needs |
|------|-------------|---------------|
| 1. **Upload** | Drag-and-drop GPKG/CSV/shapefile. System reads metadata, counts rows, detects geometry types, spots ID patterns. Displays summary: table names, row counts, geometry types, sample IDs. User names the project. | File upload endpoint that returns introspection results. Can reuse the CLI `import` logic wrapped as an API. |
| 2. **Understand tables** | For each column in each table, the system guesses its semantic role (name, period, material, photo, relationship, etc.) based on column name heuristics and value signatures. User confirms or corrects via radio-button choices. Sample values shown for context. | Column classification heuristics (these exist in the CLI import). No new backend — the UI is the feature. |
| 3. **Relationships** | System detects likely relationships by matching values across tables (e.g. finds.context column values match contexts IDs). User confirms the relationship type with plain-language options. | Value-matching logic (exists in CLI import). |
| 4. **Vocabulary mapping** *(optional, deferrable)* | System extracts distinct values from vocabulary-annotated columns, queries vocabulary APIs (PeriodO, AAT), fuzzy-matches terms, presents top matches. User confirms or skips. Reuses the same API clients and fuzzy-matching logic built for the mapping UI (§2c). | Vocabulary API clients. Fuzzy matching (Levenshtein / trigram). Map to `column_mappings` table. |
| 5. **Done** | Summary of what was generated. Download GPKG, set up field sync, or explore. Lists things to do later (unmapped terms — linked to the unmapped term browser in §2c, missing media, collaborators). | Generate `project.toml` + `tables/*.toml`. Create project on server. |

**Heuristics for column guessing (step 2):**

| Column name pattern | Value signature | Guess |
|---------------------|-----------------|-------|
| `fid`, `id`, `pk`, `oid`, `ogc_fid` | Sequential integers | Row ID |
| `label`, `name`, `title`, `context_id` | "CTX-042", "SF-003" | Feature name |
| `period`, `phase`, `date`, `period_name` | "Roman", "Medieval" | Historical period |
| `soil`, `colour`, `color`, `description` | "10YR 3/3", "dark brown" | Soil colour |
| `method`, `excavation`, `technique` | "trowel", "mattock" | Excavation method |
| `material`, `mat`, `fabric` | "pottery", "metal" | Material |
| `photo`, `image`, `picture`, `img` | `.jpg`, `.png`, file paths | Photograph |
| `model`, `3d`, `scan`, `mesh` | `.obj`, `.glb`, `.ply` | 3D model |
| Any column whose values match IDs in another table | "CTX-030" in finds table | Relationship |

**Design principles for the wizard:**

- The TOML is the machine-readable contract, not the user interface. The wizard writes TOML; the user answers plain-language questions.
- Every guess is shown with a confidence indicator and sample values so the user can override.
- Vocabulary mapping is always optional and always deferrable. Post-import cleanup via the mapping UI (§2c).
- The original GPKG is never modified.
- Relationships are detected by value-matching across tables, not declared manually.

---

### 4. Remaining Gaps & Future Considerations

These are not blocking but should be tracked:

| Gap | Notes |
|-----|-------|
| **Diff garbage collection on server** | The `database-design.md` mentions periodically collapsing old diffs into a new genesis snapshot. Not urgent — only matters at scale (hundreds of diffs per project). |
| **Machine ID → human name mapping** | When two workers collide on a sequence, the UI shows `CTX-0042-x7k` and `CTX-0042-m3p`. A future feature could display these as "CTX-0042 (Anna)" by mapping machine IDs to collaborator names. |
| **Embedding model versioning** | `media_embeddings` has no model version column. When upgrading CLIP models, embeddings become incomparable. Add a `model_version` column before populating the table. |
| **QField integration testing** | Stubs are designed to ATTACH into `project.gpkg` for QField value-relation widgets. This path hasn't been end-to-end tested with real QField projects. |
| **Import format support** | The wizard mockups show CSV and shapefile support. The CLI import only handles GPKG. Adding non-GPKG formats is backend work (likely via GDAL/OGR). |
| **Server-side diff application** | The server stores diffs and applies them to canonical.gpkg. `SeedSchema` uses `_multi_statements=true` to create all tables in one exec. A `--force` push flag uploads the full canonical GPKG, bypassing go-geodiff for schema migrations. |
| **`_` wildcard in SQLite LIKE** | `name NOT LIKE '_%'` silently matches every row because `_` is the single-character wildcard. Fixed by using `substr(name,1,1) != '_'` in introspection and entity search. Must be watched in any new features that query SQLite system tables. |
| **Project descriptions from TOML** | Project descriptions in `project.toml` are not synced to the server's `projects.description` column. The CLI push sends TOML metadata but the server indexer only updates slug, title, visibility, and entity/table counts. Needs a small server-side change to extract and store the description field. |
| **Project visibility & sharing** | ✅ Built. Settings → Visibility has global public/private toggle + per-table overrides. Settings → Members has invite/remove/role-change. |
| **Postgres FTS migration** | **Priority 1.** Replace `ILIKE` sequential scans in Stage 1 with GIN-indexed `tsvector`/`tsquery`. Generated columns on `projects` and `column_mappings` with A/B/C/D weight hierarchy. Depends on nothing; blocks nothing downstream. ~3 hours. |
| **FTS5 in canonical GPKGs** | **Priority 4a.** Stage 2 entity search currently does `LIKE '%term%'` across all text columns (full table scan). FTS5 virtual tables with `content=` pointing to source tables would replace this with index scans. Created at push time by the CLI or server-side indexer. Pre-requisite for the HTTP Range VFS item below. |
| **HTTP Range VFS for remote GPKG reads** | **Priority 4b (depends on FTS5).** The canonical GPKG is a SQLite database organized into fixed pages. An SQLite VFS that fetches pages via HTTP Range Requests from object storage (Supabase Storage or Cloudflare R2) would let the Go server query GPKGs without local disk access — the server becomes stateless with respect to entity data. |
| **Text embeddings pipeline for search** | **Priority 5a (depends on media embeddings infrastructure from §1).** The current `media_embeddings` table (pgvector) is scoped to images (CLIP). A separate text embedding pipeline — likely the same ONNX/CLIP infrastructure repurposed for text — would enable dense semantic search over project descriptions and vocabulary terms. Populates a new `text_embeddings` table with a `vector(512)` column and HNSW index. |
| **RRF hybrid fusion** | **Priority 5b (depends on FTS + text embeddings).** Once both the sparse engine (Postgres FTS via `ts_rank`) and dense engine (pgvector cosine distance via HNSW) are operational, Reciprocal Rank Fusion combines their ranked result lists: `RRF_Score(d) = sum(1 / (k + rank_m(d)))` for `k ≈ 60`. This preserves exact-code matches from FTS while adding conceptual recall from embeddings. |
