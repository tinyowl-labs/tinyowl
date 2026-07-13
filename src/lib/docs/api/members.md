# Members API

Endpoints for managing project members and their roles.

## List Members

```
GET /api/v1/projects/{slug}/members
```

List all members of a project with their roles.

**Authenticated** — requires Bearer token. Caller must be a project member.

### Response

```json
[
  {
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "alice@example.com",
    "role": "owner"
  },
  {
    "user_id": "660e8400-e29b-41d4-a716-446655440001",
    "email": "bob@example.com",
    "role": "collaborator"
  }
]
```

| Field | Type | Description |
|---|---|---|
| `user_id` | UUID | Supabase user ID |
| `email` | string | User email address |
| `role` | string | `owner`, `admin`, `collaborator`, or `viewer` |

Members are ordered by role then email.

### Example

```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:8080/api/v1/projects/my-excavation/members
```

---

## Add Member

```
POST /api/v1/projects/{slug}/members
```

Add a user to a project by email address.

**Authenticated** — requires Bearer token. Only `owner` or `admin` can add members.

### Request Body

```json
{
  "email": "charlie@example.com",
  "role": "collaborator"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `email` | string | Yes | Email address of the user to add |
| `role` | string | No | `owner`, `admin`, `collaborator`, or `viewer` (default: `viewer`) |

### Response

```json
{
  "status": "ok"
}
```

### Example

```bash
curl -X POST http://localhost:8080/api/v1/projects/my-excavation/members \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"email": "charlie@example.com", "role": "collaborator"}'
```

---

## Update Member Role

```
PATCH /api/v1/projects/{slug}/members/{userId}
```

Change a member's role.

**Authenticated** — requires Bearer token. Only `owner` can change roles.

### Request Body

```json
{
  "role": "admin"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `role` | string | Yes | `owner`, `admin`, `collaborator`, or `viewer` |

### Response

```json
{
  "status": "ok"
}
```

### Example

```bash
curl -X PATCH http://localhost:8080/api/v1/projects/my-excavation/members/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"role": "admin"}'
```

---

## Remove Member

```
DELETE /api/v1/projects/{slug}/members/{userId}
```

Remove a member from a project.

**Authenticated** — requires Bearer token. Only `owner` can remove others. Any member can remove themselves. The last `owner` cannot be removed.

### Response

```json
{
  "status": "ok"
}
```

### Example

```bash
curl -X DELETE http://localhost:8080/api/v1/projects/my-excavation/members/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer <token>"
```

---

## Roles

| Role | Permissions |
|---|---|
| `owner` | Full control: update project, manage members, push data, link QFieldCloud, edit readme |
| `admin` | Update project, manage members, push data, edit readme |
| `collaborator` | Push data, upload media, manage column mappings |
| `viewer` | Read-only access to data and media |
