Vinaris engineering guide

Vinaris is a multi-tenant wine-cellar application with a React/Vite frontend,
FastAPI backend, PostgreSQL models, and Alembic migrations.

This file defines the default engineering rules for Codex. Changes must remain
narrow, safe, testable, and proportional to their actual scope.

Repository map

backend/app/api/routes/: HTTP endpoints and request orchestration.

backend/app/models/: SQLAlchemy persistence models.

backend/app/schemas/: Pydantic request and response contracts.

backend/app/services/: integrations and reusable domain services.

backend/app/prompts/: versioned AI prompt builders.

backend/alembic/versions/: append-only database migrations.

backend/tests/: backend tests.

frontend/src/: React application.

Non-negotiable rules

Every business-data query must be scoped to the active household_id and
authorization must use CurrentContext. Never fetch a household entity by
ID alone.

Never expose provider API keys, session tokens, encrypted values, payment
secrets, or raw AI prompts in responses or logs. Document configuration in
.env.example; keep real .env files untracked.

Database changes require a new Alembic migration. Never edit an applied
migration or rewrite production data in a route handler. Alembic revision IDs
must be 32 characters or fewer: production `alembic_version.version_num` is
`varchar(32)`.

Preserve API schemas and frontend type contracts together. A backend
response change normally requires review of frontend/src/types.ts and the
affected UI.

Treat AI output as untrusted input: retain JSON schemas, validate parsed
fields, and preserve source/URL verification before saving results.

AI prompt library

Use backend/app/prompts/ for production prompt text. A prompt builder returns
Prompt(id, version, system, user).

Add a named builder for every new AI feature; avoid long inline prompts in
API routes.

Keep user/database data in explicit builder arguments.

Increment version when behavior or output expectations materially change.

Keep prompt IDs stable for evaluation and audit correlation.

Add regression tests for language, safety constraints, expected context, and
structured output.

Never log user data, keys, or full prompts.

Migrate legacy inline prompts when their feature is changed.

Test selection strategy

Testing must be proportional to the real scope of the change. Do not run the
full repository suite by default.

Before selecting tests:

Inspect git diff, git status, or equivalent.

Determine what behavior is actually affected.

Classify the change as frontend-only, backend-only, cross-stack, or
infrastructure/shared.

Run the smallest relevant checks first.

Escalate only when scope or failures justify broader testing.

Do not infer cross-stack impact merely because the repository contains both
frontend and backend code.

Frontend-only changes

Frontend-only includes React components, CSS, responsive behavior, frontend
routing/state, UI composition, frontend utilities, and frontend tests when no
backend contract or behavior is changed.

For frontend-only changes:

DO NOT run full pytest.

DO NOT run unrelated backend tests.

DO NOT run unrelated migration checks.

DO NOT run backend-wide static analysis unless backend files/contracts are
affected.

Prefer:

affected component/unit tests, if available;

affected feature E2E tests;

frontend build;

broader frontend tests only if justified.

For a Wine Detail UI-only change, normally run:

cd frontend
npm run test:e2e:wine-detail
npm run build

If the change is only layout/styling, backend tests are normally unnecessary.

Windows frontend tooling

On this workstation, Node.js and npm are installed in C:\ERI\node. When they
are not available on PATH, prepend that directory for the current PowerShell
session, then invoke npm:

$env:Path = "C:\ERI\node;$env:Path"
npm run build
npm run test:e2e:wine-detail

Run these commands from frontend/. Do not assume npm is globally available.

Backend-only changes

Run the smallest relevant backend tests first. Typical checks from backend/
with .venv activated:

ruff check app
ruff format --check app
pyright app
pytest <relevant-test-or-directory>

The complete backend suite is:

ruff check app
ruff format --check app
pyright app
pytest

The complete suite is not required for every backend change. Do not run
frontend E2E tests for backend changes that cannot affect frontend behavior.

Install hooks when needed:

pre-commit install

Cross-stack changes

Treat a change as cross-stack when it affects API request/response contracts,
frontend/src/types.ts, authentication, authorization, tenant isolation,
frontend-visible Pydantic/SQLAlchemy behavior, migrations, shared validation,
or endpoint behavior used by the modified frontend feature.

Run relevant backend tests, relevant frontend tests, and affected E2E flows.
Still prefer targeted tests before full suites.

Full-suite policy

