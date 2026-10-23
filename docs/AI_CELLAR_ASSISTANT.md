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

## More actions on a wine

Besides one tasting, the assistant understands (prompt v16), always as a proposal to confirm:

- several bottles drunk on one occasion ("abbiamo bevuto 2 bottiglie di Barolo"): one tasting,
  the other bottles taken out with it;
- bottles given away or broken ("ho regalato…", "si è rotta…"): stock goes down as a
  complimentary or breakage movement, with no tasting;
- bottles moved to a named storage place ("sposta il Barolo nel frigo vini"): the place is matched
  among the cellar's locations and bins, and an unknown name lists the existing ones;
- a rating or note without drinking ("dai 5 stelle al Barolo", "aggiungi una nota al Chianti: …"),
  also for wines already finished.

Undo restores each of them: bottles go back into their purchase lots and storage (this also fixes
undoing a tasting, which used to restore the wine's count only), a move restores the previous
places, and a rating restores the previous rating and notes.

## Several actions in one message

"Ho bevuto il Barolo e ho ordinato 6 Sassicaia 2021 da Arvi" describes two operations. The
interpreter (prompt `cellar.command_interpretation` v15) extracts the first and returns the others
as standalone sentences (`other_actions`, at most four), which the response exposes as
`follow_up_texts`. The app sends each as its own command and shows one card per operation, each
confirmed (or completed in the wine editor) on its own; with several cards an acquisition opens its
wine record from a button instead of automatically. A single-operation message costs no extra call.

## Questions about the cellar

The assistant also answers free questions such as "Quali vini sono al picco?", "Quanto ho speso
in Champagne quest'anno?" or "Cosa ho bevuto con Marco?". A message ending with `?`, or opening
like a question or a request to be told something ("Mi puoi dire…", "Dimmi", "Mostrami", "Quali",
"Quanti", "Show me"…, since dictation adds no question mark), goes straight to
`POST /api/v1/ai/cellar-assistant/ask`; any other message is first interpreted as a command and falls
back to the question endpoint when it is not a supported action. The command interpreter itself
treats requests for information as unsupported, even when they mention buying or drinking.

The question endpoint runs a short tool loop (at most six steps) with the economy model
(`gpt-6-luna`) without reasoning, for speed. When Luna cannot answer — it runs out of steps, returns nothing usable or marks the
answer `complete: false` — the same question is retried once with the balanced model
(`gpt-6.1-sol`) with low reasoning and the response reports `escalated: true`. Both attempts are charged and audited.
The model never reads the database directly: it calls read-only tools in
`app/services/cellar_assistant.py` — `search_wines`, `cellar_summary`, `drinking_plan`,
`deliveries`, `tasting_history`, `taste_profile`, `wishlist` and `purchases` — that read only the
active household, apply the user's wine visibility, omit database IDs and return at most 25 rows.
They include purchase prices, personal notes, cellar locations and tasting companions, as agreed
with the product owner. Shared positions (co-owned wines) carry the user's share and bottles,
computed as in the cellar list's ownership filter: `search_wines` filters them with `ownership`,
and `cellar_summary` groups by `ownership` and totals the user's own bottles and value. Nothing is written: asked to change the cellar, the assistant explains how
to describe the action instead. The client sends the last ten turns of the open conversation so
follow-up questions keep their meaning; nothing is stored server side beyond the AI audit entries.

## Food pairings

"Che cosa apro con un salmì di cervo?" is answered in the conversation (and aloud in voice mode):
the assistant (prompt `cellar.assistant` v4) calls its `suggest_pairing` tool, which runs the
Sommelier AI pairing on the cellar with the user's taste profile and drinking windows, and answers
with its matches instead of picking wines itself. The full pairing comes back in the answer
(`pairing_dish`, `pairing`, with its cost included in the request's), so "Vedi nel Sommelier AI"
opens the pairing view on that result, at home and without a new call.

Pairings are kept quick. A clear pairing question ("cosa apro / che vino bevo / abbino … con / al
…", "vino per …", "what should I open with …") skips the assistant model and calls the Sommelier
directly: one call to the economy model without reasoning, on at most 15 cellar candidates and with
no market or dish suggestions; the answer is composed from its result. When the assistant itself
calls `suggest_pairing`, the answer is likewise composed without another call. Only wines within the
budget are sent: a budget in the question ("sotto i 40 franchi") wins, otherwise the one set in the
Sommelier AI, which the app remembers on the device and sends as `pairing_max_price_chf`.

## Safety and behavior

- Only active wines belonging to the current household and having available stock are candidates.
- Every change is shown first and saved only when the user confirms it: a single clear match shows
  the wine with a "Conferma" button (a named wishlist likewise), ambiguous matches list the
  candidates to choose from. A confirmed update can still be undone.
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

## Voice conversation

"Conversazione a voce" turns the assistant into a hands-free loop: it listens, sends what was said
(no Continue tap), reads the answer aloud and listens again once it has finished speaking, so the
microphone does not hear the answer. When a card waits for confirmation the spoken proposal ends with
"Di' sì per confermare o no per lasciar stare": "sì", "conferma", "ok"… confirm it (a single wine or
list, or a whole batch), "no", "lascia stare"… drop the card, anything else is a new message.
"basta", "fine" or "stop" end the conversation, as do two silent turns or a microphone error. Every
change still needs that confirmation, which is why sending without a tap is safe. It uses the
browser's own recognition and speech synthesis: no audio is uploaded or stored by Vinaris. Mobile
browsers may stop restarting the microphone without a tap; the toggle then simply ends.

## Reading answers aloud

Each assistant answer has a speaker button, and the option "Leggi le risposte ad alta voce" reads
new answers and command outcomes automatically. Both use the browser's own speech synthesis
(`speechSynthesis`) in the app language, preferring an on-device voice: there is no AI cost and no
audio leaves the device. The option is remembered in this browser only. Mobile Safari speaks only
after a tap, so sending a message with the option on unlocks speech for the answer. Browsers without
speech synthesis show no speaker controls.
