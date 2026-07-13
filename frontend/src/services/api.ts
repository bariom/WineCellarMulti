import type { Locale } from "../types";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const response = await fetch(path, {
    credentials: "include",
    headers: { ...(isFormData ? {} : { "Content-Type": "application/json" }), ...init?.headers },
    ...init,
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(extractApiErrorText(message) || `Request failed: ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function extractApiErrorText(message: string) {
  const trimmedMessage = String(message || "").trim();
  if (!trimmedMessage) return "";
  if (trimmedMessage.startsWith("<")) {
    const titleMatch = trimmedMessage.match(/<title>(.*?)<\/title>/i);
    const headingMatch = trimmedMessage.match(/<h1[^>]*>(.*?)<\/h1>/i);
    const htmlSummary = titleMatch?.[1] || headingMatch?.[1] || trimmedMessage.replace(/<[^>]+>/g, " ");
    return htmlSummary.replace(/\s+/g, " ").trim();
  }
  try {
    const parsed = JSON.parse(trimmedMessage) as { detail?: unknown; message?: unknown };
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.detail === "string" && parsed.detail.trim()) return parsed.detail.trim();
      if (Array.isArray(parsed.detail) && parsed.detail.length) {
        const firstDetail = parsed.detail[0] as { msg?: unknown };
        if (typeof firstDetail?.msg === "string" && firstDetail.msg.trim()) return firstDetail.msg.trim();
      }
      if (typeof parsed.message === "string" && parsed.message.trim()) return parsed.message.trim();
    }
  } catch {
    return trimmedMessage;
  }
  return trimmedMessage;
}

export function formatUserErrorMessage(message: string, locale: Locale) {
  const text = String(message || "").trim();
  if (!text) return "";
  const normalized = text.toLowerCase();

  if (normalized.includes("413 request entity too large") || normalized.includes("request entity too large")) {
    return locale === "it"
      ? "Il file di backup e' troppo grande per essere caricato in una sola richiesta. Riduci la dimensione del file oppure aumenta ulteriormente il limite di upload del server."
      : "The backup file is too large to upload in a single request. Reduce the file size or increase the server upload limit.";
  }

  if (isConnectivityError(text)) {
    return locale === "it"
      ? "Connessione non disponibile. Puoi riprovare il login quando torni online oppure caricare un backup offline in sola lettura."
      : "No network connection is available. You can try logging in again when you are back online or load an offline backup in read-only mode.";
  }

  if (normalized.includes("email verification required")) {
    return locale === "it"
      ? "Devi confermare il tuo indirizzo email prima di accedere. Controlla la posta e apri il link di conferma."
      : "You must confirm your email address before signing in. Check your inbox and open the confirmation link.";
  }

  if (normalized.includes("openai request failed")) {
    if (
      normalized.includes("timeout")
      || normalized.includes("timed out")
      || normalized.includes("disconnect/reset before headers")
      || normalized.includes("upstream connect error")
    ) {
      return locale === "it"
        ? "La richiesta AI ha impiegato troppo tempo. Riprova tra qualche secondo."
        : "The AI request took too long. Please try again in a few seconds.";
    }
    return locale === "it"
      ? "Il servizio AI non ha risposto correttamente. Riprova tra poco."
      : "The AI service did not respond correctly. Please try again shortly.";
  }

  if (normalized.includes("no verified live market price sources found")) {
    return locale === "it"
      ? "Non sono state trovate fonti di mercato live sufficientemente affidabili per questo vino. Verifica nome, produttore e annata, poi riprova."
      : "No sufficiently reliable live market sources were found for this wine. Check name, producer, and vintage, then try again.";
  }

  if (normalized.includes("ai credits exhausted")) {
    return locale === "it"
      ? "Il saldo AI Pack e' esaurito. Acquista un nuovo AI Pack oppure usa la tua chiave OpenAI."
      : "Your AI Pack balance is exhausted. Buy a new AI Pack or use your personal OpenAI key.";
  }

  if (normalized.includes("no personal openai api key configured")) {
    return locale === "it"
      ? "Non hai configurato una chiave OpenAI personale."
      : "You have not configured a personal OpenAI key.";
  }

  if (normalized.includes("no ai provider configured") || normalized.includes("application openai api key is not configured")) {
    return locale === "it"
      ? "L'AI non e' configurata correttamente in questo momento."
      : "AI is not configured correctly at the moment.";
  }

  return text;
}

export function isConnectivityError(message: string) {
  const normalized = String(message || "").trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes("failed to fetch")
    || normalized.includes("networkerror")
    || normalized.includes("load failed")
    || normalized.includes("network request failed")
    || normalized.includes("fetch failed")
    || normalized.includes("offline")
    || normalized.includes("internet")
    || normalized.includes("connection")
  );
}
