# AI cellar assistant

Vinaris exposes a private, household-scoped assistant that converts natural language into a
controlled cellar workflow. It supports consuming exactly one bottle and preparing a reviewed
wine-acquisition draft.

Example:

> Ieri a cena ho bevuto una bottiglia di Ornellaia 2015 ed era eccellente, 9 su 10! Aggiorna la cantina.

The assistant uses `gpt-6-luna` with reasoning effort `none` and strict structured output only
to interpret the message. Wine matching, authorization, stock changes, and tasting persistence
remain deterministic application operations. The model never receives database IDs and cannot
directly write to the database.

For commands such as “Ho acquistato”, “Ho comprato”, or “Aggiungi”, Vinaris extracts the wine,
quantity and any stated purchase details. It searches the shared catalog first. A clear catalog
match pre-fills the normal wine editor; ambiguous matches require a selection. When the catalog has
no match, the existing AI wine-name research fills complementary data. In every case the wine is
created only when the user reviews the editor and submits it.

For example, `Ho ordinato una cassa di Sassicaia 2022 da Arvi` prepares six bottles with status
`Ordered` and merchant `Arvi`. A case means six bottles unless the command explicitly states a
different bottle count per case. `Ho acquistato` or `Ho comprato` prepares status `Delivered`
(`In cantina` in Italian).

`Mi hanno spedito le bottiglie di Sassicaia 2015` checks the active cellar for a matching wine in
status `Ordered`, then updates it to `Shipped`. If no ordered position matches, Vinaris proposes a
new order instead of creating a duplicate automatically.

`Aggiungi Bricco dell'Uccellone 2024 alla wishlist Rossi` adds an evaluation item to the exact
named wishlist. If that wishlist does not exist, Vinaris presents the household's existing lists
for the user to choose.

## Questions about the cellar

The assistant also answers free questions such as "Quali vini sono al picco?", "Quanto ho speso
in Champagne quest'anno?" or "Cosa ho bevuto con Marco?". A message ending with `?` goes straight
to `POST /api/v1/ai/cellar-assistant/ask`; any other message is first interpreted as a command and
falls back to the question endpoint when it is not a supported action.

The question endpoint runs a short tool loop (at most six steps) with the economy model
(`gpt-6-luna`). When Luna cannot answer — it runs out of steps, returns nothing usable or marks the
answer `complete: false` — the same question is retried once with the balanced model
(`gpt-6.1-sol`) and the response reports `escalated: true`. Both attempts are charged and audited.
The model never reads the database directly: it calls read-only tools in
`app/services/cellar_assistant.py` — `search_wines`, `cellar_summary`, `drinking_plan`,
`deliveries`, `tasting_history`, `taste_profile`, `wishlist` and `purchases` — that read only the
active household, apply the user's wine visibility, omit database IDs and return at most 25 rows.
They include purchase prices, personal notes, cellar locations and tasting companions, as agreed
with the product owner. Nothing is written: asked to change the cellar, the assistant explains how
to describe the action instead. The client sends the last ten turns of the open conversation so
follow-up questions keep their meaning; nothing is stored server side beyond the AI audit entries.

## Safety and behavior

- Only active wines belonging to the current household and having available stock are candidates.
- An unambiguous explicit command is executed automatically; ambiguous matches require the user
  to select a candidate.
- A tasting score is stored as both `score_value` and `score_scale`, so `9/10` is not converted to
  the legacy six-point rating.
- The client-generated request UUID makes retries idempotent.
- Every command stores its source text, model, estimated cost, matched wine, and execution state.
- A completed command can be undone while the affected stock has not changed again.
- Unsupported or non-explicit messages never alter the cellar.
- Acquisition commands never create a wine directly from AI output.

## API

- `POST /api/v1/ai/cellar-commands` interprets a command and may execute it when safe.
- `POST /api/v1/ai/cellar-commands/{command_id}/execute` confirms a selected wine.
- `POST /api/v1/ai/cellar-commands/{command_id}/undo` restores the previous stock state and removes
  the tasting created by that command.

The frontend exposes the workflow under **Assistente AI**. Set
`OPENAI_CELLAR_COMMAND_MODEL=gpt-6-luna` and apply Alembic migration
`0093_cellar_ai_commands` before deployment.

The assistant is a Vinaris Riserva feature: on the free tier every assistant endpoint answers
402 before any AI call, even with AI credit available, and the app shows a Riserva card instead
of the assistant. Subscribers, ambassadors, app administrators and demo cellars keep access; the
session exposes this as `cellar_ai_assistant_subscribed`. AI usage is still charged to the
user's key or credit as for every other AI feature.

Set `CELLAR_AI_ASSISTANT_ENABLED=false` to disable the assistant globally for regular users.
Application administrators retain access for testing and operations, and the backend rejects direct
cellar-command API calls from non-admin users while the flag is disabled.

## Voice input

The assistant composer progressively enables free browser speech recognition. It prefers on-device
recognition and the user's Italian or English language pack when supported. If local recognition is
unavailable, it may use the browser's own speech service; Vinaris does not upload or store an audio
recording. The resulting transcript is appended to the editable command field and is never submitted
automatically. Recognition stops after one utterance or 45 seconds.

Browsers without `SpeechRecognition` or `webkitSpeechRecognition` receive the unchanged keyboard
experience and make no audio or transcription request. There is intentionally no paid transcription
fallback.
