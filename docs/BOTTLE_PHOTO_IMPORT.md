# Quick add from a photo of bottles

The fastest way to fill a cellar: put the bottles on the table, take one to three
photos, review what Vinaris recognised, and add everything in one tap.

## The path into the cellar

Every "add wine" button (the mobile "+", the cellar's "Aggiungi vino", the empty
state) opens a chooser with two paths:

- **Inserimento veloce** – one or more bottles from a photo (this feature).
- **Inserimento dettagliato** – the full wine form, one wine at a time.

A link to the receipt/invoice import is offered underneath when available. Offline,
the buttons go straight to the form.

## Flow

1. `POST /api/v1/bottle-photos/scans` (multipart `images`, at most 3) starts a
   background job and returns `202`; the app polls `GET /api/v1/bottle-photos/scans/{id}`
   every 1.5 s for progress (`reading` → `matching` → `done`).
2. Each photo is resized to the model's view and read with the prompt
   `wine_bottles.recognition` (`backend/app/prompts/bottle_photos.py`): one entry per
   wine with a bottle count and the label position, so the review can show the label
   cut from the user's own photo. Identical wines are merged across photos.
3. Each wine is matched to the same wine already in the cellar (exact name, clear
   lead, compatible vintage) or to the shared catalog.
4. `POST /api/v1/bottle-photos/confirm` saves the reviewed rows: a new lot on an
   existing wine, or a new wine through the normal creation (catalog data, catalog
   photo, status Delivered). The free-tier label limit stops the loop and returns
   `saved_rows`/`limit_reached`, so the app keeps only the rows not yet saved.

AI enrichment is not automatic: after saving, "Completa con AI" runs the usual
completion only on the new wines the catalog did not know.

## Access and cost

Open to every plan. On the free tier it spends AI credit (402 without credit); the
model is the user's pairing model with low reasoning, audited as
`bottle_photo_import`.

## Tests

- Backend: `pytest tests/test_auth_and_wines.py -k bottle_photos`,
  `pytest tests/test_prompts.py -k wine_bottles`.
- Frontend: `npm run test:e2e:bottle-photo-import`.
