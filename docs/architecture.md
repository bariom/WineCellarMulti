# Architecture

## Core model

- `users`
- `households`
- `memberships`
- `wines`

Every business table is scoped by `household_id`.

## Session model

Each authenticated session carries:

- `user_id`
- `active_household_id`
- `membership_role`

## Rules

1. No business query runs without household scoping.
2. Passkeys belong to users, never to global roles.
3. Household switching is explicit.
4. Old single-tenant assumptions are not carried over.

## Milestone 1

- backend bootstrapped
- postgres connection wiring
- first SQLAlchemy models
- health endpoint
- development session endpoint, replaced by real auth in milestone 2
- household-scoped wine CRUD endpoints
- minimal frontend for listing, creating, editing, and deleting wines

## Authentication

Milestone 2 uses email/password registration, password hashes, database-backed sessions, and HTTP-only cookies. Registration creates the first household and owner membership. Passkeys and invitations are later milestones.
