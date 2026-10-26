import type { Locale } from "../types";

/**
 * Read text aloud with the browser's own speech synthesis: no AI cost and no
 * audio leaves the device. Browsers without it simply show no speaker controls.
 */
export function speechSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function";
}

/** The assistant's light Markdown as it should be heard: no asterisks or list dashes. */
export function spokenText(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim().replace(/^([-•*]|\d+[.)])\s+/, "").replace(/\*\*/g, ""))
    .filter(Boolean)
    .map((line) => (/[.!?:;]$/.test(line) ? line : `${line}.`))
    .join(" ");
}

/**
 * The most natural voice the browser offers, at no cost: Edge's neural voices
 * ("Natural"/"Online"), then the enhanced voices of Apple devices, then Google's
 * voices in Chrome, and only then the plain system voice.
 */
export function voiceQuality(voice: Pick<SpeechSynthesisVoice, "name" | "localService">) {
  const name = voice.name.toLowerCase();
  if (/natural|online/.test(name)) return 4;
  if (/premium|enhanced|neural/.test(name)) return 3;
  if (name.includes("google")) return 2;
  return voice.localService ? 1 : 0;
}

function voiceFor(locale: Locale) {
  const language = locale === "it" ? "it" : "en";
  const voices = window.speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith(language));
  return voices.reduce<SpeechSynthesisVoice | null>((best, voice) => (!best || voiceQuality(voice) > voiceQuality(best) ? voice : best), null);
}

export function stopSpeaking() {
  if (speechSupported()) window.speechSynthesis.cancel();
}

/** Speak the text, replacing anything already being read. Returns false when unsupported. */
export function speak(text: string, locale: Locale, onEnd?: () => void) {
  if (!speechSupported()) return false;
  const utterance = new window.SpeechSynthesisUtterance(spokenText(text));
  utterance.lang = locale === "it" ? "it-IT" : "en-US";
  const voice = voiceFor(locale);
  if (voice) utterance.voice = voice;
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return true;
}

/**
 * Mobile Safari only speaks after the page has spoken once during a tap. Calling
 * this from the tap that sends a message lets the answer be read when it arrives.
 */
export function primeSpeech() {
  if (!speechSupported() || window.speechSynthesis.speaking) return;
  const silent = new window.SpeechSynthesisUtterance("");
  silent.volume = 0;
  window.speechSynthesis.speak(silent);
}
