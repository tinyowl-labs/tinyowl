# TinyOwl CLI

The `tinyowl` CLI is a distributed version-control tool for archaeological spatial data. Each project is a directory containing a GeoPackage working copy (`project.gpkg`), table definitions (TOML), media files, and a local ledger that tracks every push and pull. The canonical state lives in `.tinyowl/canonical.gpkg`; the working copy is exported from it after each sync.

## Installation

```bash
go install github.com/tinyowl/tinyowl-cli/cmd/tinyowl@latest
```

Or download a pre-built binary from the [GitHub releases page](https://github.com/tinyowl/tinyowl-cli/releases).

## Getting started

```bash
tinyowl login                        # authenticate via browser
tinyowl clone my-project             # clone a remote project
cd my-project
# edit project.gpkg with QGIS or ArcGIS…
tinyowl push                         # push changes to the server
```

Or start from scratch:

```bash
tinyowl init my-site --template excavation
cd my-site
# add tables/ TOML files, then edit project.gpkg…
tinyowl push
```

## Global flags

| Flag | Default | Description |
|---|---|---|
| `--server` | `http://localhost:8080` | TinyOwl server URL |
| `--token` | (from config) | Auth token |

The token is stored in `~/.tinyowl/config.toml` after running `tinyowl login`.

## Commands

### Core workflow

| Command | Description |
|---|---|
| [`push`](#push) | Push local changes to the server |
| [`pull`](#pull) | Pull remote changes from the server |
| [`clone`](#clone) | Clone a remote project to a local directory |
| [`init`](#init) | Initialize a new TinyOwl project |
| [`status`](#status) | Show working-tree sync state |
| [`log`](#log) | Show local commit history |
| [`commit`](#commit) | Record an optional local commit |

### Data operations

| Command | Description |
|---|---|
| [`import`](#import) | Import a legacy GeoPackage into a TinyOwl project |
| [`export`](export.md) | Regenerate `project.gpkg` from canonical |
| [`diff`](diff.md) | Show entities changed in a commit |
| [`validate`](validate.md) | Validate the project against TOML schema |
| [`warnings`](#warnings) | Show validation warnings |

### Entity lifecycle

| Command | Description |
|---|---|
| [`delete`](#delete) | Soft-delete an entity |
| [`restore`](#restore) | Restore a soft-deleted entity |
| [`purge`](#purge) | Hard-delete an unpushed entity from canonical |

### Media

| Command | Description |
|---|---|
| `media push` | Upload media files to the server |
| `media add` | Register a media file for an entity |
| `media import-dir` | Import all media files from a directory |
| `media sync-from` | Copy media and entity links from another project |
| `media status` | Show media directory stats |
| [`gc`](#gc) | Find and remove orphaned media files |

### Project & mappings

| Command | Description |
|---|---|
| `project create` | Create a new project on the server |
| `project list` | List your projects |
| `mappings list` | List column-to-concept mappings |
| `mappings map` | Map a local value to a concept URI |

### Auth

| Command | Description |
|---|---|
| [`login`](#login) | Authenticate via browser |
| [`logout`](#logout) | Remove stored authentication |

## Project layout

```
my-project/
├── project.toml           # project metadata
├── project.gpkg           # working copy (editable)
├── README.md              # optional readme
├── tables/                # TOML table definitions
│   └── *.toml
├── media/                 # content-addressed media files
│   └── {prefix}/{hash}
└── .tinyowl/
    ├── canonical.gpkg     # authoritative state
    ├── ledger.db          # commit / sync history
    └── snapshots/         # diff snapshots
```

## Architecture

```
project.gpkg  ──edit──>  revision.Revise()  ──>  canonical.gpkg  ──push──>  server
                                                         ↑
                                                    pull (diff apply)
```

The CLI operates entirely on local SQLite GeoPackages. The server is a remote sync target — push sends diffs, pull receives them. No PostgreSQL or HTTP import pipeline is involved in normal use.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | Error (file not found, parse error, API error, etc.) |
