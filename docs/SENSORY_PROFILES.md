# Sensory profile generation

## Guided administrator workflow

1. In administration → sensory profiles, search for the wine and open **Profili vino**.
2. Click **Esamina riscontri**. Check the vintage and source dossier, then
   **Prepara proposta gratuita**. Importing the reference library is optional.
3. Inspect each proposed trait. **Mantieni e collega prove** keeps the original
   number and records its supporting description; **Approva correzione proposta**
   applies an explicit editorial correction. Conflicts and context-only claims
   cannot be selected. Nothing is preselected.
   The opening summary separates proposed corrections, descriptions that can be
   linked without changing values, and traits needing more evidence. Corrections
   appear first; blocked and already-recorded traits and methodological details
   are collapsed. When no numbers change, the page states that explicitly.
4. Read the counts of changed and retained values, acknowledge review of the
   shared profile, and click **Applica selezione**. Unselected values stay unchanged.
5. The result remains an estimate requiring validation. **Annulla ultima
   applicazione** restores the preceding profile if neither it nor its source
   proposal has changed. Reloading the proposal also retrieves the latest eligible
   undo action. Missing evidence means retain the profile and collect more data,
   not approve all profiles in bulk.

The proposal starts from the stored ordinary profile (including metadata-derived
profiles). Missing values must first be generated through ordinary generation;
this workflow does not fill them from sparse descriptions. No provider is called.

`curated_review_v1` is an experimental editorial policy, not a statistically
calibrated estimator. Reviewed intensity bands are explicitly listed in
`sensory_review_workflow.py`: Testamatta acidity/tannin and Roche Calcaire acidity
0.55–0.85; Roche Calcaire dryness 0–0.15; Loimer acidity 0.35–0.70 and dryness
0–0.20; Vin de Constance body 0.60–0.90. These are policy assumptions interpreting
descriptions, not numbers reported by sources. Compatible values are retained
exactly; outliers are proposed at the nearest boundary, never a universal midpoint.
Other supported descriptions can be attached without changing the number.
Monte Bello body is explicitly blocked because its dossier contains disagreement.

The seven-wine regression group checks consistency of this policy using controlled
input profiles; it is not an independent accuracy benchmark and does not establish
that corrections improve real tasting accuracy. Testamatta's existing acidity
0.6936 and tannin 0.644 are retained. Auto-generation is not switched to this policy.

GET `.../references/profiles/{id}/proposal`, POST `.../{id}/apply`, and POST
`.../{id}/undo/{history_id}` require application administrator context. Selection
and acknowledgement are server-validated. A revision covers the complete stored
profile, curated dossier and policy; stale proposals fail without writes.
Application stores selected source summaries as `documentary_evidence`, explicitly
separate from verbatim quotation fields. Partial provenance preserves legacy
weights for unselected dimensions; selected confidence and overall confidence
are capped at 0.45 as a conservative policy weight, not measured accuracy.
Application sets `validated=false`; approval never certifies sensory measurement.

Snapshots and audit information use existing `SharedWineFact` rows under the
isolated `sensory_review_history` feature with unique operation keys. They record
the full preceding dimensions, provenance, source, model, confidence and approval,
the exact proposal and actor. Undo restores that state and records its actor.
No household inventory rows are read or changed and no schema migration is needed.

Checks: `pytest tests/test_sensory_review_workflow.py tests/test_sensory_references.py`
and `npx playwright test e2e/sensory-workflow.spec.ts e2e/sensory-references.spec.ts
e2e/sensory-profiles.spec.ts`.

## Documentary reference pilot

In administration → wine sensory profiles, **Riferimenti documentati e
rivalidazione** opens a curated fifteen-wine pilot. Load the preview, inspect each
source and comparison, then select dossiers to import. This uses no paid AI.
The initial wines are Monte Bello 2022, Riesling Roche Calcaire 2022, Esporão
Reserva Red 2022, Cloudy Bay Sauvignon Blanc 2024, Vin de Constance 2020,
Testamatta 2018 and Loimer Kamptal DAC Grüner Veltliner 2024.
Remaining research candidates are not represented as verified references.

The second batch adds Bollinger La Grande Année 2015, Domaines Ott Château de
Selle Rosé 2023, Disznókő Tokaji Aszú 5 Puttonyos 2017, Ridge Estate Chardonnay
2022, Catena Malbec 2022, Château Musar Rosé 2017, Louis Roederer Cristal 2016
and Domaine Sigalas Santorini 2022. This covers 11 countries and five styles:
red, white, rosé, sparkling and sweet. The original seven dossiers are unchanged,
so their existing imports do not acquire content conflicts from this expansion.
Catena is deliberately a technical-only dossier: its chemistry and barrel aging
do not authorize sensory updates. Ridge Chardonnay preserves conflicting body
and acidity descriptions. Champagne dosage is distinguished from residual sugar.

