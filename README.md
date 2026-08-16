# WineCellarMulti

New multi-user foundation for Wine Cellar.

## Goals

- real users, not global roles only
- households/workspaces with memberships
- strict data isolation by `household_id`
- backend-first architecture for multi-tenant correctness

## Stack

- Frontend: React + Vite + TypeScript
- Backend: FastAPI
- Database: PostgreSQL
- ORM/Migrations: SQLAlchemy + Alembic

## Initial scope

- email/password session foundation
- one active household per session
- CRUD for wines scoped by household
- Admin-only beta for guided bottle photography with backend BiRefNet segmentation, an on-device fallback, and standardized transparent list/detail images
- membership roles: `owner`, `admin`, `member`, `viewer`

## Layout

- `frontend/` web app
- `backend/` API and data layer
- `shared/` shared contracts and notes
- `docs/` architecture and roadmap

## Notes

This repository is intentionally separate from the existing `WineCellar` project.

## Run Locally

Generate local secrets first. This creates the root `.env` used by Docker and `backend/.env` used by Alembic/Uvicorn:

```bash
chmod +x setup-env.sh
./setup-env.sh
```

Start Postgres:

```powershell
docker compose up -d
```

To run the full development stack with Docker:

```bash
docker compose --profile container-app up --build
```

This explicitly starts PostgreSQL, runs backend migrations, exposes the API on `:8000`, and exposes the frontend on `:5173`.
Without the `container-app` profile Docker Compose starts only PostgreSQL; this is the production-safe default because production runs the API through systemd.
The first AI bottle-photo request downloads the approximately 214 MB
`birefnet-general-lite` model into the persistent `wine-photo-model-data` volume.
Set `WINE_PHOTO_AI_ENABLED=false` to use only the on-device fallback. When enabled, each
server-side segmentation runs in a disposable worker so ONNX Runtime memory is released after
the capture session. The browser starts warming the model while the camera is open, and the
worker exits after 75 idle seconds. `WINE_PHOTO_AI_TIMEOUT_SECONDS` defaults to 90.

Run the backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev,photo-ai]"
alembic upgrade head
chmod +x dev.sh
./dev.sh
```

Run the frontend in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

On Windows, to test the local frontend against the production API (without Docker), run:

```powershell
.\scripts\start-frontend-production-data.cmd
```

Then open `http://localhost:5173`. This uses production authentication and data, so avoid destructive tests.

Or run backend and frontend together from the repository root:

```bash
chmod +x dev.sh
./dev.sh
```

## Code quality

Install the backend development dependencies and activate its virtual environment:

```bash
cd backend
python -m pip install -e ".[dev]"
source .venv/bin/activate
cd ..
```

On Windows PowerShell, use `.venv\Scripts\Activate.ps1` in place of
`source .venv/bin/activate`.

Then install the Git hooks from the repository root:

```bash
pre-commit install
```

The hooks validate staged application Python files with Ruff (lint and format)
and Pyright. Run the same checks manually with:

```bash
ruff check app
ruff format --check app
pyright app
pytest
```

Update backend and frontend from the repository root:

```bash
./update.sh
```

The update script pulls the latest code, installs backend dependencies, runs Alembic migrations, installs frontend dependencies, and runs the frontend build. PostgreSQL must already be running.

Start or recover the production stack after a reboot/outage:

```bash
chmod +x start.sh
./start.sh
```

First-time service installation on the Linux server:

```bash
./start.sh --install-services --build
```

Production environment values:

```env
APP_ENV=production
APP_DEBUG=false
SESSION_COOKIE_SECURE=true
FREE_TIER_LABEL_LIMIT=15
# false: disponibile soltanto agli amministratori dell'app; true: disponibile agli utenti
RESTAURANT_MODE_ENABLED=false
CORS_ORIGINS=https://vinaris.app,https://www.vinaris.app,http://localhost:5173,http://127.0.0.1:5173
```

