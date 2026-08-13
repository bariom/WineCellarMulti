# AI cellar assistant

Vinaris exposes a private, household-scoped assistant that converts natural language into a
controlled cellar workflow. It supports consuming exactly one bottle and preparing a reviewed
wine-acquisition draft.

Example:

> Ieri a cena ho bevuto una bottiglia di Ornellaia 2015 ed era eccellente, 9 su 10! Aggiorna la cantina.

The assistant uses `gpt-5.6-luna` with reasoning effort `none` and strict structured output only
to interpret the message. Wine matching, authorization, stock changes, and tasting persistence
remain deterministic application operations. The model never receives database IDs and cannot
directly write to the database.

For commands such as “Ho acquistato”, “Ho comprato”, or “Aggiungi”, Vinaris extracts the wine,
quantity and any stated purchase details. It searches the shared catalog first. A clear catalog
match pre-fills the normal wine editor; ambiguous matches require a selection. When the catalog has
no match, the existing AI wine-name research fills complementary data. In every case the wine is
created only when the user reviews the editor and submits it.

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
`OPENAI_CELLAR_COMMAND_MODEL=gpt-5.6-luna` and apply Alembic migration
`0093_cellar_ai_commands` before deployment.

Set `CELLAR_AI_ASSISTANT_ENABLED=false` to disable the assistant globally for regular users.
Application administrators retain access for testing and operations, and the backend rejects direct
cellar-command API calls from non-admin users while the flag is disabled.
