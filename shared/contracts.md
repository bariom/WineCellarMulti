# Shared Contracts

Initial API surface to stabilize first:

- `GET /health`
- `GET /api/v1/session`
- `GET /api/v1/wines`
- `POST /api/v1/wines`

Session payload target:

```json
{
  "authenticated": true,
  "user_id": "uuid",
  "active_household_id": "uuid",
  "membership_role": "owner"
}
```
