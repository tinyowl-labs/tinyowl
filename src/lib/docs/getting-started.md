# Getting Started

A complete walkthrough: install the CLI and server, authenticate, create a project, import data, push, and browse in the web UI.

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| Go | 1.22+ | Build the CLI and server |
| Node.js | 20+ | Run the SvelteKit frontend |
| Supabase project | free tier | Authentication + Postgres/PostGIS + storage |

You'll also want **QGIS** (3.28+) or **QField** for editing GeoPackage data — but you can follow this guide without it.

## Step 1: Clone the repos

```bash
git clone https://github.com/tinyowl/tinyowl-cli.git
git clone https://github.com/tinyowl/tinyowl-server.git
git clone https://github.com/tinyowl/tinyowl.git
```

## Step 2: Install the CLI

```bash
cd tinyowl-cli
go install ./cmd/tinyowl
```

Check it works:

```bash
tinyowl --help
```

## Step 3: Start the server

In a new terminal:

```bash
cd tinyowl-server
```

Create a `.env` file (or export these variables):

```bash
PORT=8080
DATABASE_URL="postgres://postgres:<password>@db.<project>.supabase.co:5432/postgres"
SUPABASE_URL="https://<project>.supabase.co"
SUPABASE_JWT_SECRET="<your-jwt-secret>"
TINYOWL_DATA_DIR="./data"
```

Then run:

```bash
go run ./cmd/tinyowl-server
```

Test it:

```bash
curl http://localhost:8080/health
# {"status":"ok"}
```

> The server defaults to port `8080`. Keep this terminal running.

## Step 4: Authenticate the CLI

```bash
tinyowl login --server http://localhost:8080
```

This opens your browser to a verification page. After authorising, the CLI stores a long-lived PAT at `~/.config/tinyowl/config.json`.

> Alternatively, create a PAT from the web UI (Settings → API Tokens) and set `TINYOWL_TOKEN` or pass `--token`.

## Step 5: Create your first project

```bash
tinyowl create my-excavation
cd my-excavation
```

This scaffolds:

```
my-excavation/
├── project.toml          # project metadata
├── project.gpkg           # working copy (editable in QGIS)
├── tables/                # your TOML table definitions go here
├── media/                 # content-addressed media store
├── README.md              # optional project overview
└── .tinyowl/
    ├── canonical.gpkg     # append-only source of truth
    ├── ledger.db          # sync state + commit history
    └── snapshots/         # diff baselines
```

Customise `project.toml`:

```toml
[project]
name = "My Excavation"
slug = "my-excavation"
description = "Summer 2026 field season at the Roman villa site"
machine = "a1b"

[project.tags]
manual = ["roman", "villa", "excavation"]

[project.dates]
start_year = -100
end_year = 400
start_label = "Late Iron Age"
end_label = "Late Roman"
```

## Step 6: Add a table definition

Create `tables/Contexts.toml`:

```toml
[table]
key = "Contexts"
label = "Stratigraphic Context"

[[columns]]
name = "context_id"
type = "string"
label = "Context ID"

[[columns]]
name = "period"
type = "string"
label = "Period"
vocabulary = "periodo"

[[columns]]
name = "depth_cm"
type = "integer"
label = "Depth (cm)"

[[columns]]
name = "soil_type"
type = "string"
label = "Soil Type"

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
references = "Contexts.source_id"
```

## Step 7: Import some data

Create `contexts.csv`:

```csv
context_id,period,depth_cm,soil_type,description,overlies,Latitude,Longitude
CTX-001,Iron Age,85,sandy_loam,Primary fill layer,,52.1234,-1.5678
CTX-002,Roman,30,silty_clay,Secondary fill,CTX-001,52.1240,-1.5680
CTX-003,Prehistoric,120,bedrock,Natural substrate,CTX-002,52.1245,-1.5685
```

Import it:

```bash
tinyowl import contexts.csv --as-new Contexts --yes
```

The CLI generates `tables/Contexts.toml` (if it doesn't exist) with CRM suggestions, creates the layer, inserts rows, and prints a gap summary.

## Step 8: Push to the server

```bash
tinyowl push
```

Expected output:

```
Changes: +3 ~0 -0
Pushed! Server head: 1
```

The CLI detected the new rows, computed a diff, uploaded it, and updated the ledger. The server indexed the metadata, extracted geometries into PostGIS, and scanned vocabulary values.

## Step 9: Browse in the web UI

In a third terminal:

```bash
cd tinyowl
npm install
npm run dev
```

Open `http://localhost:5173` and sign in with your Supabase account. You'll see:

- **Homepage** — Your project on the centroids map
- **Project page** — Overview with title, description, tags, and map
- **Layers** — Table view, 2D map, or schema graph of your Contexts table
- **Artefacts** — Media gallery (empty until you upload files)
- **Dashboard** — Stats, validation warnings, activity timeline
- **Settings** — Members, column/value mappings, visibility, licence

## Next steps

- [Core Concepts](concepts.md) — Deep dive into projects, tables, and the sync model
- [CLI Reference](cli/) — Every command: `pull`, `clone`, `media`, `mappings`, `qgis`, `purge`, and more
- [Import CSV Guide](/docs/guides/import-csv/) — Detailed CSV, GeoJSON, and Shapefile import
- [TOML Reference](/docs/config/tinyowl-toml/) — Full column type and annotation reference
- [API Reference](/docs/api/) — Programmatic access
- [Docker Deployment](/docs/deployment/docker/) — Production deployment with docker compose
