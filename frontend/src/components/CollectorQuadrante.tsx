import type * as React from "react";
import { Children, cloneElement, isValidElement, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import type { Locale, Wine } from "../types";
import { formatBottleCount, formatPercentage, isToCollectWine, isWinePhysicallyInCellar, topWineBottleGroups } from "../domain/cellar";
import { KeyPositionBottleVisual } from "./KeyPositionCardParts";
import { RiservaBanner } from "./RiservaBanner";
import { ScrollGallery } from "./HorizontalScroll";
import { formatMoney, wineTone } from "./panelSupport";
import { featuredValue } from "../domain/featuredValue";
import { bestTastingRating, isMaturityReason, isTasteReason } from "../domain/featuredSelection";
import { featuredCaption, featuredExplanation, type FeaturedWine } from "./FeaturedWineDetails";
import { CollectorAtlas } from "./CollectorAtlas";
import "./CollectorQuadrante.css";
const CollectorEvolution = lazy(() => import("./CollectorEvolution"));

type Lane = { key: "overdue" | "closing" | "ready" | "waiting" | "unknown"; label: string; items: Wine[] };

const MAX_BEFORE = 8;
const MAX_AFTER = 25;
const TONE_COLORS: Record<string, string> = { red: "#9a2f45", white: "#dccd8f", sparkling: "#a4bcad", rose: "#d39393", sweet: "#d9a35b", other: "#8a8f98" };

const positiveNumber = (value: unknown) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;

/** Why the wine is highlighted, drawn: price growth for "increase", otherwise the weight of its position in the cellar. */
function FeaturedContext({ item, stock, locale }: { item: FeaturedWine; stock: Wine[]; locale: Locale }) {
  const it = locale === "it";
  const { wine } = item;
  const year = new Date().getFullYear();
  if (isMaturityReason(item.reason) && wine.drink_from && wine.drink_to) {
    const peakFrom = wine.drink_peak_from, peakTo = wine.drink_peak_to;
    const start = Math.min(wine.drink_from, year) - 1, end = Math.max(wine.drink_to, year) + 1;
    const pos = (value: number) => (value - start) / (end - start) * 100;
    const years = year - wine.drink_to;
    const headline = item.reason === "closing" ? (it ? "Ultimo anno" : "Final year")
      : item.reason === "peak" ? `${it ? "Dal" : "From"} ${peakFrom || wine.drink_from}`
      : it ? `+${years} ${years === 1 ? "anno" : "anni"}` : `+${years} ${years === 1 ? "year" : "years"}`;
    const bar = item.reason === "closing" ? "closing" : item.reason === "peak" ? "ready" : "overdue";
    return <figure className="cq-context cq-window">
      <figcaption><span>{it ? "La sua finestra di consumo" : "Its drinking window"}</span><strong>{headline}</strong></figcaption>
      <span className="cq-track cq-window-track" role="img" aria-label={`${wine.drink_from}–${wine.drink_to}${peakFrom && peakTo ? ` · ${it ? "picco" : "peak"} ${peakFrom}–${peakTo}` : ""} · ${it ? "oggi" : "today"} ${year}`}>
        <span className={`cq-bar cq-bar-${bar}`} style={{ left: `${pos(wine.drink_from)}%`, width: `${pos(wine.drink_to + 1) - pos(wine.drink_from)}%` }} />
        {peakFrom && peakTo && peakFrom <= peakTo ? <span className="cq-window-peak" style={{ left: `${pos(peakFrom)}%`, width: `${pos(peakTo + 1) - pos(peakFrom)}%` }} /> : null}
        <span className="cq-needle" style={{ left: `${pos(year + 0.5)}%` }} />
      </span>
      <div className="cq-trend-ends">
        <span><small>{it ? "Da bere dal" : "Drink from"}</small><b>{wine.drink_from}</b></span>
        {peakFrom && peakTo ? <span className="cq-window-mid"><small>{it ? "Picco" : "Peak"}</small><b>{peakFrom}–{peakTo}</b></span> : null}
        <span><small>{it ? "Fino al" : "Until"}</small><b>{wine.drink_to}</b></span>
      </div>
      <p>{it ? `Oggi: ${year}. Finestre indicative.` : `Today: ${year}. Indicative windows.`}</p>
    </figure>;
  }
  if (isTasteReason(item.reason)) {
    const stars = Number(wine.rating || 0), best = bestTastingRating(wine);
    const summary = wine.tasting_summary;
    const last = summary?.last_consumed_at ? new Intl.DateTimeFormat(it ? "it-CH" : "en-GB", { month: "short", year: "numeric" }).format(new Date(`${summary.last_consumed_at.slice(0, 10)}T00:00:00`)) : "";
    const rows = [
      { key: "stars", label: it ? "Le tue stelle" : "Your stars", value: stars },
      { key: "best", label: it ? "Miglior degustazione" : "Best tasting", value: best },
    ].filter(row => row.value > 0);
    const scoreText = (value: number) => `${new Intl.NumberFormat(it ? "it-CH" : "en-GB", { maximumFractionDigits: 1 }).format(value)}/6`;
    return <figure className="cq-context cq-taste">
      <figcaption><span>{it ? "Il tuo giudizio" : "Your verdict"}</span>{rows.length ? <strong>{scoreText(Math.max(stars, best))}</strong> : null}</figcaption>
      <ol>{rows.map(row => <li key={row.key}>
        <p><span>{row.label}</span><b>{scoreText(row.value)}</b></p>
        <span className="cq-origin-bar"><i style={{ width: `${row.value / 6 * 100}%` }} /></span>
      </li>)}</ol>
      <p>{summary?.count
        ? (it ? `${summary.count} ${summary.count === 1 ? "degustazione registrata" : "degustazioni registrate"}${last ? ` · ultima ${last}` : ""}.` : `${summary.count} ${summary.count === 1 ? "tasting" : "tastings"} recorded${last ? ` · last ${last}` : ""}.`)
        : (it ? "Nessuna degustazione registrata finora." : "No tastings recorded yet.")}</p>
    </figure>;
  }
  if (item.reason === "increase") {
    const value = featuredValue(wine);
    if (value.baseline === null || value.current === null) return null;
    const dateFormat = new Intl.DateTimeFormat(it ? "it-CH" : "en-GB", { month: "short", year: "numeric" });
    const points = value.points.length >= 2 ? value.points : [{ value: value.baseline, timestamp: 0 }, { value: value.current, timestamp: 1 }];
    const min = Math.min(...points.map(p => p.value)), max = Math.max(...points.map(p => p.value));
    const t0 = points[0].timestamp, span = Math.max(1, points[points.length - 1].timestamp - t0);
    const xy = points.map(p => ({ x: 10 + (p.timestamp - t0) / span * 180, y: 74 - (p.value - min) / Math.max(max - min, 1) * 56 }));
    const line = xy.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const last = xy[xy.length - 1];
    const change = value.changePct;
    const from = value.baselineTimestamp !== undefined && Number.isFinite(value.baselineTimestamp) ? dateFormat.format(value.baselineTimestamp) : "";
    const to = value.currentTimestamp !== undefined && Number.isFinite(value.currentTimestamp) && value.points.length >= 2 ? dateFormat.format(value.currentTimestamp) : "";
    return <figure className="cq-context cq-trend">
      <figcaption><span>{it ? "Come è cambiato il suo valore" : "How its value has changed"}</span>{change !== null ? <strong>{change > 0 ? "+" : ""}{formatPercentage(change, locale, 1)}</strong> : null}</figcaption>
      <svg viewBox="0 0 200 92" preserveAspectRatio="none" role="img" aria-label={`${formatMoney(value.baseline, wine.currency, locale)} → ${formatMoney(value.current, wine.currency, locale)}`}>
        <defs><linearGradient id={`cq-trend-fill-${wine.id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d9b865" stopOpacity=".45" /><stop offset="1" stopColor="#d9b865" stopOpacity="0" /></linearGradient></defs>
        <path d={`${line} L${last.x.toFixed(1)} 88 L${xy[0].x.toFixed(1)} 88Z`} fill={`url(#cq-trend-fill-${wine.id})`} />
        <path d={line} className="cq-trend-line" />
        <path d={`M${xy[0].x} ${xy[0].y}h0`} className="cq-trend-dot" />
        <path d={`M${xy[0].x} ${xy[0].y}h0`} className="cq-trend-dot cq-trend-dot-core" />
        <path d={`M${last.x.toFixed(1)} ${last.y.toFixed(1)}h0`} className="cq-trend-dot cq-trend-end" />
      </svg>
      <div className="cq-trend-ends">
        <span><small>{value.fromPurchase ? (it ? "Acquisto" : "Purchase") : (it ? "Prima valutazione" : "First valuation")}{from ? ` · ${from}` : ""}</small><b>{formatMoney(value.baseline, wine.currency, locale)}</b></span>
        <span><small>{it ? "Valore attuale" : "Current value"}{to ? ` · ${to}` : ""}</small><b>{formatMoney(value.current, wine.currency, locale)}</b></span>
      </div>
      <p>{it ? "Valori per bottiglia." : "Values per bottle."}</p>
    </figure>;
  }
  const unit = (w: Wine) => positiveNumber(w.current_value) ?? positiveNumber(w.price) ?? 0;
  const total = stock.filter(w => w.currency === wine.currency).reduce((sum, w) => sum + unit(w) * w.quantity, 0);
  if (!total || !item.totalValue) return null;
  const share = Math.min(100, item.totalValue / total * 100);
  if (item.reason === "position" || item.reason === "value") {
    // Compare the highlighted position with the most valuable ones in the same currency.
    const ranked = stock.filter(w => w.currency === wine.currency).map(w => ({ id: w.id, name: w.name, vintage: w.vintage, value: unit(w) * w.quantity }))
      .filter(entry => entry.value > 0).sort((a, b) => b.value - a.value);
    const top = ranked.slice(0, 5);
    const position = ranked.findIndex(entry => entry.id === wine.id);
    const rows = position >= 5 ? [...top.slice(0, 4), ranked[position]] : top;
    const max = rows[0]?.value || 1;
    return <figure className="cq-context cq-rank">
      <figcaption><span>{it ? "Tra le posizioni di maggior valore" : "Among the most valuable positions"}</span>{position >= 0 ? <strong>#{position + 1}</strong> : null}</figcaption>
      <ol>{rows.map(entry => <li key={entry.id} className={entry.id === wine.id ? "cq-rank-current" : undefined} aria-current={entry.id === wine.id ? "true" : undefined}>
        <p><span>{entry.name}{entry.vintage ? ` · ${entry.vintage}` : ""}</span><b>{formatMoney(entry.value, wine.currency, locale)}</b></p>
        <span className="cq-origin-bar"><i style={{ width: `${entry.value / max * 100}%` }} /></span>
      </li>)}</ol>
      <p>{it ? `Pesa il ${formatPercentage(share, locale, share < 10 ? 1 : 0)} del valore totale in ${wine.currency}.` : `${formatPercentage(share, locale, share < 10 ? 1 : 0)} of the total value in ${wine.currency}.`}</p>
    </figure>;
  }
  return <figure className="cq-context cq-share">
    <figcaption><span>{it ? "Peso sulla collezione" : "Weight in the collection"}</span></figcaption>
    <div className="cq-share-body">
      <svg viewBox="0 0 100 100" role="img" aria-label={`${formatPercentage(share, locale, 1)} ${it ? "del valore" : "of the value"}`}>
        <g transform="rotate(-90 50 50)"><circle cx="50" cy="50" r="40" className="cq-donut-track" /><circle cx="50" cy="50" r="40" pathLength={100} className="cq-share-arc" strokeDasharray={`${Math.max(share, 1.5)} 100`} /></g>
        <text x="50" y="54" textAnchor="middle" className="cq-donut-num">{formatPercentage(share, locale, share < 10 ? 1 : 0)}</text>
      </svg>
      <p><strong>{formatMoney(item.totalValue, wine.currency, locale)}</strong><span>{it ? `del valore totale della cantina in ${wine.currency}` : `of the cellar’s total value in ${wine.currency}`}</span></p>
    </div>
    {item.sharePct > 0 && item.sharePct < 100 ? <div className="cq-share-mine">
      <span>{it ? "La tua quota" : "Your share"}<b>{formatPercentage(item.sharePct, locale, 0)} · {formatMoney(item.ownedValue, wine.currency, locale)}</b></span>
      <span className="cq-origin-bar"><i style={{ width: `${item.sharePct}%` }} /></span>
    </div> : null}
  </figure>;
}

/** "Il quadrante": premium collector home answering "what deserves my attention today?" — drop-in for CollectorDashboard. */
export function CollectorQuadrante({ children, wines, featured, recent, locale, canShowPhotos, showRiserva, onExploreRiserva, onOpen, now }: {
  children: ReactNode; wines: Wine[]; featured: FeaturedWine[]; ready: Wine[]; recent: Wine[]; locale: Locale; canShowPhotos: boolean;
  showRiserva: boolean; onExploreRiserva: () => void; onOpen: (wine: Wine) => void; now?: Date;
}) {
  const it = locale === "it";
  const today = now ?? new Date();
  const year = today.getFullYear();
  const [index, setIndex] = useState(0);
  const rail = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const pick = featured.length ? Math.min(index, featured.length - 1) : 0;
  const current = featured.length ? featured[pick] : null;
  // The rail scrolls natively (touch swipe, trackpad, keyboard); the arrows and the counter follow its position.
  function goTo(target: number) {
    const element = rail.current;
    if (!element) return;
    const next = Math.max(0, Math.min(featured.length - 1, target));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollTo({ left: next * element.clientWidth, behavior: reduce ? "auto" : "smooth" });
    setIndex(next);
  }
  function followScroll() {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const element = rail.current;
      if (element && element.clientWidth) setIndex(Math.round(element.scrollLeft / element.clientWidth));
    });
  }
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const bottles = (items: Wine[]) => items.reduce((sum, wine) => sum + wine.quantity, 0);
  const bott = it ? "bott." : "btl.";
  const count = (items: Wine[]) => `${formatBottleCount(bottles(items), locale)} ${bott} · ${items.length} ${it ? (items.length === 1 ? "vino" : "vini") : (items.length === 1 ? "wine" : "wines")}`;
  const stock = wines.filter(wine => wine.quantity > 0);
  const available = stock.filter(isWinePhysicallyInCellar);
  const toCollect = stock.filter(wine => !isWinePhysicallyInCellar(wine)).filter(isToCollectWine);
  const hasWindow = (wine: Wine) => Boolean(wine.drink_from && wine.drink_to && wine.drink_from <= wine.drink_to);
  const overdue = available.filter(wine => hasWindow(wine) && wine.drink_to! < year);
  const closing = available.filter(wine => hasWindow(wine) && wine.drink_to === year);
  const readyNow = available.filter(w => hasWindow(w) && w.drink_to! > year && (w.drink_peak_from || w.drink_from!) <= year);
  const lanes: Lane[] = [
    { key: "overdue", label: it ? "Oltre la finestra" : "Past the window", items: overdue },
    { key: "closing", label: it ? "In chiusura quest’anno" : "Closing this year", items: closing },
    { key: "ready", label: it ? "Pronte da bere" : "Ready to drink", items: readyNow },
    { key: "waiting", label: it ? "Da attendere" : "To wait for", items: available.filter(w => hasWindow(w) && w.drink_to! > year && (w.drink_peak_from || w.drink_from!) > year) },
    { key: "unknown", label: it ? "Senza finestra" : "Without a window", items: available.filter(w => !hasWindow(w)) },
  ];
  const dated = available.filter(hasWindow);
  const first = Math.max(year - MAX_BEFORE, Math.min(year - 2, ...dated.map(w => w.drink_from!)));
  const last = Math.min(year + MAX_AFTER, Math.max(year + 4, ...dated.map(w => w.drink_to!)));
  const pos = (value: number) => Math.max(0, Math.min(100, (value - first) / (last - first) * 100));
  const ticks = [first, Math.round((first + last) / 2), last];

  // Composition by wine style and origin, weighted by bottles.
  const toneNames: Record<string, string> = it
    ? { red: "Rossi", white: "Bianchi", sparkling: "Spumanti", rose: "Rosati", sweet: "Dolci", other: "Altri" }
    : { red: "Red", white: "White", sparkling: "Sparkling", rose: "Rosé", sweet: "Sweet", other: "Other" };
  const toneBottles = new Map<string, number>();
  for (const wine of stock) toneBottles.set(wineTone(wine.type), (toneBottles.get(wineTone(wine.type)) || 0) + wine.quantity);
  const totalBottles = bottles(stock);
  const styles = [...toneBottles].sort(([, a], [, b]) => b - a).map(([tone, value]) => ({ tone, value, pct: totalBottles ? value / totalBottles * 100 : 0 }));
  let cumulative = 0;
  const origins = topWineBottleGroups(stock, "region").slice(0, 4);

  const slots = Children.toArray(children).filter(isValidElement);
  const atlasSlot = slots.find(slot => slot.type === CollectorAtlas);
  // The timeline above already covers maturity: the atlas keeps Origins and Value only.
  const atlas = atlasSlot ? cloneElement(atlasSlot as React.ReactElement<{ maturity?: ReactNode }>, { maturity: null }) : null;
  const details = slots.filter(slot => slot.type === "details");

  function wineButtons(items: Wine[]) {
    return <div className="cq-wines">{items.map(wine => <button type="button" key={wine.id} onClick={() => onOpen(wine)}>
      <span>{wine.name}<small>{[wine.producer, wine.vintage].filter(Boolean).join(" · ")}</small></span>
      <strong>{formatBottleCount(wine.quantity, locale)} {bott}</strong>
    </button>)}</div>;
  }
  function attention(kind: "closing" | "overdue" | "collect", title: string, hint: string, items: Wine[]) {
    return items.length ? <details className={`cq-attention cq-attention-${kind}`} key={kind}>
      <summary><b>{formatBottleCount(bottles(items), locale)}</b><span><strong>{title}</strong><small>{hint} · {items.length} {it ? (items.length === 1 ? "vino" : "vini") : (items.length === 1 ? "wine" : "wines")}</small></span><i aria-hidden="true">›</i></summary>
      {wineButtons(items)}
    </details> : null;
  }
  const attentions = [
    attention("closing", it ? `Finestra in chiusura nel ${year}` : `Window closing in ${year}`, it ? "Da non rimandare" : "Not to be postponed", closing),
    attention("overdue", it ? "Finestra superata" : "Past the window", it ? "Da verificare" : "To review", overdue),
    attention("collect", it ? "Da ritirare" : "To collect", it ? "In consegna" : "Awaiting collection", toCollect),
  ].filter(Boolean);

  return <div className="cq">
    <div className="cq-board">
      <section className="cq-today" aria-label={it ? "La bottiglia del giorno" : "Bottle of the day"}>
        <header><h2>{it ? "La bottiglia del giorno" : "Bottle of the day"}</h2>{featured.length > 1 ? <span>{pick + 1} / {featured.length}</span> : null}</header>
        {current ? <>
          <div className="cq-rail" ref={rail} onScroll={followScroll} tabIndex={0} role="group" aria-roledescription="carousel" aria-label={it ? "Bottiglie in evidenza" : "Highlighted bottles"}>
            {featured.map((item, slideIndex) => <div className="cq-slide" key={item.wine.id} role="group" aria-roledescription="slide" aria-label={`${slideIndex + 1} / ${featured.length}`}>
            <div className="cq-stage">
              {item.wine.vintage ? <span className="cq-year" aria-hidden="true">{item.wine.vintage}</span> : null}
              <div className="cq-stage-top">
                <div className="cq-bottle">
                  <KeyPositionBottleVisual photoUrl={canShowPhotos ? item.wine.photo_thumbnail_url || item.wine.photo_detail_url : ""} detailUrl={canShowPhotos ? item.wine.photo_detail_url : undefined} sizes="(max-width: 900px) 140px, 220px" tone={wineTone(item.wine.type)} />
                </div>
                <div className="cq-stage-copy">
                  <p className="cq-kicker">{[item.wine.appellation || item.wine.region, item.highlight].filter(Boolean).join(" · ")}</p>
                  <h3>{item.wine.name}</h3>
                  <p className="cq-producer">{[item.wine.producer, item.wine.vintage].filter(Boolean).join(" · ")}</p>
                  <p className="cq-why">{featuredExplanation(item, locale)}</p>
                  <p className="cq-meta">{featuredCaption(item, locale).label}: {featuredCaption(item, locale).metric} · {formatBottleCount(item.wine.quantity, locale)} {bott}{hasWindow(item.wine) ? ` · ${it ? "finestra" : "window"} ${item.wine.drink_from}–${item.wine.drink_to}` : ""}</p>
                </div>
              </div>
              <FeaturedContext item={item} stock={stock} locale={locale} />
            </div>
            </div>)}
          </div>
          <div className="cq-today-actions">
            <button type="button" className="cq-primary" onClick={() => onOpen(current.wine)}>{it ? "Apri la scheda" : "Open the wine"}</button>
            {featured.length > 1 ? <>
              <button type="button" aria-label={it ? "Proposta precedente" : "Previous pick"} disabled={pick <= 0} onClick={() => goTo(pick - 1)}>‹</button>
              <button type="button" aria-label={it ? "Proposta successiva" : "Next pick"} disabled={pick >= featured.length - 1} onClick={() => goTo(pick + 1)}>›</button>
            </> : null}
          </div>
        </> : <p className="cq-empty">{it ? "Nessun vino in primo piano con i dati disponibili." : "No highlighted wine with the available data."}</p>}
      </section>

      <div className="cq-side">
      <section className="cq-timeline" aria-label={it ? "Linea del tempo di maturità" : "Maturity timeline"}>
        <h2>{it ? "Quando berle" : "When to drink"}</h2>
        <p className="cq-note">{it ? "Solo le bottiglie presenti in cantina · finestre indicative" : "Physically present bottles only · indicative windows"}</p>
        <div className="cq-panel cq-lanes">
          <div className="cq-axis" aria-hidden="true">
            <div className="cq-axis-ticks">{ticks.map(tick => <span key={tick}>{tick}</span>)}</div>
            <span className="cq-today-mark" style={{ left: `${pos(year)}%` }}><b>{it ? "Oggi" : "Today"}</b></span>
          </div>
          {lanes.filter(lane => lane.items.length > 0).map(lane => {
            const dates = lane.items.filter(hasWindow);
            const from = dates.length ? Math.min(...dates.map(w => w.drink_from!)) : null;
            const to = dates.length ? Math.max(...dates.map(w => w.drink_to!)) : null;
            const left = from === null ? 0 : pos(from);
            const width = from === null || to === null ? 100 : Math.max(2, pos(to + 1) - left);
            return <details className="cq-lane" key={lane.key}>
              <summary>
                <span className="cq-lane-head"><strong>{lane.label}</strong><span><b>{formatBottleCount(bottles(lane.items), locale)}</b> <small>{bott} · {lane.items.length} {it ? "vini" : "wines"}</small></span></span>
                <span className="cq-track" role="img" aria-label={from === null || to === null ? (it ? "Finestra non disponibile" : "Window unavailable") : `${from}–${to}`}>
                  <span className={`cq-bar cq-bar-${lane.key}`} style={{ left: `${left}%`, width: `${width}%` }} />
                  <span className="cq-needle" style={{ left: `${pos(year)}%` }} />
                </span>
              </summary>
              {wineButtons(lane.items)}
            </details>;
          })}
          {!available.length ? <p className="cq-empty">{it ? "Nessuna bottiglia presente in cantina." : "No bottles in the cellar."}</p> : null}
        </div>
      </section>
      <section className="cq-follow" aria-label={it ? "Da seguire adesso" : "Follow up now"}>
        <h2>{it ? "Da seguire adesso" : "Follow up now"}</h2>
        {attentions.length ? attentions : <p className="cq-empty">{it ? "Nessuna attenzione da segnalare in base ai dati disponibili." : "Nothing to flag based on the available data."}</p>}
        {overdue.length > 0 ? <p className="cq-note">{it ? "Una finestra superata invita a verificare il vino, non indica un deterioramento." : "A past window calls for a review, not an assumption of deterioration."}</p> : null}
      </section>
      <section aria-label={it ? "La collezione in numeri" : "The collection in numbers"}>
        <h2>{it ? "La collezione in numeri" : "The collection in numbers"}</h2>
        <div className="cq-numbers">
          <div className="cq-panel cq-styles">
            {totalBottles > 0 ? <svg viewBox="0 0 100 100" role="img" aria-label={styles.map(s => `${toneNames[s.tone]} ${Math.round(s.pct)}%`).join(", ")}>
              <g transform="rotate(-90 50 50)">
                <circle cx="50" cy="50" r="40" className="cq-donut-track" />
                {styles.map(s => { const offset = cumulative; cumulative += s.pct; return <circle key={s.tone} cx="50" cy="50" r="40" pathLength={100} fill="none" stroke={TONE_COLORS[s.tone]} strokeWidth="14" strokeDasharray={`${Math.max(0, s.pct - .6)} 100`} strokeDashoffset={-offset} />; })}
              </g>
              <text x="50" y="49" textAnchor="middle" className="cq-donut-num">{formatBottleCount(totalBottles, locale)}</text>
              <text x="50" y="62" textAnchor="middle" className="cq-donut-label">{it ? "BOTTIGLIE" : "BOTTLES"}</text>
            </svg> : null}
            <ul>{styles.map(s => <li key={s.tone}><span><i style={{ background: TONE_COLORS[s.tone] }} />{toneNames[s.tone]}</span><strong>{Math.round(s.pct)}%</strong></li>)}</ul>
          </div>
          <div className="cq-panel cq-origins">
            <div><strong>{it ? "Origini principali" : "Leading origins"}</strong><span>{it ? "per bottiglie" : "by bottles"}</span></div>
            {origins.map(o => <div key={o.label} className="cq-origin"><p><span>{o.label}</span><b>{formatBottleCount(o.value, locale)}</b></p><span className="cq-origin-bar"><i style={{ width: `${o.value / origins[0].value * 100}%` }} /></span></div>)}
          </div>
        </div>
      </section>
      </div>
    </div>

    {showRiserva ? <RiservaBanner locale={locale} onExplore={onExploreRiserva} /> : null}

    <ScrollGallery title={it ? "Ultimi arrivi" : "Recent arrivals"} locale={locale} count={recent.length} className="collector-mobile-gallery collector-mobile-arrivals cq-arrivals">
      {recent.map(wine => <div role="listitem" key={wine.id}>
        <button type="button" onClick={() => onOpen(wine)}>
          <KeyPositionBottleVisual photoUrl={canShowPhotos ? wine.photo_thumbnail_url || wine.photo_detail_url : ""} detailUrl={canShowPhotos ? wine.photo_detail_url : undefined} sizes="160px" tone={wineTone(wine.type)} />
          <strong>{wine.name}</strong>
          <span>{[wine.producer, wine.vintage].filter(Boolean).join(" · ")}</span>
          <small>{wine.created_at ? new Intl.DateTimeFormat(it ? "it-CH" : "en-GB").format(new Date(wine.created_at)) : `${formatBottleCount(wine.quantity, locale)} ${bott}`}</small>
        </button>
      </div>)}
    </ScrollGallery>

    <section className="cq-evolution" aria-label={it ? "Come sta cambiando la tua cantina" : "How your cellar is changing"}>
      <Suspense fallback={<p role="status">{it ? "Caricamento grafici…" : "Loading charts…"}</p>}>
        <CollectorEvolution wines={wines} locale={locale} now={today} onOpen={onOpen} hideHorizon />
      </Suspense>
    </section>

    {atlas}
    {details}
  </div>;
}
