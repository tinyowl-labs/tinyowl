# tinyowl push

Push local changes to the server. This is the primary command for sharing your work — it detects edits in `project.gpkg`, computes a diff against canonical, runs validation checks, and uploads the result.

## Usage

```bash
tinyowl push
```

Run from within a TinyOwl project directory (or any subdirectory). The command finds the project root automatically.

## Flags

| Flag | Type | Required | Default | Description |
|---|---|---|---|---|
| `--server` | string | No | `http://localhost:8080` | Server URL (global) |
| `--token` | string | No | (from config) | Auth token (global) |

## What it does

1. **Loads project** — reads `project.toml` and all `tables/*.toml` files.
2. **Revises** — compares `project.gpkg` against `.tinyowl/canonical.gpkg` to detect inserts, updates, and deletes.
3. **Validates** — runs schema validation against the TOML definitions. Shows warnings but never blocks the push.
4. **Cross-ref checks** — validates cross-GPKG reference integrity for columns with `references` configured.
5. **Computes diff** — generates a binary diff of changes.
6. **Uploads** — sends the diff, DDL, and TOML metadata to the server.
7. **Records commit** — writes the operation to `.tinyowl/ledger.db` and saves a snapshot.
8. **Re-exports** — regenerates `project.gpkg` from the updated canonical.

## Example

```bash
cd my-excavation
# edit project.gpkg in QGIS…
tinyowl push
```

Output (with changes):

```
Changes: +5 ~3 -1
  Validation warnings (2):
    ⚠ context.depth [ctx-012]: value exceeds expected range (range_check)
    ⚠ sample.material: empty value (missing_required)
Pushed! Server head: d4e5f6a7b8c9
```

Output (no changes):

```
No changes to push.
```

Output (TOML-only changes):

```
TOML annotations changed — re-indexing on server.
Pushed! Server head: d4e5f6a7b8c9
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

- [`tinyowl pull`](#) — pull remote changes
- [`tinyowl status`](#) — check sync state
- [`tinyowl validate`](validate.md) — run validation standalone
- [`tinyowl warnings`](#) — show validation warnings
