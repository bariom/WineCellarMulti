import { useEffect, useRef, useState } from "react";
import type { Locale } from "../../types";
import type { LandingCopy } from "./content";
import "./NewsPanel.css";

const STORAGE_KEY = "vinaris.landing-news";
const AUTO_OPEN_DELAY_MS = 18_000;

function readDismissedFor(): string {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}") as { dismissedFor?: unknown };
    return typeof stored.dismissedFor === "string" ? stored.dismissedFor : "";
  } catch {
    return "";
  }
}

function rememberDismissed(latest: string) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ dismissedFor: latest })); } catch { /* Storage may be unavailable; the panel simply returns next visit. */ }
}

/**
 * Updates live outside the page flow: a panel that emerges once the visitor
 * starts reading, can be closed, and stays closed until something newer is
 * published. A small tab keeps it one tap away.
 */
export default function NewsPanel({ copy, locale, open, focusToken, onOpenChange, onRegister }: {
  copy: LandingCopy["news"]; locale: Locale; open: boolean;
  /** Changes when the visitor opens the panel on purpose, so focus follows. */
  focusToken: number;
  onOpenChange: (open: boolean, userInitiated?: boolean) => void; onRegister: () => void;
}) {
  const [active, setActive] = useState(0);
  const panel = useRef<HTMLElement>(null);
  const selectors = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const focusedToken = useRef(0);
  const count = copy.entries.length;
  const entry = copy.entries[active];
  const italian = locale === "it";
  const latest = copy.entries.reduce((newest, item) => (item.date > newest ? item.date : newest), "");
  const [dismissed, setDismissed] = useState(() => readDismissedFor() >= latest);
  const move = (offset: number) => setActive((current) => (current + offset + count) % count);

  const close = () => { rememberDismissed(latest); setDismissed(true); onOpenChange(false); };

  // Emerge once the visitor has started reading, unless something else is asking for attention.
  useEffect(() => {
    if (dismissed || open) return undefined;
    let timer = 0;
    let done = false;
    const tryOpen = () => {
      if (done) return;
      if (document.querySelector(".cookie-consent-banner, .auth-modal-overlay")) { timer = window.setTimeout(tryOpen, 2000); return; }
      done = true;
      onOpenChange(true);
    };
    const onScroll = () => { if (window.scrollY > window.innerHeight * 0.8) { window.removeEventListener("scroll", onScroll); tryOpen(); } };
    window.addEventListener("scroll", onScroll, { passive: true });
    timer = window.setTimeout(tryOpen, AUTO_OPEN_DELAY_MS);
    return () => { done = true; window.clearTimeout(timer); window.removeEventListener("scroll", onScroll); };
  }, [dismissed, open, onOpenChange]);

  useEffect(() => {
    if (open && focusToken !== focusedToken.current) { focusedToken.current = focusToken; panel.current?.focus({ preventScroll: true }); }
  }, [open, focusToken]);

  const tab = <button type="button" className="landing-news-tab" aria-expanded={open} aria-controls="news" onClick={() => onOpenChange(true, true)}>
    <i aria-hidden="true" className={dismissed ? "" : "is-new"} />{italian ? "Novità" : "What’s new"}
  </button>;

  if (!open) return tab;

  return <>
    <section id="news" ref={panel} tabIndex={-1} className="landing-news" aria-labelledby="news-title" aria-roledescription={italian ? "carosello" : "carousel"}
      onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); close(); } }}>
      <header>
        <p className="landing-news-kicker">{copy.eyebrow}</p>
        <button type="button" className="landing-news-close" aria-label={italian ? "Chiudi le novità" : "Close updates"} onClick={close}><span aria-hidden="true">×</span></button>
      </header>
      <h2 id="news-title">{copy.title}</h2>
      <div className="landing-news-selectors" ref={selectors} role="group" aria-label={italian ? "Scegli una novità" : "Choose an update"}>
        {copy.entries.map((item, index) => <button key={item.id} type="button" aria-pressed={active === index} aria-controls="news-slide" aria-label={item.tab} onClick={() => setActive(index)} onKeyDown={(event) => {
          const next = event.key === "ArrowRight" ? (index + 1) % count : event.key === "ArrowLeft" ? (index - 1 + count) % count : event.key === "Home" ? 0 : event.key === "End" ? count - 1 : null;
          if (next === null) return;
          event.preventDefault(); setActive(next); selectors.current?.querySelectorAll("button")[next]?.focus();
        }}>0{index + 1}</button>)}
      </div>
      <article id="news-slide" className={`landing-news-card${entry.featured ? " is-featured" : ""}`} aria-labelledby={`news-${entry.id}`} aria-roledescription="slide"
        onTouchStart={(event) => { const touch = event.touches[0]; touchStart.current = event.touches.length === 1 ? { x: touch.clientX, y: touch.clientY } : null; }}
        onTouchCancel={() => { touchStart.current = null; }}
        onTouchEnd={(event) => {
          const start = touchStart.current; touchStart.current = null;
          if (!start || !event.changedTouches.length) return;
          const dx = event.changedTouches[0].clientX - start.x;
          const dy = event.changedTouches[0].clientY - start.y;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1);
        }}>
        <div className="landing-news-meta"><span>{entry.label}</span><time dateTime={entry.date}>{entry.dateLabel}</time></div>
        <div className="landing-news-copy"><h3 id={`news-${entry.id}`}>{entry.title}</h3><p>{entry.body}</p></div>
        <div className="landing-news-action"><button type="button" className="marketing-button primary" onClick={onRegister}>{entry.action}<span aria-hidden="true"> →</span></button><small>{entry.availability}</small></div>
      </article>
      <footer>
        <p id="news-signup-note">{copy.note}</p>
        <div className="landing-news-arrows">
          <button type="button" aria-label={italian ? "Novità precedente" : "Previous update"} aria-controls="news-slide" onClick={() => move(-1)}>←</button>
          <span aria-live="polite" aria-atomic="true"><span className="sr-only">{entry.tab}, </span>{active + 1} / {count}</span>
          <button type="button" aria-label={italian ? "Novità successiva" : "Next update"} aria-controls="news-slide" onClick={() => move(1)}>→</button>
        </div>
      </footer>
    </section>
  </>;
}
