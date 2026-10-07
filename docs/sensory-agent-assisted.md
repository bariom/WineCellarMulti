# Assisted sensory profile agent

The agent is available to application administrators in the sensory profile settings panel. Start a research run, choose wines and a credit budget, review the evidence and **Values that will be used**, then explicitly apply an eligible proposal. A research run does not modify wine profiles. Applying a proposal leaves it unvalidated. Manual and validated profiles remain protected.

This release describes the **expected wine style at release**, not the condition of a particular bottle today. Body means perceived palate weight; tannin means perceived astringency intensity; sweetness means perceived palate sweetness; aromatic intensity means nose strength. Fruit, oak and spice describe the prominence of those sensory families. Minerality describes explicitly reported mineral or saline sensations, not a chemical measurement.

Research reserves both passes, including search context, tool calls and the most expensive configured fallback model. When the normal reservation exceeds the remaining run budget, both enforced response limits adapt from 12,000 down to a minimum of 4,096 tokens per pass. Search limits and source verification remain unchanged. The run stops before a paid request if that minimum is still unaffordable; a one-dollar budget is not a guarantee for every model, price book or credit markup configuration.

## What gets applied

New runs use an autonomous OpenAI Responses tool loop (`wine.sensory_autonomous` v1,
result contract v12). The agent chooses searches, reads discovered HTML/PDF sources,
submits candidate profiles for server review, receives failed-check feedback and can
repair its evidence before concluding. Unsupported dimensions remain unknown rather
than being filled with nine forced inferences. Applying a supported partial proposal
retains the existing fallback for its gaps. The existing approval flow protects manual
and validated profiles. Set `WINE_SENSORY_AUTONOMOUS_ENABLED=false` to use the previous
two-pass researcher; `OPENAI_SENSORY_AGENT_MODEL` selects the autonomous model (default
`gpt-6.1-sol`). Model/account availability must be checked on deployment.

Each research is bounded to eight model turns, eight web tool calls and twelve public
documents, with a cost check before every provider request. Every completed provider
step is billed/audited, including malformed or weak results; unused reservations are
reused for subsequent wines. Paid checked drafts survive interruption. Step metadata
contains tool names and cost, never full prompts, arguments or reasoning. The agent
can return a partial draft when the budget runs out. These bounds do not guarantee
that a one-dollar budget will cover a multi-step investigation under every price book.

Contract v12 excludes explicitly labelled drinking windows and publication dates from
vintage-conflict checks, while bare years and other wine/vintage headings still block
attribution. Quotes must still match actual source text. Review confidence is an
editorial evidence-support score; reliability must be measured against independent
expert profiles using the evaluation procedure below.

Research prompt `wine.sensory_research` version 11 and completion prompt `wine.sensory_completion` version 7 retain nine research estimates. Application uses a separate, deterministic policy:

- A quotation must occur in a readable public source. Its `attribution_excerpt` must be a real contiguous heading or sentence identifying producer, cuvée and applicable vintage or edition, before and within 3,000 normalized characters of the quotation. Intervening conflicting years or editions reject exact applicability. This conservative check can reject valid documents; it does not prove an author's accuracy.
- A documented identity is required. An edition-specific NV wine is not dated by its base harvest. For example, Krug 170ème and the harvest of 2014 must not become a vintage-2014 identity. Edition-specific descriptions may support its style without confirming the supplied numeric vintage. No user metadata is silently corrected.
- Only direct, checked intensity descriptors normalized with `verified_descriptor_v2` can replace a baseline. Qualitative descriptions, context, blocked sources, donor wines and free model inferences remain research information.
- Firm tannins alone describe texture. Explicit full/high tannins can support amount. Pepper/gingerbread, crushed rock and “corposo” are recognized in the relevant sensory families; recognizing a family does not automatically assign intensity.
- A single-source or style change exceeding **0.20** on the 0–1 scale retains the previous value and is marked for further review. This is an operational guard, not an accuracy threshold. Independent corroboration can permit a larger change; conflicts retain baseline.
- With an existing unvalidated profile, fallback retains its values and provenance. Without a profile, fallback uses the existing deterministic metadata generator. Unsupported dimensions without a fallback remain unavailable, never zero. No supported updates means no apply action.
- The server recalculates the preview while applying. Changed values, provenance confidence, validation or identity reject stale proposals. Research cannot overwrite manual or validated profiles.

