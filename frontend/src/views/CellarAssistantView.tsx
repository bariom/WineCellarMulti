import { FormEvent, useState } from "react";
import { AppIcon } from "../components/AppIcon";
import { api } from "../services/api";
import type { CellarCommandResult, Locale } from "../types";
import "./CellarAssistantView.css";

type CellarAssistantViewProps = {
  locale: Locale;
  disabled?: boolean;
  onCellarChanged: () => Promise<void> | void;
};

export default function CellarAssistantView({
  locale,
  disabled = false,
  onCellarChanged,
}: CellarAssistantViewProps) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<CellarCommandResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isItalian = locale === "it";
  const example = isItalian
    ? "Ieri a cena ho bevuto una bottiglia di Ornellaia 2015 ed era eccellente, 9 su 10! Aggiorna la cantina."
    : "Yesterday at dinner I drank a bottle of Ornellaia 2015. It was excellent, 9 out of 10. Update my cellar.";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim() || busy || disabled) return;
    setBusy(true);
    setError("");
    try {
      const next = await api<CellarCommandResult>("/api/v1/ai/cellar-commands", {
        method: "POST",
        body: JSON.stringify({
          request_id: crypto.randomUUID(),
          text: text.trim(),
          locale,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Zurich",
        }),
      });
      setResult(next);
      if (next.status === "executed") await onCellarChanged();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to process command");
    } finally {
      setBusy(false);
    }
  }

  async function execute(wineId: string) {
    if (!result || busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await api<CellarCommandResult>(
        `/api/v1/ai/cellar-commands/${result.command_id}/execute`,
        { method: "POST", body: JSON.stringify({ wine_id: wineId }) },
      );
      setResult(next);
      await onCellarChanged();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to execute command");
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    if (!result || busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await api<CellarCommandResult>(
        `/api/v1/ai/cellar-commands/${result.command_id}/undo`,
        { method: "POST" },
      );
      setResult(next);
      await onCellarChanged();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to undo command");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="cellar-assistant-view" aria-labelledby="cellar-assistant-title">
      <header className="cellar-assistant-hero">
        <span className="cellar-assistant-icon"><AppIcon name="glass-sparkle" variant="ai" detailLevel="rich" /></span>
        <div>
          <p>{isItalian ? "Vinaris · GPT-5.6 Luna" : "Vinaris · GPT-5.6 Luna"}</p>
          <h1 id="cellar-assistant-title">{isItalian ? "Assistente Cantina AI" : "AI Cellar Assistant"}</h1>
          <span>{isItalian
            ? "Racconta cosa hai bevuto: Vinaris identifica la bottiglia e aggiorna quantità e degustazione."
            : "Describe what you drank: Vinaris identifies the bottle and updates quantity and tasting history."}</span>
        </div>
      </header>

      <form className="cellar-assistant-composer" onSubmit={submit}>
        <label htmlFor="cellar-assistant-command">{isItalian ? "Cosa è successo in cantina?" : "What happened in your cellar?"}</label>
        <textarea
          id="cellar-assistant-command"
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={2000}
          rows={5}
          disabled={disabled || busy}
          placeholder={example}
        />
        <div>
          <button type="button" className="secondary compact" onClick={() => setText(example)} disabled={busy}>
            {isItalian ? "Usa l’esempio" : "Use example"}
          </button>
          <button type="submit" disabled={disabled || busy || !text.trim()}>
            <AppIcon name="glass-sparkle" variant="ai" />
            {busy ? (isItalian ? "Elaborazione…" : "Processing…") : (isItalian ? "Interpreta e aggiorna" : "Interpret and update")}
          </button>
        </div>
        <small>{isItalian
          ? "L’AI interpreta il testo. La ricerca e la modifica avvengono soltanto nella cantina attiva."
          : "AI interprets the text. Search and changes are restricted to the active cellar."}</small>
      </form>

      {error ? <p className="cellar-assistant-error" role="alert">{error}</p> : null}

      {result ? (
        <article className={`cellar-assistant-result status-${result.status}`} aria-live="polite">
          <header>
            <AppIcon name={result.status === "executed" ? "status-delivered" : "glass-sparkle"} variant={result.status === "executed" ? "status" : "ai"} />
            <div><strong>{result.message}</strong>{result.model ? <small>{result.model}</small> : null}</div>
          </header>
          {result.tasting ? (
            <dl>
              {result.tasting.consumed_at ? <div><dt>{isItalian ? "Data" : "Date"}</dt><dd>{result.tasting.consumed_at}</dd></div> : null}
              {result.tasting.note ? <div><dt>{isItalian ? "Nota" : "Note"}</dt><dd>{result.tasting.note}</dd></div> : null}
              {result.tasting.score_value !== null && result.tasting.score_scale ? <div><dt>{isItalian ? "Punteggio" : "Score"}</dt><dd>{result.tasting.score_value}/{result.tasting.score_scale}</dd></div> : null}
              {result.tasting.occasion ? <div><dt>{isItalian ? "Occasione" : "Occasion"}</dt><dd>{result.tasting.occasion}</dd></div> : null}
            </dl>
          ) : null}
          {result.candidates.length ? (
            <div className="cellar-assistant-candidates">
              {result.candidates.map((candidate) => (
                <button type="button" className="secondary" key={candidate.wine_id} onClick={() => void execute(candidate.wine_id)} disabled={busy}>
                  <span><strong>{candidate.name}</strong><small>{[candidate.producer, candidate.vintage, candidate.format].filter(Boolean).join(" · ")}</small></span>
                  <b>{candidate.quantity} {isItalian ? "bott." : "btl."}</b>
                </button>
              ))}
            </div>
          ) : null}
          {result.status === "executed" ? <button type="button" className="secondary compact" onClick={() => void undo()} disabled={busy}>{isItalian ? "Annulla aggiornamento" : "Undo update"}</button> : null}
        </article>
      ) : null}
    </section>
  );
}
