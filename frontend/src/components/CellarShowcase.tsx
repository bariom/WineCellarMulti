import { useEffect, useId, useMemo, type CSSProperties, type PointerEvent } from "react";
import { ScrollControls, useHorizontalScroll } from "./HorizontalScroll";
import type { Locale, Wine } from "../types";
import { formatMoney, wineTone } from "./panelSupport";
import "./CellarShowcase.css";

const SHOWCASE_SIZE = 5;

function unitValue(wine: Wine) {
  const current = Number(wine.current_value);
  if (Number.isFinite(current) && current > 0) return current;
  const purchase = Number(wine.price);
  return Number.isFinite(purchase) && purchase > 0 ? purchase : 0;
}

/**
 * Home showcase (docs/UI_WOW_RECIPE.md): the most valuable bottles in stock
 * that have a photo, falling back to the most recently added. Hidden when
 * fewer than two bottles can be shown, so the home never opens on a half-empty shelf.
 */
export function CellarShowcase({ wines, locale, onOpenWine }: { wines: Wine[]; locale: Locale; onOpenWine: (wine: Wine) => void }) {
  const showcase = useMemo(() => {
    const withPhoto = wines.filter((wine) => wine.quantity > 0 && (wine.photo_detail_url || wine.photo_thumbnail_url));
    const valued = withPhoto.filter((wine) => unitValue(wine) > 0).sort((a, b) => unitValue(b) - unitValue(a));
    const recent = withPhoto
      .filter((wine) => !valued.includes(wine))
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    return [...valued, ...recent].slice(0, SHOWCASE_SIZE);
  }, [wines]);

  if (showcase.length < 2) return null;
  return <CellarShowcaseRail showcase={showcase} locale={locale} onOpenWine={onOpenWine} />;
}

/** Mounted only with bottles to show, so the scroll hook measures a real rail. */
function CellarShowcaseRail({ showcase, locale, onOpenWine }: { showcase: Wine[]; locale: Locale; onOpenWine: (wine: Wine) => void }) {
  const it = locale === "it";
  const id = useId();
  const title = it ? "Le bottiglie più preziose" : "Your most precious bottles";
  const scroll = useHorizontalScroll();
  const railRef = scroll.ref;

  // A mouse wheel scrolls vertically: over the rail it moves the shelf sideways,
  // and hands the page back its scroll once the rail reaches either end.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      const max = rail.scrollWidth - rail.clientWidth;
      if (max <= 2) return;
      const atStart = rail.scrollLeft <= 1 && event.deltaY < 0;
      const atEnd = rail.scrollLeft >= max - 1 && event.deltaY > 0;
      if (atStart || atEnd) return;
      event.preventDefault();
      rail.scrollBy({ left: event.deltaY, behavior: "auto" });
      scroll.interact();
    };
    rail.addEventListener("wheel", onWheel, { passive: false });
    return () => rail.removeEventListener("wheel", onWheel);
  }, [railRef]);

  function tilt(event: PointerEvent<HTMLButtonElement>) {
    if (event.pointerType !== "mouse") return;
    const card = event.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    card.style.setProperty("--tilt-x", `${(-y * 12).toFixed(2)}deg`);
    card.style.setProperty("--tilt-y", `${(x * 12).toFixed(2)}deg`);
  }

  function resetTilt(event: PointerEvent<HTMLButtonElement>) {
    event.currentTarget.style.removeProperty("--tilt-x");
    event.currentTarget.style.removeProperty("--tilt-y");
  }

  return <section className="cellar-showcase" aria-label={it ? "Vetrina della cantina" : "Cellar showcase"}>
    <header className="cellar-showcase-head">
      <div>
        <p className="eyebrow">{it ? "In vetrina" : "Showcase"}</p>
        <h2>{title}</h2>
      </div>
      <ScrollControls scroll={scroll} label={title} locale={locale} target={id} />
    </header>
    <div ref={railRef} id={id} className="cellar-showcase-track" role="list" aria-label={title} onPointerDown={scroll.interact} onKeyDown={scroll.interact}>
      {showcase.map((wine, index) => {
        const value = unitValue(wine);
        const photo = wine.photo_detail_url || wine.photo_thumbnail_url;
        return <div role="listitem" key={wine.id} style={{ "--showcase-index": index } as CSSProperties}>
          <button
            type="button"
            className={`cellar-showcase-card tone-${wineTone(wine.type)}`}
            onClick={() => onOpenWine(wine)}
            onPointerMove={tilt}
            onPointerLeave={resetTilt}
            aria-label={[wine.name, wine.vintage, wine.producer].filter(Boolean).join(", ")}
          >
            <span className="cellar-showcase-stage" aria-hidden="true">
              <img className="cellar-showcase-bottle" src={photo} alt="" loading={index < 2 ? "eager" : "lazy"} decoding="async" />
              <span className="cellar-showcase-reflection"><img src={photo} alt="" loading="lazy" decoding="async" /></span>
            </span>
            <span className="cellar-showcase-copy">
              <strong>{wine.name}</strong>
              <small>{[wine.producer, wine.vintage].filter(Boolean).join(" · ")}</small>
              {value ? <em>{formatMoney(String(value), wine.currency, locale)}</em> : null}
            </span>
          </button>
        </div>;
      })}
    </div>
  </section>;
}
