# Wine list decorative images

The empty wine detail sidebar draws one of seven photographs when the application loads: the original `premium-cellar-empty.jpg` and six generated WebP assets in `frontend/public/images/`. Photographs fill the available frame with centered proportional cropping (`object-fit: cover`), preventing dark side bars at different viewport sizes. The choice remains stable during in-app navigation and React remounts; subsequent loads exclude the previous photograph when session storage is available. If a new image fails, the original photograph is used. If that also fails, the decorative image is omitted and the explanatory text remains.

The six new assets were generated with the built-in image_gen tool, then exported as WebP (quality 85, maximum 1086 x 1448) for delivery. Original generated PNG files were preserved outside the repository. No external image service is needed at runtime.

## Generation prompts

### cellar-stone-v1.webp

Use case: photorealistic-natural. Asset: decorative wine cellar photograph for Vinaris wine collection sidebar. Generate ONE premium architectural interior photograph, portrait 3:4 composition, no collage. A historic Italian private wine cellar, pale limestone barrel vault, built-in aged oak bottle racks filled with horizontally stored wine bottles on both sides, a short intimate aisle ending in an arched stone niche. Warm concealed amber lights, realistic subtle patina, refined serene atmosphere, warm walnut and honey limestone tones. Eye-level perspective, straight architectural verticals, entire room sharply readable, suitable for central crop to square as well. No people, no typography, no readable labels, no logos, no watermark, no interface. Photorealistic high quality editorial interiors photography, distinct from a dark modern rectangular wood cellar.

### cellar-modern-v1.webp

Use case: photorealistic-natural. Asset: decorative photograph for a premium wine collection sidebar, Vinaris. Generate ONE architectural interior photograph, portrait 3:4, no collage. Contemporary boutique private wine cellar, floor-to-ceiling slender bronze and dark metal wine racks with horizontal bottles, smoked oak paneling, a pale travertine tasting island centered at the far end, softly illuminated niches and glass partitions. Elegant coherent realistic design, quiet warm evening ambience, muted walnut, bronze and cream palette, subtle amber indirect lighting, natural material textures, editorial interiors photography. Eye-level three-quarter viewpoint showing room depth, straight verticals, legible composition also cropped to square. No people, no text, no logos, no readable bottle branding, no watermarks, no UI. Avoid excessively dark exposure and avoid duplicating a narrow traditional wooden cellar aisle.

### cellar-rustic-v1.webp

Use case: photorealistic-natural. Asset: premium decorative wine cellar image for Vinaris wine list sidebar. Generate ONE editorial architectural interior photograph portrait 3:4, no collage. An intimate rustic winery cellar with handmade terracotta brick vaulted ceiling, three beautifully aged oak wine barrels along one side, stacked wooden bottle bins filled with horizontally stored dark glass bottles on the other side, small round oak tasting table deeper in the room, earthy limestone floor, gentle warm wall lantern lighting with subtle soft natural light from a high small window. Rich real wood grain, fine textured old brick and restrained elegant atmosphere; cozy artisan Italian winery, not a cavernous industrial warehouse. Eye-level slightly off-center view, straight realistic architecture, composition works when center-cropped to square. Warm earth tones and amber glow, detailed and well exposed. No people, no typography, no readable labels, no logos, no watermark, no interface.

## Wine and glass photographs

### cellar-red-glass-v1.webp

Use case: photorealistic-natural. Asset: premium decorative photograph for Vinaris wine collection sidebar. One portrait 3:4 editorial still life photograph. A beautiful single thin-stemmed crystal glass of ruby red wine on a dark walnut table beside an unbranded dark green wine bottle, softly blurred warm restaurant interior in the background. Rich ruby highlights transmitted through wine, realistic glass reflections and correct clean glass geometry, textured wood, restrained warm amber light with gentle side daylight, refined intimate wine tasting atmosphere. Eye-level close view, main glass entirely visible including stem and base, uncluttered composition, centered subjects suitable for cropping. No wine cellar racks, no people or hands, no text, no readable labels, no logos, no watermark, no collage, no UI. Natural photographic realism, sophisticated warm tones and good exposure.

### cellar-white-glasses-v1.webp

Use case: photorealistic-natural. Asset: premium decorative photograph for Vinaris wine collection sidebar. One portrait 3:4 editorial still life photograph. Two elegant thin-stemmed crystal glasses of pale golden white wine resting on a light limestone terrace table, one closer and one slightly behind, a subtle linen napkin. Softly blurred Mediterranean vineyard hillside in the background at golden hour. Luminous wine, convincing clear glass rims stems and bases, natural gentle reflections, fine linen texture and warm late afternoon light. Refined relaxed atmosphere, cream olive and golden palette, photographic realism. Both glasses entirely visible including stems and bases; elegant uncluttered composition that works in a sidebar. No wine cellar interior, no people or hands, no text, no branding, no logos, no watermark, no collage, no UI.

### cellar-tasting-glasses-v1.webp

Use case: photorealistic-natural. Asset: premium decorative photograph for Vinaris wine collection sidebar. One portrait 3:4 editorial wine tasting still life photograph. A refined wine tasting table with three separate elegant crystal stemmed glasses, containing a small tasting measure each of white, rose and red wine, arranged in a relaxed triangular grouping. An understated clear wine decanter with red wine slightly behind them, a natural linen cloth on a walnut tabletop, soft neutral plaster wall and warm defocused evening lights behind. Each glass has believable transparent bowl stem base and realistic reflections; stems and bases visible, no overlapping rims. Intimate sophisticated warm ambience, realistic textures, muted cream wood and ruby tones. Photograph from a slightly elevated three-quarter angle, balanced uncluttered composition. No cellar racks, no people, no hands, no text, no branding, no watermark, no collage, no UI. High quality realistic editorial photography.

## Validation

From `frontend/`: `npx playwright test e2e/cellar-empty-image.spec.ts`. Coverage includes all six new photographs loading, stable navigation, a different selection on reload, failure fallback, unavailable session storage, desktop geometry and mobile overflow at 360, 390 and 430 px. Review screenshots are temporary test artifacts.
