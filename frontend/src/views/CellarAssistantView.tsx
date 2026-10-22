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
import { AssistantAnswer } from "../components/AssistantAnswer";
import { primeSpeech, speak, speechSupported, stopSpeaking } from "../utils/speech";

const READ_ALOUD_KEY = "vinaris.assistant.read-aloud";

// Openings of a question or a request to be told something. The lookahead replaces
// \b, which does not work after accented letters such as "c'è" or "perché".
const QUESTION_OPENING = /^(mi\s+(puoi|potresti|sai)\s+(dire|mostrare|elencare|indicare|ricordare)|dimmi|mostrami|elencami|elenca|fammi\s+vedere|quali|quale|quanti|quante|quanto|cosa|che\s+cosa|chi|dove|quando|perch[eé]|c['’]?\s*è|ci\s+sono|ho\s+ancora|what|which|how|when|where|who|why|show\s+me|list|tell\s+me|can\s+you\s+(tell|show|list)|do\s+i|did\s+i|have\s+i|is\s+there|are\s+there)(?=[\s,.!:;]|$)/i;

/** A question for the assistant rather than a cellar action, with or without "?". */
function isQuestion(text: string) {
  const trimmed = text.trim();
  return trimmed.endsWith("?") || QUESTION_OPENING.test(trimmed);
}

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
  /** A question asked elsewhere (the home ask bar), sent as soon as the view opens. */
  initialQuestion?: { id: number; text: string } | null;
};

export default function CellarAssistantView({
  locale,
  disabled = false,
  onCellarChanged,
  onPreparePurchase,
  onOpenWishlist,
  initialQuestion = null,
}: CellarAssistantViewProps) {
  const [text, setText] = useState("");
  // One card per operation of the last message, each confirmed on its own.
  const [results, setResults] = useState<CellarCommandResult[]>([]);
  const result = results[results.length - 1] ?? null;
  const replaceResult = (next: CellarCommandResult) => setResults((current) => current.map((item) => (item.command_id === next.command_id ? next : item)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const [voicePreparing, setVoicePreparing] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  // The open conversation with the assistant: questions and answers, newest last.
  const [conversation, setConversation] = useState<Array<{ role: "user" | "assistant"; content: string; meta?: string }>>([]);
  const recognitionRef = useRef<VoiceRecognition | null>(null);
  const voiceTimeoutRef = useRef<number | null>(null);
  const finalTranscriptRef = useRef("");
  const resultRef = useRef<HTMLElement | null>(null);
  const errorRef = useRef<HTMLParagraphElement | null>(null);
  const latestQuestionRef = useRef<HTMLLIElement | null>(null);
  const [canSpeak] = useState(() => speechSupported());
  // A per-device convenience, so it is kept in this browser only.
  const [readAloud, setReadAloud] = useState(() => {
    try { return window.localStorage.getItem(READ_ALOUD_KEY) === "1"; } catch { return false; }
  });
  // Conversation turn being read aloud; -1 is the command result.
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
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
  const shipmentExample = isItalian
    ? "Segna l'ordine di Sassicaia 2022 come arrivato."
    : "Mark my Sassicaia 2022 order as received.";
  const collectionExample = isItalian
    ? "Ho ritirato i vini da Enoteca Pinchiorri."
    : "I collected the wines from Enoteca Pinchiorri.";
  const restockExample = isItalian
    ? "Reintegra 3 bottiglie di Sassicaia 2021 in cantina."
    : "Restock 3 bottles of Sassicaia 2021 in my cellar.";
  const wishlistExample = isItalian
    ? "Aggiungi Barolo 2021 alla wishlist Rossi, prezzo massimo 100 franchi."
    : "Add Barolo 2021 to wishlist Rossi, maximum price CHF 100.";
  const wishlistOfferExample = isItalian
    ? "Aggiungi Barolo 2021 alla wishlist Rossi: l'ho trovato in offerta a 85 CHF."
    : "Add Barolo 2021 to wishlist Rossi: I found an offer at CHF 85.";
  const strategyExample = isItalian
    ? "Considera Arcadia Brut da bere."
    : "Mark Arcadia Brut for drinking.";
  const valueStrategyExample = isItalian
    ? "Metti tutti i vini sotto 40 CHF da bere."
    : "Mark all wines below CHF 40 for drinking.";
  const producerStrategyExample = isItalian
    ? "Metti i vini di Lantieri da maturare."
    : "Mark Lantieri wines for maturation.";
  const questionExamples = isItalian
    ? ["Quali vini sono al picco?", "Cosa scade quest'anno?", "Quanto ho speso in Champagne quest'anno?", "Cosa ho bevuto con Marco?"]
    : ["Which wines are at their peak?", "What should I drink this year?", "How much did I spend on Champagne this year?", "What did I drink with Marco?"];
  const helpExamples = [
    { label: isItalian ? "Bevuta" : "Drinking", description: isItalian ? "Nota, data e voto: scala 6, 10 o 100." : "Notes, date, and a score on a 6, 10, or 100 scale.", example: consumptionExample },
    { label: isItalian ? "Acquisto" : "Purchase", description: isItalian ? "Nuove bottiglie con prezzo, valuta e rivenditore." : "New bottles with price, currency, and merchant.", example: purchaseExample },
    { label: isItalian ? "Reintegro" : "Restock", description: isItalian ? "Aggiunge un nuovo lotto a un vino già presente." : "Adds a new lot to a wine already in the cellar.", example: restockExample },
    { label: isItalian ? "Ordine" : "Order", description: isItalian ? "Registra una cassa o bottiglie come ordinate." : "Records a case or bottles as ordered.", example: orderExample },
    { label: isItalian ? "Arrivo ordine" : "Order received", description: isItalian ? "Aggiorna un ordine esistente quando arriva." : "Updates an existing order when it arrives.", example: shipmentExample },
    { label: isItalian ? "Ritiro" : "Collection", description: isItalian ? "Sposta i vini da ritirare nella cantina dopo il ritiro." : "Moves collected wines into the cellar.", example: collectionExample },
    { label: "Wishlist", description: isItalian ? "Salva un prezzo massimo che sei disposto a pagare." : "Saves the maximum price you are willing to pay.", example: wishlistExample },
    { label: isItalian ? "Offerta wishlist" : "Wishlist offer", description: isItalian ? "Distingue un prezzo trovato dal prezzo target." : "Separates a found offer from your target price.", example: wishlistOfferExample },
    { label: isItalian ? "Obiettivo vino" : "Wine objective", description: isItalian ? "Da bere, maturare, investimento o occasione speciale." : "Drinking, maturation, investment, or special occasion.", example: strategyExample },
    { label: isItalian ? "Strategia per valore" : "Value strategy", description: isItalian ? "Propone tutte le bottiglie sotto una soglia." : "Proposes every bottle below a value threshold.", example: valueStrategyExample },
    { label: isItalian ? "Strategia produttore" : "Producer strategy", description: isItalian ? "Propone i vini di un produttore in una sola volta." : "Proposes a producer's wines in one action.", example: producerStrategyExample },
    { label: isItalian ? "Regalo o rottura" : "Gift or breakage", description: isItalian ? "Scarica bottiglie regalate o rotte, senza degustazione." : "Takes out bottles given away or broken, with no tasting.", example: isItalian ? "Ho regalato una bottiglia di Sassicaia 2019." : "I gave away a bottle of Sassicaia 2019." },
    { label: isItalian ? "Sposta" : "Move", description: isItalian ? "Cambia la posizione delle bottiglie in cantina." : "Changes where the bottles are stored.", example: isItalian ? "Sposta 2 bottiglie di Barolo 2019 nel frigo vini." : "Move 2 bottles of Barolo 2019 to the wine fridge." },
    { label: isItalian ? "Voto o nota" : "Rating or note", description: isItalian ? "Aggiorna voto e note di un vino, anche già finito." : "Updates a wine's rating and notes, even when finished.", example: isItalian ? "Dai 5 stelle al Chianti 2018 e aggiungi una nota: splendido con il brasato." : "Give the Chianti 2018 five stars and add a note: superb with braised beef." },
    { label: isItalian ? "Più azioni" : "Several actions", description: isItalian ? "Una frase, più operazioni: ognuna da confermare." : "One sentence, several operations: each one confirmed.", example: isItalian ? "Abbiamo bevuto 2 bottiglie di Barolo 2019 e ho ordinato 6 Sassicaia 2021 da Arvi." : "We drank 2 bottles of Barolo 2019 and I ordered 6 Sassicaia 2021 from Arvi." },
  ];
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
    setResults([]);
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

  // On a phone the composer sits below the conversation: bring each new exchange,
  // from the question down to the answer, into view instead of staying on the composer.
  useEffect(() => {
    if (!conversation.length || !window.matchMedia("(max-width: 820px)").matches) return;
    const target = latestQuestionRef.current;
    if (!target) return;
    const frame = window.requestAnimationFrame(() => {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [conversation.length]);

  function toggleSpeech(index: number, content: string) {
    if (speakingIndex === index) {
      stopSpeaking();
      setSpeakingIndex(null);
      return;
    }
    if (speak(content, locale, () => setSpeakingIndex((current) => (current === index ? null : current)))) setSpeakingIndex(index);
  }

  function changeReadAloud(enabled: boolean) {
    setReadAloud(enabled);
    try { window.localStorage.setItem(READ_ALOUD_KEY, enabled ? "1" : "0"); } catch { /* the choice lasts this visit */ }
    if (!enabled) {
      stopSpeaking();
      setSpeakingIndex(null);
    }
  }

  // Read each new answer, or the outcome of a command, when the option is on. Only
  // a newly added answer is read, not one already on screen when it is switched on.
  const lastTurn = conversation[conversation.length - 1];
  useEffect(() => {
    if (!readAloud || lastTurn?.role !== "assistant") return;
    const index = conversation.length - 1;
    if (speak(lastTurn.content, locale, () => setSpeakingIndex((current) => (current === index ? null : current)))) setSpeakingIndex(index);
  }, [conversation.length]);
  // Command cards: read each message that is new or changed (a confirmation's "Fatto…").
  const spokenMessages = useRef<Record<string, string>>({});
  useEffect(() => {
    const fresh = results.filter((item) => item.message && spokenMessages.current[item.command_id] !== item.message);
    for (const item of results) spokenMessages.current[item.command_id] = item.message;
    if (!readAloud || !fresh.length) return;
    if (speak(fresh.map((item) => item.message).join(" "), locale, () => setSpeakingIndex((current) => (current === -1 ? null : current)))) setSpeakingIndex(-1);
  }, [results]);
  useEffect(() => () => stopSpeaking(), []);

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

  async function askAssistant(question: string) {
    const answer = await api<{ answer: string; tools_used: string[]; model: string; estimated_cost_usd: string }>("/api/v1/ai/cellar-assistant/ask", {
      method: "POST",
      body: JSON.stringify({
        question,
        locale,
        history: conversation.slice(-10).map(({ role, content }) => ({ role, content: content.slice(0, 4000) })),
      }),
    });
    setConversation((current) => [
      ...current,
      { role: "user", content: question },
      { role: "assistant", content: answer.answer, meta: `${answer.model} · ${requestCostLabel(answer.estimated_cost_usd)}` },
    ]);
    setResults([]);
    setText("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await send(text);
  }

  useEffect(() => {
    if (initialQuestion?.text.trim()) void send(initialQuestion.text);
  }, [initialQuestion?.id]);

  function sendCommand(commandText: string) {
    return api<CellarCommandResult>("/api/v1/ai/cellar-commands", {
      method: "POST",
      body: JSON.stringify({
        request_id: crypto.randomUUID(),
        text: commandText,
        locale,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Zurich",
      }),
    });
  }

  async function send(message: string) {
    const question = message.trim();
    if (!question || busy || disabled || listening) return;
    // Still inside the tap: lets mobile Safari read the answer when it arrives.
    if (readAloud) primeSpeech();
    setBusy(true);
    setError("");
    try {
      // A question goes straight to the assistant, so "did I drink the Barolo?"
      // is never taken for a tasting to record. Dictation adds no question mark,
      // so a message that opens like a question or a request to be told counts too.
      if (isQuestion(question)) {
        await askAssistant(question);
        return;
      }
      const next = await sendCommand(question);
      // Not a cellar action: let the assistant answer it with the conversation so far.
      if (next.status === "unsupported" && !next.follow_up_texts?.length) {
        await askAssistant(question);
        return;
      }
      const prepared = [next];
      setResults([next]);
      setText("");
      // The other operations of the same message, one command (and one card) each.
      for (const followUp of next.follow_up_texts || []) {
        const extra = await sendCommand(followUp);
        prepared.push(extra);
        setResults([...prepared]);
      }
      // A single acquisition opens its wine record straight away; with several
      // operations each card offers it, so one editor does not hide the others.
      if (
        prepared.length === 1
        && next.purchase_draft
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

  async function selectCatalogCandidate(result: CellarCommandResult, candidate: CellarCommandCatalogCandidate) {
    if (!result.purchase_draft || busy) return;
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

  async function selectWishlistList(result: CellarCommandResult, wishlistListId: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await api<CellarCommandResult>(
        `/api/v1/ai/cellar-commands/${result.command_id}/wishlist`,
        { method: "POST", body: JSON.stringify({ wishlist_list_id: wishlistListId }) },
      );
      replaceResult(next);
      await onCellarChanged();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to add wishlist item");
    } finally {
      setBusy(false);
    }
  }

  async function prepareResultPurchase(result: CellarCommandResult) {
    if (!result.purchase_draft || busy) return;
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

  async function execute(result: CellarCommandResult, wineId: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await api<CellarCommandResult>(
        `/api/v1/ai/cellar-commands/${result.command_id}/execute`,
        { method: "POST", body: JSON.stringify({ wine_id: wineId }) },
      );
      replaceResult(next);
      await onCellarChanged();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to execute command");
    } finally {
      setBusy(false);
    }
  }

  async function executeBulkStrategy(result: CellarCommandResult) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await api<CellarCommandResult>(
        `/api/v1/ai/cellar-commands/${result.command_id}/execute`,
        { method: "POST", body: JSON.stringify({ confirm_all: true }) },
      );
      replaceResult(next);
      await onCellarChanged();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to execute command");
    } finally {
      setBusy(false);
    }
  }

  async function undo(result: CellarCommandResult) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await api<CellarCommandResult>(
        `/api/v1/ai/cellar-commands/${result.command_id}/undo`,
        { method: "POST" },
      );
      replaceResult(next);
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
          <p>{isItalian ? "Domande e azioni" : "Questions and actions"}</p>
          <div className="cellar-assistant-title-row"><h1 id="cellar-assistant-title">{isItalian ? "Assistente Cantina AI" : "AI Cellar Assistant"}</h1><button type="button" className="secondary compact cellar-assistant-help-button" onClick={() => setHelpOpen(true)} aria-label={isItalian ? "Come funziona l'assistente AI" : "How the AI assistant works"}>?</button></div>
          <span>{isItalian
            ? "Chiedi qualsiasi cosa sulla tua cantina, oppure racconta cosa hai bevuto, acquistato o deciso: Vinaris risponde o prepara l’aggiornamento."
            : "Ask anything about your cellar, or describe what you drank, purchased, or decided: Vinaris answers or prepares the update."}</span>
        </div>
      </header>

      {helpOpen ? <div className="cellar-assistant-help-overlay" role="presentation" onClick={() => setHelpOpen(false)}><section className="cellar-assistant-help" role="dialog" aria-modal="true" aria-labelledby="cellar-assistant-help-title" onClick={(event) => event.stopPropagation()}><header><div><p>{isItalian ? "GUIDA RAPIDA" : "QUICK GUIDE"}</p><h2 id="cellar-assistant-help-title">{isItalian ? "Cosa può fare l’assistente" : "What the assistant can do"}</h2></div><button type="button" className="secondary compact" onClick={() => setHelpOpen(false)} aria-label={isItalian ? "Chiudi" : "Close"}>×</button></header><p className="cellar-assistant-help-intro">{isItalian ? "Scegli un esempio per inserirlo nel comando e personalizzarlo." : "Choose an example to place it in the command field and customize it."}</p><div className="cellar-assistant-help-examples"><button type="button" onClick={() => applyExample(consumptionExample)}><strong>{isItalian ? "Bevuta" : "Drinking"}</strong><span>{isItalian ? "Registra nota e voto su scala 6." : "Record notes and a six-point score."}</span></button><button type="button" onClick={() => applyExample(purchaseExample)}><strong>{isItalian ? "Acquisto" : "Purchase"}</strong><span>{isItalian ? "Aggiunge bottiglie o un nuovo lotto." : "Adds bottles or a new purchase lot."}</span></button><button type="button" onClick={() => applyExample(orderExample)}><strong>{isItalian ? "Ordine" : "Order"}</strong><span>{isItalian ? "Registra lo stato ordinato; spedizioni aggiornano ordini esistenti." : "Records an order; shipments update existing orders."}</span></button><button type="button" onClick={() => applyExample(wishlistExample)}><strong>Wishlist</strong><span>{isItalian ? "Salva un vino da valutare con prezzo target." : "Save a wine to evaluate with a target price."}</span></button><button type="button" onClick={() => applyExample(strategyExample)}><strong>Intelligence</strong><span>{isItalian ? "Assegna bottiglie a consumo, maturazione, investimento o occasioni speciali." : "Assign bottles to drinking, maturation, investment, or special occasions."}</span></button></div><ul>{isItalian ? <li>Controlla sempre la proposta prima della conferma: l’assistente non modifica nulla senza il tuo OK.</li> : <li>Always review the proposal: nothing changes without your confirmation.</li>}</ul></section></div> : null}

      {helpOpen ? (
        <div className="cellar-assistant-help-overlay cellar-assistant-help-overlay--extended" role="presentation" onClick={() => setHelpOpen(false)}>
          <section className="cellar-assistant-help" role="dialog" aria-modal="true" aria-labelledby="cellar-assistant-help-extended-title" onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <p>{isItalian ? "GUIDA RAPIDA" : "QUICK GUIDE"}</p>
                <h2 id="cellar-assistant-help-extended-title">{isItalian ? "Comandi dell’assistente" : "Assistant commands"}</h2>
              </div>
              <button type="button" className="secondary compact" onClick={() => setHelpOpen(false)} aria-label={isItalian ? "Chiudi" : "Close"}>×</button>
            </header>
            <p className="cellar-assistant-help-intro">{isItalian ? "Scegli un esempio, poi personalizzalo. Puoi anche parlare: Vinaris riceve soltanto la trascrizione." : "Choose an example, then personalize it. You can also speak: Vinaris receives only the transcript."}</p>
            <div className="cellar-assistant-help-examples">
              {helpExamples.map((item) => (
                <button type="button" key={item.label} onClick={() => applyExample(item.example)}>
                  <strong>{item.label}</strong>
                  <span>{item.description}</span>
                </button>
              ))}
            </div>
            <ul>
              <li>{isItalian ? "Indica vino, annata e quantità; aggiungi prezzo, valuta e rivenditore quando li conosci." : "Include wine, vintage, and quantity; add price, currency, and merchant when known."}</li>
              <li>{isItalian ? "Bevute, reintegri e strategie sono verificabili prima dell’aggiornamento. Un arrivo modifica solo un ordine esistente trovato con sicurezza." : "Drinking, restocks, and strategies can be reviewed before an update. An arrival changes only an existing order found with confidence."}</li>
            </ul>
          </section>
        </div>
      ) : null}

      {conversation.length ? <section className="cellar-assistant-conversation" aria-label={isItalian ? "Conversazione con l'assistente" : "Conversation with the assistant"}>
        <header>
          <strong>{isItalian ? "Conversazione" : "Conversation"}</strong>
          <button type="button" className="secondary compact" onClick={() => { stopSpeaking(); setSpeakingIndex(null); setConversation([]); }} disabled={busy}>{isItalian ? "Nuova conversazione" : "New conversation"}</button>
        </header>
        <ol aria-live="polite">
          {conversation.map((turn, index) => <li key={index} className={`is-${turn.role}`} ref={turn.role === "user" && index === conversation.length - 2 ? latestQuestionRef : undefined}>
            {turn.role === "assistant" ? <AssistantAnswer text={turn.content} /> : <p>{turn.content}</p>}
            {turn.role === "assistant" && (turn.meta || canSpeak) ? <div className="cellar-assistant-turn-footer">
              {turn.meta ? <small>{turn.meta}</small> : <span />}
              {canSpeak ? <button type="button" className={`cellar-assistant-speak${speakingIndex === index ? " is-speaking" : ""}`} aria-pressed={speakingIndex === index} aria-label={speakingIndex === index ? (isItalian ? "Ferma la lettura" : "Stop reading") : (isItalian ? "Leggi ad alta voce" : "Read aloud")} title={speakingIndex === index ? (isItalian ? "Ferma la lettura" : "Stop reading") : (isItalian ? "Leggi ad alta voce" : "Read aloud")} onClick={() => toggleSpeech(index, turn.content)}><span aria-hidden="true">{speakingIndex === index ? "■" : "🔊"}</span></button> : null}
            </div> : turn.meta ? <small>{turn.meta}</small> : null}
          </li>)}
        </ol>
        <small className="cellar-assistant-conversation-note">{isItalian ? "L'assistente legge la tua cantina per rispondere; per modificarla, racconta cosa è successo." : "The assistant reads your cellar to answer; to change it, describe what happened."}</small>
      </section> : null}

      <form className={`cellar-assistant-composer${conversation.length ? " has-conversation" : ""}`} onSubmit={submit}>
        <label htmlFor="cellar-assistant-command">{isItalian ? "Chiedi o racconta" : "Ask or tell"}</label>
        <div className="cellar-assistant-command-examples" aria-label={isItalian ? "Esempi di domande" : "Question examples"}>
          <span>{isItalian ? "Chiedi:" : "Ask:"}</span>
          <div>
            {questionExamples.map((example) => (
              <button type="button" key={example} className="secondary compact" onClick={() => applyExample(example)} disabled={disabled || busy}>
                {example}
              </button>
            ))}
          </div>
        </div>
        <div className="cellar-assistant-command-examples" aria-label={isItalian ? "Esempi di comandi" : "Command examples"}>
          <span>{isItalian ? "Prova un comando:" : "Try a command:"}</span>
          <div>
            {helpExamples.map((item) => (
              <button type="button" key={item.label} className="secondary compact" onClick={() => applyExample(item.example)} disabled={disabled || busy} title={item.description}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
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
        </div>
        <div className="cellar-assistant-composer-footer">
          <small id="cellar-assistant-continue-help">
            {isItalian ? "Risponde alle domande sulla cantina o prepara il prossimo aggiornamento." : "Answers cellar questions or prepares the next cellar update."}
          </small>
          {/* Speak and send side by side, so dictating and sending are one thumb apart. */}
          <div className="cellar-assistant-send-actions">
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
            <button type="submit" disabled={disabled || busy || listening || !text.trim()} aria-describedby="cellar-assistant-continue-help">
              <AppIcon name="glass-sparkle" variant="ai" />
              {busy ? (isItalian ? "Elaborazione…" : "Processing…") : (isItalian ? "Continua" : "Continue")}
            </button>
          </div>
        </div>
        {canSpeak ? <label className="cellar-assistant-read-aloud"><input type="checkbox" checked={readAloud} onChange={(event) => changeReadAloud(event.target.checked)} /><span>{isItalian ? "Leggi le risposte ad alta voce" : "Read answers aloud"}</span></label> : null}
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

      {results.map((result, index) => (
        <article key={result.command_id} ref={index === 0 ? resultRef : undefined} className={`cellar-assistant-result status-${result.status}`} aria-live="polite" tabIndex={-1}>
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
          {result.status === "needs_confirmation" && result.candidates.length === 1 && !result.strategy_bulk && !result.collection_bulk ? (
            <div className="cellar-assistant-confirm">
              <span><strong>{result.candidates[0].name}</strong><small>{[result.candidates[0].producer, result.candidates[0].vintage, result.candidates[0].format].filter(Boolean).join(" · ")}</small></span>
              <button type="button" onClick={() => void execute(result, result.candidates[0].wine_id)} disabled={busy}>{isItalian ? "Conferma" : "Confirm"}</button>
            </div>
          ) : result.candidates.length ? (
            <div className="cellar-assistant-candidates">
              {result.candidates.map((candidate) => (
                (result.strategy_bulk || result.collection_bulk) ? <div className="cellar-assistant-candidate-preview" key={candidate.wine_id}>
                  <span><strong>{candidate.name} {candidate.vintage}</strong><small>{[candidate.producer, candidate.format].filter(Boolean).join(" · ")}</small></span>
                  <b>{candidate.unit_value} {candidate.currency}<small>{candidate.value_source === "purchase" ? (isItalian ? "Prezzo d’acquisto" : "Purchase price") : (isItalian ? "Valore attuale" : "Current value")}</small></b>
                </div> : <button type="button" className="secondary" key={candidate.wine_id} onClick={() => void execute(result, candidate.wine_id)} disabled={busy}>
                  <span><strong>{candidate.name}</strong><small>{[candidate.producer, candidate.vintage, candidate.format].filter(Boolean).join(" · ")}</small></span>
                  <b>{candidate.quantity} {isItalian ? "bott." : "btl."}</b>
                </button>
              ))}
              {result.strategy_bulk ? <button type="button" onClick={() => void executeBulkStrategy(result)} disabled={busy}>{isItalian ? `Conferma tutti come ${strategyPurposeLabel(result.strategy_purpose || "")}` : `Confirm all ${strategyPurposeLabel(result.strategy_purpose || "")}`}</button> : null}
              {result.collection_bulk ? <button type="button" onClick={() => void executeBulkStrategy(result)} disabled={busy}>{result.intent === "ship_wine"
                ? (isItalian ? (result.candidates.length === 1 ? "Conferma: segna il vino come spedito" : `Conferma: segna i ${result.candidates.length} vini come spediti`) : `Confirm: mark ${result.candidates.length === 1 ? "the wine" : `all ${result.candidates.length} wines`} as shipped`)
                : (isItalian ? "Conferma ritiro e sposta in cantina" : "Confirm collection and move to cellar")}</button> : null}
            </div>
          ) : null}
          {result.catalog_candidates.length ? (
            <div className="cellar-assistant-candidates">
              {result.catalog_candidates.map((candidate) => (
                <button type="button" className="secondary" key={candidate.catalog_entry_id} onClick={() => void selectCatalogCandidate(result, candidate)} disabled={busy}>
                  <span><strong>{candidate.name}</strong><small>{[candidate.producer, candidate.region, candidate.appellation].filter(Boolean).join(" · ")}</small></span>
                  <b>{isItalian ? "Usa" : "Use"}</b>
                </button>
              ))}
            </div>
          ) : null}
          {result.status === "wishlist_selection" && result.wishlist_lists.length === 1 ? (
            <div className="cellar-assistant-confirm">
              <span><strong>{result.wishlist_lists[0].name}</strong><small>{isItalian ? "Wishlist" : "Wishlist"}</small></span>
              <button type="button" onClick={() => void selectWishlistList(result, result.wishlist_lists[0].wishlist_list_id)} disabled={busy}>{isItalian ? "Conferma" : "Confirm"}</button>
            </div>
          ) : result.wishlist_lists.length ? (
            <div className="cellar-assistant-candidates">
              {result.wishlist_lists.map((wishlistList) => (
                <button type="button" className="secondary" key={wishlistList.wishlist_list_id} onClick={() => void selectWishlistList(result, wishlistList.wishlist_list_id)} disabled={busy}>
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
          {results.length > 1 && result.intent === "acquire_wine" && result.purchase_draft && (result.status === "draft_ready" || result.status === "ai_research_required") ? (
            <button type="button" onClick={() => void prepareResultPurchase(result)} disabled={busy}>
              {isItalian ? "Apri la scheda del vino" : "Open the wine record"}
            </button>
          ) : null}
          {result.intent === "ship_wine" && result.status === "not_found" && result.purchase_draft ? (
            <button type="button" className="secondary" onClick={() => void prepareResultPurchase(result)} disabled={busy}>
              {isItalian ? "Aggiungi come nuovo ordine" : "Add as a new order"}
            </button>
          ) : null}
          {result.status === "executed" ? <button type="button" className="secondary compact" onClick={() => void undo(result)} disabled={busy}>{isItalian ? "Annulla aggiornamento" : "Undo update"}</button> : null}
        </article>
      ))}
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
