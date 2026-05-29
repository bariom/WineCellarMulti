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
- auth placeholder endpoint
- household-scoped wine list/create endpoints
