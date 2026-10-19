import { useState } from "react";
import type { RestaurantWineListQuestionPayload, RestaurantWineListQuestionResult, RestaurantWineListScanResult } from "../types";

// Each exchange adds two turns; only the latest eight are sent back as context.
const maxTurns = 16;

type Turn = { role: "user" | "assistant"; content: string; wines?: number[] };

/**
 * Follow-up questions about wines already read from a photo (a restaurant list
 * or a shop shelf). Remount it with a new `key` when a new photo is analysed.
 */
export function WineListChat({
  locale,
  canGenerateAi,
  wines,
  dish,
  maxPriceChf,
  ignorePreferences,
  setting,
  suggestions,
  scope,
  onAsk,
}: {
  locale: "it" | "en";
  canGenerateAi: boolean;
  wines: RestaurantWineListScanResult["wines"];
  dish: string;
  maxPriceChf: string;
  ignorePreferences: boolean;
  setting: "restaurant" | "shop";
  suggestions: string[];
  scope: string;
  onAsk: (payload: RestaurantWineListQuestionPayload) => Promise<RestaurantWineListQuestionResult>;
}) {
  const it = locale === "it";
  const [conversation, setConversation] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [error, setError] = useState("");

  async function ask(text: string) {
    const trimmed = text.trim();
    if (trimmed.length < 2 || pendingQuestion) return;
    setError("");
    setPendingQuestion(trimmed);
    setQuestion("");
    try {
      const result = await onAsk({
        question: trimmed,
        wines,
        history: conversation.slice(-8).map(({ role, content }) => ({ role, content: content.slice(0, 1500) })),
        dish: dish.trim(),
        max_price_chf: maxPriceChf.trim() || null,
        ignore_preferences: ignorePreferences,
        setting,
      });
      setConversation((current) => [...current, { role: "user", content: trimmed }, { role: "assistant", content: result.answer, wines: result.referenced_indexes }]);
    } catch (nextError) {
      setQuestion(trimmed);
      setError(nextError instanceof Error ? nextError.message : (it ? "Non è stato possibile rispondere." : "The question could not be answered."));
    } finally {
      setPendingQuestion("");
    }
  }

  const busy = Boolean(pendingQuestion);
  return <section className="restaurant-wine-list-chat" aria-labelledby={`wine-list-chat-title-${setting}`}>
    <div className="restaurant-wine-list-chat-heading"><h4 id={`wine-list-chat-title-${setting}`}>{it ? "Chiedi al sommelier" : "Ask the sommelier"}</h4><span>{scope}</span></div>
    {conversation.length || pendingQuestion ? <ol className="restaurant-wine-list-chat-log" aria-live="polite">
      {conversation.map((turn, index) => <li key={index} className={`is-${turn.role}`}><p>{turn.content}</p>{turn.wines?.length ? <ul>{turn.wines.map((wineIndex) => { const wine = wines[wineIndex]; return wine ? <li key={wineIndex}>{[wine.name, wine.vintage, wine.price_text].filter(Boolean).join(" · ")}</li> : null; })}</ul> : null}</li>)}
      {pendingQuestion ? <><li className="is-user"><p>{pendingQuestion}</p></li><li className="is-assistant is-pending"><p>{it ? "Il sommelier sta valutando…" : "The sommelier is thinking…"}</p></li></> : null}
    </ol> : <div className="restaurant-wine-list-chat-suggestions">{suggestions.map((suggestion) => <button type="button" className="secondary compact" key={suggestion} disabled={!canGenerateAi || busy} onClick={() => void ask(suggestion)}>{suggestion}</button>)}</div>}
    {conversation.length < maxTurns ? <form className="restaurant-wine-list-chat-form" onSubmit={(event) => { event.preventDefault(); void ask(question); }}>
      <input value={question} maxLength={500} onChange={(event) => setQuestion(event.target.value)} placeholder={it ? "Es. quale si conserva più a lungo?" : "E.g. which one will age longer?"} aria-label={it ? "Domanda per il sommelier" : "Question for the sommelier"} disabled={!canGenerateAi || busy} />
      <button type="submit" disabled={!canGenerateAi || busy || question.trim().length < 2}>{it ? "Chiedi" : "Ask"}</button>
    </form> : <small>{it ? "Hai raggiunto il limite di domande: avvia una nuova analisi per continuare." : "You have reached the question limit: start a new analysis to continue."}</small>}
    {error ? <p className="restaurant-wine-list-error" role="alert">{error}</p> : null}
  </section>;
}