Open `http://<server-ip>:5173`.

## Android PWA

WineCellarMulti can be installed from Android Chrome when served over HTTPS.
The frontend includes a web app manifest and service worker.

Production preview uses port `4174` to avoid conflicting with the old WineCellar app that already uses `4173`:

```bash
cd frontend
npm run build
```

In production nginx serves `frontend/dist` directly with compression and
long-lived caching for hashed assets. `vite preview` remains available only
for local verification of a production build.

See `docs/PWA_DEPLOYMENT.md` for the nginx configuration.

To start WineCellarMulti automatically after a server reboot, install the systemd services documented in `docs/SYSTEMD_DEPLOYMENT.md`.

## Reset Local PostgreSQL

If the local PostgreSQL password is no longer known, regenerate local secrets and recreate the development database volume:

```bash
./setup-env.sh --force
docker compose down
docker volume rm winecellarmulti_postgres-data
docker compose up -d postgres
./update.sh
```

This deletes the local development database. Do not run it if you need to preserve existing data.

## AI Features

AI generation runs only from the backend.

Two modes are now supported:

- personal OpenAI key per user
- Vinaris-managed AI Pack purchased via Stripe, using the application OpenAI key server-side

To enable the app-managed AI Pack, configure `OPENAI_API_KEY` in `backend/.env`, then restart the backend. This key is never exposed to end users.

GPT-5.5 is the production default. GPT-5.6 Luna, Terra and Sol are available
behind server-side feature flags; see [docs/OPENAI_MODELS.md](docs/OPENAI_MODELS.md)
for rollout, routing, fallback and rollback instructions.

Legacy per-feature model overrides remain accepted for backward compatibility:

```bash
OPENAI_AI_NOTES_MODEL=gpt-5.4-mini
OPENAI_DRINK_WINDOW_MODEL=gpt-5.4
OPENAI_VALUE_MODEL=gpt-5.4-mini
OPENAI_GRAPE_MODEL=gpt-5.4-nano
OPENAI_WISHLIST_MODEL=gpt-5.4
OPENAI_PAIRING_MODEL=gpt-5.4
```

Current AI actions: wine notes, drinking window, value estimate, grape composition, wishlist strategy, food pairing, and source-backed buying advice. App administrators can also research a verified vineyard, estate, or appellation location for each distinct wine; these application-funded results include their evidence precision and are displayed on a map in the wine detail. Buying advice supports drink-now, cellaring, and food-pairing goals, plus today/tomorrow/flexible delivery deadlines and a buyer location. Urgent searches favor local pickup; flexible searches can include online retailers.

Bottle recognition uses Luna. The same client-side capture is retained for the
product photo while an in-memory, EXIF-corrected JPEG copy and optional label
crop are sent by the backend for recognition. No temporary image is persisted
before the wine is saved.

```env
WINE_RECOGNITION_MAX_INPUT_BYTES=16000000
WINE_RECOGNITION_MAX_DIMENSION=1600
WINE_RECOGNITION_JPEG_QUALITY=88
WINE_RECOGNITION_TIMEOUT_SECONDS=45
```

Luna uses the configured economy model and requires the GPT-5.6 rollout flag
when that model is `gpt-5.6-luna` (`OPENAI_ENABLE_GPT56=true`).

Users can choose the AI source in the application settings:

- `Automatic`: prefer personal key, otherwise use Vinaris AI Pack
- `My OpenAI key`
- `Vinaris AI Pack`

## Stripe Payments

Stripe Checkout creates a user-specific redeem code after payment. Configure these values in `backend/.env`, run `alembic upgrade head`, then restart the backend:

