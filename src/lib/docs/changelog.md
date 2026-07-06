---
title: API Changelog
description: Breaking changes and significant updates to the TinyOwl Core API across versions.
---

This page tracks API changes that affect client compatibility. For a stable upgrade path, review this before updating your TinyOwl Core deployment.

## v0.2.0 (Current)

### Removed Endpoints

The following routes were removed during the CRUD handler refactor. They will be re-added in a future release.

| Endpoint | Status | Replacement |
|---|---|---|
| `GET /api/ogc/:groupId` | ❌ Removed | Re-adding in future release |
| `GET /api/ogc/:groupId/conformance` | ❌ Removed | Re-adding in future release |
| `GET /api/ogc/:groupId/collections` | ❌ Removed | Re-adding in future release |
| `GET /api/ogc/:groupId/collections/:id` | ❌ Removed | Re-adding in future release |
| `GET /api/ogc/:groupId/collections/:id/items` | ❌ Removed | Re-adding in future release |
| `POST /api/ogc/:groupId/collections/:id/items` | ❌ Removed | Re-adding in future release |
| `GET /api/vocabularies` | ❌ Removed | Use Supabase queries directly |
| `GET /api/vocabularies/:id/terms` | ❌ Removed | Use Supabase queries directly |
| `POST /api/vocabularies/:id/match-terms` | ❌ Removed | Use Supabase queries directly |
| `GET /api/gis-tokens` | ❌ Removed | Use Supabase JWT tokens |
| `POST /api/gis-tokens` | ❌ Removed | Use Supabase JWT tokens |
| `DELETE /api/gis-tokens/:id` | ❌ Removed | Use Supabase JWT tokens |
| `POST /api/phases` | ❌ Removed | Use direct Supabase queries |
| `POST /api/phase-period-link` | ❌ Removed | Use direct Supabase queries |

### Architectural Changes

- **Auth at proxy**: Core no longer validates web JWT tokens (trusts `X-User-ID` header forwarded by the proxy). CLI PAT tokens are still validated by core's `pkg/auth/middleware.go`.
- **Stateless design**: Core is a single Docker service with no local database. All data lives in Supabase.
- **Import pipeline**: All heavy operations (parse, diff, apply) now delegated to `tinyowl-native`. Core's `import.go` shrank from 1493 to 539 lines.
- **CLI embeds core**: `tinyowl serve` now imports core's public `pkg/api` package, providing a single-binary deployment option.
- **JS SDK aligned**: `@tinyowl/js` exports match core's current route surface. Vocab, GIS token, and phase methods removed.
- **Auth endpoint replaced**: `POST /api/auth/device-token` was removed and replaced by `POST /api/auth/device-code/activate` in the device-code auth flow.

### SDK Changes (`@tinyowl/js`)

Removed from client class:
- `client.getVocabularies()`
- `client.searchTerms()`
- `client.matchTerms()`
- `client.createPhase()`
- `client.getGisTokens()`
- `client.createGisToken()`
- `client.revokeGisToken()`

### CLI Changes

- `tinyowl serve` now embeds full core API via `pkg/api` (was scaffolded placeholder)
- `tinyowl export` now outputs GeoJSON/CSV/JSONL with geometries and properties (was basic skeleton)
- TOML mapping now supports classification and relation columns with delimiters

## v0.1.0

Initial release. All endpoints documented in this site were available.

### Present in v0.1.0, Removed in v0.2.0

The API surface at v0.1.0 included all routes listed in the [API overview](/api/). See v0.2.0 above for the current reduced surface.

---

## Migration Checklist

When upgrading between versions:

1. **Check this changelog** for breaking changes
2. **Update SDK version** — `npm install @tinyowl/js@latest`
3. **Review deprecated endpoints** — remove or replace calls to removed routes
4. **Test imports** — verify the import pipeline works with your existing mappings
5. **Update config** — check for new or changed environment variables

## Reporting Issues

Found a bug or regression? Open an issue at [github.com/tinyowl/tinyowl-core](https://github.com/tinyowl/tinyowl-core).
