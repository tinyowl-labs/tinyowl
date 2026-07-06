# tinyowl import

Import a legacy GeoPackage into a new TinyOwl project. This introspects the source GPKG schema, generates TOML table definitions, seeds the canonical, and copies the data into the working copy.

## Usage

```bash
tinyowl import <gpkg-path> <project-dir> [flags]
```

## Examples

### Basic import

```bash
tinyowl import old_data.gpkg ./my-project
```

Output:

```
Importing old_data.gpkg -> ./my-project/
  Introspecting schema...
  Found 3 tables
  TOML files ready
  Creating canonical...
  Exporting project.gpkg...
  Importing data...
  Linking media to entities...
  Copied 12 media files

Project ready: ./my-project/
```

### Import and push immediately

```bash
tinyowl import survey.gpkg ./survey-project --push-after
```

Introspects, imports, then pushes the new project to the server in one step.

## Flags

| Flag | Type | Required | Default | Description |
|---|---|---|---|---|
| `--name` | string | No | (from dir name) | Project name for `project.toml` |
| `--push-after` | bool | No | `false` | Push to the server after import completes |
| `--server` | string | No | `http://localhost:8080` | Server URL (global) |
| `--token` | string | No | (from config) | Auth token (global) |

## What it does

1. **Introspects** the source GPKG — reads all tables, columns, and geometry types.
2. **Generates TOML** — writes `project.toml` and one `tables/<name>.toml` per table. Existing files are never overwritten.
3. **Seeds canonical** — creates `.tinyowl/canonical.gpkg` with the full DDL.
4. **Exports working copy** — writes `project.gpkg` from canonical.
5. **Imports rows** — copies all data from the source GPKG into the working copy, applying the machine prefix to entity IDs (`imp` by default).
6. **Links media** — if the source GPKG has a `_media` table (e.g. from a previous TinyOwl export), entity-media links are recreated.
7. **Copies media files** — media files from the source directory are copied into the project's `media/` directory.

## After import

The project is ready to use:

```bash
cd ./my-project
# edit project.gpkg in QGIS…
tinyowl push
```

Review and adjust the generated `tables/*.toml` files to add vocabulary annotations, column descriptions, and relation predicates before pushing.
