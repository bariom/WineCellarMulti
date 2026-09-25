import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { Locale } from "../types";
import "./HorizontalScroll.css";

export function useHorizontalScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ index: 0, count: 0, overflow: false, start: true, end: true });
  const [interacted, setInteracted] = useState(false);
  function measure() {
    const rail = ref.current;
    if (!rail) return;
    const items = Array.from(rail.children).filter(item => (item as HTMLElement).offsetWidth > 0) as HTMLElement[];
    const max = rail.scrollWidth - rail.clientWidth;
    const start = rail.scrollLeft <= 2;
    const end = rail.scrollLeft >= max - 2;
    const edge = rail.getBoundingClientRect().left;
    let index = 0;
    let distance = Infinity;
    items.forEach((item, i) => { const delta = Math.abs(item.getBoundingClientRect().left - edge); if (delta < distance) { distance = delta; index = i; } });
    if (end && !start) index = items.length - 1;
    const next = { index, count: items.length, overflow: rail.clientWidth > 0 && max > 2, start, end };
    setPosition(current => Object.keys(next).every(key => current[key as keyof typeof next] === next[key as keyof typeof next]) ? current : next);
  }
  useEffect(() => {
    const rail = ref.current;
    if (!rail) return;
    const resize = new ResizeObserver(measure);
    const observe = () => { resize.disconnect(); resize.observe(rail); Array.from(rail.children).forEach(child => resize.observe(child)); measure(); };
    const mutation = new MutationObserver(observe);
    mutation.observe(rail, { childList: true });
    observe();
    rail.addEventListener("scroll", measure, { passive: true });
    return () => { resize.disconnect(); mutation.disconnect(); rail.removeEventListener("scroll", measure); };
  }, []);
  function go(index: number) {
    const rail = ref.current;
    const items = rail && Array.from(rail.children).filter(item => (item as HTMLElement).offsetWidth > 0);
    const item = items?.[Math.max(0, Math.min(index, items.length - 1))];
    if (!rail || !item) return;
    setInteracted(true);
    const left = rail.scrollLeft + item.getBoundingClientRect().left - rail.getBoundingClientRect().left;
    rail.scrollTo({ left, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  return { ref, ...position, interacted, go, interact: () => setInteracted(true) };
}

export function ScrollControls({ scroll, label, locale, target }: { scroll: ReturnType<typeof useHorizontalScroll>; label: string; locale: Locale; target: string }) {
  if (!scroll.overflow) return null;
  const it = locale === "it";
  return <div className="horizontal-scroll-controls" role="group" aria-label={`${it ? "Scorrimento" : "Scroll"}: ${label}`}>
    <button type="button" className="secondary" aria-controls={target} aria-label={`${it ? "Precedente" : "Previous"}: ${label}`} disabled={scroll.start} onClick={() => scroll.go(scroll.index - 1)}>‹</button>
    <span aria-live="polite" aria-atomic="true">{scroll.index + 1} {it ? "di" : "of"} {scroll.count}</span>
    <button type="button" className="secondary" aria-controls={target} aria-label={`${it ? "Successivo" : "Next"}: ${label}`} disabled={scroll.end} onClick={() => scroll.go(scroll.index + 1)}>›</button>
  </div>;
}

export function ScrollHint({ scroll, locale }: { scroll: ReturnType<typeof useHorizontalScroll>; locale: Locale }) {
  return scroll.overflow && !scroll.interacted ? <p className="horizontal-scroll-hint">{locale === "it" ? "Scorri per esplorare →" : "Swipe to explore →"}</p> : null;
}

export function ScrollGallery({ title, locale, className, children, count }: { title: string; locale: Locale; className: string; children: ReactNode; count: number }) {
  const scroll = useHorizontalScroll();
  const id = useId();
  return <section className={className} aria-label={title}>
    <header><h2>{title}</h2>{scroll.overflow ? <ScrollControls scroll={scroll} label={title} locale={locale} target={id} /> : <span>{count} {locale === "it" ? "vini" : "wines"}</span>}</header>
    <ScrollHint scroll={scroll} locale={locale} />
    <div ref={scroll.ref} id={id} className="collector-photo-rail" role="list" aria-label={title} onPointerDown={scroll.interact} onKeyDown={scroll.interact}>
      {children}
    </div>
    {!count && <p>{locale === "it" ? "Nessun vino in questa selezione." : "No wines in this selection."}</p>}
  </section>;
}