### Reproducible offline comparison

From `backend/`, run:

```text
python -m scripts.evaluate_sensory_references --output data/reference-report
pytest tests/test_sensory_reference_evaluation.py tests/test_sensory_references.py tests/test_sensory_review_workflow.py
```

Open `data/reference-report/report.html`; `report.json` includes every dimension,
source URL, evidence status, recommendation and the source-bundle checksum.
The script creates an isolated in-memory database, invokes the actual ordinary
inference and guided-proposal services, and disposes it afterward. It never reads
server profiles, changes production data or calls an AI provider. Its controlled
input uses only the existing wine-type fallback, without grape, appellation or
region baselines. Therefore it is not a comparison against actual cellar profiles
or a complete evaluation of all ordinary generation paths.

Results for the 2026-10-08 bundle: 15 wines, 135 traits; 57 retain their fallback
value with a linked description, one receives an editorial correction, and 77
remain blocked. The sole numerical proposal is Vin de Constance body 0.52 → 0.60,
the nearest boundary of the existing experimental band. Evidence statuses are
59 described, three conflicting, three context-only and 70 missing. Two described
traits are nevertheless blocked by the existing policy. No new numerical bands
were introduced to force more corrections.

All 15 references are documentary only. None provides a matched sensory panel
with comparable measured intensities, so calibration eligibility is zero and
accuracy is explicitly unmeasurable. More notes improve traceability and expose
disagreement; these counts do not demonstrate better numerical predictions.

Admin next steps: deploy this bundle, open the reference preview, import desired
new dossiers, then use **Esamina riscontri** on the exact wine and vintage.
Review only useful descriptions and corrections; leave unsupported traits for
later evidence. Ordinary generation remains the operational default. Extending
automatic numerical correction requires a separately evaluated sensory dataset
or structured tastings on a shared scale, not more editorial bands alone.

Each wine in the profile list now has **Esamina riscontri**. The read-only,
application-admin endpoint `GET /api/v1/taste-profile/admin/references/profiles/{identity_id}`
compares its current nine values against the currently shipped curated dossier,
even before import. Matching requires exact normalized name, producer and vintage;
missing dossiers retain all current values with nine explicit no-evidence entries.
This reads the curated bundle, not live websites or an AI provider. Imported
editions remain unchanged when a new curated edition is shipped.

Per-trait editorial assessments distinguish a documented description, conflicting
descriptions, contextual information and missing evidence. Each assessment cites
its actual publisher, source URL and note date when available. These statuses
describe the evidence, not the accuracy of the baseline number. Numerical
validation remains `not_validated` for every trait. Import records all cited
publishers, without counting republished reviews as independent confirmations.

Testamatta 2018 is the first detailed example: body descriptions disagree;
aromatic intensity, dryness classification and barrel aging provide insufficient
support for a numeric intensity. Fruit, acidity, tannin, spice and mineral
descriptions are retained with their sources. No automatic 0.25/0.75 mapping or
profile update is performed. Earlier imports without the optional assessment
field remain recognized; genuine content changes continue to produce conflicts.

Previous manual approvals are historical decisions, not evidence of accuracy.
The pilot counts all existing profiles as requiring evidence review, including
previously approved profiles. It preserves their values and historical flags;
it does not silently reset approvals or claim to have revalidated them.
Matching dossiers show the nine current dimensions alongside qualitative
observations and missing evidence. Analytical acidity, residual sugar, and
production methods are not converted into 0–1 sensory intensities.

Application-admin-only GET/POST `/api/v1/taste-profile/admin/references` previews
and imports selected server-owned dossiers. Imports require a current preview
revision. Unknown selections, ambiguous names, changed dossiers and stale
previews are rejected; repeated imports are idempotent. Conflicts require
catalog identity/source review before proceeding, without automatic merging.
No household inventory records or numeric profiles are written.

The version-controlled seed is `backend/app/services/sensory_reference_seed.json`.
Sources were editorially checked on the displayed date, not fetched live during
import. Each dossier records attribution, analytical units, observations and
limitations. It is stored as a `SharedWineFact` with feature `sensory_reference`,
outside the automatic shared-feature application pipeline. Existing tables
support this payload, so no schema migration is needed. Updating a seed dossier
does not overwrite an imported edition; the preview reports a conflict.

This is a documentary foundation, not a calibrated worldwide benchmark or a
completed revalidation workflow. Further batches, independent tasting evidence
and an evaluated calibration method are needed before changing generation.
Kaggle's noncommercial dataset and synthetic Oenra notes are excluded. Public
producer pages are cited with brief editorial summaries; no open license for
their full text is asserted.

Targeted checks:
`pytest tests/test_sensory_references.py` and
`npx playwright test e2e/sensory-references.spec.ts e2e/sensory-profiles.spec.ts`.

