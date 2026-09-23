# Landing demo screenshots

The landing page leads with the read-only demo, without registration. The hero
uses actual captures of the public demo's **Drink well today** view: one wine
recommendation on phones, and the evening selection on larger screens.
Italian and English captures are separate. The founder section shows a current
mobile collector screenshot (390 × 844), with the Wines/Priorities/Collection tabs.
The cellar knowledge section places a real demo region map beside the introduction
on desktop and below it on phones. Map captures retain the map attribution and
load lazily; the landing page does not request live map tiles.

To refresh these captures from the public demo, from `frontend/`:

```powershell
$env:Path = "C:\ERI\node;$env:Path"
node scripts/capture-landing-demo.mjs
# Refresh the founder section's mobile collector screenshots only:
node scripts/capture-landing-demo.mjs --collector-only
# Refresh the real region map beside the cellar knowledge text:
node scripts/capture-landing-demo.mjs --map-only
```

This opens the public demo, rejects optional cookies, and captures existing UI
without changing wine data. Review the generated images for loaded bottle photos,
unobstructed controls, and correct language. If capture dimensions change, update
the image dimensions in `PublicLanding.tsx` too.

Targeted validation:

```powershell
npx playwright test e2e/landing.spec.ts e2e/cookie-consent.spec.ts
npm run build
```

Landing tests cover Italian/English, 360/390/430 px phones and desktop, viewport
overflow, button geometry, responsive image selection, demo loading/retry and
registration access. Review the screenshots in `frontend/test-results/` after
running them; these are temporary review artifacts, not committed baselines.
