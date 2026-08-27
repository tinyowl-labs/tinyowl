# tinyowl push

Push local changes to the server. The command revises `project.gpkg` into canonical, diffs that against **last approved server HEAD**, and uploads the result. Incremental pushes land as **pending** until someone approves them on the web.

## Usage

```bash
tinyowl push -m "describe this changeset"
```

Run from within a TinyOwl project directory (or any subdirectory). The command finds the project root automatically.

## Flags

| Flag | Type | Required | Default | Description |
|---|---|---|---|---|
| `-m`, `--message` | string | Yes, for reviewable incremental pushes and first/full dumps | | Changeset message shown in review |
| `--force` | bool | No | false | Full GPKG dump instead of an incremental diff |
| `--replace-head` | bool | No | false | With `--force`, allow a full dump when the server already has approved HEAD (rebuild only) |
| `--org` | string | No | | Organisation slug |
| `--server` | string | No | `http://localhost:8080` | Server URL (global) |
| `--token` | string | No | (from config) | Auth token (global) |

`--force` against an existing HEAD is refused unless you also pass `--replace-head`. Normal sequential work is `tinyowl push -m "..."`.

## What it does

1. **Loads project** — reads `project.toml` and all `tables/*.toml` files.
2. **Revises** — compares `project.gpkg` against `.tinyowl/canonical.gpkg` to detect inserts, updates, and deletes.
3. **Validates** — runs schema validation against the TOML definitions. Shows warnings but never blocks the push.
4. **Cross-ref checks** — validates cross-GPKG reference integrity for columns with `references` configured.
5. **Refreshes approved base** — if local ledger `server_head` is behind `GET /head`, pull/apply (collaborator) or download HEAD into `snapshots/base.gpkg` (author whose canonical already has those rows).
6. **Computes diff** — `CreateChangeset(base.gpkg, canonical.gpkg)`. `base.gpkg` is last **approved** HEAD, not the pending working copy.
7. **Uploads** — first push / `--force --replace-head` sends the full GPKG; otherwise the incremental diff. Incremental uploads are pending until approve.
8. **Records commit** — writes the operation to `.tinyowl/ledger.db`. A new snapshot of canonical is saved only after an **approved** apply, not while the changeset is pending.

## Example

```bash
cd my-excavation
# edit project.gpkg in QGIS…
tinyowl push -m "Added trench A contexts"
```

First push (no server HEAD yet) installs canonical immediately:

```
Initial push — uploading local canonical.
Pushed! Server head: 1
```

Incremental push (review gate):

```
Unpushed changes vs approved HEAD.
Submitted for review (changeset 0015e511-…). Approved head: 1
After approve, the next pull or push refreshes from server HEAD.
```

After approve, with no further local edits:

```
Server advanced to seq 2 (local 1). Refreshing from HEAD...
Local canonical already has those rows; keeping it and refreshing base from server HEAD.
Already in sync with seq 2.
```

If Revise found rows that are already on HEAD (or still waiting on review):

```
Already on the server (seq 2) or waiting on review.
```

## Validation

Validation runs automatically on every push. It checks:

- Required columns are populated.
- Values fall within declared ranges.
- Vocabulary terms match governed values.
- Geometry columns have valid spatial data.
- Media files referenced in the canonical exist on disk.

Warnings are advisory — they do not block the push. To see warnings without pushing, use `tinyowl validate` or `tinyowl warnings`.

## TOML and README

Push also detects changes to TOML annotations and `README.md`:

- If `tables/*.toml` or `project.toml` changed, the server re-indexes annotations.
- If `README.md` changed, it is uploaded to the server.

## See also

- [`tinyowl pull`](#) — pull remote changes (same HEAD refresh as push)
- [`tinyowl status`](#) — local seq vs remote seq when they differ
- [`tinyowl validate`](validate.md) — run validation standalone
- [`tinyowl warnings`](#) — show validation warnings
