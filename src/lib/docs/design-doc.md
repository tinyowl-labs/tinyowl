# TinyOwl Design Document

**What's built (tactical). Horizon roadmap and agent context live in the workspace `docs/` tree.**

> Source of truth: `docs/design_doc.md`, `docs/tinyowl_next.md`, `docs/HANDOFF.md`.
> This copy is served by the embedded docs site — keep it aligned when those change.

Last updated: 2026-07-13 (mappings cutover + handoff).

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

**Rule:** Pushing TOML never deletes manual `value_mappings`. TOML/auto upserts skip `source=manual`. Legacy `column_mappings` table is **dropped** (migration `024`).

---

## What's Built

| Component | Status |
|-----------|--------|
| TOML → GPKG including `arch_date` | ✅ |
| `arch_date` parse / validate / heuristics | ✅ |
| Temporal search (`date_from` / `date_to`) | ✅ |
| Layers + search UI for `arch_date` | ✅ |
| Array / enum TOML types | ✅ |
| Auth (HS256 + ES256 JWKS + PAT via `tinyowl login`) | ✅ |
| Mappings split + UI tabs + legacy drop | ✅ |
| `mappings.toml` export (CLI + web) | ✅ |
| `/value-mappings` (+ `/column-mappings` compat) | ✅ |
| Similar projects | ✅ |
| QGIS ValueRelation FK preservation | ✅ |
| QFieldCloud bridge (link/unlink, `gpkg_name`) | ✅ |
| OpenAlex research accordion | ✅ |
| JS SDK | ❌ Removed |

---

## Remaining priorities

**See workspace `docs/tinyowl_next.md` (P0–P8).** Next up: import wizard (P0), then artefacts ∥ embeddings (P1∥P2).

Skip: diff rewrite. Keep: `cli_tokens` (PATs).

---

## Related

- [TOML config](/docs/config/tinyowl-toml)
- [Search API](/docs/api/search)
- [Mappings API](/docs/api/column-mappings)
- [Concepts](/docs/concepts)
- [Changelog](/docs/changelog)
