# Desktop Home editorial composition

## Scope and files

The existing private Home is redesigned in place. Restaurant views, routes,
authorization, API calls and subscription behavior are unchanged.

- `frontend/src/App.tsx`: reuses the live hero/summary and subscription banner on
  desktop; arranges existing featured, recent and ready-wine modules; surfaces
  the shared, data-derived featured explanation; requests the larger existing
  photograph for the editorial hero.
- `frontend/src/components/CellarHome.css`: common materials and independent
  desktop composition, navigation, photo layout, responsive grid and hover rules.
- `frontend/src/components/CellarDesktopNavigation.css`: keeps the desktop
  navigation horizontal below the compact header on private inner sections;
  the AI submenu overlays the page without moving content. The collection
  list and detail panel remain side by side, and mobile navigation is unchanged.
  The cellar reading panel stays the same width whether a wine is selected or
  not, between 480 and 550 px according to the desktop viewport. Other
  sections keep their existing proportions.
- `frontend/e2e/wine-detail.spec.ts`: desktop composition, data, navigation,
  permissions/subscription, image fallback, geometry and mobile regression tests.

No parallel mockup or new component library is introduced. Reused components:
`CellarHomeHero`, `CellarHomeStats`, `RiservaBanner`, `CollectorMaturity`,
`KeyPositionBottleVisual`, `CollectorReadyWines`, and the existing arrivals list.
The desktop feature retains its richer market-history content and direct wine
opening; mobile retains its compact card and explanation dialog.

## Shared design system

`--home-forest`, `--home-copper`, `--home-paper`, and `--home-rule` are now defined
once outside media queries. `--home-serif` and `--home-shadow` support desktop
editorial surfaces. Paper, rules and text inherit the user's light/dark theme.
No external fonts are introduced. Three bundled photographs provide a randomly
selected header, stable while navigating and renewed on reload; see
[background assets and prompts](HOME_BACKDROPS.md).

## Composition and breakpoints

- Up to 900 px: the approved mobile layout, summary rail, featured gallery and
  bottom navigation are retained. Dashboard choices remain above the summary.
- 901–1099 px: two-column editorial feature and reduced arrivals grid; existing
  touch bottom navigation is retained rather than showing both navigation systems.
- From 1100 px: existing navigation actions become a restrained horizontal bar.
  Search, cellar switch, notifications and account actions remain in the header.
- Up to 1200 px: two arrival columns, narrower gaps and a less asymmetric split.
- Wider desktop: approximately 40/60 bottle/information composition, then an
  approximately 62/38 arrivals/ready-wine split. Three arrival columns show related
  wines together without a horizontal carousel. Ready-wine pagination remains.
- The centered shell is capped at 1600 px, including its responsive gutters.

The hero is shallow enough to expose real cellar metrics immediately. The
featured wine separates identity, values, maturity and explanation through
typography and dividers, rather than another collection of nested cards.
The optional Riserva section spans the content width between the feature and
secondary wines. Existing subscribers, administrators, demos and offline sessions
do not receive a subscription CTA. The CTA opens existing profile settings.

## Reference adaptations and data limits

The compact header uses a vineyard, barrel cellar or tasting scene, independent
of theme background rules. Global navigation sits on the page surface rather
than a second green band. Actual wine
photos use the available detail asset, with the existing thumbnail/illustration
fallback and photo permissions preserved. The featured selection retains its
existing previous/next controls; arrivals use a grid instead.

Summary values remain separated by currency and disclose price coverage. No
comparable 12-month portfolio-return metric is available here, so no percentage
is fabricated. Monitoring represents existing drinking-window conditions, not a
prediction of investment potential. Explanations are the existing data-derived
selection explanations, not newly generated AI assessments. Missing dated history
or drinking windows remain explicitly unavailable.

## Verification

Targeted command (Chromium):

```powershell
npx playwright test e2e/wine-detail.spec.ts -g "collector|desktop cellar|editorial dashboard"
npm run build
```

Composition checks cover 1024, 1280, 1366, 1440, 1600 and 1920 px. Existing mobile
tests include 390, 430 and 768 px, plus smaller widths. Checks assert visible
first-screen summaries, bounded navigation height, image/text separation, correct
section order, asymmetric columns, no horizontal page overflow, and functional
wine/subscription navigation. Image tests cover 1x, 2x and detail-image failure.
English, empty cellars and dark themes are also covered.

Legacy desktop assertions that required a one-row arrivals carousel or featured
and ready cards on the same row are replaced by geometry assertions for the
intentional new composition. Header photograph changes require deliberate
review of affected desktop and mobile page baselines.

Validation result: 92 Home regression tests passed, followed by six targeted
checks including the desktop baseline, personal-dashboard previews, financial
widgets, resizing and drag-and-drop. The final multi-cellar header and Riserva
flow also pass. Production TypeScript/build/bundle checks pass; there is no
separate lint script configured in the frontend package.

Reviewed Windows Chromium baselines at 1440 × 1000:
`collector-desktop-home.webp` and `collector-desktop-stage.webp`. The latter hides
only fixed global controls while capturing the full editorial section.
