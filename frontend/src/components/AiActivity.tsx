import type { Locale } from "../types";
import { AppIcon } from "./AppIcon";
import "./AiActivity.css";

export type AiActivityPhase = "listening" | "thinking" | "speaking";

/**
 * The AI at work, in one visual language everywhere: a dark gold-lit panel with
 * the glass inside a turning halo (thinking), sound bars (listening) or a voice
 * wave (speaking), the words of what is happening, and the action that stops it.
 * `compact` is the inline bar for scanners, searches and generation inside forms.
 */
export function AiActivity({ phase = "thinking", label, detail, locale = "it", onStop, compact = false }: {
  phase?: AiActivityPhase;
  label: string;
  detail?: string;
  /** Only the stop button's wording depends on it: inline waits can leave it out. */
  locale?: Locale;
  onStop?: () => void;
  compact?: boolean;
}) {
  const it = locale === "it";
  const stopLabel = phase === "listening" ? (it ? "Ferma" : "Stop") : (it ? "Interrompi" : "Interrupt");
  return (
    <div className={`ai-activity is-${phase}${compact ? " is-compact" : ""}`} role="status" aria-live="polite">
      <span className="ai-activity-visual" aria-hidden="true">
        {phase === "thinking"
          ? <><i className="ai-activity-halo" /><i className="ai-activity-halo is-inner" /><i className="ai-activity-spark" /><AppIcon name="glass-sparkle" variant="ai" /></>
          : Array.from({ length: phase === "listening" ? 5 : 7 }, (_, index) => <i key={index} style={{ animationDelay: `${index * 0.09}s` }} />)}
      </span>
      <span className="ai-activity-copy">
        <strong>{label}</strong>
        {detail && !compact ? <small>{detail}</small> : null}
      </span>
      {onStop ? <button type="button" className="ai-activity-stop" onClick={onStop}>{stopLabel}</button> : null}
    </div>
  );
}

/** The spark that replaces a button's icon while the AI works on it. */
export function AiSpark() {
  return <span className="ai-spark" aria-hidden="true"><i /><i /></span>;
}

export default AiActivity;
