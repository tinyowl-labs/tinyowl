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

Requires collaborator+ role. Body is raw bytes, streamed (do not buffer the whole file in RAM).

Max size: **500 MB** for attachments (images, PDFs); **10 GiB** for GLB/glTF and `.3tz`.

| Header | Required | Meaning |
|--------|----------|---------|
| `Authorization` | yes | Bearer JWT/PAT |
| `X-TinyOwl-Media-Hash` | yes | SHA-256 hex of **uncompressed** payload bytes |
| `X-TinyOwl-Media-Type` | no | MIME type (`.glb` → `model/gltf-binary`) |
| `X-TinyOwl-Entity-Type` | no | Table / entity type to link |
| `X-TinyOwl-Entity-Id` | no | Entity `source_id` |
| `Content-Encoding` | no | `gzip` for compressible types (GeoTIFF ≥ 32 MiB). Stored object is uncompressed. |
| `X-TinyOwl-Raw-Size` | no | Uncompressed byte length (required when gzipping / omitting `Content-Length`) |

Also available as `POST /api/v1/{org}/{project}/media` (`tinyowl media push`). Same land/staging path as the Artefacts UI. GPKG `tinyowl push` does not upload blobs.

### Response

```json
{ "status": "stored" | "queued", "media_hash": "…", "size": 123 }
```

- `stored` — attachments promoted to the canonical `tinyowl` bucket
- `queued` — GLB/glTF, `.3tz`, or coverage GeoTIFF staged in `upload` until a worker finishes

Upload-only index rows **survive** subsequent GPKG push reindexes (only GPKG `_media` hashes are replaced). Pending ingest `meta` (`ingest_status`, `upload_key`) is preserved. GPKG refs without a blob stay `awaiting_blob` until `media push`.

## Media Integrity

```
GET /api/v1/projects/{slug}/media/integrity
```

Reports `media_index` rows whose content-addressed blobs are missing from local disk, the canonical bucket, **and** the `upload` staging bucket. `orphan_blobs` are local files not present in the index.

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
