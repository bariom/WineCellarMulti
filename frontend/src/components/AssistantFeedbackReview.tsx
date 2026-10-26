import { useEffect, useState } from "react";
import type { Locale } from "../types";
import { api } from "../services/api";

type Feedback = { id: string; rating: "up" | "down"; question: string; answer: string; comment: string; model: string; tools_used: string[]; created_at: string };

/**
 * The thumbs users gave to the cellar assistant: the answers to improve first,
 * with what was asked, so prompts can be fixed on real questions.
 */
export default function AssistantFeedbackReview({ locale }: { locale: Locale }) {
  const it = locale === "it";
  const [rating, setRating] = useState<"" | "up" | "down">("down");
  const [items, setItems] = useState<Feedback[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setError("");
    api<Feedback[]>(`/api/v1/ai/cellar-assistant/feedback${rating ? `?rating=${rating}` : ""}`)
      .then((next) => { if (!cancelled) setItems(next); })
      .catch((nextError) => { if (!cancelled) setError(nextError instanceof Error ? nextError.message : "Unable to load feedback"); });
    return () => { cancelled = true; };
  }, [rating]);

  return <div className="assistant-feedback-review">
    <div className="assistant-feedback-filters" role="group" aria-label={it ? "Filtra i giudizi" : "Filter feedback"}>
      {([["down", it ? "👎 Da migliorare" : "👎 To improve"], ["up", it ? "👍 Utili" : "👍 Helpful"], ["", it ? "Tutti" : "All"]] as const).map(([value, label]) => (
        <button key={value || "all"} type="button" className={rating === value ? "" : "secondary"} aria-pressed={rating === value} onClick={() => setRating(value)}>{label}</button>
      ))}
    </div>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {items === null && !error ? <p role="status">{it ? "Caricamento…" : "Loading…"}</p> : null}
    {items?.length === 0 ? <p className="empty-state">{it ? "Nessun giudizio per ora." : "No feedback yet."}</p> : null}
    {items?.length ? <ol className="assistant-feedback-list">
      {items.map((item) => <li key={item.id} className={`is-${item.rating}`}>
        <header>
          <span aria-label={item.rating === "up" ? (it ? "Utile" : "Helpful") : (it ? "Da migliorare" : "To improve")}>{item.rating === "up" ? "👍" : "👎"}</span>
          <strong>{item.question || "—"}</strong>
          <small>{new Date(item.created_at).toLocaleString(it ? "it-CH" : "en-CH")} · {item.model}{item.tools_used.length ? ` · ${item.tools_used.join(", ")}` : ""}</small>
        </header>
        {item.comment ? <p className="assistant-feedback-comment">“{item.comment}”</p> : null}
        <details><summary>{it ? "Risposta data" : "Answer given"}</summary><p>{item.answer}</p></details>
      </li>)}
    </ol> : null}
  </div>;
}
