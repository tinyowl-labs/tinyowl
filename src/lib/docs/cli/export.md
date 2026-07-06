# tinyowl export

Regenerate `project.gpkg` from the canonical GeoPackage. This rebuilds the working copy so it reflects the current canonical state — useful after manual canonical edits, or when the working copy gets out of sync.

## Usage

```bash
tinyowl export
```

Run from within a TinyOwl project directory (or any subdirectory). The command finds the project root automatically.

## Flags

| Flag | Type | Required | Default | Description |
|---|---|---|---|---|
| `--server` | string | No | `http://localhost:8080` | Server URL (global) |
| `--token` | string | No | (from config) | Auth token (global) |

## What it does

1. Reads `project.toml` for the machine prefix and project metadata.
2. Loads all table definitions from `tables/*.toml`.
3. Exports the canonical GPKG (`.tinyowl/canonical.gpkg`) into the working copy (`project.gpkg`), applying the machine prefix to entity IDs and filtering out soft-deleted entities.
4. The working copy is a standard GeoPackage — open it in QGIS, ArcGIS, or any GIS tool.

## Example

```bash
cd my-project
tinyowl export
```

```
project.gpkg regenerated from canonical.
```

## When to use

- **After a pull** — `pull` already calls export automatically; you rarely need to run this manually.
- **After editing canonical directly** — if you manually modify `.tinyowl/canonical.gpkg` (not recommended), export syncs the working copy.
- **Working copy corruption** — if `project.gpkg` becomes damaged, delete it and run `tinyowl export` to regenerate.
