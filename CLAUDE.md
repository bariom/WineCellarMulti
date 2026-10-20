# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`AGENTS.md` is the authoritative engineering guide (tenant isolation, AI prompt library, test selection, UI validation, visual-baseline policy). Read it before non-trivial changes; the essentials are summarized below.

## What this is

Vinaris: a multi-tenant wine-cellar app. React/Vite/TypeScript frontend (`frontend/`), FastAPI backend (`backend/`), PostgreSQL via SQLAlchemy + Alembic. Also `android/` (TWA pilot), `deploy/`, `scripts/`, `docs/` (feature docs, many referenced from README).

## Commands

Backend (from `backend/`, venv active; on Windows `.venv\Scripts\Activate.ps1`):

```bash
pip install -e ".[dev]"            # add ",photo-ai" for bottle-photo segmentation
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000   # or ./dev.sh
ruff check app && ruff format --check app && pyright app
pytest tests/test_purchase_imports.py            # single file
pytest tests/test_auth_and_wines.py -k "tasting_archive"   # single test by keyword
```

Frontend (from `frontend/`; on this Windows machine Node lives in `C:\Program Files\nodejs`, use `npm.cmd` if PowerShell blocks `npm.ps1`):

```bash
npm run dev            # Vite on :5173
npm run build          # tsc -b + vite build + bundle-size check (500 kB per chunk limit)
npm run test:e2e:<feature>                       # Playwright, one feature suite (see docs/FRONTEND_E2E.md)
npx playwright test e2e/<spec>.spec.ts -g "name" # single spec / test
```

Postgres: `docker compose up -d` (only Postgres by default; `--profile container-app` adds API + frontend). `./setup-env.sh` generates root `.env` and `backend/.env`.

**Port 5173 belongs to the user's own dev server** — when I start Vite/Playwright, use another port (e.g. `PLAYWRIGHT_PORT=5199`), or point `PLAYWRIGHT_BASE_URL` at an existing server.

## Test scope (important)

Do not run full suites by default. Inspect `git diff`, classify as frontend-only / backend-only / cross-stack, and run the smallest relevant checks.
- Frontend-only: matching `test:e2e:<feature>` + `npm run build`; no pytest.
- Backend-only: targeted pytest + ruff/pyright; no E2E.
- Cross-stack (API contracts, `frontend/src/types.ts`, auth/tenancy, migrations): both, targeted.
- E2E suites use mocked API fixtures (`e2e/fixtures/app.ts`) — no backend or credentials needed. Default 2 workers; use `--workers=1` to diagnose.
- UI changes: build passing is not enough — render at 390×844 (also 360×800, 430×932), check no overlap / horizontal overflow, and never update screenshot baselines (`--update-snapshots`) before visual review.

## Architecture

**Tenancy is the core invariant.** Every session carries `user_id`, `active_household_id` and `membership_role`; `backend/app/api/deps.py` builds a `CurrentContext` from the HTTP-only session cookie (`get_current_context`, `require_role`, `require_admin_context`). Every business query must filter by `context.household_id` — never fetch a household entity by ID alone. Passkeys/permissions belong to users, not global roles. Roles: `owner`, `admin`, `member`, `viewer`; app admins are a separate concept.

**Backend layout** (`backend/app/`): `api/routes/` thin HTTP handlers under `/api/v1` (assembled in `api/router.py`) → `services/` for domain logic and integrations (OpenAI client/pricing/credits, purchase import, stock ledger, sensory-profile pipeline, wine news, photo library, storage) → `models/` (SQLAlchemy) with `schemas/` (Pydantic contracts). `prompts/` holds versioned AI prompt builders returning `Prompt(id, version, system, user)` — add a named builder for each AI feature, keep IDs stable, bump `version` on behavior change, never log prompts or user data. AI output is untrusted: keep JSON schemas, validate fields, preserve source/URL verification.

**Billing/AI cost model:** AI calls go through personal OpenAI key or the app-managed key (Vinaris AI Pack / subscription, Stripe webhooks). Credit reservation/deduction logic lives in `services/ai_credits.py` and pricing in `openai_pricing.py`; model routing is documented in `docs/OPENAI_MODELS.md`.

**Migrations:** Alembic in `backend/alembic/versions/`, numbered `0NNN_name.py` (latest ≈ `0121`). Append-only: never edit an applied migration. Revision IDs must be ≤ 32 characters (production `version_num` is `varchar(32)`). Never rewrite data in a route handler.

**Frontend** (`frontend/src/`): `App.tsx` is the shell; `views/` (screens), `components/`, `domain/`, `services/` (API client), `utils/`, `help/`, `legal/`, `i18n.ts` (Italian/English — every user-visible string needs both). `types.ts` mirrors backend schemas: change a response shape and review `types.ts` plus affected UI together. `MonitorApp.tsx`/`monitor.css` is a separate Vinaris Monitor build (`build:monitor`). Heavy features (tasting, scanner, assistant, Wine Pulse) are lazy-loaded chunks; keep shared deps out of manual chunk groups.

**Wine Detail (compact/mobile)** has strict invariants (Registra bevuta / Registra vendita each appear exactly once; Status/Quantity and Drinking Window before Wine Origin; no horizontal scroll; secondary sections collapsed) — see AGENTS.md before touching it.

## Deployment notes

Production runs the API under systemd and serves `frontend/dist` via nginx (`docs/SYSTEMD_DEPLOYMENT.md`, `docs/PWA_DEPLOYMENT.md`). `./update.sh` is a diff-aware deploy (deps, Alembic, frontend rebuild, backend restart); `./start.sh` recovers the stack. Configuration is documented in `.env.example`; real `.env` files stay untracked.
