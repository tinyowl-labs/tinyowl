# Readme API

Endpoints for reading and writing the project README. The README is stored as a Markdown file in the project's storage directory.

## Get Readme

```
GET /api/v1/projects/{slug}/readme
```

Retrieve the project README as raw Markdown.

**Public** — no authentication required.

### Response

Returns the raw Markdown content with `Content-Type: text/markdown; charset=utf-8`.

The server first looks for a local `README.md` file in the project directory, then falls back to S3/Supabase Storage.

### Example

```bash
curl http://localhost:8090/api/v1/projects/my-excavation/readme
```

Response:

```markdown
# My Excavation Project

Summer 2026 field season at the Injalak Hill site.

## Sites

- SITE-001: Hill Fort Alpha (Iron Age)
- SITE-002: Valley Settlement (Medieval)
```

### Error Responses

| Status | Meaning |
|---|---|
| `404` | No README found for this project |

---

## Put Readme

```
PUT /api/v1/projects/{slug}/readme
```

Upload or update the project README.

**Authenticated** — requires Bearer token. Caller must be a project member with `owner` or `admin` role.

### Request

Send the raw Markdown content as the request body. Use `Content-Type: text/markdown` or `text/plain`.

```bash
curl -X PUT http://localhost:8090/api/v1/projects/my-excavation/readme \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: text/markdown" \
  -d "# My Excavation Project

Updated documentation for the 2026 season."
```

### Response

```json
{
  "status": "saved"
}
```

The README is saved to the local project directory and uploaded to S3/Supabase Storage for persistence.

### Error Responses

| Status | Meaning |
|---|---|
| `400` | Invalid request (missing slug) |
| `403` | Caller is not a project member or lacks owner/admin role |
| `500` | Failed to write or upload the file |
