# Sensory profile generation

The admin panel offers “Genera mancanti con AI” for missing profiles and
“Genera profilo con AI” for an individual identity. Existing metadata and
baselines are used first. When insufficient, AI attempts metadata enrichment
before direct sensory inference. Single-wine errors appear beside the action.

Preview and batch generation also include shared identities whose original
cellar wine has been removed or renamed. Their name, producer, and vintage
provide the AI context; generation does not insert a replacement cellar wine.

The backend requires WINE_SENSORY_AI_ENABLED=true and a configured application
OpenAI key. Local regression checks:

```text
cd backend
.venv/Scripts/python.exe -m pytest tests/test_taste_profiles.py
cd ../frontend
npx.cmd playwright test e2e/sensory-profiles.spec.ts
npm.cmd run build
```
