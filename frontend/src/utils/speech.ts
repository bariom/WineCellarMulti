import type { Locale } from "../types";

/**
 * Read text aloud with the browser's own speech synthesis: no AI cost and no
 * audio leaves the device. Browsers without it simply show no speaker controls.
 *
 * When the natural AI voice is on (Riserva, billed to AI credit), the same calls
 * play an MP3 read by OpenAI's speech model instead, and fall back to the
 * browser's voice whenever it is not available.
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

function voiceFor(locale: Locale) {
  const language = locale === "it" ? "it" : "en";
  const voices = window.speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith(language));
  return voices.find((voice) => voice.localService) || voices[0] || null;
}

// The natural voice: one audio element, unlocked during a tap so phones let it play later.
let aiVoiceEnabled = false;
let aiAudio: HTMLAudioElement | null = null;
let aiAudioUrl = "";
let aiPending = false;
let aiRequest = 0;

export function setAiVoice(enabled: boolean) {
  aiVoiceEnabled = enabled;
}

function audioElement() {
  if (!aiAudio) aiAudio = new Audio();
  return aiAudio;
}

/** A twentieth of a second of silence, to unlock audio playback inside a tap. */
function silentWav() {
  const samples = 800;
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  text(0, "RIFF"); view.setUint32(4, 36 + samples, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true); view.setUint32(28, 16000, true); view.setUint16(32, 1, true); view.setUint16(34, 8, true);
  text(36, "data"); view.setUint32(40, samples, true);
  bytes.fill(128, 44);
  return `data:audio/wav;base64,${btoa(String.fromCharCode(...bytes))}`;
}

/** True while an answer is being read, or the natural voice is still on its way. */
export function isSpeaking() {
  return aiPending || Boolean(aiAudio && !aiAudio.paused && !aiAudio.ended) || (speechSupported() && window.speechSynthesis.speaking);
}

export function stopSpeaking() {
  aiRequest += 1;
  aiPending = false;
  if (aiAudio) aiAudio.pause();
  if (speechSupported()) window.speechSynthesis.cancel();
}

function speakWithBrowser(text: string, locale: Locale, onEnd?: () => void) {
  if (!speechSupported()) {
    onEnd?.();
    return false;
  }
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

async function speakWithAiVoice(text: string, locale: Locale, onEnd?: () => void) {
  const request = ++aiRequest;
  aiPending = true;
  if (speechSupported()) window.speechSynthesis.cancel();
  if (aiAudio) aiAudio.pause();
  try {
    const response = await fetch("/api/v1/ai/cellar-assistant/speech", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: spokenText(text), locale }),
    });
    if (!response.ok) throw new Error(`speech ${response.status}`);
    const blob = await response.blob();
    if (request !== aiRequest) return;
    const audio = audioElement();
    if (aiAudioUrl) URL.revokeObjectURL(aiAudioUrl);
    aiAudioUrl = URL.createObjectURL(blob);
    const finish = () => {
      if (request !== aiRequest) return;
      aiPending = false;
      onEnd?.();
    };
    audio.onended = finish;
    audio.onerror = finish;
    audio.src = aiAudioUrl;
    await audio.play();
    aiPending = false;
    window.dispatchEvent(new CustomEvent("vinaris:ai-voice-cost", { detail: response.headers.get("X-AI-Cost-USD") || "" }));
  } catch {
    if (request !== aiRequest) return;
    aiPending = false;
    // No credit, no network or a blocked player: the browser's voice still reads it.
    speakWithBrowser(text, locale, onEnd);
  }
}

/** Speak the text, replacing anything already being read. Returns false when unsupported. */
export function speak(text: string, locale: Locale, onEnd?: () => void) {
  if (aiVoiceEnabled) {
    void speakWithAiVoice(text, locale, onEnd);
    return true;
  }
  return speakWithBrowser(text, locale, onEnd);
}

/**
 * Mobile Safari only speaks after the page has spoken once during a tap. Calling
 * this from the tap that sends a message lets the answer be read when it arrives.
 */
export function primeSpeech() {
  if (aiVoiceEnabled) {
    const audio = audioElement();
    if (audio.paused) {
      audio.src = silentWav();
      void audio.play().catch(() => undefined);
    }
  }
  if (!speechSupported() || window.speechSynthesis.speaking) return;
  const silent = new window.SpeechSynthesisUtterance("");
  silent.volume = 0;
  window.speechSynthesis.speak(silent);
}
