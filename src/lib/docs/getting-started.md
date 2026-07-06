# Getting Started

This guide walks you through installing TinyOwl and creating your first project. You'll set up the CLI, initialise a project, push data to a server, and view it in the browser.

## Prerequisites

- **Go 1.22+** — for building the CLI and server
- **Node.js 20+** — for running the SvelteKit frontend
- A **Supabase** project (free tier works) for authentication

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/tinyowl/tinyowl.git
cd tinyowl
```

### 2. Install the CLI

Build and install the `tinyowl` command-line tool:

```bash
go install ./cmd/tinyowl
```

Verify it works:

```bash
tinyowl --help
```

### 3. Create a project

Initialise a new archaeological project. This creates a directory with a `project.toml` config, an empty `canonical.gpkg`, and a `tables/` directory for your TOML table definitions.

```bash
tinyowl init my-excavation
cd my-excavation
```

### 4. Start the server

In a separate terminal, start `tinyowl-server` from the repository root:

```bash
cd /path/to/tinyowl
go run ./cmd/tinyowl-server
```

The API server starts on `http://localhost:8090` by default. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in your environment so the server can validate auth tokens.

### 5. Push your project

From your project directory, push the project to the server:

```bash
tinyowl push
```

The CLI computes a diff of your local `canonical.gpkg` against the server and sends only the changes. A ledger tracks what has been pushed so subsequent pushes are incremental.

### 6. View in the browser

Start the frontend from the repository root:

```bash
cd /path/to/tinyowl
npm install
npm run dev
```

Open `http://localhost:5173` and sign in with your Supabase account. Your project appears in the dashboard with its layers, media, and README.

## Next Steps

- [Core Concepts](concepts.md) — Understand projects, tables, and the push/pull model
- [CLI Reference](cli/) — All available CLI commands
- [API Reference](/api/) — Explore the REST API endpoints
