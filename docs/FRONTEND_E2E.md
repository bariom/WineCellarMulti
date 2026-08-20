# Frontend E2E checks

The frontend uses Playwright with Chromium. The Wine Detail suite uses safe,
deterministic browser fixtures and does not require real credentials, tokens,
production data, or a backend process.

From `frontend/`:

```powershell
npm ci
npx playwright install chromium
npm run test:e2e
npm run test:e2e:wine-detail
```

`PLAYWRIGHT_BASE_URL` can point to an already running Vite frontend. Without
it, Playwright starts `npm run dev` automatically. The normal Vite API proxy
remains available for future suites that use a test backend.

The Wine Detail suite covers compact/mobile rendering at 360x800, 390x844,
and 430x932, a desktop smoke path, semantic Wine Detail content, the two quick
actions exactly once, visual hierarchy using bounding boxes, collapsed
secondary sections, and the explicit `document.documentElement` overflow
invariant. Maps and API data are fixture-backed so remote tiles and credentials
cannot make the test nondeterministic.

The reviewed visual baseline is stored in
`e2e/wine-detail.spec.ts-snapshots/`. Update it only intentionally:

```powershell
npm run test:e2e:update
```

Do not update snapshots as a way to hide an unexpected UI regression.

## Scope-aware test selection

`AGENTS.md` is the authoritative Codex guide. Codex must inspect `git diff`
and classify changes before selecting checks. Frontend-only changes use the
smallest relevant frontend test, `npm run test:e2e:wine-detail` when applicable,
and `npm run build`; they do not require the full backend pytest suite. Backend
or cross-stack changes add their targeted backend/contract checks, and the full
repository suite is reserved for changes whose scope justifies it.
