# Column Mappings API

Endpoints for managing column-level annotations that link data columns to controlled vocabularies and CRM (CIDOC Conceptual Reference Model) properties.

## Overview

Column mappings connect raw data columns in your GeoPackage tables to semantic concepts. Each mapping tracks:

- **Vocabulary columns** — Columns that contain values from a known vocabulary (e.g., PeriodO, Wikidata). Value-level concept URIs can be assigned via `PUT`.
- **CRM columns** — Columns whose semantics are defined by a CRM property (e.g., `crm:P3_has_note`). These are populated automatically from table TOML annotations.

When data is pushed, the server automatically indexes column names and distinct values into the `column_mappings` table. TOML annotations in `[table]` definitions further refine these mappings.

## List Column Mappings

```
GET /api/v1/{org}/{project}/column-mappings
```

List all column mappings for a project, ordered by entity type, column name, and local value.

**Authenticated** — requires Bearer token and project membership.

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
  },
  {
    "entity_type": "Site_Points",
    "column_name": "period",
    "local_value": "Medieval",
    "concept_uri": null,
    "vocabulary": "periodo",
    "crm_property": null,
    "crm_range": null,
    "confidence": 1.0,
    "source": "auto",
    "entity_count": 15
  },
  {
    "entity_type": "Site_Points",
    "column_name": "note",
    "local_value": "note",
    "concept_uri": "crm:P3_has_note",
    "vocabulary": "crm",
    "crm_property": "crm:P3_has_note",
    "crm_range": "crm:E62_String",
    "confidence": 1.0,
    "source": "toml",
    "entity_count": 142
  }
]
```

| Field | Type | Description |
|---|---|---|
| `entity_type` | string | Table name in the GeoPackage |
| `column_name` | string | Column name |
| `local_value` | string | For value-level mappings: the data value. For column-level: same as `column_name` |
| `concept_uri` | string\|null | URI of the linked concept (from vocabulary if set, or CRM property URI) |
| `vocabulary` | string\|null | Vocabulary namespace (e.g., `periodo`, `crm`) |
| `crm_property` | string\|null | CRM property URI |
| `crm_range` | string\|null | CRM range class |
| `confidence` | number | Confidence score (0.0–1.0) |
| `source` | string | Origin: `auto` (indexed), `toml` (from annotations), or `manual` (via API) |
| `entity_count` | int | Number of entities with this column/value |

### Example

```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:8090/api/v1/my-org/my-project/column-mappings
```

---

## Create or Update Column Mapping

```
PUT /api/v1/{org}/{project}/column-mappings
```

Set a concept URI for a specific value-level mapping. This is how you link a raw data value (e.g., `"Iron Age"`) to a controlled vocabulary concept (e.g., `periodo:p0v8k4r`).

**Authenticated** — requires Bearer token and project membership.

### Request Body

```json
{
  "entity_type": "Site_Points",
  "column_name": "period",
  "local_value": "Iron Age",
  "concept_uri": "periodo:p0v8k4r",
  "vocabulary": "periodo",
  "crm_property": null,
  "crm_range": null,
  "confidence": 1.0
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `entity_type` | string | Yes | Table name |
| `column_name` | string | Yes | Column name |
| `local_value` | string | Yes | The data value to map |
| `concept_uri` | string\|null | No | URI of the linked concept |
| `vocabulary` | string\|null | No | Vocabulary namespace |
| `crm_property` | string\|null | No | CRM property URI |
| `crm_range` | string\|null | No | CRM range class |
| `confidence` | number | No | Confidence score (default: `1.0`) |

If a mapping already exists for `(project_slug, entity_type, column_name, local_value)`, it is updated. Otherwise a new row is inserted. The `source` is set to `manual`.

### Response

```json
{
  "status": "ok"
}
```

### Example

```bash
curl -X PUT http://localhost:8090/api/v1/my-org/my-project/column-mappings \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "entity_type": "Site_Points",
    "column_name": "period",
    "local_value": "Iron Age",
    "concept_uri": "periodo:p0v8k4r",
    "vocabulary": "periodo"
  }'
```

---

## How Mappings Are Populated

1. **On push** — The server scans the canonical GeoPackage for column names and inserts them as column-level mappings (`source: "auto"`). For columns with vocabulary annotations in the table TOML, distinct data values are also indexed as value-level mappings.

2. **From TOML** — When the table TOML defines `vocabulary` or `property` on a column (see [TOML Config](/docs/config/tinyowl-toml/)), those annotations update the corresponding mappings (`source: "toml"`).

3. **Manual** — You can set or override concept URIs via this API (`source: "manual"`).
