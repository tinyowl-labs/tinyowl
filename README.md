# TinyOwl

Web frontend for the TinyOwl archaeological data platform — browse projects, explore spatial layers on 2D/3D maps, manage media, search across projects, and configure settings.

## Architecture

TinyOwl frontend is a **SvelteKit 5** app (with runes, Svelte 5) using:

- **Tailwind CSS v4** with CSS custom properties for full themeability
- **shadcn-svelte** UI primitives (bits-ui under the hood)
- **Supabase Auth** for user sign-in (email/password)
- **Leaflet** for 2D maps, **CesiumJS** for 3D globe/tileset scenes
- **@xyflow/svelte** for interactive schema entity-relationship graphs
- **Lucide** for icons, **marked** for Markdown rendering

It proxies `/api/v1` and `/media` to `tinyowl-server` (port 8080).

## Quick start

```bash
npm install
npm run dev
```

Requires `tinyowl-server` running on `localhost:8080`. The dev server opens on `http://localhost:5173`.

For an invite-only Tailscale Funnel demo, use a production build + preview (not `dev`):

```bash
ORIGIN=https://desktop.YOUR-TAILNET.ts.net npm run demo
# Node build + front door on :4173 (SSR, /api/*, API + Supabase proxies)
```

See [`docs/demo-funnel.md`](../docs/demo-funnel.md).

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | Yes | Supabase URL for **server-side** clients (usually `http://127.0.0.1:54321`) |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anon key for browser auth |
| `VITE_SUPABASE_SAME_ORIGIN` | No | `true` → browser uses page origin for Supabase (Vite proxies `/auth/v1` etc.; needed for Tailscale Funnel) |
| `PUBLIC_DEMO_INVITE_ONLY` | No | `true` → hide signup link and redirect `/auth/signup` → login |
| `TINYOWL_CORE_URL` | Yes (server-side) | Internal API URL for server-side fetches (set in `.env`) |

Invite-only PC demos: see [`docs/demo-funnel.md`](../docs/demo-funnel.md).

## Features

### Project browsing
- Homepage with **centroids map** showing all visible projects
- Project overview with title, description, temporal extent, tags, bounding-box map
- Editable **README** (Markdown) for each project
- **Similar projects** sidebar (by tag, temporal, and spatial overlap)
- **Research articles** sidebar (OpenAlex integration)

### Layers explorer
- **Table view** — paginated data grid with sortable columns and media thumbnails
- **2D Map view** — Leaflet map with multiple toggleable GeoJSON layers, per-entity popups, URL-driven entity highlighting
- **3D Scene view** — CesiumJS globe for `.3tz` tilesets and GeoJSON entities
- **Schema graph** — Interactive entity-relationship diagram (SvelteFlow) showing FK edges, QGIS relations, and inferred links

### Media & artefacts
- Infinite-scroll gallery with type filters (images, video, audio, PDF, 3D)
- Full-image viewer with prev/next navigation
- Drag-and-drop **media upload** (collaborator+)
- **CARE consent metadata** editing (public view/embed permissions)
- **Similar media search** (by tag, period, region)

### Search
- Full-text + **semantic search** across all projects
- Spatial filtering (map view bbox or point+radius)
- Temporal range filtering
- Entity expansion within search results

### Settings
- **Project settings** — visibility, licence, embargo, location precision, per-table visibility
- **QFieldCloud bridge** — link/unlink/sync QFieldCloud projects
- **Member management** — invite by email, role assignment (owner/admin/collaborator/viewer)
- **Column/value mappings** — vocabulary harmonisation workbench with bulk-apply and progress tracking
- **User settings** — API tokens, QFieldCloud accounts, theme appearance (accent hue, background base, radius, blur)

### Theme engine
- **5 background presets** — pitch, dark, dim, stone, paper
- **8 accent hues** — slate, indigo, violet, teal, sage, amber, rose, crimson
- **3 radius scales** — sharp, rounded, pill
- **3 blur scales** — none, subtle, glass
- Persisted to localStorage and synced to Supabase user metadata

## Project structure

```
tinyowl/
├── src/
│   ├── app.css                 # Global styles, theme tokens, view transitions
│   ├── lib/
│   │   ├── assets/             # SVGs (logo, labyrinth)
│   │   ├── components/
│   │   │   ├── ui/             # shadcn-svelte primitives + header, mobile-nav, etc.
│   │   │   ├── dashboard/      # BboxMap, LayerMap, LayerScene, SchemaGraph, CommitTimeline
│   │   │   ├── artefacts/      # MediaUpload
│   │   │   └── settings/       # MappingWorkbench
│   │   ├── stores/             # Theme engine (theme.svelte.ts)
│   │   ├── supabase/           # Browser + server Supabase clients (SSR-safe)
│   │   ├── search/             # QueryIR codec, highlight utilities
│   │   ├── project/            # Entity deep-link builder
│   │   └── docs/               # In-app markdown docs (served at /docs)
│   └── routes/
│       ├── +page.svelte        # Homepage — search + project map
│       ├── [project]/           # Project overview, dashboard, layers, artefacts, settings
│       ├── search/              # Global search page
│       ├── profile/             # User profile + recent diffs timeline
│       ├── settings/            # Global user settings
│       ├── auth/                # Login, signup, logout, CLI authorisation
│       ├── api/                 # Internal API proxies (cli-tokens, QFieldCloud, theme)
│       └── docs/                # Documentation site (markdown → HTML via marked)
├── static/                     # Static assets (cesium, favicon)
├── vite.config.ts              # Vite config with proxy + Cesium asset copy
└── package.json
```

## Building

```bash
npm run build
```

Uses `@sveltejs/adapter-static` — outputs a fully static site to `build/`.

## Docs

In-app docs live under `src/lib/docs/` and are rendered at `/docs`. Docs are loaded at build time via `import.meta.glob` (no runtime file I/O).

## Related

| Project | Role |
|---|---|
| [tinyowl-server](https://github.com/tinyowl-labs/tinyowl-server) | HTTP API + Postgres index |
| [tinyowl-cli](https://github.com/tinyowl-labs/tinyowl-cli) | Command-line interface |
| [tinyowl-native](https://github.com/tinyowl-labs/tinyowl-native) | Client-side engine (TOML, revision, diff, validate) |
| [go-geodiff](https://github.com/tinyowl-labs/go-geodiff) | Binary diff engine |
| [tinyowl-toml](https://github.com/tinyowl-labs/tinyowl-toml) | TOML schemas and templates |

## License

MIT
