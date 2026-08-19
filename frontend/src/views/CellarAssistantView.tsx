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
import "./CellarAssistantStrategy.css";

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
  onOpenWishlist: () => void;
};

export default function CellarAssistantView({
  locale,
  disabled = false,
  onCellarChanged,
  onPreparePurchase,
  onOpenWishlist,
}: CellarAssistantViewProps) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<CellarCommandResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const [voicePreparing, setVoicePreparing] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const recognitionRef = useRef<VoiceRecognition | null>(null);
  const voiceTimeoutRef = useRef<number | null>(null);
  const finalTranscriptRef = useRef("");
  const resultRef = useRef<HTMLElement | null>(null);
  const errorRef = useRef<HTMLParagraphElement | null>(null);
  const voiceSupported = Boolean(browserVoiceRecognition());
  const isItalian = locale === "it";
  const consumptionExample = isItalian
    ? "Ieri a cena ho bevuto una bottiglia di Ornellaia 2015 ed era eccellente, 9 su 10! Aggiorna la cantina."
    : "Yesterday at dinner I drank a bottle of Ornellaia 2015. It was excellent, 9 out of 10. Update my cellar.";
  const purchaseExample = isItalian
    ? "Ho acquistato 6 bottiglie di Sassicaia 2021 da Enoteca Pinchiorri a 245 CHF ciascuna. Aggiungile alla cantina."
    : "I bought 6 bottles of Sassicaia 2021 from Enoteca Pinchiorri at CHF 245 each. Add them to my cellar.";
  const orderExample = isItalian
    ? "Ho ordinato una cassa di Sassicaia 2022 da Arvi. Registrala come ordinata."
    : "I ordered a case of Sassicaia 2022 from Arvi. Register it as ordered.";
  const wishlistExample = isItalian
    ? "Aggiungi Barolo 2021 alla wishlist Rossi, prezzo massimo 100 franchi."
    : "Add Barolo 2021 to wishlist Rossi, maximum price CHF 100.";
  const strategyExample = isItalian
    ? "Considera Arcadia Brut da bere."
    : "Mark Arcadia Brut for drinking.";
  const strategyPurposeLabel = (purpose: string) => ({
    drink: isItalian ? "Da bere" : "For drinking",
    maturation: isItalian ? "Da maturare" : "For maturation",
    investment: isItalian ? "Investimento" : "Investment",
    special_occasion: isItalian ? "Occasione speciale" : "Special occasion",
    undecided: isItalian ? "Da decidere" : "Undecided",
  }[purpose] || purpose);
  const applyExample = (example: string) => {
    setText(example);
    setError("");
    setResult(null);
    setHelpOpen(false);
  };
  const purchaseStatusLabel = (status: string) => {
    if (status === "Delivered") return isItalian ? "In cantina" : "In cellar";
    if (status === "Ordered") return isItalian ? "Ordinato" : "Ordered";
    return status;
  };
  const requestCostLabel = (cost: number | string) => {
    const value = Number(cost || 0);
    const formatted = Number.isFinite(value)
      ? value.toLocaleString(locale === "it" ? "it-CH" : "en-US", { maximumFractionDigits: 6 })
      : "0";
    return `${isItalian ? "Costo" : "Cost"}: $${formatted}`;
  };

  useEffect(() => () => {
    recognitionRef.current?.abort();
    if (voiceTimeoutRef.current !== null) window.clearTimeout(voiceTimeoutRef.current);
  }, []);

  useEffect(() => {
    if (!window.matchMedia("(max-width: 820px)").matches || (!result && !error)) return;
    const target = result ? resultRef.current : errorRef.current;
    if (!target) return;
    const frame = window.requestAnimationFrame(() => {
      target.focus({ preventScroll: true });
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [error, result]);

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
      } else {
        setVoiceMessage(isItalian ? "Dettatura fermata." : "Dictation stopped.");
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
    setListening(false);
    setVoiceMessage(isItalian ? "Dettatura fermata." : "Dictation stopped.");
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
        status: purchaseDraft.status,
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

  async function selectWishlistList(wishlistListId: string) {
    if (!result || busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await api<CellarCommandResult>(
        `/api/v1/ai/cellar-commands/${result.command_id}/wishlist`,
        { method: "POST", body: JSON.stringify({ wishlist_list_id: wishlistListId }) },
      );
      setResult(next);
      await onCellarChanged();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to add wishlist item");
    } finally {
      setBusy(false);
    }
  }

  async function prepareMissingShipment() {
    if (!result?.purchase_draft || busy) return;
    setBusy(true);
    setError("");
    try {
      await preparePurchase(result.purchase_draft);
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

  async function executeBulkStrategy() {
    if (!result || busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await api<CellarCommandResult>(
        `/api/v1/ai/cellar-commands/${result.command_id}/execute`,
        { method: "POST", body: JSON.stringify({ confirm_all: true }) },
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
      <div className="cellar-assistant-card">
      <div className="cellar-assistant-layout">
      <div className="cellar-assistant-main">
      <header className="cellar-assistant-hero">
        <span className="cellar-assistant-icon"><AppIcon name="glass-sparkle" variant="ai" detailLevel="rich" /></span>
        <div>
          <p>{isItalian ? "Azioni guidate" : "Guided actions"}</p>
          <div className="cellar-assistant-title-row"><h1 id="cellar-assistant-title">{isItalian ? "Assistente Cantina AI" : "AI Cellar Assistant"}</h1><button type="button" className="secondary compact cellar-assistant-help-button" onClick={() => setHelpOpen(true)} aria-label={isItalian ? "Come funziona l'assistente AI" : "How the AI assistant works"}>?</button></div>
          <span>{isItalian
            ? "Racconta cosa hai bevuto, acquistato o deciso per le bottiglie: Vinaris prepara l’aggiornamento corretto."
            : "Describe what you drank, purchased, or decided for your bottles: Vinaris prepares the correct update."}</span>
        </div>
      </header>

      {helpOpen ? <div className="cellar-assistant-help-overlay" role="presentation" onClick={() => setHelpOpen(false)}><section className="cellar-assistant-help" role="dialog" aria-modal="true" aria-labelledby="cellar-assistant-help-title" onClick={(event) => event.stopPropagation()}><header><div><p>{isItalian ? "GUIDA RAPIDA" : "QUICK GUIDE"}</p><h2 id="cellar-assistant-help-title">{isItalian ? "Cosa può fare l’assistente" : "What the assistant can do"}</h2></div><button type="button" className="secondary compact" onClick={() => setHelpOpen(false)} aria-label={isItalian ? "Chiudi" : "Close"}>×</button></header><p className="cellar-assistant-help-intro">{isItalian ? "Scegli un esempio per inserirlo nel comando e personalizzarlo." : "Choose an example to place it in the command field and customize it."}</p><div className="cellar-assistant-help-examples"><button type="button" onClick={() => applyExample(consumptionExample)}><strong>{isItalian ? "Bevuta" : "Drinking"}</strong><span>{isItalian ? "Registra nota e voto su scala 6." : "Record notes and a six-point score."}</span></button><button type="button" onClick={() => applyExample(purchaseExample)}><strong>{isItalian ? "Acquisto" : "Purchase"}</strong><span>{isItalian ? "Aggiunge bottiglie o un nuovo lotto." : "Adds bottles or a new purchase lot."}</span></button><button type="button" onClick={() => applyExample(orderExample)}><strong>{isItalian ? "Ordine" : "Order"}</strong><span>{isItalian ? "Registra lo stato ordinato; spedizioni aggiornano ordini esistenti." : "Records an order; shipments update existing orders."}</span></button><button type="button" onClick={() => applyExample(wishlistExample)}><strong>Wishlist</strong><span>{isItalian ? "Salva un vino da valutare con prezzo target." : "Save a wine to evaluate with a target price."}</span></button><button type="button" onClick={() => applyExample(strategyExample)}><strong>Intelligence</strong><span>{isItalian ? "Assegna bottiglie a consumo, maturazione, investimento o occasioni speciali." : "Assign bottles to drinking, maturation, investment, or special occasions."}</span></button></div><ul>{isItalian ? <li>Controlla sempre la proposta prima della conferma: l’assistente non modifica nulla senza il tuo OK.</li> : <li>Always review the proposal: nothing changes without your confirmation.</li>}</ul></section></div> : null}

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
        <div className="cellar-assistant-composer-footer">
          <small id="cellar-assistant-continue-help">
            {isItalian ? "Interpreta il testo e prepara il prossimo aggiornamento della cantina." : "Interpret the text and prepare the next cellar update."}
          </small>
          <button type="submit" disabled={disabled || busy || listening || !text.trim()} aria-describedby="cellar-assistant-continue-help">
            <AppIcon name="glass-sparkle" variant="ai" />
            {busy ? (isItalian ? "Elaborazione…" : "Processing…") : (isItalian ? "Continua" : "Continue")}
          </button>
        </div>
        {voiceMessage ? <p className={`cellar-assistant-voice-status${listening ? " is-listening" : ""}`} aria-live="polite">{voiceMessage}</p> : null}
        <small>{isItalian
          ? voiceSupported
            ? "Puoi parlare o scrivere. Il browser gestisce la dettatura; Vinaris riceve soltanto il testo e non conserva audio. Controlla sempre la trascrizione."
            : "La dettatura non è disponibile in questo browser. Inserisci il comando con la tastiera."
          : voiceSupported
            ? "Speak or type. Your browser handles dictation; Vinaris receives text only and stores no audio. Always review the transcript."
            : "Dictation is unavailable in this browser. Enter the command with the keyboard."}</small>
      </form>

      {error ? <p ref={errorRef} className="cellar-assistant-error" role="alert" tabIndex={-1}>{error}</p> : null}

      {result ? (
        <article ref={resultRef} className={`cellar-assistant-result status-${result.status}`} aria-live="polite" tabIndex={-1}>
          <header>
            <AppIcon name={result.status === "executed" ? "status-delivered" : "glass-sparkle"} variant={result.status === "executed" ? "status" : "ai"} />
            <div><strong>{result.message}</strong>{result.model ? <small>{result.model} · {requestCostLabel(result.estimated_cost_usd)}</small> : null}</div>
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
              <div><dt>{isItalian ? "Stato" : "Status"}</dt><dd>{purchaseStatusLabel(result.purchase_draft.status)}</dd></div>
              {result.purchase_draft.price !== null ? <div><dt>{isItalian ? "Prezzo unitario" : "Unit price"}</dt><dd>{result.purchase_draft.price} {result.purchase_draft.currency}</dd></div> : null}
              {result.purchase_draft.merchant ? <div><dt>{isItalian ? "Rivenditore" : "Merchant"}</dt><dd>{result.purchase_draft.merchant}</dd></div> : null}
            </dl>
          ) : null}
          {result.strategy_purpose ? (
            <dl>
              <div><dt>{isItalian ? "Obiettivo" : "Objective"}</dt><dd>{strategyPurposeLabel(result.strategy_purpose)}</dd></div>
              {result.strategy_quantity !== null ? <div><dt>{isItalian ? "Bottiglie" : "Bottles"}</dt><dd>{result.strategy_quantity}</dd></div> : null}
            </dl>
          ) : null}
          {result.candidates.length ? (
            <div className="cellar-assistant-candidates">
              {result.candidates.map((candidate) => (
                result.strategy_bulk ? <div className="cellar-assistant-candidate-preview" key={candidate.wine_id}>
                  <span><strong>{candidate.name} {candidate.vintage}</strong><small>{[candidate.producer, candidate.format].filter(Boolean).join(" · ")}</small></span>
                  <b>{candidate.unit_value} {candidate.currency}<small>{candidate.value_source === "purchase" ? (isItalian ? "Prezzo d’acquisto" : "Purchase price") : (isItalian ? "Valore attuale" : "Current value")}</small></b>
                </div> : <button type="button" className="secondary" key={candidate.wine_id} onClick={() => void execute(candidate.wine_id)} disabled={busy}>
                  <span><strong>{candidate.name}</strong><small>{[candidate.producer, candidate.vintage, candidate.format].filter(Boolean).join(" · ")}</small></span>
                  <b>{candidate.quantity} {isItalian ? "bott." : "btl."}</b>
                </button>
              ))}
              {result.strategy_bulk ? <button type="button" onClick={() => void executeBulkStrategy()} disabled={busy}>{isItalian ? "Conferma tutti come da bere" : "Confirm all for drinking"}</button> : null}
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
          {result.wishlist_lists.length ? (
            <div className="cellar-assistant-candidates">
              {result.wishlist_lists.map((wishlistList) => (
                <button type="button" className="secondary" key={wishlistList.wishlist_list_id} onClick={() => void selectWishlistList(wishlistList.wishlist_list_id)} disabled={busy}>
                  <span><strong>{wishlistList.name}</strong><small>{isItalian ? "Aggiungi a questa wishlist" : "Add to this wishlist"}</small></span>
                  <b>{isItalian ? "Scegli" : "Choose"}</b>
                </button>
              ))}
            </div>
          ) : null}
          {result.intent === "add_to_wishlist" && result.status === "executed" ? (
            <button type="button" className="secondary" onClick={onOpenWishlist}>
              {isItalian ? "Apri wishlist e completa i dati" : "Open wishlist and complete details"}
            </button>
          ) : null}
          {result.intent === "ship_wine" && result.status === "not_found" && result.purchase_draft ? (
            <button type="button" className="secondary" onClick={() => void prepareMissingShipment()} disabled={busy}>
              {isItalian ? "Aggiungi come nuovo ordine" : "Add as a new order"}
            </button>
          ) : null}
          {result.status === "executed" ? <button type="button" className="secondary compact" onClick={() => void undo()} disabled={busy}>{isItalian ? "Annulla aggiornamento" : "Undo update"}</button> : null}
        </article>
      ) : null}
      </div>
      <aside className="cellar-assistant-sidekick" aria-hidden="true">
        <div className="cellar-assistant-sidekick-card">
          <div className="cellar-assistant-sidekick-heading">
            <span><AppIcon name="glass-sparkle" variant="ai" detailLevel="rich" />{isItalian ? "Assistente AI" : "AI Assistant"}</span>
            <strong>{isItalian ? "Il tuo assistente cantina integrato" : "Your integrated cellar assistant"}</strong>
          </div>
          <div className="cellar-assistant-sidekick-illustration">
            <img className="cellar-assistant-hero-illustration" src="/images/assistant-ai-sommelier.png" alt="" />
          </div>
        </div>
      </aside>
      </div>
      </div>
    </section>
  );
}
