# tinyowl validate

Validate the current project's working copy against the TOML table schema. This checks data quality without connecting to the server or pushing anything.

## Usage

```bash
tinyowl validate
```

Run from within a TinyOwl project directory. The command finds the project root automatically and validates `project.gpkg` against the table definitions in `tables/*.toml`.

## Flags

| Flag | Type | Required | Default | Description |
|---|---|---|---|---|
| `--server` | string | No | `http://localhost:8080` | Server URL (global) |
| `--token` | string | No | (from config) | Auth token (global) |

## What it checks

Validation inspects every row in `project.gpkg` against the schema defined in `tables/*.toml`:

- **Required columns** — are required fields populated?
- **Range checks** — do numeric values fall within declared min/max?
- **Vocabulary** — do text values match governed vocabulary terms?
- **Geometry validity** — are spatial columns present and well-formed?
- **Media references** — do referenced media files exist in `media/`?
- **Entity ID format** — do source IDs follow the expected machine prefix pattern?

## Output

### All clear

```
Validation passed.
```

### Warnings found

```
2 warnings:
  ⚠ context.depth [ctx-012]: value exceeds expected range (range_check)
  ⚠ sample.material: empty value (missing_required)
```

Each warning line shows:

| Part | Meaning |
|---|---|
| `context.depth` | Table name and column name |
| `[ctx-012]` | Source ID of the entity (if applicable) |
| `value exceeds expected range` | Human-readable message |
| `(range_check)` | Warning type code |

## When to use

- **Before pushing** — catch data issues early. `push` also runs validation, but `validate` lets you check without touching the server.
- **CI / pre-commit hooks** — run `tinyowl validate` in a script to gate on clean data.
- **Schema development** — iterate on `tables/*.toml` and validate against real data.

## See also

- [`tinyowl warnings`](#) — same output, with an `--acknowledged` flag
- [`tinyowl push`](serve.md) — push changes (includes validation)
