import { useEffect, useState } from "react";
import { AppIcon } from "../components/AppIcon";
import { api } from "../services/api";
import type {
  Locale,
  WineNewsArticle,
  WineNewsCategory,
  WineNewsFeed,
} from "../types";
import "./WinePulseView.css";

const categoryLabels: Record<Locale, Record<WineNewsCategory, string>> = {
  it: {
    wine_world: "Mondo del vino",
    regions_vintages: "Territori e annate",
    producers: "Produttori",
    market: "Mercato",
    climate_vineyards: "Clima e vigneti",
    events_awards: "Eventi e riconoscimenti",
  },
  en: {
    wine_world: "Wine World",
    regions_vintages: "Regions & Vintages",
    producers: "Producers",
    market: "Market",
    climate_vineyards: "Climate & Vineyards",
    events_awards: "Events & Awards",
  },
};

const categories = Object.keys(categoryLabels.it) as WineNewsCategory[];

function relativeDate(value: string, locale: Locale) {
  const timestamp = new Date(value).getTime();
  const elapsedHours = Math.max(Math.floor((Date.now() - timestamp) / 3_600_000), 0);
  if (elapsedHours < 1) return locale === "it" ? "Adesso" : "Now";
  if (elapsedHours < 24) return locale === "it" ? `${elapsedHours} h fa` : `${elapsedHours}h ago`;
  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) return locale === "it" ? `${elapsedDays} g fa` : `${elapsedDays}d ago`;
  return new Intl.DateTimeFormat(locale === "it" ? "it-IT" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function sourceInitials(source: string) {
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase())
    .join("");
}

function WinePulseArticleCard({ article, locale, featured = false }: {
  article: WineNewsArticle;
  locale: Locale;
  featured?: boolean;
}) {
  return (
    <article className={`wine-pulse-story wine-pulse-story--${article.category}${featured ? " wine-pulse-story--featured" : ""}`}>
      {featured ? (
        <div className="wine-pulse-lead-number" aria-label={locale === "it" ? "Storia di copertina" : "Cover story"}>
          <span>{locale === "it" ? "Copertina" : "Cover"}</span>
          <strong>01</strong>
        </div>
      ) : <div className="wine-pulse-source-mark" aria-hidden="true">{sourceInitials(article.source)}</div>}
      <div className="wine-pulse-story-copy">
        <div className="wine-pulse-story-meta">
          <span>{article.source}</span>
          <i />
          <span>{categoryLabels[locale][article.category]}</span>
          <i />
          <time dateTime={article.published_at}>{relativeDate(article.published_at, locale)}</time>
        </div>
        <h2>{article.headline}</h2>
        <p>{article.summary}</p>
        <div className="wine-pulse-story-footer">
          <small>{locale === "it" ? "Sintesi editoriale Vinaris AI" : "Vinaris AI editorial summary"}</small>
          <a href={article.article_url} target="_blank" rel="noopener noreferrer">
            {locale === "it" ? "Leggi alla fonte" : "Read at source"}
            <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>
      {featured ? (
        <div className="wine-pulse-featured-visual" aria-hidden="true">
          {article.image_url ? (
            <img src={article.image_url} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} />
          ) : null}
          <span>{sourceInitials(article.source)}</span>
        </div>
      ) : null}
    </article>
  );
}

export function WinePulsePreview({ locale, onOpen }: { locale: Locale; onOpen: () => void }) {
  const [feed, setFeed] = useState<WineNewsFeed | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api<WineNewsFeed>(`/api/v1/wine-pulse?locale=${locale}&limit=3`, { signal: controller.signal })
      .then(setFeed)
      .catch(() => undefined);
    return () => controller.abort();
  }, [locale]);

  if (!feed?.items.length) return null;
  return (
    <section className="wine-pulse-preview" aria-labelledby="wine-pulse-preview-title">
      <div className="wine-pulse-preview-heading">
        <div>
          <span>{locale === "it" ? "Dal mondo del vino" : "From the wine world"}</span>
          <h2 id="wine-pulse-preview-title">Vinaris Wine Pulse</h2>
          <p>{locale === "it" ? "Le storie che vale la pena conoscere, selezionate da Vinaris." : "The stories worth knowing, selected by Vinaris."}</p>
        </div>
        <button type="button" className="secondary" onClick={onOpen}>
          {locale === "it" ? "Scopri Wine Pulse" : "Explore Wine Pulse"}
          <AppIcon name="chevron-right" />
        </button>
      </div>
      <div className="wine-pulse-preview-grid">
        {feed.items.map((article) => (
          <WinePulseArticleCard key={article.id} article={article} locale={locale} />
        ))}
      </div>
    </section>
  );
}

