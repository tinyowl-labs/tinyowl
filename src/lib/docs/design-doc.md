# TinyOwl Design Document

**What's built, what's next. Authoritative reference for remaining work.**

> Source of truth for this document lives in the workspace `docs/design_doc.md`.
> This copy is served by the embedded docs site.

Last updated: 2026-07-11 (QField polish + mappings export + arch_date UI).

---

## Architecture Overview

TinyOwl is a collaborative archaeological data platform. Field teams work offline in QField/QGIS, sync through a coordination server, and search across projects using shared vocabularies — without leaving their existing tools.

### Three-Layer Model

1. **Canonical GPKG (append-only)** — Immutable entity rows (`source_id` + `_revision`). Media is content-addressed (SHA-256).
2. **Diff sync** — Incremental `.diff` files via go-geodiff. Good enough for archaeology concurrency — not a focus area.
3. **Coordination index (Postgres)** — Derived from TOML + GPKG at push time. Search, spatial, temporal, tags, column annotations, value mappings. Never the source of truth for schema or project metadata.

### Authority model

| Concern | Source of truth | Postgres |
|---------|-----------------|----------|
| Project identity, tags_manual, dates | `project.toml` | Indexed on push |
| Auto tags | Server-derived | `tags_auto` |
| Temporal extent | Project dates + entity `arch_date` | `date_start` / `date_end` |
| Column semantics | `tables/*.toml` | `column_annotations` |
| Value → concept | DB + optional `mappings.toml` | `value_mappings` |

**Rule:** Pushing TOML never deletes manual `value_mappings`. TOML/auto upserts skip `source=manual`.

---

## What's Built

| Component | Status |
|-----------|--------|
| TOML → GPKG including `arch_date` | ✅ |
| `arch_date` parse / validate / heuristics | ✅ |
| Temporal search (`date_from` / `date_to`) | ✅ |
| Layers + search UI for `arch_date` | ✅ |
| Array / enum TOML types | ✅ |
| Auth (HS256 + ES256 JWKS + PAT) | ✅ |
| Mappings split + UI tabs | ✅ |
| `mappings.toml` export (CLI + web) | ✅ |
| `/value-mappings` alias | ✅ |
| Similar projects | ✅ |
| QGIS ValueRelation FK preservation | ✅ |
| QFieldCloud bridge (link/unlink, `gpkg_name`) | ✅ |
| OpenAlex research accordion | ✅ |
| JS SDK | ❌ Removed |

---

## Remaining priorities

Skip: diff rewrite. Keep: `cli_tokens` (PATs).

---

## Related

- [TOML config](/docs/config/tinyowl-toml)
- [Search API](/docs/api/search)
- [Column mappings API](/docs/api/column-mappings)
- [Concepts](/docs/concepts)
