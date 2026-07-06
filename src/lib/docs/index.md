# TinyOwl Documentation

TinyOwl is an open-source archaeological data management platform built around a push/pull workflow. It combines a command-line tool for data operations, a REST API server for serving spatial data, and a web UI for browsing and managing projects. All data is stored in GeoPackage files — a portable, standards-based SQLite format for geospatial data.

## What is TinyOwl?

TinyOwl lets archaeological teams manage excavation data as versioned projects. Each project lives in a directory containing a `canonical.gpkg` GeoPackage file, TOML-defined table schemas, and optional README documentation. You work locally with the CLI, push changes to a server, and browse results in a web frontend. The diff-based sync model means only changes travel over the wire — not entire datasets.

## Architecture

TinyOwl has three components, all in a single repository:

- **`tinyowl`** (Go CLI) — The command-line tool for `init`, `push`, `pull`, and `clone` operations on projects.
- **`tinyowl-server`** (Go) — A REST API server that serves GeoPackage data, handles authentication, and manages project storage.
- **`tinyowl` frontend** (SvelteKit) — A web UI for browsing projects, viewing layers on a Leaflet map, managing media, and configuring settings.

Authentication uses Supabase Auth for JWT-based login. The server validates tokens but does not depend on the Supabase database — all data lives in your GeoPackage files.

## Key Features

- **Project management** — Create, clone, push, and pull archaeological projects with versioned history.
- **Layers and tables** — Define tables in TOML with typed columns, served as map layers in the web UI.
- **Media support** — Store images and files alongside entities, served through the REST API.
- **README rendering** — Each project can have a README.md rendered as an overview in the frontend.
- **Column mappings** — Map local column values to external vocabularies for data harmonisation.
- **Member management** — Control access with owner, admin, and viewer roles per project.
- **Related research** — Integration with OpenAlex for discovering linked scholarly works.

## Quick Links

- [Getting Started](getting-started.md) — Install and run TinyOwl locally
- [CLI Reference](cli/) — Commands for `tinyowl` push, pull, init, and clone
- [API Reference](/api/) — REST API endpoints served by `tinyowl-server`
- [Core Concepts](concepts.md) — Understand projects, tables, and the push/pull model
