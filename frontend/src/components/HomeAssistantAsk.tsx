import { FormEvent, useState } from "react";
import type { Locale } from "../types";
import { AppIcon } from "./AppIcon";
import "./HomeAssistantAsk.css";

/** A question for the cellar assistant straight from the home page. */
export function HomeAssistantAsk({ locale, onAsk }: { locale: Locale; onAsk: (question: string) => void }) {
  const [question, setQuestion] = useState("");
  const it = locale === "it";
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
      <button type="submit" disabled={!question.trim()} aria-label={it ? "Chiedi" : "Ask"}>
        <span aria-hidden="true">→</span>
      </button>
    </form>
  );
}

export default HomeAssistantAsk;