export default function WinePulseView({ locale }: { locale: Locale }) {
  const [feed, setFeed] = useState<WineNewsFeed | null>(null);
  const [category, setCategory] = useState<WineNewsCategory | "all">("all");
  const [view, setView] = useState<"current" | "archive">("current");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ locale, view, limit: "20" });
    if (category !== "all") query.set("category", category);
    setFeed(null);
    setLoading(true);
    setFailed(false);
    api<WineNewsFeed>(`/api/v1/wine-pulse?${query}`, { signal: controller.signal })
      .then(setFeed)
      .catch((error: Error) => {
        if (error.name !== "AbortError") setFailed(true);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [locale, category, view]);

  async function loadMore() {
    if (!feed?.next_offset || loadingMore) return;
    const query = new URLSearchParams({
      locale,
      view,
      limit: "20",
      offset: String(feed.next_offset),
    });
    if (category !== "all") query.set("category", category);
    setLoadingMore(true);
    try {
      const next = await api<WineNewsFeed>(`/api/v1/wine-pulse?${query}`);
      setFeed((current) => current ? { ...next, items: [...current.items, ...next.items] } : next);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section className="wine-pulse-view">
      <header className="wine-pulse-hero">
        <div className="wine-pulse-hero-kicker">
          <AppIcon name="newspaper" variant="premium" detailLevel="rich" />
          <span>{locale === "it" ? "Osservatorio editoriale" : "Editorial observatory"}</span>
        </div>
        <h1>Wine Pulse</h1>
        <p>{locale === "it"
          ? "Una selezione essenziale di ciò che sta accadendo nel mondo del vino. Poche storie, scelte con criterio."
          : "An essential selection of what is happening across the wine world. Fewer stories, thoughtfully chosen."}</p>
        {feed?.generated_at ? (
          <small>{locale === "it" ? "Ultimo aggiornamento" : "Last updated"}: {relativeDate(feed.generated_at, locale)}</small>
        ) : null}
        {feed?.total ? (
          <div className="wine-pulse-edition-mark">
            <span>{view === "archive" ? (locale === "it" ? "Archivio Wine Pulse" : "Wine Pulse archive") : (locale === "it" ? "Edizione corrente" : "Current edition")}</span>
            <strong>{feed.total} {locale === "it" ? (feed.total === 1 ? "storia" : "storie") : (feed.total === 1 ? "story" : "stories")}{view === "current" ? (locale === "it" ? " selezionata" : " selected") : ""}</strong>
          </div>
        ) : null}
      </header>

      <div className="wine-pulse-controls">
        <div className="wine-pulse-view-switch" role="tablist" aria-label={locale === "it" ? "Vista Wine Pulse" : "Wine Pulse view"}>
          <button type="button" role="tab" aria-selected={view === "current"} className={view === "current" ? "active" : ""} onClick={() => setView("current")}>
            {locale === "it" ? "Edizione corrente" : "Current edition"}
          </button>
          <button type="button" role="tab" aria-selected={view === "archive"} className={view === "archive" ? "active" : ""} onClick={() => setView("archive")}>
            {locale === "it" ? "Archivio" : "Archive"}
          </button>
        </div>
        <label>
          <span>{locale === "it" ? "Argomento" : "Topic"}</span>
          <select value={category} onChange={(event) => setCategory(event.target.value as WineNewsCategory | "all")}>
            <option value="all">{locale === "it" ? "Tutti gli argomenti" : "All topics"}</option>
            {categories.map((value) => <option key={value} value={value}>{categoryLabels[locale][value]}</option>)}
          </select>
        </label>
      </div>

      {loading ? <div className="wine-pulse-state">{locale === "it" ? "Preparazione della rassegna…" : "Preparing the edition…"}</div> : null}
      {!loading && failed ? <div className="wine-pulse-state wine-pulse-state--error">{locale === "it" ? "Wine Pulse non è momentaneamente disponibile." : "Wine Pulse is temporarily unavailable."}</div> : null}
      {!loading && !failed && !feed?.items.length ? <div className="wine-pulse-state">{locale === "it" ? (view === "archive" ? "L’archivio non contiene ancora storie consultabili." : "Nessuna storia disponibile per questi filtri.") : (view === "archive" ? "The archive does not contain any browsable stories yet." : "No stories are available for these filters.")}</div> : null}
      {!loading && feed?.items.length ? (
        <div className="wine-pulse-feed">
          {feed.items.map((article, index) => (
            <WinePulseArticleCard key={article.id} article={article} locale={locale} featured={view === "current" && index === 0} />
          ))}
          {feed.has_more ? <button type="button" className="wine-pulse-load-more secondary" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? (locale === "it" ? "Caricamento…" : "Loading…") : (locale === "it" ? "Carica altre storie" : "Load more stories")}</button> : null}
        </div>
      ) : null}
      <footer className="wine-pulse-disclosure">
        {locale === "it" && view === "archive" ? "Le storie archiviate restano consultabili fino a 180 giorni. " : null}
        {locale === "it"
          ? "Titoli e sintesi localizzati sono generati automaticamente a partire dai metadati delle fonti. Per il contenuto completo e autorevole consulta sempre l’articolo originale."
          : "Localized headlines and summaries are generated automatically from source metadata. Always consult the original article for the complete, authoritative content."}
      </footer>
    </section>
  );
}
