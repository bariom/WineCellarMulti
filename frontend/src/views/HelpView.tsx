import { useEffect, useMemo, useRef, useState } from "react";

import type { Locale } from "../types";
import { searchHelpArticles } from "../help/articleFactory";
import type { HelpArticle, HelpCategory, HelpRole } from "../help/types";
import "./HelpView.css";

type HelpViewProps = {
  locale: Locale;
  role: HelpRole;
  aiAvailable: boolean;
  initialSlug: string | null;
  onArticleChange: (slug: string | null) => void;
  onClose: () => void;
  onZeroResults?: (query: string) => void;
};

const categories: HelpCategory[] = ["getting-started", "cellar", "decisions", "sharing", "account", "troubleshooting"];
const aiArticleIds = new Set(["label-recognition", "value-window", "wishlist", "pairing", "buying-advice", "compare", "ai-pack"]);
const categoryLabels: Record<Locale, Record<HelpCategory, string>> = {
  it: { "getting-started": "Per iniziare", cellar: "Cantina", decisions: "Decisioni", sharing: "Condivisioni", account: "Account", troubleshooting: "Problemi" },
  en: { "getting-started": "Getting started", cellar: "Cellar", decisions: "Decisions", sharing: "Sharing", account: "Account", troubleshooting: "Troubleshooting" },
};

async function loadArticles(locale: Locale): Promise<HelpArticle[]> {
  return locale === "it"
    ? (await import("../help/articles.it")).helpArticles
    : (await import("../help/articles.en")).helpArticles;
}

function usefulnessKey(article: HelpArticle) {
  return `vinaris-help-useful:${article.locale}:${article.id}`;
}

