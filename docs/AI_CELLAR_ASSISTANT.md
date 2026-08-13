# AI cellar assistant

Vinaris exposes a private, household-scoped assistant that converts a natural-language
consumption note into a controlled cellar operation. The first supported operation is the
consumption of exactly one bottle, optionally including a tasting date, note, occasion, and a
score on the user's original scale.

Example:

> Ieri a cena ho bevuto una bottiglia di Ornellaia 2015 ed era eccellente, 9 su 10! Aggiorna la cantina.

The assistant uses `gpt-5.6-luna` with reasoning effort `none` and strict structured output only
to interpret the message. Wine matching, authorization, stock changes, and tasting persistence
remain deterministic application operations. The model never receives database IDs and cannot
directly write to the database.

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

## API

- `POST /api/v1/ai/cellar-commands` interprets a command and may execute it when safe.
- `POST /api/v1/ai/cellar-commands/{command_id}/execute` confirms a selected wine.
- `POST /api/v1/ai/cellar-commands/{command_id}/undo` restores the previous stock state and removes
  the tasting created by that command.

The frontend exposes the workflow under **Assistente AI**. Set
`OPENAI_CELLAR_COMMAND_MODEL=gpt-5.6-luna` and apply Alembic migration
`0093_cellar_ai_commands` before deployment.