```env
STRIPE_SECRET_KEY=sk_live_or_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_MONTHLY_PRICE_ID=price_monthly_...
STRIPE_ANNUAL_PRICE_ID=price_annual_...
STRIPE_AI_CREDIT_PRICE_ID=price_ai_credits_...
STRIPE_AI_CREDIT_AMOUNT_USD=5.00
STRIPE_AI_CREDIT_LABEL=Vinaris AI Pack
AI_PACK_MARKUP_PERCENT=15
FREE_TIER_AI_PACK_MARKUP_PERCENT=100
SIGNUP_AI_CREDIT_USD=0
STRIPE_MONTHLY_ENTITLEMENT_DAYS=31
STRIPE_ANNUAL_ENTITLEMENT_DAYS=365
STRIPE_SUCCESS_URL=https://vinaris.app/?stripe_checkout=success
STRIPE_CANCEL_URL=https://vinaris.app/?stripe_checkout=cancelled
STRIPE_PORTAL_RETURN_URL=https://vinaris.app/?billing_portal=return
```

Create the two Stripe prices as recurring prices: one monthly and one annual. `STRIPE_PRICE_ID` is still accepted as a legacy fallback for annual access only. If you do not use an annual Stripe Price ID, configure a one-time annual amount instead:

```env
STRIPE_PAYMENT_AMOUNT_CENTS=4900
STRIPE_PAYMENT_CURRENCY=chf
STRIPE_PAYMENT_LABEL=Vinaris annual access
```

Create a Stripe webhook endpoint pointing to:

```text
https://vinaris.app/api/v1/billing/stripe/webhook
```

Enable these events:

```text
checkout.session.completed
invoice.paid
invoice.payment_failed
customer.subscription.updated
customer.subscription.deleted
```

`checkout.session.completed` is also used for one-time AI Pack purchases. When the AI Pack product is bought, the user receives a balance in USD-equivalent AI budget, and future AI requests consume that balance until it reaches zero.

`AI_PACK_MARKUP_PERCENT` adds the configurable spread used for subscribed users. `FREE_TIER_AI_PACK_MARKUP_PERCENT` is the separate, normally wider spread for free-tier AI Pack usage. Both can be changed immediately from **Settings → Operations → AI model price book**; persisted console values override the environment defaults. App admins continue to consume AI budget at the base estimated OpenAI cost. Free-tier accounts cannot use a personal OpenAI key and can use AI only from a positive AI Pack balance. `FREE_TIER_LABEL_LIMIT` controls the private-cellar cap of active distinct labels (15 by default), while `SIGNUP_AI_CREDIT_USD=0` ensures AI access starts after an AI Pack purchase.

### Updating AI model prices

Token costs are not hard-coded operationally. The built-in price book is used by default, while `OPENAI_MODEL_PRICING_USD_PER_MILLION_TOKENS` can override an existing model or add a new one without changing application code. The value is a JSON object of USD prices per one million tokens:

```env
OPENAI_MODEL_PRICING_USD_PER_MILLION_TOKENS={"gpt-new":{"input":"1.25","cached_input":"0.125","output":"10"}}
```

All three fields are required and must be non-negative. Update the variable and restart the backend; an invalid price book makes AI requests fail safely instead of recording an unreliable cost.

An app administrator can instead maintain the same JSON from **Settings → Operations → AI model price book**. Console values are persisted in the database and take precedence immediately; the **Ask AI** button uses server-side web search to prepare a reviewable draft and never saves it automatically.

The webhook creates redeem codes, renewal notifications, and subscription status notifications. A browser redirect alone is not trusted. Enable Stripe Customer Portal in the Stripe dashboard so users can manage or cancel subscriptions from the app.

## Email Notifications

To enable email notifications for new pending users, approval/rejection outcomes, household invites, and Stripe redeem codes, configure either SMTP or Resend in `backend/.env`.

SMTP:

```env
EMAIL_PROVIDER=smtp
EMAIL_FROM_EMAIL=noreply@your-domain.tld
EMAIL_FROM_NAME=Vinaris
SMTP_HOST=smtp.your-provider.tld
SMTP_PORT=587
SMTP_USERNAME=your-smtp-user
SMTP_PASSWORD=your-smtp-password
SMTP_USE_TLS=true
SMTP_USE_SSL=false
```

