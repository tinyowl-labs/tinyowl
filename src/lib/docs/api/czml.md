# Media API

Endpoints for listing and serving media files attached to project entities.

## List Project Media

```
GET /api/v1/projects/{slug}/media
```

List all media files associated with a project, grouped by content hash. Each media item references one or more entities.

**Public** — no authentication required.

### Response

```json
[
  {
    "hash": "a1b2c3d4e5f6789012345678abcdef01",
    "media_type": "image/jpeg",
    "file_size": 245760,
    "url": "/media/a1b2c3d4e5f6789012345678abcdef01",
    "entities": [
      {
        "entity_type": "Site_Points",
        "entity_id": "SITE-001"
      },
      {
        "entity_type": "Artefacts",
        "entity_id": "ART-042"
      }
    ]
  },
  {
    "hash": "f1e2d3c4b5a6789012345678abcdef02",
    "media_type": "image/png",
    "file_size": 512000,
    "url": "/media/f1e2d3c4b5a6789012345678abcdef02",
    "entities": [
      {
        "entity_type": "Site_Points",
        "entity_id": "SITE-001"
      }
    ]
  }
]
```

| Field | Type | Description |
|---|---|---|
| `hash` | string | Content hash (SHA-256) of the media file |
| `media_type` | string | MIME type (e.g., `image/jpeg`) |
| `file_size` | int64 | File size in bytes |
| `url` | string | Relative URL to fetch the media file |
| `entities` | array | Entities that reference this media file |
| `entities[].entity_type` | string | Table/entity type name |
| `entities[].entity_id` | string | Entity source_id |

A single media file can be attached to multiple entities — for example, a photo showing both a site and an artefact.

### Example

```bash
curl http://localhost:8090/api/v1/projects/my-excavation/media
```

---

## Serve Media

```
GET /media/{hash}
```

Serve a media file by its content hash. The response includes long-lived cache headers (`Cache-Control: public, max-age=31536000, immutable`).

**Public** — no authentication required.

### Path Parameters

| Parameter | Type | Description |
|---|---|---|
| `hash` | string | Content hash (minimum 4 characters) |

### Response

The raw media file bytes with the detected MIME type. The server searches local project directories first, then falls back to S3/Supabase Storage.

### Example

```bash
curl http://localhost:8090/media/a1b2c3d4e5f6789012345678abcdef01 \
  -o photo.jpg
```

### Error Responses

| Status | Meaning |
|---|---|
| `400` | Invalid hash (less than 4 characters) |
| `404` | Media file not found locally or in storage |

---

## Upload Media

```
POST /api/v1/{org}/{project}/media
```

Upload a media file to a project.

**Authenticated** — requires Bearer token and project membership.

### Request

Send the file as the raw request body. Media files are stored on S3/Supabase Storage at `projects/{slug}/media/{prefix}/{hash}` where `prefix` is the first two characters of the content hash.

```bash
curl -X POST http://localhost:8090/api/v1/my-org/my-project/media \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @photo.jpg
```

### Response

```json
{
  "status": "ok"
}
```

---

## How Media Is Indexed

Media references are discovered from the canonical GeoPackage's `_media` table during push indexing. Each row in `_media` contains:

- `media_hash` — SHA-256 content hash
- `entity_type` — The table the entity belongs to
- `entity_id` — The entity's source_id
- `media_type` — Detected MIME type
- `file_size` — File size in bytes

The actual media files themselves must be uploaded separately via the `POST /media` endpoint or the CLI.
