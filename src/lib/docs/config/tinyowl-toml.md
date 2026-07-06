# TOML Configuration Reference

TinyOwl uses TOML files to define projects and table schemas. These files are used by the CLI during import and by the server during push indexing.

## Project TOML (`project.toml`)

The project TOML defines top-level project metadata. Place it at the root of your data directory.

### Format

```toml
[project]
name = "My Excavation Project"
slug = "my-excavation"
machine = "archaeology"
```

### Fields

| Key | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Human-readable project title |
| `slug` | string | Yes | URL-safe project identifier. Use `org/project` for namespaced projects |
| `machine` | string | No | Domain hint for the project (e.g., `archaeology`, `ecology`, `geology`) |

### Example

```toml
[project]
name = "Injalak Rock Art Survey 2026"
slug = "injalak/rock-art-survey"
machine = "archaeology"
```

---

## Table TOML

Each entity type (table) in your project needs a corresponding TOML file. The file defines the table name and the columns (with types, vocabulary bindings, and constraints).

### Format

```toml
[table]
key = "Site_Points"

[[columns]]
name = "site_name"
type = "text"

[[columns]]
name = "period"
type = "text"
vocabulary = "periodo"

[[columns]]
name = "depth_cm"
type = "integer"

[[columns]]
name = "soil_type"
type = "text"
vocabulary = "soil"

[[columns]]
name = "description"
type = "text"
property = "crm:P3_has_note"
range = "crm:E62_String"

[[columns]]
name = "overlies"
type = "text"
references = "Contexts.source_id"
```

### `[table]` Section

| Key | Type | Required | Description |
|---|---|---|---|
| `key` | string | Yes | Table name. Becomes the entity type and GeoPackage table name. Must be a valid SQLite table name |

### `[[columns]]` Sections

Each `[[columns]]` entry defines one column in the table.

| Key | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Column name. Must be a valid SQLite column name |
| `type` | string | Yes | SQLite column type. Common values: `text`, `integer`, `real`, `blob` |
| `vocabulary` | string | No | Vocabulary namespace for this column. Triggers value-level indexing. Examples: `periodo`, `wikidata`, `soil` |
| `property` | string | No | CRM property URI (e.g., `crm:P3_has_note`). Marks this as a CRM-annotated column |
| `range` | string | No | CRM range class (e.g., `crm:E62_String`). Used with `property` |
| `references` | string | No | Foreign key reference in the form `Table.column` (e.g., `Contexts.source_id`) |

### Column Annotations

#### Vocabulary Columns

Set `vocabulary` on columns whose values come from a controlled terminology:

```toml
[[columns]]
name = "period"
type = "text"
vocabulary = "periodo"
```

During push, the server scans distinct values in this column and creates value-level `column_mappings` rows. You can then assign concept URIs via the [Column Mappings API](/docs/api/column-mappings/).

#### CRM Property Columns

Set `property` on columns whose semantics are defined by a CIDOC CRM property:

```toml
[[columns]]
name = "description"
type = "text"
property = "crm:P3_has_note"
range = "crm:E62_String"
```

The `vocabulary` is auto-set to the prefix of the property (e.g., `crm` for `crm:P3_has_note`). The `concept_uri` is set to the property URI.

#### Reference Columns

Set `references` on columns that reference entities in another table:

```toml
[[columns]]
name = "overlies"
type = "text"
references = "Contexts.source_id"
```

This declares that values in this column are `source_id` values from the `Contexts` table. The CLI uses this to validate referential integrity during import.

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
