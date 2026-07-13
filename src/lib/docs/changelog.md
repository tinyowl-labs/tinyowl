---
title: API Changelog
description: Breaking changes and significant updates to the TinyOwl server API across versions.
---

This page tracks API changes that affect client compatibility.

## v0.4.0 — Mappings split cutover

### Schema

- **`column_annotations` + `value_mappings`** are the sole mapping tables (migration `019`).
- **`column_mappings` dropped** (migration `024`). Dual-write / legacy fallbacks removed from the server.
- Stub public downloads gate on `column_annotations` (vocabulary or `crm_property`).

### API

- Prefer `/value-mappings` and `/column-annotations`. `/column-mappings` remains a compat alias for value endpoints.
- CLI and web Settings use `/value-mappings`.

### Docs

- Workspace roadmap: `docs/tinyowl_next.md`. Agent entry: `docs/HANDOFF.md`.

## v0.3.0 — Production harden

### Auth

- **JWT verification required.** Supabase access tokens are verified with HS256 using `SUPABASE_JWT_SECRET` (or `JWT_SECRET`). Unsigned / forged JWTs are rejected. Set the secret in production.
- Static `TINYOWL_AUTH_TOKEN` and CLI PATs (`tol_…` / `cli_tokens`) unchanged. Device-code login mints a PAT (CLI never stores short-lived JWT).

### Indexing

- Column-level TOML annotations live in `column_annotations`.
- Value-level rows come from scanning vocab / `arch_date` / array columns into `value_mappings`.
- Junk `local_value = column_name` stubs are gone with the legacy table.

### Removed

- **`@tinyowl/js`** — removed from the workspace. Frontend uses raw `/api/v1` fetch. Do not reintroduce until the API is stable.
- **`tinyowl-native/pkg/sync`** — dead stub; push/pull lives in `tinyowl-cli`.

### Client / ledger

- CLI push now records changed `source_id`s into ledger `commit_entities` (purge safety).

## v0.2.0

Historical notes for the earlier core refactor. Several claims below (proxy-only auth, embedded `tinyowl serve`, JS SDK) no longer describe the current stack — see v0.3.0.

### Architectural Changes (historical)

- Diff-based push/pull against canonical GeoPackages.
- Postgres coordination index for search and mappings.
- Device-code CLI login + PAT tokens.