Run a broad/full suite only when explicitly requested or justified by release
preparation, auth/authorization/tenant changes, shared infrastructure, widely
used API contracts, migrations, broad refactors, or targeted failures that
suggest wider regressions.

A CSS/layout/responsive/isolated component change must not trigger the entire
backend suite.

Frontend local setup

cd frontend
npm ci
npm run build

Do not run npm ci after every source change when dependencies are already
installed and unchanged.

On this machine Node/npm are available under C:\ERI\node; add that directory
to PATH when necessary.

Frontend UI validation

For UI, layout, or responsive changes, a successful build is necessary but not
sufficient.

Run relevant component/unit tests when available.

Run relevant Playwright E2E tests.

Verify responsive layouts when affected.

Render and visually inspect significant UI changes.

Run npm run build.

A UI task is not complete merely because the build succeeds.

When a relevant test fails, identify whether the cause is implementation,
test, environment, or nondeterministic dependency; fix the actual cause and
rerun the smallest relevant test. Do not weaken/delete/bypass a valid test just
to make it pass.

Visual UI quality review

For significant UI/responsive changes, render the actual page and inspect it.
For compact/mobile changes inspect at least 390 x 844, plus other supported
sizes when relevant.

Reject the implementation if visible defects include:

overlapping controls or text;

text underneath another element;

clipped labels or values;

buttons covering headings, values, or labels;

overlapping cards;

floating controls obscuring content;

accidental negative-offset layouts;

broken alignment;

disconnected labels and values;

controls outside their intended container;

content outside the viewport;

unreadable responsive layouts;

broken information hierarchy.

If a defect is visible: identify the responsible component/CSS, fix it, render
again, capture/review another screenshot, and repeat until resolved.

A visually broken layout is not acceptable merely because DOM, functional, or
screenshot-baseline tests pass.

Visual baseline policy

Visual regression protects an already validated layout; it does not decide
whether an initial layout is good.

NEVER create or update a visual baseline until the layout has passed visual
quality review.

Do not automatically update baselines after screenshot mismatches. A visual
difference must remain a failure until intentionally reviewed and accepted.
Use an explicit baseline-update command.

Responsive layout quality rules

For compact/mobile UI:

no horizontal page scrolling;

no overlapping interactive controls or text;

no content outside the viewport;

no clipped primary information;

touch targets remain usable (approximately 44 px where practical);

cards do not overlap;

headings/values remain visually associated;

labels do not collide with values;

compact spacing must not sacrifice readability.

Avoid arbitrary negative margins or absolute positioning as responsive
shortcuts unless explicitly required and validated across supported sizes.
Prefer normal flow, flexbox, and grid.

Responsive test viewports

Validate important compact/mobile flows at least at:

360 x 800

390 x 844

430 x 932

Use 390 x 844 as the primary visual-review viewport unless another canonical
size is more appropriate. Do not unnecessarily run every functional test at
every viewport; parameterize targeted responsive checks.

Layout geometry testing

For important responsive components, Playwright should verify geometry where
useful. Do not rely only on DOM/text presence or screenshot equality.

Use bounding boxes to detect meaningful structural problems: wrong visual
order, buttons overlapping headings, values overlapping labels, floating
controls covering content, adjacent cards intersecting, or elements leaving
the viewport.

Example helper:

