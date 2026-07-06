# tinyowl diff

Show entities changed in a specific commit. Without arguments, shows changes in the most recent (HEAD) commit.

## Usage

```bash
tinyowl diff [commit-id]
```

## Examples

### Show HEAD commit changes

```bash
tinyowl diff
```

### Show changes for a specific commit

```bash
tinyowl diff a1b2c3d4
```

## Flags

| Flag | Type | Required | Default | Description |
|---|---|---|---|---|
| `--server` | string | No | `http://localhost:8080` | Server URL (global) |
| `--token` | string | No | (from config) | Auth token (global) |

## Output

Lists entities grouped by entity type that were part of the commit:

```
Entities in commit a1b2c3d4:
  context:  ctx-001, ctx-002, ctx-005
  sample:   spl-042, spl-043
  find:     fnd-007
```

If the commit has no entities:

```
No entities in this commit.
```

If there are no commits at all:

```
No commits.
```

## How it works

`diff` reads from the local ledger (`.tinyowl/ledger.db`), which records which entity IDs were included in each push, pull, or commit operation. It does not compute a content diff — use `tinyowl validate` or `tinyowl warnings` to inspect data quality.
