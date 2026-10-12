import { useRef, useState } from "react";
import type { Locale } from "../../types";
import type { LandingCopy } from "./content";

export default function NewsCarousel({ copy, locale, onRegister }: {
  copy: LandingCopy["news"]; locale: Locale; onRegister: () => void;
}) {
  const [active, setActive] = useState(0);
  const selectors = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const count = copy.entries.length;
  const entry = copy.entries[active];
  const italian = locale === "it";
  const move = (offset: number) => setActive((current) => (current + offset + count) % count);

  return <section id="news" className="marketing-section marketing-news-section marketing-news-carousel" aria-labelledby="news-title" aria-roledescription={italian ? "carosello" : "carousel"}>
    <div className="marketing-section-copy">
      <p className="marketing-kicker">{copy.eyebrow}</p><h2 id="news-title">{copy.title}</h2><p>{copy.body}</p>
    </div>
    <div className="marketing-news-selectors" ref={selectors} role="group" aria-label={italian ? "Scegli una novità" : "Choose an update"}>
      {copy.entries.map((item, index) => <button key={item.id} type="button" aria-pressed={active === index} aria-controls="news-slide" onClick={() => setActive(index)} onKeyDown={(event) => {
        const next = event.key === "ArrowRight" ? (index + 1) % count : event.key === "ArrowLeft" ? (index - 1 + count) % count : event.key === "Home" ? 0 : event.key === "End" ? count - 1 : null;
        if (next === null) return;
        event.preventDefault(); setActive(next); selectors.current?.querySelectorAll("button")[next]?.focus();
      }}><span aria-hidden="true">0{index + 1}</span>{item.tab}</button>)}
    </div>
    <article id="news-slide" className={`marketing-news-card${entry.featured ? " is-featured" : ""}`} aria-labelledby={`news-${entry.id}`} aria-roledescription="slide"
      onTouchStart={(event) => { const touch = event.touches[0]; touchStart.current = event.touches.length === 1 ? { x: touch.clientX, y: touch.clientY } : null; }}
      onTouchCancel={() => { touchStart.current = null; }}
      onTouchEnd={(event) => {
        const start = touchStart.current; touchStart.current = null;
        if (!start || !event.changedTouches.length) return;
        const dx = event.changedTouches[0].clientX - start.x;
        const dy = event.changedTouches[0].clientY - start.y;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1);
      }}>
      <div className="marketing-news-meta"><span className="marketing-news-label">{entry.label}</span><time dateTime={entry.date}>{entry.dateLabel}</time></div>
      <div className="marketing-news-content">
        <div className="marketing-news-copy"><h3 id={`news-${entry.id}`}>{entry.title}</h3><p>{entry.body}</p></div>
        {entry.id === "purchase-scan" ? <div className="marketing-news-scan-visual" aria-hidden="true"><span>VINARIS</span><i /><i /><i /><b>6 × 750 ml</b><span className="marketing-news-scan-check">✓</span></div>
          : entry.id === "photo-memories" ? <div className="marketing-news-memory-visual" aria-hidden="true"><img src="/images/cellar-tasting-glasses-v1.webp" alt="" width={1086} height={1448} /><span>Vinaris memories</span></div>
          : <div className="marketing-news-dashboard-visual" aria-hidden="true"><span /><i /><i /><i /><i /></div>}
      </div>
      <div className="marketing-news-card-action"><button type="button" className="marketing-button primary" onClick={onRegister}>{entry.action}<span aria-hidden="true"> →</span></button><small>{entry.availability}</small></div>
    </article>
    <div className="marketing-news-controls">
      <p id="news-signup-note">{copy.note}</p>
      <div className="marketing-news-arrows">
        <button type="button" aria-label={italian ? "Novità precedente" : "Previous update"} aria-controls="news-slide" onClick={() => move(-1)}>←</button>
        <span aria-live="polite" aria-atomic="true"><span className="sr-only">{entry.tab}, </span>{active + 1} / {count}</span>
        <button type="button" aria-label={italian ? "Novità successiva" : "Next update"} aria-controls="news-slide" onClick={() => move(1)}>→</button>
      </div>
    </div>
  </section>;
}
