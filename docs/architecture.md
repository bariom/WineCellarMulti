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
- development session endpoint
- household-scoped wine CRUD endpoints
- minimal frontend for listing, creating, editing, and deleting wines

## Authentication Roadmap

Milestone 1 uses a development session that creates one user, one household, and one owner membership from environment settings. This keeps the first implementation focused on data isolation. Real authentication should replace this dependency without changing the wine route query shape.
