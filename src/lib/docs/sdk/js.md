# JavaScript SDK

The `@tinyowl/js` package is a TypeScript HTTP client for the TinyOwl server API. It provides typed methods for all endpoints and handles authentication token management.

## Installation

```bash
npm install @tinyowl/js
```

## Construction

```typescript
import { TinyOwlClient } from '@tinyowl/js';

const client = new TinyOwlClient({
  baseUrl: 'http://localhost:8090',
  token: 'your-supabase-access-token',
});
```

### Constructor Options

| Option | Type | Required | Description |
|---|---|---|---|
| `baseUrl` | string | Yes | Base URL of the TinyOwl server |
| `token` | string | No | Supabase JWT access token for authenticated requests |

## Project Methods

### `listProjects()`

List all projects the authenticated user is a member of.

```typescript
const projects = await client.listProjects();
// [{ slug: "my-excavation", role: "owner", title: "My Excavation" }]
```

### `getProject(slug)`

Get details for a project.

```typescript
const project = await client.getProject('my-excavation');
// { slug, title, description, entity_count, table_count, bbox, ... }
```

### `createProject(input)`

Create a new project.

```typescript
const result = await client.createProject({
  slug: 'new-project',
  title: 'New Excavation',
  description: 'Field season 2026',
});
```

### `updateProject(slug, input)`

Update a project's title or description.

```typescript
await client.updateProject('my-excavation', {
  title: 'Updated Title',
});
```

## Tables & Rows Methods

### `listTables(slug)`

List tables in a project's GeoPackage.

```typescript
const tables = await client.listTables('my-excavation');
// { tables: { Site_Points: ["name", "period"], Artefacts: ["material"] } }
```

### `listTableRows(slug, table)`

List rows in a specific table.

```typescript
const rows = await client.listTableRows('my-excavation', 'Site_Points');
// { rows: [{ source_id: "SITE-001", name: "Hill Fort", ... }] }
```

### `getTableGeoJSON(slug, table)`

Get a table as a GeoJSON FeatureCollection.

```typescript
const geojson = await client.getTableGeoJSON('my-excavation', 'Site_Points');
// { type: "FeatureCollection", features: [...] }
```

## Member Methods

### `listMembers(slug)`

List project members.

```typescript
const members = await client.listMembers('my-excavation');
// [{ user_id, email, role }, ...]
```

### `addMember(slug, input)`

Add a member to a project.

```typescript
await client.addMember('my-excavation', {
  email: 'charlie@example.com',
  role: 'viewer',
});
```

### `updateMemberRole(slug, userId, role)`

Change a member's role.

```typescript
await client.updateMemberRole('my-excavation', 'user-uuid', 'admin');
```

### `removeMember(slug, userId)`

Remove a member from a project.

```typescript
await client.removeMember('my-excavation', 'user-uuid');
```

## Column Mappings

### `getColumnMappings(org, project)`

List column mappings for a project.

```typescript
const mappings = await client.getColumnMappings('my-org', 'my-project');
// [{ entity_type, column_name, local_value, concept_uri, vocabulary, ... }]
```

### `putColumnMapping(org, project, input)`

Create or update a column mapping.

```typescript
await client.putColumnMapping('my-org', 'my-project', {
  entity_type: 'Site_Points',
  column_name: 'period',
  local_value: 'Iron Age',
  concept_uri: 'periodo:p0v8k4r',
  vocabulary: 'periodo',
});
```

## Search

### `search(params)`

Spatial search across projects.

```typescript
const results = await client.search({
  lat: -12.33,
  lng: 133.06,
  radius: 50000,
});
// [{ project_slug, entity_type, entity_id, lat, lng, distance_m, ... }]
```

## Readme

### `getReadme(slug)`

Get a project's README.

```typescript
const readme = await client.getReadme('my-excavation');
// "# My Excavation Project\n\n..."
```

### `putReadme(slug, content)`

Upload a README.

```typescript
await client.putReadme('my-excavation', '# Updated Readme\n\nNew content.');
```

## Media

### `listMedia(slug)`

List media files for a project.

```typescript
const media = await client.listMedia('my-excavation');
// [{ hash, media_type, file_size, url, entities: [...] }]
```

### `getMediaUrl(hash)`

Get the full URL for a media file.

```typescript
const url = client.getMediaUrl('a1b2c3d4e5f6789012345678abcdef01');
// "http://localhost:8090/media/a1b2c3d4e5f6789012345678abcdef01"
```

## Push/Pull Sync

### `getHead(org, project)`

Get the current server HEAD.

```typescript
const { server_head } = await client.getHead('my-org', 'my-project');
```

### `pull(org, project, sinceHead?)`

Pull diffs since a given HEAD.

```typescript
const { server_head, diff_count, diff_data } = await client.pull('my-org', 'my-project', 10);
```

### `push(org, project, diffData, opts?)`

Push a diff changeset.

```typescript
await client.push('my-org', 'my-project', diffBytes, {
  ddl: ddlBase64,       // Required for first push
  metaOnly: false,
  toml: tomlBase64,
});
```

### `downloadCanonical(org, project)`

Download the full canonical GeoPackage.

```typescript
const gpkgBytes = await client.downloadCanonical('my-org', 'my-project');
```

### `downloadStub(org, project, table, columns)`

Download a SQLite stub.

```typescript
const stubBytes = await client.downloadStub('my-org', 'my-project', 'Site_Points', 'name,period');
```

## Error Handling

All methods throw on HTTP errors (4xx, 5xx). The error includes the status code and response body:

```typescript
try {
  await client.getProject('nonexistent');
} catch (error) {
  console.error(error.status); // 404
  console.error(error.message); // {"error": "project not found"}
}
```

## Token Management

The SDK uses the token passed at construction time. You can update it at runtime:

```typescript
client.setToken(newToken);
```

For Supabase integration, get the token from your Supabase client's session:

```typescript
const { data: { session } } = await supabase.auth.getSession();
const client = new TinyOwlClient({
  baseUrl: import.meta.env.PUBLIC_API_URL,
  token: session?.access_token,
});

// Listen for token refreshes
supabase.auth.onAuthStateChange((event, session) => {
  client.setToken(session?.access_token);
});
```

## Type Definitions

The SDK exports TypeScript interfaces for all request and response types:

```typescript
import type {
  Project,
  ProjectDetail,
  TableList,
  TableRows,
  GeoJSONFeatureCollection,
  Member,
  ColumnMapping,
  SearchResult,
  MediaItem,
  HeadResponse,
  PullResponse,
  PushResponse,
  ProfileDiff,
} from '@tinyowl/js';
```
