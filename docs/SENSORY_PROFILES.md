# Sensory profile generation

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

The server checks wine identity, vintage, public source documents and sensory
quotations. Accepted continuous numerical estimates are model interpretations,
not measurements or verified numerical intensities. The editor displays their
reasons, sources and interpretative ranges; the numbers are not forced to
descriptor anchors such as 0.25 or 0.75. Unsupported traits retain their previous
values. No usable evidence means no profile update, although completed provider
usage is still billed. The response shows the actual model and charged cost.

Usable estimates are saved to the shared profile as unvalidated and opened for
review. Manual or validated profiles cannot be overwritten by this operation;
changes made during research also block saving. Historical agent results and
APIs remain available for compatibility. No database migration is required.

Preview and batch generation also include shared identities whose original
cellar wine has been removed or renamed. Their name, producer, and vintage
provide the AI context; generation does not insert a replacement cellar wine.

The backend requires WINE_SENSORY_AI_ENABLED=true and a configured application
OpenAI key. Local regression checks:

```text
cd backend
.venv/Scripts/python.exe -m pytest tests/test_taste_profiles.py tests/test_sensory_refinement.py
cd ../frontend
npx.cmd playwright test e2e/sensory-profiles.spec.ts
npm.cmd run build
```
