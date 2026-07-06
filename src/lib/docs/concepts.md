# Core Concepts

This page explains the fundamental building blocks of TinyOwl: projects, the push/pull workflow, tables, media, column mappings, and member roles. Understanding these will help you structure your data and collaborate effectively.

## Projects

A **project** is a directory that contains all the data and configuration for one archaeological excavation or study. Each project has:

- **`project.toml`** — Project-level configuration: name, description, server URL, and member list.
- **`canonical.gpkg`** — The canonical GeoPackage file. This is the single source of truth for all spatial and tabular data in the project.
- **`tables/`** — A directory of TOML files, each defining one table (layer) in the GeoPackage. A table definition includes its name, columns with types, and optional metadata like descriptions or vocabulary bindings.
- **`README.md`** *(optional)* — A markdown file rendered as the project overview in the web UI. Use it for project descriptions, methodology notes, or links to related resources.

Projects are self-contained: you can copy the directory, share it with a colleague, or clone it from a server. Everything needed to reconstruct the dataset lives in these files.

## Push and Pull Workflow

TinyOwl uses a **diff-based push/pull model** for synchronisation. Instead of uploading entire files each time, the CLI computes only what changed.

- **Push** — The CLI compares your local `canonical.gpkg` against the server's copy and sends only new, modified, or deleted rows. A **ledger** on the server tracks which changes have been applied, so the next push is always incremental.
- **Pull** — The opposite direction: fetch changes made by other team members and merge them into your local `canonical.gpkg`.
- **Clone** — Copy an entire project from the server, including its full GeoPackage and all configuration files.

This model keeps transfers small and fast, even for large excavation datasets. The ledger ensures consistency — if a push is interrupted, you can resume without duplicating data.

## Tables

Tables are the core organisational unit for your data. Each table is defined by a TOML file in the `tables/` directory and maps to a layer in the GeoPackage.

A typical table definition looks like:

```toml
name = "contexts"
description = "Excavation contexts for Trench A"

[[columns]]
name = "context_id"
type = "INTEGER"

[[columns]]
name = "description"
type = "TEXT"

[[columns]]
name = "phase"
type = "TEXT"
```

Table columns can optionally carry **annotations** for data harmonisation:

- **Vocabulary bindings** — Link a column to a controlled vocabulary or CRM ontology term, making it clear what the values represent.
- **Column mappings** — Define how local values translate to external standard vocabularies (see below).

Tables are versioned as part of the project. Changing a table definition (adding a column, renaming a field) produces a schema diff that is pushed and pulled alongside the data.

## Media

Media files — photographs, scanned plans, PDF reports — are stored alongside the entities they document. Each media file is associated with a row in a table via a media column. Files are served through the REST API and displayed inline in the web UI.

The server stores media as files on disk, referenced from the GeoPackage. When you push a project, new or changed media files are included in the diff.

## Column Mappings

**Column mappings** translate values in a local column to terms in an external vocabulary. This is how you harmonise your data with published standards without changing your field recording practices.

For example, you might record "pottery" in a `find_type` column while an external thesaurus expects "ceramic vessel". A column mapping lets you declare that equivalence:

```toml
[mappings.find_type]
pottery = "ceramic vessel"
bone = "faunal remains"
charcoal = "carbonised material"
```

Mappings are stored in the table's TOML definition. The server and frontend use them to display harmonised values alongside your originals.

## Members and Roles

TinyOwl has a simple three-tier role system for controlling access to a project:

| Role | Permissions |
|---|---|
| **Owner** | Full control: manage members, delete the project, all data operations |
| **Admin** | Manage members, push and pull data, modify table definitions |
| **Viewer** | Read-only access: browse layers, view media, read the README |

Members are listed in `project.toml` under a `[members]` section, keyed by the user's Supabase ID. Authentication uses Supabase Auth — users sign in via the web UI and the server validates their JWT tokens against your Supabase project.

Membership is per-project. A user can be an owner of one project and a viewer of another. The CLI uses the same Supabase identity, so push and pull operations are authenticated.
