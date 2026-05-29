# Shared Contracts

Initial API surface to stabilize first:

- `GET /health`
- `GET /api/v1/session`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/wines`
- `POST /api/v1/wines`
- `GET /api/v1/wines/{wine_id}`
- `PATCH /api/v1/wines/{wine_id}`
- `DELETE /api/v1/wines/{wine_id}`

Session payload target:

```json
{
  "authenticated": true,
  "user_id": "uuid",
  "user_email": "owner@winecellar.local",
  "user_display_name": "Cellar Owner",
  "active_household_id": "uuid",
  "active_household_name": "Main Cellar",
  "membership_role": "owner"
}
```