## Ordinary generation and retained research

Paid experimental sensory research is suspended by default
(`WINE_SENSORY_RESEARCH_ENABLED=false`). This blocks new legacy agent runs,
new Astra refinement runs, and paid work reached by queued workers. The admin
panel hides the Astra action and explains the suspension. Existing runs remain
readable. `WINE_SENSORY_AI_ENABLED` independently controls ordinary generation;
baseline blending, metadata completion, and manual validation remain available.
The detailed research workflow below documents the retained experimental code,
which requires explicit operator reactivation after evaluation.

Recover qualitative information from an already-paid response without calling
OpenAI or modifying the database:

```text
cd backend
python -m scripts.review_sensory_log "path/to/Pasted text.txt" --output data/sensory-reviews/review.html
```

This reads public HTML/PDF sources and writes an HTML report plus a JSON report.
It retains each verified, vintage-attributed quotation independently and reports
blocked/unmatched sources. Numeric estimates and model rationales are excluded.
Sources are checked at review time; this cannot reconstruct the original server
fetches or missing provider source metadata. Reports under `backend/data/` are
local artifacts and remain untracked. Italian fruit descriptors include more,
mirtilli, lamponi, fragole and ribes; English “more” alone is not a fruit signal.

The admin panel offers “Genera mancanti con AI” for missing profiles and
“Genera profilo con AI” for an individual identity. Existing metadata and
baselines are used first. When insufficient, AI attempts metadata enrichment
before direct sensory inference. Single-wine errors appear beside the action.

“Cerca vino, produttore o annata” searches the full shared profile catalog,
including missing profiles when that filter is selected. Press Enter or
“Applica filtri” to restart from page one. “Precedenti” and “Successivi” navigate
pages of 30 wines; the count beside “Profili vino” is the current page size.

Baseline generation respects complete, valid grape percentages (using the midpoint
for ranges). Otherwise it weights the distinct varieties equally. The grape blend
has one fixed overall weight, so listing more grapes does not overwhelm the
appellation baseline. Existing profiles are not automatically recalculated.

For one wine in the active household, “Approfondisci con Astra” performs an
optional vintage-specific web search using OPENAI_SENSORY_REFINEMENT_MODEL
(default gpt-6-astra). It uses the normal AI credits and audit system, up to five
search tool calls, and may take several minutes. It is never triggered by batch
generation. The separate autonomous-agent panel has been retired.

Refinement runs in the API background after a short HTTP 202 response. The UI
polls short status requests every two seconds, retrying transient connection or
gateway errors without resubmitting the paid research. The run ID is kept in the
browser until the proposal is applied or discarded, so refreshing or reopening
the panel restores the result. Only the requesting user in the active household
can retrieve the stored proposal. Repeated submissions for the same active run
reuse it; only one refinement runs per user and household at a time.

Runs interrupted by an API restart are marked failed after 15 minutes and are
not automatically retried. This uses the existing FastAPI background-task
mechanism, not a separate durable worker queue. Deploy migration
`0116_sensory_refinement` with `alembic upgrade head` before using the updated UI.
No increase to the Nginx request timeout is needed for this asynchronous flow.

The server checks wine identity, vintage, public source documents and sensory
quotations. Accepted continuous numerical estimates are model interpretations,
not measurements or verified numerical intensities. The editor displays their
reasons, sources and interpretative ranges; the numbers are not forced to
descriptor anchors such as 0.25 or 0.75. Unsupported traits retain their previous
values. No usable evidence means no profile update, although completed provider
usage is still billed. The response shows the actual model and charged cost.

Research is available for manual and validated profiles too. It returns a
proposal without changing or invalidating the current shared profile. The editor
compares current and proposed values; “Scarta proposta” discards the proposal,
while “Applica proposta” explicitly saves the selected editor values as a manual
revision, with the administrator's validation choice. Changes during research or
between research and applying the proposal block saving and require a fresh
analysis. Creating a profile for a missing identity also requires explicit
application. Historical agent results and
APIs remain available for compatibility. The old synchronous refinement endpoint
is retained for compatibility; the updated UI uses the asynchronous endpoints.

Preview and batch generation also include shared identities whose original
cellar wine has been removed or renamed. Their name, producer, and vintage
provide the AI context; generation does not insert a replacement cellar wine.

The backend requires WINE_SENSORY_AI_ENABLED=true and a configured application
OpenAI key. Local regression checks:

```text
cd backend
.venv/Scripts/python.exe -m pytest tests/test_taste_profiles.py tests/test_sensory_refinement.py tests/test_sensory_refinement_jobs.py tests/test_sensory_refinement_migration.py
cd ../frontend
npx.cmd playwright test e2e/sensory-profiles.spec.ts
npm.cmd run build
```
