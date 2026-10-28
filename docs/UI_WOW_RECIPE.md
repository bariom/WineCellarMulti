# UI "WOW" recipe — motion, light, typography

Shared rules for the premium polish pass (per-wine
colour, showcase, drinking-window gauge, micro-interactions). Any model or
contributor applying one of these items follows this file so the result reads
as one system. Read `AGENTS.md` first for the compact Wine Detail invariants,
viewport checks (390×844 primary) and the visual-baseline policy.

## Non-negotiables

- No new runtime dependencies (framer-motion, three, lottie, gsap are out:
  the 500 kB per-chunk budget and lazy chunks must stay as they are).
- Every animation has a `prefers-reduced-motion: reduce` branch that removes
  movement but keeps the end state visible (opacity fade at most).
- Progressive enhancement only: View Transitions, `animation-timeline`,
  `@starting-style`, DeviceOrientation and `navigator.vibrate` are guarded;
  the page is complete without them.
- New CSS goes in a dedicated file next to the component (or
  `frontend/src/components/<Feature>Refined.css`), never appended to
  `styles.css`. Colours come from theme variables; never hard-code a hex.
- Both languages for any new string (`i18n.ts`), both themes checked
  (light default and `private-cellar` at minimum).
- Nothing in this file changes layout order, element counts or the Wine
  Detail invariants. If an effect needs a DOM change, it is a separate,
  reviewed change.

## Tokens (add to `frontend/src/tokens.css`)

```css
:root {
  /* Durations */
  --dur-tap: 120ms;        /* press feedback, toggles */
  --dur-fast: 180ms;       /* hover, colour, border */
  --dur-base: 240ms;       /* reveal, fade, small moves */
  --dur-slow: 360ms;       /* cards entering, segmented indicator */
  --dur-hero: 520ms;       /* view transitions, gauge sweep, wheel draw */

  /* Easing — match what the AI overlay and hero already use */
  --ease-out: cubic-bezier(0.2, 0.7, 0.2, 1);      /* default for entrances */
  --ease-spring: cubic-bezier(0.22, 1, 0.36, 1);   /* lifts, carousels */
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);   /* cross-fades */

  /* Light */
  --hairline-gold: color-mix(in srgb, var(--accent) 38%, transparent);
  --glow-gold: 0 0 0 1px var(--hairline-gold), 0 0 28px color-mix(in srgb, var(--accent) 22%, transparent);
  --focus-ring: 0 0 0 3px color-mix(in srgb, var(--accent) 45%, transparent);
}
```

Use existing `--shadow-soft` / `--shadow-premium` for elevation; do not add
a third shadow. Hover lift is `translateY(-2px)` + `--shadow-premium`, never
more.

## Micro-interactions (apply everywhere, same values)

| Element | Rest → active | Duration / easing |
| --- | --- | --- |
| Button, chip, card tap | `transform: scale(0.97)` on `:active`, `--focus-ring` on `:focus-visible` | `--dur-tap` / `--ease-out` |
| Hover on cards, rows | `translateY(-2px)`, border → `--border-strong`, shadow → `--shadow-premium` | `--dur-fast` |
| Segmented control / tabs | one absolutely positioned indicator slides to the active item | `--dur-slow` / `--ease-spring` |
| Toggle | knob `translateX`, track colour | `--dur-base` / `--ease-out` |
| Success (tasting, sale, stock) | checkmark SVG `stroke-dashoffset` 48 → 0, then gold glow fades | 320ms draw + `--dur-base` |
| Destructive confirm | shake 3× at 4px | 280ms, reduced-motion: none |
| Haptic | `navigator.vibrate?.(8)` only on stock-changing actions that succeed | — |

Transition only `transform`, `opacity`, `box-shadow`, `border-color`,
`background-color`. Never animate `width`, `height`, `top`, `left`.

## Entrances and scroll

- Lists and dashboard sections: fade + `translateY(12px)` → 0, staggered
  `40ms` per item, capped at 8 items (later items appear instantly).
- Entrances run on mount (`SurfacesRefined.css`), not on scroll. Scroll-driven
  `animation-timeline: view()` was rejected because it leaves below-the-fold
  content at opacity 0 in full-page captures and in print. Charts keep the
  IntersectionObserver in `chartMotion.ts`; do not add a second observer.
- Skeletons: bottle-shaped blocks with a diagonal shimmer (`--accent` at 14%)
  sweeping every 1.6 s; reduced motion = static blocks.

## View transitions

Decided against (28 Oct 2026): the bottle flying from the list row to the
detail hero was judged ugly and without added value. Do not reintroduce a
shared-element transition between list and Wine Detail; plain cross-fades of
whole views remain acceptable if a later item needs them.

