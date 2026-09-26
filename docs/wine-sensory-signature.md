# Wine sensory signature

Wine Detail displays the existing sensory profile beside the personal taste note. Nine intensity bars use a 0–10 scale: body, acidity, tannin, sweetness, aromatic intensity, fruit, oak, spice and minerality. These describe the wine rather than personal affinity. Source, confidence and validation status provide context for the estimate.

The read-only `GET /api/v1/taste-profile/wines/{wine_id}/sensory` endpoint checks the active household and wine visibility before retrieving the shared sensory profile. It returns `null` when no available profile exists; opening Wine Detail never generates AI data or charges credits. Wines without an available profile do not display the chart. Unknown or invalid dimensions are labelled unavailable, while a genuine zero remains zero.

Targeted checks:

```text
cd backend
pytest tests/test_taste_profiles.py
cd ../frontend
npm run test:e2e:wine-detail -- --grep "wine sensory signature"
npm run build
```
