---
title: API Changelog
description: Breaking changes and significant updates to the TinyOwl server API across versions.
---

This page tracks API changes that affect client compatibility.

## v0.3.0 (Current) — Production harden

### Auth

- **JWT verification required.** Supabase access tokens are verified with HS256 using `SUPABASE_JWT_SECRET` (or `JWT_SECRET`). Unsigned / forged JWTs are rejected. Set the secret in production.
- Static `TINYOWL_AUTH_TOKEN` and CLI PATs (`tol_…` / `cli_tokens`) unchanged.

### Indexing

- Removed junk `column_mappings` rows where `local_value = column_name`.
- Column-level TOML annotations upsert with `local_value = ''`.
- Value-level rows still come from scanning vocab-annotated columns.

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
