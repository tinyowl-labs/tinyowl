# Push & Pull API

Endpoints for syncing project data via a diff-based protocol. The canonical data store is a GeoPackage SQLite file. Changes are tracked as sequential diffs, forming a Merkle chain.

## Overview

The sync model works as follows:

1. **First push** — The client sends a DDL header to seed the GeoPackage schema, then applies the initial diff (immediate).
2. **Subsequent pushes** — Each incremental push creates a **pending changeset** (optional `X-TinyOwl-Message`). On **approve**, the server applies the geodiff, saves `NNNN.diff`, and advances `server_head`.
3. **Pull** — Clients request all **approved** diffs since a given `server_head`.

Approve triggers re-indexing: column mappings, entity spatial data, media references, and project metadata.

## Get Server Head

```
GET /api/v1/{org}/{project}/head
```

Get the current HEAD sequence number (how many diffs have been applied).

**Authenticated** — requires Bearer token and project membership.

### Response

```json
{
  "server_head": "42"
}
```

### Example

```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:8090/api/v1/my-org/my-project/head
```

---

## Pull Diffs

```
GET /api/v1/{org}/{project}/pull
```

Retrieve all diffs since a given sequence number.

**Authenticated** — requires Bearer token and project membership.

### Query Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `since_head` | int | No | Pull diffs with `seq > since_head` |

### Response

```json
{
  "server_head": "42",
  "diff_count": 3,
  "diff_data": "<binary diff data>"
}
```

If no new diffs exist (or `since_head` equals current HEAD):

```json
{
  "server_head": "42",
  "diff_count": 0
}
```

| Field | Type | Description |
|---|---|---|
| `server_head` | int | Current HEAD sequence number |
| `diff_count` | int | Number of diffs returned |
| `diff_data` | bytes | Concatenated binary diff data |

Multiple diffs are concatenated into a single `diff_data` payload.

### Example

```bash
# Pull all diffs since seq 10
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8090/api/v1/my-org/my-project/pull?since_head=10"
```

---

## Push

```
POST /api/v1/{org}/{project}/push
```

Push a diff changeset. **Incremental** pushes (existing canonical, not meta-only, not first-seed) become a **pending changeset** for review (S1). First-seed DDL, meta-only, and `push-full` still apply immediately.

**Authenticated** — requires Bearer token and project membership (collaborator+).

### Request

The diff data is sent as the raw request body. Additional metadata is passed via HTTP headers:

| Header | Required | Description |
|---|---|---|
| `X-TinyOwl-DDL` | Yes (first push) | Base64-encoded DDL to seed the GeoPackage schema |
| `X-TinyOwl-Meta-Only` | No | If `"true"`, skip diff application and only re-index (requires existing canonical) |
| `X-TinyOwl-Toml` | No | Base64-encoded JSON array of table TOML annotations |
| `X-TinyOwl-Message` | No | Review message stored on the pending changeset (`tinyowl push -m`) |

#### First Push (Schema Creation)

The first push must include the DDL header to create the initial GeoPackage schema:

```bash
# Encode your DDL as base64
DDL_B64=$(cat schema.sql | base64 -w0)

curl -X POST http://localhost:8090/api/v1/my-org/my-project/push \
  -H "Authorization: Bearer <token>" \
  -H "X-TinyOwl-DDL: $DDL_B64" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @diff.bin
```

#### Subsequent (incremental) pushes

After the initial push, incremental diffs land as **pending** (HTTP 202) until approve:

```bash
curl -X POST http://localhost:8090/api/v1/my-org/my-project/push \
  -H "Authorization: Bearer <token>" \
  -H "X-TinyOwl-Message: field edits from transect A" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @diff.bin
```

```json
{
  "status": "pending",
  "changeset_id": "<uuid>",
  "server_head": "42",
  "message": "field edits from transect A"
}
```

One open pending changeset per project; a newer push supersedes the prior open row.

#### Meta-Only Push

Re-index without applying any diff changes. The project must already have a canonical GeoPackage:

```bash
curl -X POST http://localhost:8090/api/v1/my-org/my-project/push \
  -H "Authorization: Bearer <token>" \
  -H "X-TinyOwl-Meta-Only: true" \
  -H "X-TinyOwl-Toml: <base64-table-toml>" \
  -d ''
```

### Immediate-apply response (first-seed / meta-only / no Postgres)

```json
{
  "server_head": "43",
  "status": "indexed"
}
```

---

## Pending changesets (S1 review)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/v1/projects/{slug}/changesets?status=pending` | List for members |
| `GET` | `/api/v1/projects/{slug}/changesets/{id}` | Metadata + message |
| `GET` | `/api/v1/projects/{slug}/changesets/{id}/changes` | `ListChanges` + summary; geometry enriched as GeoJSON |
| `POST` | `/api/v1/projects/{slug}/changesets/{id}/approve` | Collaborator+: ApplyDiff → SaveDiff → index |
| `POST` | `/api/v1/projects/{slug}/changesets/{id}/reject` | Optional JSON `{ "note": "..." }` |
| `POST` | `/api/v1/projects/{slug}/changesets/{id}/request-changes` | Requires note |

Pull continues to serve only **approved** `diffs` (unchanged). Review UI: `/{slug}/review` and `/{slug}/review/{id}`.

### What Happens on Approve

After applying the pending diff, the server asynchronously:

1. **Indexes mappings** — Upserts `column_annotations` from TOML; scans distinct values into `value_mappings`
2. **Applies TOML annotations** — Vocabulary / CRM property / range on columns (`source: "toml"`, skips manual annotations)
3. **Generates warnings** — Flags unmapped vocab columns without value-level concept URIs
4. **Indexes values** — Distinct data values for vocabulary / `arch_date` / array columns
5. **Indexes media** — Reads `_media` table from canonical into `media_index`
6. **Indexes spatial entities** — Extracts geometries into PostGIS `entity_spatial`
7. **Updates project metadata** — Bounding box, entity/table counts, tags, dates, URIs

---

## Diff Storage

Diffs are stored as numbered files (`0001.diff`, `0002.diff`, etc.) in the project's diffs directory. Each diff's SHA-256 is recorded in the `diffs` table along with its parent SHA, forming a Merkle chain for integrity verification.
