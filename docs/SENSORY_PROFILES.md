# Sensory profile generation

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
