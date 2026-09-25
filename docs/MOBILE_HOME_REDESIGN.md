# Mobile Home redesign

The existing collector Home now uses a photographic forest-green header, warm
paper surfaces, serif editorial headings, a live cellar summary, a larger featured
wine, a drinking-window instrument, an insight panel, a subscription-aware Riserva
section and native horizontal browsing. The collector mobile layout applies up to
900 px. All private Home focuses now share its masthead, search, cellar switcher,
bottom navigation, paper cards and editorial typography. Daily, balanced, value,
readiness, timeline and data retain their own indicators in scrollable summary
cards; taste and the personal dashboard retain their specialized content and
editing controls. Restaurant views are unchanged. The subsequent desktop
interpretation is documented in `DESKTOP_HOME_DESIGN.md`; it shares the materials
while using a separate multi-column composition.

## Files and reusable components

- `frontend/src/components/CellarHomeHero.tsx`: `CellarHomeHero` and `CellarHomeStats`.
- `frontend/src/components/FeaturedWineCard.tsx`: dynamic featured wine and insight.
- `frontend/src/components/RiservaBanner.tsx`: editorial subscription invitation.
- `frontend/src/components/CellarHome.css`: scoped mobile composition and styling.
- `frontend/src/App.tsx`: connects the header, summary, search and existing profile action.
- `frontend/src/components/CollectorDashboard.tsx`: composes featured wines, Riserva
  and recent arrivals with the existing galleries and navigation.
- `frontend/src/components/CollectorEditorial.css`: removes superseded featured-card rules.
- `frontend/src/components/CollectorMaturity.tsx`: aligns the compact timeline labels
  with its scale, including the current year when it is outside the drinking window.
- `frontend/src/components/FeaturedWineDetails.tsx`: shares the existing explanation
  with the featured card.
- `frontend/src/components/HorizontalScroll.tsx`: makes Previous work at the end
  when multiple cards are visible at once.
- `frontend/e2e/wine-detail.spec.ts`: responsive, data, entitlement, navigation and
  geometry coverage; isolates section screenshots from fixed page controls.
- `frontend/e2e/wine-detail.spec.ts-snapshots/`: reviewed `collector-compact`,
  `collector-riserva-home-compact`, `collector-glance-compact` and
  `collector-evolution-compact` Windows Chromium baselines.
- `docs/FRONTEND_E2E.md`: behavior and targeted verification instructions.

## Data and reference adaptations

All wine identities, photographs, valuations, drinking windows and explanations
come from the existing application data and feature selection. Value totals stay
separate by currency and disclose coverage. Ready wines use the existing complete
eligible selection, before the slideshow limit. Monitoring means valid windows
closing this year or already past their end, for physically present wines.

The reference's vineyard is replaced by the existing local cellar photograph.
KPI cards scroll on narrow phones; the featured wine's timeline and insight use
full-width rows for readability. User themes remain supported. Dashboard focus
selectors sit immediately below the masthead in every focus, before the collector summary and galleries; collection
tabs remain available below the galleries.

The banner says “Explore Reserve”, opens existing subscription settings and does
not promise a trial or bundled AI usage. It is absent for active entitlements,
administrators, demos and offline sessions. Unsupported favourite controls and
invented editorial wine descriptions are not added.

No backend change is required. A future summary could expose a server-calculated,
comparable 12-month valuation change per currency, with dated coverage and a
clear distinction between price changes and inventory movements. Until that
metric is defined, the reference's portfolio growth percentage is omitted.
Likewise, “high potential” is not substituted for the operational monitoring count.

## Verification

Responsive geometry and visual review cover 360, 390, 412, 430, 480 and 768 px;
existing collector tests also cover desktop at 1024, 1280, 1440 and 1920 px,
themes, missing photos/data, keyboard/touch scrolling and opening wine details.

The initial broader Wine Detail run exposed pre-existing absolute-position
failures in the other Home focuses, reproduced at `6fb9b20`. With the shared
masthead redesign, editorial tests now check actual section order, visible
dashboard navigation, KPI label/value separation and viewport containment rather
than the obsolete absolute first-card offset. The unrelated three-pixel difference
in the 390 px tasting-dialog baseline is unchanged. `balanced-home-compact.png`
protects the reviewed shared mobile edition alongside the collector baselines.

Targeted shared-Home regression command:

```powershell
npx playwright test e2e/wine-detail.spec.ts -g "editorial dashboard|collector|scroll cues|personal dashboard"
```

Shared-style verification: 104 distinct relevant cases passed across targeted
runs. Three personal-dashboard screenshot differences were visually reviewed,
intentionally accepted, and passed again without snapshot updates. The final
32-case run covers every secondary focus at mobile/desktop widths and the
affected personal-dashboard flows. Production build and bundle checks pass.