function overlaps(a, b) {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

Do not exhaustively compare every DOM pair. Test meaningful relationships and
known regression risks.

Horizontal overflow testing

Responsive E2E tests should check unwanted horizontal scrolling, equivalent to:

document.documentElement.scrollWidth <=
document.documentElement.clientWidth

Use tolerance only when technically justified and documented. If overflow
exists, find and fix the responsible element; do not hide it by relaxing or
removing the test.

Playwright

Use @playwright/test for browser-level validation when available. Prefer
Chromium for the primary E2E workflow unless browser-specific testing matters.

Prefer semantic selectors: getByRole, getByLabel, stable visible text, and
getByTestId only when needed. Avoid selectors coupled to incidental DOM
nesting or CSS classes.

E2E tests should not unnecessarily depend on unstable external services such
as map tiles, geocoding, remote images, AI providers, or unrelated APIs. Use
request interception, deterministic fixtures, mocks, controlled test data, or
limited masking of genuinely nondeterministic screenshot regions.

Do not alter production functionality merely to simplify E2E testing.

Visual regression

For visually important compact/mobile views, maintain deterministic screenshot
tests. Wine Detail uses 390 x 844 as the primary viewport and should normally
use a full-page screenshot.

Commit visual baselines. Do not commit temporary traces, failed-run
screenshots, videos, reports, or test-results unless intentionally required.

Wine Detail compact/mobile

Wine Detail is a high-value Vinaris UI and requires dedicated regression
coverage.

For Wine Detail frontend-only changes:

cd frontend
npm run test:e2e:wine-detail
npm run build

Run relevant component tests when available. Do not run backend tests unless
backend files/contracts/behavior used by Wine Detail changed or a failure
suggests a backend regression.

Information hierarchy

Preserve this conceptual order:

Wine identity

Price/value

Status and quantity

Drinking window

Quick actions

Cellar objective

Identity and availability

Prices and value

Profile and recognition

Wine origin

Stock and purchases

Notes and history

AI audit

Invariants

Registra bevuta appears exactly once.

Registra vendita appears exactly once.

No horizontal scrolling.

Status and Quantity are clearly visible.

Drinking Window is visible.

Status/Quantity appear before Wine Origin.

Drinking Window appears before Wine Origin.

Secondary sections remain collapsed by default where intended.

Floating controls do not hide primary content.

Desktop behavior does not regress.

Do not remove information merely to reduce vertical height.

Visual quality checks

For significant Wine Detail compact changes, render at 390 x 844 and verify:

wine name is unobstructed;

price/value is unobstructed;

photo controls do not overlap title/content;

origin controls do not overlap title/content;

rating controls do not overlap metadata;

Status and Quantity cards are readable;

card labels do not overlap values;

adjacent cards do not overlap;

content stays within viewport width;

floating controls do not obscure content;

visual hierarchy remains understandable.

Fix any failure before updating screenshot baselines.

Geometry checks

Where stable selectors exist, test meaningful geometry such as:

photo action does not overlap wine title;

origin action does not overlap wine title;

price does not overlap Status/Quantity cards;

Status label does not overlap its value;

Quantity label does not overlap its value;

Status and Quantity cards do not overlap;

primary controls remain inside the viewport.

Visual baseline

Maintain at least one deterministic compact baseline, suggested:
wine-detail-compact.png at 390 x 844.

Before creating/updating it:

Run functional tests.

Run layout/geometry tests.

Perform visual quality review.

Only then intentionally accept the baseline.

Desktop smoke testing

Important responsive changes must not silently break desktop. Maintain a light
Wine Detail desktop smoke test verifying page load, main content rendering,
and absence of application crash. Full desktop visual regression is optional.

Change workflow

Read relevant implementation and tests before changing behavior.

Inspect the working tree and classify actual scope.

Keep changes narrow; avoid unrelated formatting/refactoring/cleanup.

Run the smallest relevant checks first.

Implement the requested change.

Run targeted regression tests.

For significant UI changes, render the page, inspect visually, run geometry
checks, and verify relevant responsive sizes.

On failure, investigate, fix, and rerun the targeted test.

Escalate to broader suites only when justified.

A task is not complete while a relevant test fails.

Do not run unrelated backend tests for frontend-only changes.

Do not run unrelated frontend E2E tests for backend-only changes.

For AI changes, test no-result, malformed-result, and weak-evidence paths.

Update README/docs when setup, deployment, test procedures, or externally
visible behavior changes.

Autonomous UI iteration workflow

For frontend UI work:

inspect affected files
        |
classify scope
        |
implement narrow change
        |
run targeted functional tests
        |
run layout/geometry tests
        |
render actual UI
        |
inspect screenshot
        |
visual defect?
   yes       no
    |         |
   fix    regression check
    |         |
 rerun    frontend build
              |
             done

For Wine Detail frontend-only changes, do not turn this into a full backend
validation workflow.

Definition of done for frontend UI changes

A frontend UI task is complete when:

requested behavior/layout is implemented;

relevant functional tests pass;

relevant responsive tests pass;

no unintended horizontal overflow exists;

important elements do not overlap;

the actual rendered UI has been visually reviewed when significant;

affected visual baselines were intentionally reviewed;

frontend build passes;

unrelated backend suites were not unnecessarily executed;

no unrelated functionality was changed.

A visually broken UI is not complete even if TypeScript compiles, Vite builds,
DOM tests pass, or a screenshot matches an outdated baseline.
