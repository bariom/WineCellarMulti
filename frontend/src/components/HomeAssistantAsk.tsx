import { FormEvent, useState } from "react";
import type { Locale } from "../types";
import { AppIcon } from "./AppIcon";
import "./HomeAssistantAsk.css";

/** A question for the cellar assistant straight from the home page. */
export function HomeAssistantAsk({ locale, onAsk, onVoice }: { locale: Locale; onAsk: (question: string) => void; onVoice?: () => void }) {
  const [question, setQuestion] = useState("");
  const it = locale === "it";
  // The microphone opens the assistant in voice conversation, where it is handled.
  const [voiceAvailable] = useState(() => {
    const voiceWindow = window as typeof window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    return Boolean(voiceWindow.SpeechRecognition || voiceWindow.webkitSpeechRecognition) && "speechSynthesis" in window;
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!question.trim()) return;
    onAsk(question.trim());
    setQuestion("");
  }
  return (
    <form className="home-assistant-ask" onSubmit={submit} role="search" aria-label={it ? "Chiedi all'assistente della cantina" : "Ask the cellar assistant"}>
      <AppIcon name="assistant" variant="ai" detailLevel="rich" />
      <input
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        maxLength={2000}
        enterKeyHint="send"
        aria-label={it ? "Chiedi alla tua cantina" : "Ask your cellar"}
        placeholder={it ? "Chiedi alla tua cantina…" : "Ask your cellar…"}
      />
      {onVoice && voiceAvailable && !question.trim() ? (
        <button type="button" className="home-assistant-ask-voice" onClick={onVoice} aria-label={it ? "Parla con l'assistente" : "Talk to the assistant"} title={it ? "Parla con l'assistente" : "Talk to the assistant"}>
          <span aria-hidden="true">🎙</span>
        </button>
      ) : null}
      <button type="submit" disabled={!question.trim()} aria-label={it ? "Chiedi" : "Ask"}>
        <span aria-hidden="true">→</span>
      </button>
    </form>
  );
}

export default HomeAssistantAsk;