Stored reports from versions 1–10 remain readable, but must be researched again before application. Their quotations did not require the new attribution contract. No database migration is needed: application previews and provenance use existing JSON fields.

## Recommendations and learning

Profiles with per-dimension provenance use that dimension's confidence. Unsupported or missing confidence does not borrow confidence from another trait. Zero-confidence dimensions are excluded from wine/wishlist matching and personal preference learning. Matching weights supported dimensions by their own evidence support. Legacy profiles without provenance retain their existing global confidence behavior. Wine Detail still displays the recorded sensory profile; lack of evidence is not equivalent to a zero sensory intensity.

These evidence-support weights are editorial, not calibrated probabilities. Existing personal profiles are recalculated through the existing rebuild flow; this change does not silently rebuild production data.

## Offline evaluation

Run from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m app.services.sensory_evaluation tests/fixtures/sensory_agent_pilot.json
```

The pilot fixture transcribes the four supplied before/agent numeric profiles. It has **no expert ratings** and only one historical agent run per wine. Its assisted prediction is the retained baseline because those legacy reports cannot be applied under version 11. It is not a run of the new agent and must not be used to claim its accuracy. The recorded output is `docs/sensory-agent-pilot-evaluation.json`: insufficient evidence, no measured MAE and no automatic rollout.

For a real evaluation, create a JSON list with this shape (anonymous case/reviewer IDs; no tokens or prompts):

```json
[
  {
    "case_id": "wine-001",
    "category": "Red",
    "target": "expected_at_release",
    "experts": [
      { "reviewer_id": "taster-a", "profile": { "dimensions": { "body": 0.75 } } },
      { "reviewer_id": "taster-b", "profile": { "dimensions": { "body": 0.70 } } }
    ],
    "predictions": {
      "baseline": [{ "dimensions": { "body": 0.68 } }],
      "agent": [{ "dimensions": { "body": 0.75 }, "ranges": { "body": [0.60, 0.90] } }],
      "assisted": [{ "dimensions": { "body": 0.75 } }]
    }
  }
]
```

Use all nine dimensions where reference ratings exist. For new research, take `agent` values/ranges from `complete_profile` and `assisted` values from `application.dimensions`; preserve the frozen baseline. Repeat the agent research three times without selecting the most favorable result. Raters use the same anchored scale, assess the same target and do not see method labels. Two documents or two model calls are not two expert reviewers. A tasting today of an aged bottle is not a release-style reference.

The evaluator reports paired per-trait/category MAE, error rate at 0.25 or larger, reference coverage, repeated-run spread, expert disagreement and interpretative-range coverage. Range coverage does not imply statistical calibration. Conservative evaluation criteria require 50 independently reviewed wines, five wines in each category (Red, White, Rose, Sparkling, Sweet, Fortified), 30 paired comparisons per trait and three runs per method for 50 wines. Assisted MAE must improve by at least 0.02, large errors and coverage must not regress, mean repeat spread must be at most 0.10, and category/per-trait MAE must not regress by more than 0.02. These are operational pilot criteria, not a statistical proof of superiority.

A passed sensory evaluation still does **not** activate automation. Before replacing the current generator, also compare preference predictions on held-out user experiences and record actual credit costs, failures and latency on the evaluated categories. Assisted use remains available while that evidence is collected.

## Targeted verification

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_sensory_agent.py tests/test_sensory_assisted.py tests/test_sensory_attribution.py tests/test_sensory_evaluation.py tests/test_sensory_matching.py tests/test_sensory_descriptors.py tests/test_sensory_relevance.py tests/test_sensory_documents.py tests/test_sensory_parallel.py tests/test_sensory_sources.py tests/test_taste_profiles.py
cd ../frontend
$env:Path = "C:\ERI\node;$env:Path" # Use C:\Program Files\nodejs on newer installations.
npx.cmd playwright test e2e/sensory-agent.spec.ts e2e/sensory-profiles.spec.ts e2e/taste-profile.spec.ts --output=test-results/sensory-assisted
npm.cmd run build
```

The assisted preview has mobile overflow/geometry checks at 360, 390 and 430 pixels plus a desktop check. Review its actual 390 × 844 and desktop screenshots before accepting visual changes. No visual baseline update is implied by this release.
