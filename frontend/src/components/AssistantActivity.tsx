import type { Locale } from "../types";
import { AppIcon } from "./AppIcon";
import "./AssistantActivity.css";

export type AssistantActivityPhase = "listening" | "thinking" | "speaking";

/**
 * What the assistant is doing right now, in place of greyed-out buttons: listening
 * (sound bars and the words heard), working (a glowing glass and what it is doing)
 * or answering aloud (a voice wave), each with the action that stops it.
 */
export function AssistantActivity({ phase, label, detail, locale, onStop }: {
  phase: AssistantActivityPhase;
  label: string;
  detail?: string;
  locale: Locale;
  onStop?: () => void;
}) {
  const it = locale === "it";
  const stopLabel = phase === "listening" ? (it ? "Ferma" : "Stop") : (it ? "Interrompi" : "Interrupt");
  return (
    <div className={`assistant-activity is-${phase}`} role="status" aria-live="polite">
      <span className="assistant-activity-visual" aria-hidden="true">
        {phase === "thinking"
          ? <><i className="assistant-activity-ring" /><AppIcon name="glass-sparkle" variant="ai" /></>
          : Array.from({ length: phase === "listening" ? 5 : 7 }, (_, index) => <i key={index} style={{ animationDelay: `${index * 0.11}s` }} />)}
      </span>
      <span className="assistant-activity-copy">
        <strong>{label}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
      {onStop ? <button type="button" className="assistant-activity-stop" onClick={onStop}>{stopLabel}</button> : null}
    </div>
  );
}

export default AssistantActivity;
