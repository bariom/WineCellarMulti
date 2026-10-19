import { ReactNode, useState } from "react";
import { AppIcon } from "./AppIcon";
import { KeyPositionBottleVisual } from "./KeyPositionCardParts";
import { wineTone } from "./panelSupport";
import type { Locale, Wine } from "../types";
import "./DailyDrinkBoard.css";

type ToneGroup = { tone: string; label: string; wines: Wine[] };

/**
 * "Drink well today": one clear pick for tonight, the other ready wines as a
 * still grid filtered by style, and special-occasion bottles apart. Nothing
 * moves by itself, so every proposal stays readable at a glance.
 */
export default function DailyDrinkBoard({
  locale, t, groups, ranking, premiumWines, budgetChf, canShowPhotos, reason, windowLabel, price, onOpenWine, onPairWine, onOpenPairing, children,
}: {
  locale: Locale;
  t: (key: any) => string;
  groups: ToneGroup[];
  /** Ready wines ordered by urgency (window ending soonest, not drunk lately). */
  ranking: Wine[];
  premiumWines: Wine[];
  budgetChf: number | null;
  canShowPhotos: boolean;
  reason: (wine: Wine) => string;
  windowLabel: (wine: Wine) => string;
  price: (wine: Wine) => string;
  onOpenWine: (wine: Wine) => void;
  onPairWine: (wine: Wine) => void;
  onOpenPairing: () => void;
  /** Lower cards kept as they are (past window, maturity map). */
  children?: ReactNode;
}) {
  const it = locale === "it";
  const [style, setStyle] = useState("all");
  const available = groups.filter((group) => group.wines.length);
  const proposed = new Set(available.flatMap((group) => group.wines.map((wine) => wine.id)));
  const pick = ranking.find((wine) => proposed.has(wine.id)) || null;
  const others = available
    .filter((group) => style === "all" || group.tone === style)
    .flatMap((group) => group.wines)
    .filter((wine) => wine.id !== pick?.id);
  const visual = (wine: Wine, sizes: string) => <KeyPositionBottleVisual
    photoUrl={canShowPhotos ? wine.photo_thumbnail_url || wine.photo_detail_url : ""}
    detailUrl={canShowPhotos ? wine.photo_detail_url : undefined}
    sizes={sizes}
    tone={wineTone(wine.type)}
  />;
  const identity = (wine: Wine) => [wine.producer, wine.vintage].filter(Boolean).join(" · ");
  const budgetNote = budgetChf ? (it ? `entro il tuo budget di CHF ${budgetChf}` : `within your CHF ${budgetChf} budget`) : "";

  return <section className="daily-board" aria-label={t("dailyFocus")}>
    {pick ? <article className="daily-board-pick">
      <div className="daily-board-pick-visual">{visual(pick, "220px")}</div>
      <div className="daily-board-pick-copy">
        <span className="daily-board-eyebrow"><AppIcon name="glass-sparkle" />{it ? "Stasera ti consiglio" : "Tonight I suggest"}</span>
        <h2>{pick.name}</h2>
        {identity(pick) ? <p className="daily-board-identity">{identity(pick)}</p> : null}
        <p className="daily-board-reason">{reason(pick)}</p>
        <div className="daily-board-chips">
          <span><i className={`wine-dot tone-${wineTone(pick.type)}`} />{available.find((group) => group.wines.some((wine) => wine.id === pick.id))?.label}</span>
          <span><AppIcon name="calendar" />{windowLabel(pick)}</span>
          {price(pick) ? <span>{price(pick)}{budgetNote ? ` · ${budgetNote}` : ""}</span> : null}
        </div>
        <div className="daily-board-actions">
          <button type="button" onClick={() => onOpenWine(pick)}>{it ? "Apri la scheda" : "Open the wine"}</button>
          <button type="button" className="secondary" onClick={() => onPairWine(pick)}><AppIcon name="glass-sparkle" />{it ? "Abbina un piatto" : "Pair a dish"}</button>
          <button type="button" className="secondary daily-board-link" onClick={onOpenPairing}>{it ? "Parto dal piatto →" : "Start from the dish →"}</button>
        </div>
      </div>
    </article> : <article className="daily-board-empty">
      <AppIcon name="bottle" />
      <div><h2>{it ? "Nessun vino pronto stasera" : "No wine ready tonight"}</h2><p>{t("dailyNoReadyWine")}</p></div>
      <button type="button" className="secondary" onClick={onOpenPairing}>{it ? "Parti dal piatto" : "Start from the dish"}</button>
    </article>}

    {pick && (others.length || available.length > 1) ? <section className="daily-board-section" aria-labelledby="daily-board-more">
      <header>
        <h3 id="daily-board-more">{it ? "Altre idee pronte da bere" : "More ideas ready to drink"}</h3>
        <div className="daily-board-filters" role="group" aria-label={it ? "Tipologia" : "Style"}>
          <button type="button" aria-pressed={style === "all"} onClick={() => setStyle("all")}>{it ? "Tutti" : "All"}</button>
          {available.map((group) => <button type="button" key={group.tone} aria-pressed={style === group.tone} onClick={() => setStyle(group.tone)}>
            <i className={`wine-dot tone-${group.tone}`} />{group.label}<small>{group.wines.length}</small>
          </button>)}
        </div>
      </header>
      {others.length ? <ul className="daily-board-grid">
        {others.map((wine) => <li key={wine.id}>
          <button type="button" className="daily-board-card" onClick={() => onOpenWine(wine)}>
            <span className="daily-board-card-visual">{visual(wine, "90px")}</span>
            <span className="daily-board-card-copy">
              <strong>{wine.name}</strong>
              <span>{identity(wine)}</span>
              <em>{reason(wine)}</em>
              <span className="daily-board-card-meta"><span><AppIcon name="calendar" />{windowLabel(wine)}</span>{price(wine) ? <b>{price(wine)}</b> : null}</span>
            </span>
          </button>
        </li>)}
      </ul> : <p className="daily-board-note">{it ? "La proposta di stasera è l'unica pronta per questa tipologia." : "Tonight's pick is the only one ready in this style."}</p>}
    </section> : null}

    {premiumWines.length ? <section className="daily-board-section daily-board-premium" aria-labelledby="daily-board-premium">
      <header>
        <h3 id="daily-board-premium"><AppIcon name="star" />{it ? "Per un'occasione speciale" : "For a special occasion"}</h3>
        <p>{it ? "Pronte da bere, oltre il budget di tutti i giorni." : "Ready to drink, beyond the everyday budget."}</p>
      </header>
      <ul className="daily-board-grid is-premium">
        {premiumWines.slice(0, 4).map((wine) => <li key={wine.id}>
          <button type="button" className="daily-board-card" onClick={() => onOpenWine(wine)}>
            <span className="daily-board-card-visual">{visual(wine, "90px")}</span>
            <span className="daily-board-card-copy">
              <strong>{wine.name}</strong>
              <span>{identity(wine)}</span>
              <span className="daily-board-card-meta"><span><AppIcon name="calendar" />{windowLabel(wine)}</span>{price(wine) ? <b>{price(wine)}</b> : null}</span>
            </span>
          </button>
        </li>)}
      </ul>
    </section> : null}

    {children ? <div className="daily-board-lower">{children}</div> : null}
  </section>;
}