export default function HelpView({ locale, role, aiAvailable, initialSlug, onArticleChange, onClose, onZeroResults }: HelpViewProps) {
  const [articles, setArticles] = useState<HelpArticle[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<HelpCategory | "all">("all");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(initialSlug);
  const [feedback, setFeedback] = useState<"yes" | "no" | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const articleRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let active = true;
    setArticles([]);
    void loadArticles(locale).then((next) => { if (active) setArticles(next); });
    return () => { active = false; };
  }, [locale]);

  useEffect(() => {
    setSelectedSlug(initialSlug);
  }, [initialSlug]);

  const visibleArticles = useMemo(() => {
    const byCategory = category === "all" ? articles : articles.filter((article) => article.category === category);
    return searchHelpArticles(byCategory, query);
  }, [articles, category, query]);
  const selectedArticle = articles.find((article) => article.slug === selectedSlug || article.id === selectedSlug) || null;
  const selectedUsesAi = Boolean(selectedArticle && aiArticleIds.has(selectedArticle.id));
  const frequentArticles = articles.filter((article) => ["onboarding", "cellar-filters", "value-window", "ai-pack"].includes(article.id));

  useEffect(() => {
    if (!selectedArticle) return;
    setFeedback((localStorage.getItem(usefulnessKey(selectedArticle)) as "yes" | "no" | null) || null);
    articleRef.current?.focus();
  }, [selectedArticle]);

  useEffect(() => {
    if (query.trim() && articles.length && visibleArticles.length === 0) onZeroResults?.(query.trim());
  }, [articles.length, onZeroResults, query, visibleArticles.length]);

  function openArticle(article: HelpArticle) {
    setSelectedSlug(article.slug);
    onArticleChange(article.slug);
  }

  function closeArticle() {
    setSelectedSlug(null);
    onArticleChange(null);
    window.requestAnimationFrame(() => searchRef.current?.focus());
  }

  function saveFeedback(value: "yes" | "no") {
    if (!selectedArticle) return;
    localStorage.setItem(usefulnessKey(selectedArticle), value);
    setFeedback(value);
  }

  if (!articles.length) return <div className="help-center" aria-busy="true" />;

  if (selectedArticle) {
    const related = selectedArticle.relatedArticles
      .map((id) => articles.find((article) => article.id === id))
      .filter((article): article is HelpArticle => Boolean(article));
    const roleNote = selectedArticle.roles.includes(role)
      ? null
      : locale === "it" ? "Questa funzione potrebbe non essere abilitata per il tuo ruolo." : "This feature may not be enabled for your role.";
    return (
      <section className="help-center help-article-view" aria-label={locale === "it" ? "Articolo assistenza" : "Help article"}>
        <div className="help-toolbar no-print">
          <button type="button" className="secondary compact" onClick={closeArticle}>{locale === "it" ? "Torna al centro assistenza" : "Back to Help Center"}</button>
          <button type="button" className="secondary compact" onClick={() => window.print()}>{locale === "it" ? "Stampa" : "Print"}</button>
          <a className="secondary compact help-support-link" href={`mailto:?subject=${encodeURIComponent(`Vinaris · ${selectedArticle.title}`)}`}>{locale === "it" ? "Contatta supporto" : "Contact support"}</a>
          <button type="button" className="help-close-button" onClick={onClose} aria-label={locale === "it" ? "Chiudi il centro assistenza" : "Close Help Center"} title={locale === "it" ? "Chiudi assistenza" : "Close help"} />
        </div>
        <article className="help-article" ref={articleRef} tabIndex={-1}>
          <p className="eyebrow">{categoryLabels[locale][selectedArticle.category]}</p>
          {selectedUsesAi ? <span className="help-ai-badge">AI · {locale === "it" ? "Funzione assistita" : "Assisted feature"}</span> : null}
          <h2>{selectedArticle.title}</h2>
          <p className="help-summary">{selectedArticle.summary}</p>
          {roleNote ? <p className="help-role-note">{roleNote}</p> : null}
          {selectedUsesAi ? <p className="help-ai-note">{aiAvailable ? (locale === "it" ? "AI disponibile: verifica sempre risultati, fonti e costi prima di agire." : "AI is available: always verify results, sources and costs before acting.") : (locale === "it" ? "AI non configurata: questa funzione richiede una chiave personale oppure credito AI Pack." : "AI is not configured: this feature requires a personal key or AI Pack credit.")}</p> : null}
          <h3>{locale === "it" ? "Passaggi" : "Steps"}</h3>
          <ol>{selectedArticle.steps.map((step) => <li key={step}>{step}</li>)}</ol>
          {selectedArticle.warnings.length ? <aside className="help-warnings"><strong>{locale === "it" ? "Attenzione" : "Important"}</strong>{selectedArticle.warnings.map((warning) => <p key={warning}>{warning}</p>)}</aside> : null}
          {related.length ? <nav className="help-related" aria-label={locale === "it" ? "Articoli correlati" : "Related articles"}>{related.map((article) => <button type="button" key={article.id} onClick={() => openArticle(article)}>{article.title}</button>)}</nav> : null}
          <div className="help-feedback no-print"><span>{locale === "it" ? "Questo articolo è stato utile?" : "Was this article helpful?"}</span><button type="button" aria-pressed={feedback === "yes"} onClick={() => saveFeedback("yes")}>{locale === "it" ? "Sì" : "Yes"}</button><button type="button" aria-pressed={feedback === "no"} onClick={() => saveFeedback("no")}>{locale === "it" ? "No" : "No"}</button></div>
          <small>{locale === "it" ? "Aggiornato" : "Updated"}: {selectedArticle.updatedAt}</small>
        </article>
      </section>
    );
  }

  return (
    <section className="help-center" aria-label={locale === "it" ? "Centro assistenza" : "Help Center"}>
      <div className="help-hero">
        <button type="button" className="help-close-button" onClick={onClose} aria-label={locale === "it" ? "Chiudi il centro assistenza" : "Close Help Center"} title={locale === "it" ? "Chiudi assistenza" : "Close help"} />
        <p className="eyebrow">{locale === "it" ? "Centro assistenza" : "Help Center"}</p>
        <h2>{locale === "it" ? "Come possiamo aiutarti?" : "How can we help?"}</h2>
        <p>{locale === "it" ? "Cerca guide operative, funzioni AI, ruoli e soluzioni ai problemi." : "Search practical guides, AI features, roles and troubleshooting."}</p>
        <label className="help-search"><span className="sr-only">{locale === "it" ? "Cerca assistenza" : "Search help"}</span><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={locale === "it" ? "Cerca per parola chiave…" : "Search by keyword…"} /></label>
      </div>
      <nav className="help-categories" aria-label={locale === "it" ? "Categorie assistenza" : "Help categories"}>
        <button type="button" aria-current={category === "all" ? "page" : undefined} onClick={() => setCategory("all")}>{locale === "it" ? "Tutte" : "All"}</button>
        {categories.map((item) => <button type="button" key={item} aria-current={category === item ? "page" : undefined} onClick={() => setCategory(item)}>{categoryLabels[locale][item]}</button>)}
      </nav>
      {!query && category === "all" ? <section><h3>{locale === "it" ? "Attività frequenti" : "Frequent tasks"}</h3><div className="help-grid">{frequentArticles.map((article) => <button type="button" className="help-card" key={article.id} onClick={() => openArticle(article)}>{aiArticleIds.has(article.id) ? <span className="help-ai-badge">AI</span> : null}<strong>{article.title}</strong><span>{article.summary}</span></button>)}</div></section> : null}
      <section><h3>{query ? (locale === "it" ? "Risultati" : "Results") : categoryLabels[locale][category === "all" ? "getting-started" : category]}</h3>{visibleArticles.length ? <div className="help-grid">{visibleArticles.map((article) => <button type="button" className="help-card" key={article.id} onClick={() => openArticle(article)}><span>{categoryLabels[locale][article.category]}</span>{aiArticleIds.has(article.id) ? <span className="help-ai-badge">AI</span> : null}<strong>{article.title}</strong><small>{article.summary}</small>{!article.roles.includes(role) ? <em>{locale === "it" ? "Dipende dal ruolo" : "Role dependent"}</em> : null}</button>)}</div> : <div className="empty-state-panel" role="status"><div><strong>{locale === "it" ? "Nessun articolo trovato" : "No articles found"}</strong><span>{locale === "it" ? "Prova sinonimi o contatta il supporto." : "Try different words or contact support."}</span></div></div>}</section>
    </section>
  );
}