Resend:

```env
EMAIL_PROVIDER=resend
EMAIL_FROM_EMAIL=noreply@your-verified-domain.tld
EMAIL_FROM_NAME=Vinaris
RESEND_API_KEY=re_xxxxxxxxx
```

Emails are sent best-effort. If email delivery is not configured or a delivery fails, the application flow still completes and the email is skipped. Email verification requires a working email provider. Admin alerts go to all approved, unblocked application admins.

Co-ownership agreements support both registered Vinaris users and external participants. Registered users receive an in-app notification and can optionally receive email; external participants receive a private response link by email. If delivery fails, the agreement creator can copy the participant-specific link from the wine detail. Each new agreement is versioned, snapshots the wine and ownership terms, and becomes final only after every participant accepts it.

## Privacy, terms, and complete backups

Privacy and terms are available before registration at `/privacy` and `/terms`.
Registration records separate, versioned acceptance of both documents. Existing
users must accept the current version before accessing business APIs. Configure
the public controller details described in
[docs/LEGAL_DOCUMENTS.md](docs/LEGAL_DOCUMENTS.md) before deployment.

Nightly backups now package PostgreSQL and the complete wine-photo store in one
checksummed bundle. Use `scripts/verify-backup.sh` for a disposable restore test
and follow [docs/BACKUP_AND_RESTORE.md](docs/BACKUP_AND_RESTORE.md) for recovery.

Wine Pulse provides a deliberately small Italian/English wine-news edition.
Collection and AI curation run independently from the web process; deployment,
source configuration and editorial safeguards are documented in
[docs/WINE_PULSE.md](docs/WINE_PULSE.md).

Restaurant cellars can record bottle sales and review revenue, bottle cost and
gross margin; see [docs/RESTAURANT_MODE.md](docs/RESTAURANT_MODE.md).

Find the Linux machine IP with:

```bash
hostname -I
```

## Current API

- `GET /health`
- `GET /api/v1/session`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/password-reset/request`
- `POST /api/v1/auth/password-reset/confirm`
- `GET /api/v1/co-ownership-agreements/wines/{wine_id}`
- `POST /api/v1/co-ownership-agreements/wines/{wine_id}`
- `GET /api/v1/co-ownership-agreements/public/{token}`
- `POST /api/v1/co-ownership-agreements/public/{token}/respond`
- `GET /api/v1/billing/status`
- `POST /api/v1/billing/checkout`
- `POST /api/v1/billing/redeem`
- `POST /api/v1/billing/stripe/webhook`
- `GET /api/v1/wines`
- `POST /api/v1/wines`
- `GET /api/v1/wines/{wine_id}`
- `PATCH /api/v1/wines/{wine_id}`
- `DELETE /api/v1/wines/{wine_id}`
- `GET /api/v1/wishlist`
- `GET /api/v1/wine-pulse`
- `POST /api/v1/wishlist`
- `PATCH /api/v1/wishlist/{item_id}`
- `DELETE /api/v1/wishlist/{item_id}`
- `POST /api/v1/imports/legacy-json`
- `POST /api/v1/ai/wines/{wine_id}/notes`
- `POST /api/v1/ai/wines/{wine_id}/all`
- `POST /api/v1/ai/wines/{wine_id}/drink-window`
- `POST /api/v1/ai/wines/{wine_id}/value`
- `POST /api/v1/ai/wines/{wine_id}/grapes`
- `POST /api/v1/ai/wishlist/{item_id}/strategy`
- `POST /api/v1/ai/pairing`
- `POST /api/v1/ai/buying-advice`

The current auth flow uses email/password registration, HTTP-only session cookies, and one active household per session. Legacy JSON import is scoped to the active household and requires an owner/admin role.
