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
docker compose up --build
```

This starts PostgreSQL, runs backend migrations, exposes the API on `:8000`, and exposes the frontend on `:5173`.

Run the backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
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

Or run backend and frontend together from the repository root:

```bash
chmod +x dev.sh
./dev.sh
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
TRIAL_ENTITLEMENT_DAYS=5
CORS_ORIGINS=https://vinaris.app,https://www.vinaris.app,https://vinaris.duckdns.org,https://winecellarmulti.duckdns.org,http://localhost:5173,http://127.0.0.1:5173
```

Open `http://<server-ip>:5173`.

## Android PWA

WineCellarMulti can be installed from Android Chrome when served over HTTPS.
The frontend includes a web app manifest and service worker.

Production preview uses port `4174` to avoid conflicting with the old WineCellar app that already uses `4173`:

```bash
cd frontend
npm run build
npm run preview:pwa
```

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

Current AI actions: wine notes, drinking window, value estimate, grape composition, wishlist strategy, and food pairing.

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

`AI_PACK_MARKUP_PERCENT` adds a configurable spread on AI Pack consumption for end users only. App admins continue to consume AI budget at the base estimated OpenAI cost.

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
- `POST /api/v1/wishlist`
- `PATCH /api/v1/wishlist/{item_id}`
- `DELETE /api/v1/wishlist/{item_id}`
- `POST /api/v1/imports/legacy-json`
- `POST /api/v1/ai/wines/{wine_id}/notes`
- `POST /api/v1/ai/wines/{wine_id}/drink-window`
- `POST /api/v1/ai/wines/{wine_id}/value`
- `POST /api/v1/ai/wines/{wine_id}/grapes`
- `POST /api/v1/ai/wishlist/{item_id}/strategy`
- `POST /api/v1/ai/pairing`

The current auth flow uses email/password registration, HTTP-only session cookies, and one active household per session. Legacy JSON import is scoped to the active household and requires an owner/admin role.
