import type { Locale } from "../types";
import { pronounceForItalianVoice } from "./pronunciation";

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
  // One speaker for every language: names keep their own pronunciation, in the same voice.
  if (name.includes("multilingual")) return 5;
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

// French names of this cellar, respelled for an Italian voice so they are not read letter by letter.
let frenchNames: string[] = [];

export function setFrenchNames(names: string[]) {
  frenchNames = names;
}

/** What the voice is given to read: names respelled for an Italian voice that is not multilingual. */
export function textForVoice(text: string, locale: Locale, voice: Pick<SpeechSynthesisVoice, "name"> | null) {
  const spoken = spokenText(text);
  if (locale !== "it" || voice?.name.toLowerCase().includes("multilingual")) return spoken;
  return pronounceForItalianVoice(spoken, frenchNames);
}

/** Speak the text, replacing anything already being read. Returns false when unsupported. */
export function speak(text: string, locale: Locale, onEnd?: () => void) {
  if (!speechSupported()) return false;
  const voice = voiceFor(locale);
  const utterance = new window.SpeechSynthesisUtterance(textForVoice(text, locale, voice));
  utterance.lang = locale === "it" ? "it-IT" : "en-US";
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
