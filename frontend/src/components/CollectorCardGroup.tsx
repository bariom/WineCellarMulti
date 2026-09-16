import { Children, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Locale } from "../types";

export function CollectorCardGroup({ children, className, label, locale }: {
  children: ReactNode; className: string; label: string; locale: Locale;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [height, setHeight] = useState<number>();
  const count = Children.count(children);

  useEffect(() => {
    const card = track.current?.children[active] as HTMLElement | undefined;
    if (!card) return;
    const measure = () => setHeight(Math.ceil(card.getBoundingClientRect().height) + 8);
    const observer = new ResizeObserver(measure);
    observer.observe(card);
    measure();
    return () => observer.disconnect();
  }, [active, children]);

  function update() {
    const container = track.current;
    if (!container) return;
    const left = container.getBoundingClientRect().left;
    let nearest = 0;
    let distance = Infinity;
    Array.from(container.children).forEach((card, index) => {
      const delta = Math.abs(card.getBoundingClientRect().left - left);
      if (delta < distance) { nearest = index; distance = delta; }
    });
    setActive(nearest);
  }

  function go(index: number) {
    const container = track.current;
    const card = container?.children[index];
    if (!container || !card) return;
    container.scrollTo({ left: container.scrollLeft + card.getBoundingClientRect().left - container.getBoundingClientRect().left, behavior: "instant" });
    setActive(index);
  }

  return <div className="collector-card-group">
    <div className={`${className} collector-card-track`} ref={track} role="region" aria-label={label} onScroll={update}
      style={{ "--collector-card-height": height ? `${height}px` : undefined } as CSSProperties}>
      {children}
    </div>
    <nav className="collector-group-controls" aria-label={`${label} · ${locale === "it" ? "scorri le schede" : "browse cards"}`}>
      <button type="button" disabled={active === 0} onClick={() => go(active - 1)} aria-label={locale === "it" ? "Scheda precedente" : "Previous card"}>‹</button>
      <span aria-live="polite">{label} · {active + 1}/{count}</span>
      <button type="button" disabled={active >= count - 1} onClick={() => go(active + 1)} aria-label={locale === "it" ? "Scheda successiva" : "Next card"}>›</button>
    </nav>
  </div>;
}
