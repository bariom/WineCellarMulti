import { FormEvent, useEffect, useRef, useState } from "react";
import { AppIcon } from "../components/AppIcon";
import { api } from "../services/api";
import type {
  CellarCommandCatalogCandidate,
  CellarCommandPurchaseDraft,
  CellarCommandResult,
  Locale,
  WineLabelEnrichment,
} from "../types";
import "./CellarAssistantView.css";
import "./CellarAssistantVoice.css";

type VoiceRecognitionResult = {
  isFinal: boolean;
  length: number;
  [index: number]: { transcript: string };
};

type VoiceRecognitionEvent = {
  resultIndex: number;
  results: { length: number; [index: number]: VoiceRecognitionResult };
};

type VoiceRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  processLocally?: boolean;
  onstart: (() => void) | null;
  onresult: ((event: VoiceRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type VoiceRecognitionConstructor = {
  new (): VoiceRecognition;
  available?: (options: { langs: string[]; processLocally: boolean }) => Promise<string>;
  install?: (options: { langs: string[]; processLocally: boolean }) => Promise<boolean>;
};

function browserVoiceRecognition(): VoiceRecognitionConstructor | null {
  const voiceWindow = window as typeof window & {
    SpeechRecognition?: VoiceRecognitionConstructor;
    webkitSpeechRecognition?: VoiceRecognitionConstructor;
  };
  return voiceWindow.SpeechRecognition || voiceWindow.webkitSpeechRecognition || null;
}

type CellarAssistantViewProps = {
  locale: Locale;
  disabled?: boolean;
  onCellarChanged: () => Promise<void> | void;
  onPreparePurchase: (draft: CellarCommandPurchaseDraft) => void;
};

export default function CellarAssistantView({
  locale,
  disabled = false,
  onCellarChanged,
  onPreparePurchase,
}: CellarAssistantViewProps) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<CellarCommandResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const [voicePreparing, setVoicePreparing] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState("");
  const recognitionRef = useRef<VoiceRecognition | null>(null);
  const voiceTimeoutRef = useRef<number | null>(null);
  const finalTranscriptRef = useRef("");
  const voiceSupported = Boolean(browserVoiceRecognition());
  const isItalian = locale === "it";
  const consumptionExample = isItalian
    ? "Ieri a cena ho bevuto una bottiglia di Ornellaia 2015 ed era eccellente, 9 su 10! Aggiorna la cantina."
    : "Yesterday at dinner I drank a bottle of Ornellaia 2015. It was excellent, 9 out of 10. Update my cellar.";
  const purchaseExample = isItalian
    ? "Ho acquistato 6 bottiglie di Sassicaia 2021 da Enoteca Pinchiorri a 245 CHF ciascuna. Aggiungile alla cantina."
    : "I bought 6 bottles of Sassicaia 2021 from Enoteca Pinchiorri at CHF 245 each. Add them to my cellar.";

  useEffect(() => () => {
    recognitionRef.current?.abort();
    if (voiceTimeoutRef.current !== null) window.clearTimeout(voiceTimeoutRef.current);
  }, []);

  function voiceErrorMessage(code: string) {
    if (code === "not-allowed" || code === "service-not-allowed") {
      return isItalian ? "Consenti l’accesso al microfono per usare la dettatura." : "Allow microphone access to use dictation.";
    }
    if (code === "no-speech") return isItalian ? "Non ho rilevato la voce. Riprova." : "No speech was detected. Try again.";
    if (code === "audio-capture") return isItalian ? "Microfono non disponibile." : "Microphone unavailable.";
    if (code === "network") return isItalian ? "Il servizio vocale del browser non è raggiungibile." : "The browser voice service is unavailable.";
    return isItalian ? "Dettatura non riuscita. Puoi continuare con la tastiera." : "Dictation failed. You can continue with the keyboard.";
  }

  function appendVoiceTranscript(transcript: string) {
    const cleaned = transcript.trim();
    if (!cleaned) return;
    setText((current) => [current.trim(), cleaned].filter(Boolean).join(" ").slice(0, 2000));
  }

  function runVoiceRecognition(Recognition: VoiceRecognitionConstructor, processLocally: boolean) {
    const recognition = new Recognition();
    let retryWithBrowserService = false;
    recognition.lang = locale === "it" ? "it-IT" : "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    if ("processLocally" in recognition) recognition.processLocally = processLocally;
    finalTranscriptRef.current = "";
    recognition.onstart = () => {
      setListening(true);
      setVoiceMessage(isItalian ? "Ti ascolto…" : "Listening…");
    };
    recognition.onresult = (event) => {
      let interimTranscript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript || "";
        if (result.isFinal) finalTranscriptRef.current += `${transcript} `;
        else interimTranscript += transcript;
      }
      if (interimTranscript.trim()) {
        setVoiceMessage(`${isItalian ? "Ti ascolto" : "Listening"}: ${interimTranscript.trim()}`);
      }
    };
    recognition.onerror = (event) => {
      if (processLocally && event.error === "language-not-supported") {
        retryWithBrowserService = true;
        setVoiceMessage(isItalian ? "Lingua locale non disponibile; uso il servizio vocale del browser…" : "Local language unavailable; using the browser voice service…");
        return;
      }
      setVoiceMessage(voiceErrorMessage(event.error));
    };
    recognition.onend = () => {
      if (retryWithBrowserService) {
        recognitionRef.current = null;
        if (voiceTimeoutRef.current !== null) window.clearTimeout(voiceTimeoutRef.current);
        voiceTimeoutRef.current = null;
        runVoiceRecognition(Recognition, false);
        return;
      }
      const transcript = finalTranscriptRef.current;
      appendVoiceTranscript(transcript);
      setListening(false);
      recognitionRef.current = null;
      if (voiceTimeoutRef.current !== null) {
        window.clearTimeout(voiceTimeoutRef.current);
        voiceTimeoutRef.current = null;
      }
      if (transcript.trim()) {
        setVoiceMessage(isItalian ? "Testo aggiunto. Controllalo prima di continuare." : "Text added. Review it before continuing.");
      }
    };
    recognitionRef.current = recognition;
    recognition.start();
    voiceTimeoutRef.current = window.setTimeout(() => recognition.stop(), 45_000);
  }

  async function startVoiceInput() {
    const Recognition = browserVoiceRecognition();
    if (!Recognition || disabled || busy || voicePreparing) return;
    setVoicePreparing(true);
    setError("");
    setVoiceMessage(isItalian ? "Preparo il microfono…" : "Preparing microphone…");
    const language = locale === "it" ? "it-IT" : "en-US";
    let processLocally = false;
    if (Recognition.available && Recognition.install) {
      try {
        const availability = await Recognition.available({ langs: [language], processLocally: true });
        if (availability === "available") {
          processLocally = true;
        } else if (availability === "downloadable" || availability === "downloading") {
          setVoiceMessage(isItalian ? "Installazione della lingua sul dispositivo…" : "Installing the on-device language…");
          processLocally = await Recognition.install({ langs: [language], processLocally: true });
        }
      } catch {
        processLocally = false;
      }
    }
    try {
      runVoiceRecognition(Recognition, processLocally);
    } catch {
      setListening(false);
      setVoiceMessage(isItalian ? "Il microfono non può essere avviato. Usa la tastiera." : "The microphone could not start. Use the keyboard.");
    } finally {
      setVoicePreparing(false);
    }
  }

  function stopVoiceInput() {
    recognitionRef.current?.stop();
  }

  async function preparePurchase(
    purchaseDraft: CellarCommandPurchaseDraft,
    catalogCandidate?: CellarCommandCatalogCandidate,
  ) {
    if (catalogCandidate) {
      onPreparePurchase({
        ...purchaseDraft,
        ...catalogCandidate,
        lookup_source: "catalog",
        catalog_entry_id: catalogCandidate.catalog_entry_id,
        vintage: purchaseDraft.vintage,
        quantity: purchaseDraft.quantity,
        price: purchaseDraft.price,
        currency: purchaseDraft.currency,
        merchant: purchaseDraft.merchant,
        order_date: purchaseDraft.order_date,
      });
      return;
    }
    if (purchaseDraft.lookup_source === "catalog") {
      onPreparePurchase(purchaseDraft);
      return;
    }
    const label = [purchaseDraft.producer, purchaseDraft.name, purchaseDraft.vintage]
      .map((value) => value.trim())
      .filter(Boolean)
      .join(" ");
    const enrichment = await api<WineLabelEnrichment>("/api/v1/ai/wine-label/enrich", {
      method: "POST",
      body: JSON.stringify({ label, locale, source: "manual" }),
    });
    onPreparePurchase({
      ...purchaseDraft,
      name: enrichment.name || purchaseDraft.name,
      producer: enrichment.producer || purchaseDraft.producer,
      vintage: purchaseDraft.vintage || enrichment.vintage,
      format: purchaseDraft.format,
      region: enrichment.region || purchaseDraft.region,
      appellation: enrichment.appellation || purchaseDraft.appellation,
      type: enrichment.type || purchaseDraft.type,
      country: enrichment.country || purchaseDraft.country,
      grapes_text: enrichment.grapes_text || purchaseDraft.grapes_text,
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim() || busy || disabled || listening) return;
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
      if (
        next.purchase_draft
        && (next.status === "draft_ready" || next.status === "ai_research_required")
      ) {
        await preparePurchase(next.purchase_draft);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to process command");
    } finally {
      setBusy(false);
    }
  }

  async function selectCatalogCandidate(candidate: CellarCommandCatalogCandidate) {
    if (!result?.purchase_draft || busy) return;
    setBusy(true);
    setError("");
    try {
      await preparePurchase(result.purchase_draft, candidate);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to prepare wine record");
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
            ? "Racconta cosa hai bevuto o acquistato: Vinaris identifica il vino e prepara l’aggiornamento corretto."
            : "Describe what you drank or purchased: Vinaris identifies the wine and prepares the correct update."}</span>
        </div>
      </header>

      <form className="cellar-assistant-composer" onSubmit={submit}>
        <label htmlFor="cellar-assistant-command">{isItalian ? "Cosa è successo in cantina?" : "What happened in your cellar?"}</label>
        <div className={`cellar-assistant-voice-input${listening ? " is-listening" : ""}`}>
          <textarea
            id="cellar-assistant-command"
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={2000}
            rows={5}
            disabled={disabled || busy}
            placeholder={purchaseExample}
          />
          {voiceSupported ? (
            <button
              type="button"
              className={`cellar-assistant-microphone${listening ? " is-listening" : ""}`}
              onClick={listening ? stopVoiceInput : () => void startVoiceInput()}
              disabled={disabled || busy || voicePreparing}
              aria-pressed={listening}
              aria-label={listening ? (isItalian ? "Ferma dettatura" : "Stop dictation") : (isItalian ? "Detta il comando" : "Dictate command")}
              title={listening ? (isItalian ? "Ferma dettatura" : "Stop dictation") : (isItalian ? "Parla" : "Speak")}
            >
              <span aria-hidden="true">🎙</span>
              {listening
                ? (isItalian ? "Ferma" : "Stop")
                : voicePreparing
                  ? (isItalian ? "Preparo…" : "Preparing…")
                  : (isItalian ? "Parla" : "Speak")}
            </button>
          ) : null}
        </div>
        {voiceMessage ? <p className="cellar-assistant-voice-status" aria-live="polite">{voiceMessage}</p> : null}
        <div>
          <span className="cellar-assistant-examples">
            <button type="button" className="secondary compact" onClick={() => setText(purchaseExample)} disabled={busy}>
              {isItalian ? "Esempio acquisto" : "Purchase example"}
            </button>
            <button type="button" className="secondary compact" onClick={() => setText(consumptionExample)} disabled={busy}>
              {isItalian ? "Esempio bevuta" : "Consumption example"}
            </button>
          </span>
          <button type="submit" disabled={disabled || busy || listening || !text.trim()}>
            <AppIcon name="glass-sparkle" variant="ai" />
            {busy ? (isItalian ? "Elaborazione…" : "Processing…") : (isItalian ? "Interpreta e aggiorna" : "Interpret and update")}
          </button>
        </div>
        <small>{isItalian
          ? voiceSupported
            ? "Puoi parlare o scrivere. Il browser gestisce la dettatura; Vinaris riceve soltanto il testo e non conserva audio. Controlla sempre la trascrizione."
            : "La dettatura non è disponibile in questo browser. Inserisci il comando con la tastiera."
          : voiceSupported
            ? "Speak or type. Your browser handles dictation; Vinaris receives text only and stores no audio. Always review the transcript."
            : "Dictation is unavailable in this browser. Enter the command with the keyboard."}</small>
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
          {result.purchase_draft ? (
            <dl>
              <div><dt>{isItalian ? "Vino" : "Wine"}</dt><dd>{[result.purchase_draft.producer, result.purchase_draft.name, result.purchase_draft.vintage].filter(Boolean).join(" · ")}</dd></div>
              <div><dt>{isItalian ? "Quantità" : "Quantity"}</dt><dd>{result.purchase_draft.quantity}</dd></div>
              {result.purchase_draft.price !== null ? <div><dt>{isItalian ? "Prezzo unitario" : "Unit price"}</dt><dd>{result.purchase_draft.price} {result.purchase_draft.currency}</dd></div> : null}
              {result.purchase_draft.merchant ? <div><dt>{isItalian ? "Rivenditore" : "Merchant"}</dt><dd>{result.purchase_draft.merchant}</dd></div> : null}
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
          {result.catalog_candidates.length ? (
            <div className="cellar-assistant-candidates">
              {result.catalog_candidates.map((candidate) => (
                <button type="button" className="secondary" key={candidate.catalog_entry_id} onClick={() => void selectCatalogCandidate(candidate)} disabled={busy}>
                  <span><strong>{candidate.name}</strong><small>{[candidate.producer, candidate.region, candidate.appellation].filter(Boolean).join(" · ")}</small></span>
                  <b>{isItalian ? "Usa" : "Use"}</b>
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
