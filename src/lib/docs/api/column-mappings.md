# Mappings API

Value-level concept links and column-level vocabulary opt-in. Prefer these paths; `/column-mappings` remains a **compat alias** for the value endpoints.

**Column annotation** = opt a field into a namespace (`periodo` / `aat` / `crm` for shared meaning; empty or unknown names stay local). **Value mapping** = bind a local label to a `concept_uri` so projects interoperate even when they do not share wording.

## Overview

Two tables after migration `019` / `024`:

| Table | Role |
|-------|------|
| `value_mappings` | Distinct cell values → optional `concept_uri` (project-canonical) |
| `column_annotations` | Per-column `vocabulary`, `crm_property`, `crm_range` (mostly TOML-owned) |

On push the server upserts annotations from TOML, scans distinct values into `value_mappings` for columns that declare any vocabulary, and never clears manual `concept_uri` on auto re-scan. Unmapped-concept warnings apply only to shared vocabs (`periodo`, `aat`, `crm`). TOML / auto upserts skip rows with `source = 'manual'`. Search (`vocab=` and mapped `q=` hits) joins on `concept_uri`, not identical local strings.

---

## List value mappings

```
GET /api/v1/{org}/{project}/value-mappings
GET /api/v1/projects/{slug}/value-mappings
```

Compat: same handler on `/column-mappings`.

Query params: `unmapped=true`, `needs_review=true`, `table=…`, `column=…`.

**Authenticated** — Bearer + project membership.

### Response

```json
[
  {
    "entity_type": "Site_Points",
    "column_name": "period",
    "local_value": "Iron Age",
    "concept_uri": "periodo:p0v8k4r",
    "vocabulary": "periodo",
    "crm_property": null,
    "crm_range": null,
    "confidence": 1.0,
    "source": "manual",
    "entity_count": 23
  }
]
```

CRM fields are always null on value rows (they live on `column_annotations`).

| Field | Type | Description |
|---|---|---|
| `entity_type` | string | Table name |
| `column_name` | string | Column name |
| `local_value` | string | Normalised cell value |
| `concept_uri` | string\|null | Linked concept |
| `vocabulary` | string\|null | e.g. `periodo`, `aat` |
| `confidence` | number | 0.0–1.0 |
| `source` | string | `auto` \| `toml` \| `manual` |
| `entity_count` | int | Approximate entity count for this value |

```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:8080/api/v1/projects/my-org_my-project/value-mappings
```

---

## Upsert value mapping

```
PUT /api/v1/{org}/{project}/value-mappings
PUT /api/v1/projects/{slug}/value-mappings
```

```json
{
  "entity_type": "Site_Points",
  "column_name": "period",
  "local_value": "Iron Age",
  "concept_uri": "periodo:p0v8k4r",
  "vocabulary": "periodo",
  "confidence": 1.0
}
```

Sets `source = 'manual'`. Unique key: `(project_slug, entity_type, column_name, local_value)`.

---

## Bulk value mapping

```
POST /api/v1/projects/{slug}/value-mappings/bulk
```

```json
{
  "local_value": "Roman",
  "column_name": "period",
  "concept_uri": "periodo:roman",
  "vocabulary": "PeriodO",
  "confidence": 0.9,
  "scope": "matching_value_and_column"
}
```

`scope`: `exact` (needs `entity_type`) or `matching_value_and_column`.

---

## Column annotations

```
GET /api/v1/projects/{slug}/column-annotations
PUT /api/v1/projects/{slug}/column-annotations
```

```json
{
  "entity_type": "Site_Points",
  "column_name": "note",
  "vocabulary": "crm",
  "crm_property": "crm:P3_has_note",
  "crm_range": "crm:E62_String"
}
```

PUT sets `source = 'manual'` and can override TOML until the next TOML push that is allowed to win (TOML upserts skip `source = 'manual'`). Setting `vocabulary` to `periodo`, `aat`, or `crm` opts the column into the shared-meaning queue; clearing it (or using a local name such as `find-type`) keeps values project-local. `crm_property` is optional metadata.

---

## Export

```
GET /api/v1/projects/{slug}/mappings.toml
```

Confirmed value mappings (`concept_uri` set) as `mappings.toml`.

CLI: `tinyowl mappings list|map|export` (uses `/value-mappings`).

---

## How rows are populated

1. **Push / reindex** — TOML → `column_annotations`; scan vocab / `arch_date` / array columns → `value_mappings` (`source=auto`).
2. **Optional `mappings.toml`** — seed with `source=toml` where not manual.
3. **Settings UI / API** — manual concept links (`source=manual`).