## Per-wine colour (Wine Detail hero)

- Sample the label thumbnail on a 16×16 canvas, average the saturated pixels,
  clamp lightness to the theme (light themes: L ≤ 62%; dark themes: L ≥ 28%).
  Expose as `--wine-hue` and `--wine-tint` on the detail root.
- Fallback by wine type when there is no photo: red `#6b1f2a`, white
  `#c9b36a`, rosé `#c97b8a`, sparkling `var(--accent)`, dessert `#a66a2c`,
  all taken through `color-mix` with the theme surface at 70%.
- Backdrop recipe: `radial-gradient(120% 80% at 50% 0%, var(--wine-tint) 0%, transparent 60%)`
  behind the hero; text stays on the theme surface, contrast ≥ 4.5:1 checked
  on both the lightest and darkest tints.

## Surfaces and light

- Premium card = theme card + inset hairline
  (`box-shadow: inset 0 0 0 1px var(--hairline-gold)`) + grain overlay:
  an SVG `feTurbulence` data URI at 6% opacity, `mix-blend-mode: soft-light`,
  dark themes only.
- Cursor light: `background: radial-gradient(240px at var(--mx) var(--my), color-mix(in srgb, var(--accent) 10%, transparent), transparent 70%)`
  on `:hover`, `--mx/--my` set via a single delegated `pointermove` listener
  on the list container (not one per card). Touch devices: none.

## Typography

- Wine name in the detail hero: `var(--font-display)`, italic, 40–48px
  (`clamp(2.25rem, 6vw, 3rem)`), `font-optical-sizing: auto`, letter-spacing
  -0.01em. Vintage beside it in `var(--font-ui)` small caps
  (`font-variant-caps: all-small-caps`) in `--accent`.
- Every numeric value (prices, quantities, scores, dates):
  `font-variant-numeric: tabular-nums`.
- Eyebrows/kickers: `--text-xs`, letter-spacing 0.12em, uppercase, `--accent`.

## Drinking-window gauge (SVG)

- 180° arc, stroke 10px, track = `--border`, window = gradient
  `--accent` → wine tint, peak = brightest point with `--glow-gold`.
- "Today" marker: 8px gold dot that sweeps from the arc start to its position
  over `--dur-hero` with `--ease-spring`; after the window end, the remaining
  track darkens to `--border-strong`.
- Same component at 56px wide for rows (no labels, no animation).

## Taste wheel and share card

- The signature blooms from the centre (scale + slight rotation over
  `--dur-hero`), then each point lands with a 60 ms stagger. Stroke-dash
  drawing is not used: weak edges already rely on `stroke-dasharray`.
- Share card: 1080×1350 PNG from a canvas, dark surface, gold hairline,
  wheel centred, user's first name only, no e-mail, no cellar totals.

## Showcase carousel (home)

- Top 5 bottles by value with a photo; fallback to the 5 most recent.
- Photo with `--shadow-premium` plus a mirrored reflection
  (`transform: scaleY(-1)`, mask to 35% height, opacity 0.25).
- Tilt: ±6° from a mouse pointer on desktop; reduced motion disables it.
  No DeviceOrientation: iOS needs a permission prompt for it, too intrusive
  for a decorative effect.
- Scroll-snap horizontal, 1 card visible at 390px, 2.5 at ≥ 900px.

## Maps

- Dark themes invert the OpenStreetMap tiles into a warm night palette with a
  CSS filter on `.leaflet-tile-pane`. CARTO basemaps were rejected: their free
  tier is non-commercial and Vinaris sells subscriptions.
- The highlighted origin ring (`vinaris-map-pulse`) and memory clusters pulse
  in gold three times, 1.8 s each.

## Theme tone

`App.tsx` sets `data-theme-tone="dark|light"` on `<html>` from the active
theme's `--surface` luminance. Target dark themes with
`:root[data-theme-tone="dark"]`; never list theme names again. Switching
between two themes cross-fades through `document.startViewTransition`
(root only, no shared elements).

## Review checklist for each item

1. Render 390×844, 360×800, 430×932; no horizontal overflow, no overlap.
2. Toggle `prefers-reduced-motion` in DevTools and confirm the end state.
   Playwright runs with `reducedMotion: "reduce"`, so the suites only see end
   states; review motion with `page.emulateMedia({ reducedMotion: "no-preference" })`.
3. Check light default and `private-cellar`; contrast on hero text.
4. `npm run build` passes and chunk sizes are unchanged within 5 kB.
5. Matching `test:e2e:<feature>` suite; never update baselines before visual
   review (`AGENTS.md`).
