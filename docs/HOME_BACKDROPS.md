Home photographic backgrounds
============================

Generated with the built-in image generation tool, September 2026. Original PNGs are preserved in the Codex generated-images directory; production assets are JPEG quality 85, approximately 250 KB each. Only the selected photograph is requested.

A random scene is saved in sessionStorage under `vinaris.home-backdrop.v1`. In-app navigation and theme changes preserve it. A full reload (including Ctrl+F5) randomly selects one of the other scenes, excluding the previous image. Logout clears it. A new tab session chooses again. If storage is unavailable, the choice persists in memory until reload, but consecutive repeats cannot be excluded across reloads. Failed images fall back to the existing cellar photograph, then to the forest-green surface.

The decorative image layer is independent of theme background rules. Desktop uses a compact photographic masthead and transparent navigation over the page surface; dashboard choices retain their shared position below navigation.

Header colors are centralized in `frontend/src/components/CellarHeaderTheme.css` for all 18 resolved themes (System resolves to Light or Dark). Inner pages use a dark surface matched to the palette; Home retains the photograph with a matching translucent tint. Ivory text and notification icons remain unchanged. Theme changes do not choose another photograph. Failed photographs now fall back to the theme's header surface. The scoped palette does not recolor cards, Riserva artwork or restaurant headers.

Targeted regression coverage: `npx playwright test -g "header palettes|compact section header|Home backdrop themes"`. This checks both header compositions, text contrast, notification layering and responsive layouts; inspect generated screenshots before accepting visual baselines.

Validation: 107 existing Home checks passed initially; five page-baseline differences were visually reviewed and intentionally accepted. All five affected tests then passed without snapshot-update mode, alongside 17 backdrop checks (22 final checks passed). Six themes were rendered on mobile and desktop; responsive coverage includes 360, 390, 430 and desktop widths through 1920 px. Production build and final local build passed. No backend changes or backend test runs.

Prompt set
----------

## vineyard

Asset: `frontend/public/images/home-vineyard-v1.jpg`

Use case: photorealistic-natural. Asset type: panoramic photographic background for Vinaris premium wine-cellar application header. Create one landscape photograph, 3:1 wide composition, of terraced European vineyards at late afternoon, layered vine rows crossing gentle hills with a small warm limestone winery on the far right. Realistic botanical and stone textures, soft atmospheric depth, restrained forest green, sage and warm copper sunlight, luxurious quiet editorial photography, natural not oversaturated. Left 45 percent subdued darker greenery with low visual detail to support white interface text, recognizable landscape and winery concentrated in the right half and middle horizontal band so a shallow banner crop retains the subject. The right half must remain luminous and clearly legible, not uniformly dark. No people, no labels, no text, no logos, no typography, no frame, no UI. This is a background photograph, not a screenshot.

## barrels

Asset: `frontend/public/images/home-barrels-v1.jpg`

Use case: photorealistic-natural. Asset type: panoramic photographic hero background for Vinaris, a premium private wine-cellar application. One wide landscape photograph, 3:1 panoramic composition: intimate historic European barrel cellar, warm limestone vaults, oak barrels in disciplined rows receding to a small softly lit arch on the right, wood grain, naturally worn stone. Quiet luxury editorial architectural photography, soft warm side lighting, forest green shadows, sage and warm bronze highlights, restrained contrast, realistic materials. Left 45 percent quiet deep shaded stone for white interface text; most identifiable architecture and barrels in the right half and central horizontal band, readable in a very shallow website crop. Keep the right half sufficiently illuminated to see architectural texture, not black. No people, no labels, no readable text, no signage, no logos, no watermark, no UI or frame. Not a screenshot.

## tasting

Asset: `frontend/public/images/home-tasting-v1.jpg`

Use case: photorealistic-natural. Asset type: panoramic editorial background photograph for Vinaris premium private cellar app. One photograph, wide 3:1 landscape composition. A quiet wine tasting room overlooking soft vineyard hills, a single elegant crystal stemmed glass holding a little red wine and a plain unlabelled dark wine bottle on a worn limestone ledge on the right, warm late-afternoon light through an old stone window. Sophisticated realistic still life with natural glass reflections, stone pores, subtle atmospheric landscape. Muted forest-green shadows, warm ivory stone, copper sunlight. Left 45 percent softly shaded uncluttered stone with low contrast for white interface copy; wine glass and bottle and window concentrated in right half in the central horizontal band so recognizable in a shallow banner crop. The image must remain clearly photographic and illuminated, not a nearly black texture. No people, no text, no labels, no logos, no watermark, no graphic overlays, no UI, no frame.
