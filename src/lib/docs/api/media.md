# Media API

Endpoints for listing, uploading, and serving media files attached to project entities.

## List Project Media

```
GET /api/v1/projects/{slug}/media?offset=0&limit=50
```

List media associated with a project, grouped by content hash. Each item may reference one or more entities.

**Access** — public for public projects; Bearer required for private projects.

### Response

```json
{
  "items": [
    {
      "hash": "a1b2c3…",
      "media_type": "image/jpeg",
      "file_size": 245760,
      "url": "/media/a1b2c3…",
      "entities": [
        { "entity_type": "contexts", "entity_id": "CTX-0001" }
      ]
    }
  ],
  "counts": {
    "image": 42,
    "application": 5,
    "pdf": 3
  }
}
```

- `Content-Range: items 0-49/123`
- `counts.pdf` is the distinct `application/pdf` count (grey literature / reports)

## Upload Media (by slug)

```
POST /api/v1/projects/{slug}/media
```

Requires collaborator+ role. Body is raw bytes (max 500MB).

| Header | Required | Meaning |
|--------|----------|---------|
| `Authorization` | yes | Bearer JWT/PAT |
| `X-TinyOwl-Media-Hash` | yes | SHA-256 hex of body |
| `X-TinyOwl-Media-Type` | no | MIME type |
| `X-TinyOwl-Entity-Type` | no | Table / entity type to link |
| `X-TinyOwl-Entity-Id` | no | Entity `source_id` |

Also available as `POST /api/v1/{org}/{project}/media` (CLI).

Upload-only index rows **survive** subsequent GPKG push reindexes (only GPKG `_media` hashes are replaced).

## Media Integrity

```
GET /api/v1/projects/{slug}/media/integrity
```

```json
{
  "ok": false,
  "missing_blobs": [
    { "hash": "…", "media_type": "image/jpeg", "entity_type": "contexts", "entity_id": "CTX-0001" }
  ],
  "orphan_blobs": ["…"]
}
```

## Serve Media

```
GET /media/{hash}?token=<jwt>
```

Serves content-addressed bytes. Use `?token=` for `<img>` / `<iframe>` on private projects.
