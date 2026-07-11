# TOML Configuration Reference

TinyOwl uses TOML files to define projects and table schemas. These files are used by the CLI during import and by the server during push indexing.

## Project TOML (`project.toml`)

The project TOML defines top-level project metadata. Place it at the root of your project directory.

### Format

```toml
[project]
name = "My Excavation Project"
slug = "my-excavation"
description = "Short summary"
machine = "a1b"

[project.tags]
manual = ["rock-art", "survey"]

[project.dates]
start_year = -20000
end_year = 2024
start_label = "Pleistocene"
end_label = "Present"
```

### Fields

| Key | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Human-readable project title |
| `slug` | string | Yes | URL-safe project identifier |
| `description` | string | No | Short project summary |
| `machine` | string | No | Worker machine id for source_id generation (e.g. `a1b`) |
| `tags.manual` | string[] | No | Curator tags (`tags_manual` in Postgres) |
| `dates.start_year` / `end_year` | int | No | Astronomical years (negative = BCE) |
| `dates.start_label` / `end_label` | string | No | Human labels for the extent |
| `dates.start_uri` / `end_uri` | string | No | Optional PeriodO (or other) concept URIs |

### Example

```toml
[project]
name = "Injalak Rock Art Survey 2026"
slug = "injalak-hill"
machine = "a1b"

[project.tags]
manual = ["rock-art", "kakadu"]

[project.dates]
start_year = -20000
end_year = 2024
start_label = "Pleistocene"
end_label = "Present"
```

---

## Table TOML

Each entity type (table) in your project needs a corresponding TOML file. The file defines the table name and the columns (with types, vocabulary bindings, and constraints).

### Format

```toml
[table]
key = "contexts"
label = "Stratigraphic Context"

[[columns]]
name = "site_name"
type = "string"
label = "Site name"

[[columns]]
name = "period"
type = "arch_date"
label = "Period"
vocabulary = "periodo"

[[columns]]
name = "depth_cm"
type = "integer"
label = "Depth (cm)"

[[columns]]
name = "compaction"
type = "enum"
label = "Compaction"
values = ["loose", "firm", "compact"]

[[columns]]
name = "description"
type = "string"
label = "Description"
property = "crm:P3_has_note"
range = "crm:E62_String"

[[columns]]
name = "overlies"
type = "string"
label = "Overlies"
references = "contexts.source_id"
```

### `[table]` Section

| Key | Type | Required | Description |
|---|---|---|---|
| `key` | string | Yes | Table name. Becomes the entity type and GeoPackage table name. Must be a valid SQLite table name |
| `label` | string | Yes | Human-readable table label |

### `[[columns]]` Sections

Each `[[columns]]` entry defines one column in the table.

| Key | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Column name |
| `type` | string | Yes | `string`, `integer`, `double`, `boolean`, `date`, `datetime`, `arch_date`, `enum`, `media`, `geometry`, `id` |
| `label` | string | Yes | Display label |
| `vocabulary` | string | No | Vocabulary namespace (`periodo`, `aat`, …). Triggers value-level indexing |
| `property` | string | No | CRM property URI (e.g. `crm:P3_has_note`) |
| `range` | string | No | CRM range class |
| `references` | string | No | FK reference `Table.column` (also from QGIS ValueRelation import) |
| `values` | string[] | No | Allowed values when `type = "enum"` |

### Column Annotations

#### Archaeological dates (`arch_date`)

```toml
[[columns]]
name = "occupation"
type = "arch_date"
label = "Occupation"
vocabulary = "periodo"
```

Stored as TEXT. Prefer compact JSON `{"start":-8000,"end":-6000,"label":"Early Holocene"}`. Plain strings like `1200 BCE` or `Roman` are accepted; the server parses years when possible and unions them into the project temporal extent.

#### Vocabulary Columns

Set `vocabulary` on columns whose values come from a controlled terminology:

```toml
[[columns]]
name = "period"
type = "string"
vocabulary = "periodo"
```

During push, the server scans distinct values and creates `value_mappings` rows. Assign concept URIs via the [Column Mappings API](/docs/api/column-mappings/).

#### CRM Property Columns

Set `property` on columns whose semantics are defined by a CIDOC CRM property:

```toml
[[columns]]
name = "description"
type = "string"
property = "crm:P3_has_note"
range = "crm:E62_String"
```

#### Reference Columns

Set `references` on columns that reference entities in another table (or import from QGIS ValueRelation widgets):

```toml
[[columns]]
name = "overlies"
type = "string"
references = "contexts.source_id"
```

---

## Complete Example

### project.toml

```toml
[project]
name = "Injalak Rock Art Survey 2026"
slug = "injalak/rock-art-survey"
machine = "archaeology"
```

### RockArt_Points.toml

```toml
[table]
key = "RockArt_Points"

[[columns]]
name = "motif_id"
type = "text"

[[columns]]
name = "motif_type"
type = "text"
vocabulary = "motif"

[[columns]]
name = "pigment"
type = "text"
vocabulary = "pigment"

[[columns]]
name = "panel"
type = "text"
references = "Panels.source_id"

[[columns]]
name = "condition"
type = "text"
vocabulary = "condition"

[[columns]]
name = "notes"
type = "text"
property = "crm:P3_has_note"
range = "crm:E62_String"

[[columns]]
name = "photographer"
type = "text"
```

### Panels.toml

```toml
[table]
key = "Panels"

[[columns]]
name = "panel_name"
type = "text"

[[columns]]
name = "aspect"
type = "text"
vocabulary = "aspect"

[[columns]]
name = "shelter_type"
type = "text"
vocabulary = "shelter"

[[columns]]
name = "site"
type = "text"
references = "Sites.source_id"
```

---

## How TOML Annotations Are Used

When data is pushed with the `X-TinyOwl-Toml` header (a base64-encoded JSON representation of the table TOMLs), the server:

1. Updates `column_mappings` rows with vocabulary and CRM property info (`source: "toml"`)
2. Generates `validation_warnings` for:
   - Vocabulary columns with no value-level concept mappings
   - Columns with no vocabulary or CRM annotation at all
3. Scans distinct values for vocabulary-annotated columns and creates value-level mapping rows

The TOML annotations are **additive**: they don't replace manually set concept URIs — they only fill in missing vocabulary and property metadata.
