import { useEffect, useState } from "react";
import type { Locale } from "../types";
import { api } from "../services/api";
import LandingHeader from "./landing/LandingHeader";
import { landingCopy } from "./landing/content";
import {
  InsightsVisual,
  LandingIcon,
  MaturityVisual,
  SommelierVisual,
} from "./landing/LandingVisuals";
import "./PublicLanding.css";

type PublicLandingProps = {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  onRegister: () => void;
  onLogin: () => void;
  onDemo: () => void;
  demoLoading?: boolean;
};

const iconNames = ["search", "window", "insights"] as const;
const restaurantContactCodePoints = [105, 110, 102, 111, 64, 118, 105, 110, 97, 114, 105, 115, 46, 97, 112, 112];
const defaultFreeTierLabelLimit = 30;

type PublicAppConfig = {
  free_tier_label_limit: number;
};

function RestaurantContactButton({ label }: { label: string }) {
  const openContact = () => {
    const address = String.fromCodePoint(...restaurantContactCodePoints);
    window.location.assign(`mailto:${address}`);
  };

  return <button type="button" className="marketing-button secondary compact" onClick={openContact}>{label}</button>;
}

function ensureMeta(name: string, content: string, property = false) {
  const selector = property ? `meta[property="${name}"]` : `meta[name="${name}"]`;
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(property ? "property" : "name", name);
    document.head.appendChild(element);
  }
  element.content = content;
}

const seoContent = {
  it: {
    eyebrow: "Enciclopedia della cantina",
    title: "Cantina vino digitale per collezionisti e sommelier",
    body: "Vinaris è una cantina digitale privata per organizzare bottiglie, annate, produttori, valore e finestre di beva. È pensata per chi cerca un wine cellar moderno, per il collezionista e per chi vuole un sommelier AI che conosca davvero i vini presenti in cantina.",
    regionsTitle: "Regioni vinicole e denominazioni",
    regionsBody: "Organizza la tua collezione per regione produttrice e scopri l’equilibrio della cantina tra grandi classici italiani e internazionali.",
    regions: ["Ticino", "Piemonte", "Toscana", "Veneto", "Borgogna", "Bordeaux", "Champagne", "Rodano", "Rioja", "Napa Valley"],
    faqTitle: "Domande frequenti su Vinaris",
    faq: [
      ["Che cos’è Vinaris?", "Vinaris è un’app per gestire una cantina di vino privata: inventario, maturità, valore, wishlist, degustazioni e consigli del sommelier AI."],
      ["Vinaris è una cantina digitale o un wine cellar manager?", "Entrambe le cose: Vinaris è una cantina digitale per collezionisti di vino, disponibile sul web e progettata per seguire ogni bottiglia nel tempo."],
      ["Posso organizzare i vini per regione, incluso il Ticino?", "Sì. Puoi catalogare i vini per paese, regione e denominazione, inclusi Ticino, Piemonte, Toscana, Bordeaux, Borgogna, Champagne, Rioja e Napa Valley."],
    ],
  },
  en: {
    eyebrow: "Cellar knowledge",
    title: "Digital wine cellar for collectors and sommeliers",
    body: "Vinaris is a private digital wine cellar for organising bottles, vintages, producers, value, and drinking windows. It is built for collectors and for anyone who wants an AI sommelier that understands the wines in their own cellar.",
    regionsTitle: "Wine regions and classic appellations",
    regionsBody: "Organise your collection by producing region and understand the balance between classic Italian and international wines.",
    regions: ["Ticino", "Piedmont", "Tuscany", "Veneto", "Burgundy", "Bordeaux", "Champagne", "Rhône", "Rioja", "Napa Valley"],
    faqTitle: "Frequently asked questions about Vinaris",
    faq: [
      ["What is Vinaris?", "Vinaris is a private wine cellar app for inventory, maturity, value, wishlist, tasting notes, and AI sommelier recommendations."],
      ["Is Vinaris a digital cellar or a wine cellar manager?", "Both: Vinaris is a digital wine cellar for collectors, available on the web and designed to follow every bottle over time."],
      ["Can I organise wines by region, including Ticino?", "Yes. Catalogue wines by country, region, and appellation, including Ticino, Piedmont, Tuscany, Bordeaux, Burgundy, Champagne, Rioja, and Napa Valley."],
    ],
  },
} as const;

export default function PublicLanding({
  locale,
  onLocaleChange,
  onRegister,
  onLogin,
  onDemo,
  demoLoading = false,
}: PublicLandingProps) {
  const [freeTierLabelLimit, setFreeTierLabelLimit] = useState(defaultFreeTierLabelLimit);
  const copy = landingCopy[locale];
  const labelLimitPattern = /\b30\b/g;
  const dynamicCopy = {
    ...copy,
    hero: { ...copy.hero, signal: copy.hero.signal.replace(labelLimitPattern, String(freeTierLabelLimit)) },
    closing: {
      ...copy.closing,
      tiers: copy.closing.tiers.map((tier) => ({
        ...tier,
        body: tier.body.replace(labelLimitPattern, String(freeTierLabelLimit)),
      })),
    },
  };
  const seo = seoContent[locale];
  const openingLabel = locale === "it" ? "Apertura…" : "Opening…";

  useEffect(() => {
    let active = true;
    void api<PublicAppConfig>("/api/v1/public-config")
      .then((config) => {
        if (active && Number.isInteger(config.free_tier_label_limit) && config.free_tier_label_limit > 0) {
          setFreeTierLabelLimit(config.free_tier_label_limit);
        }
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = dynamicCopy.meta.title;
    ensureMeta("description", dynamicCopy.meta.description);
    ensureMeta("og:title", dynamicCopy.meta.title, true);
    ensureMeta("og:description", dynamicCopy.meta.description, true);
    ensureMeta("og:type", "website", true);
    ensureMeta("og:url", "https://vinaris.app/", true);
    ensureMeta("og:image", "https://vinaris.app/landing/demo-dashboard-desktop.webp", true);
    ensureMeta("twitter:title", copy.meta.title);
    ensureMeta("twitter:description", copy.meta.description);
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = "https://vinaris.app/";
  }, [dynamicCopy.meta.description, dynamicCopy.meta.title, locale]);

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: seo.faq.map(([question, answer]) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };

  return (
    <div className="marketing-site">
      <LandingHeader
        copy={dynamicCopy}
        locale={locale}
        onLocaleChange={onLocaleChange}
        onLogin={onLogin}
        onRegister={onRegister}
      />

      <main id="top" className="marketing-landing">
        <section className="marketing-hero" aria-labelledby="marketing-title">
          <div className="marketing-hero-copy" data-reveal>
            <p className="marketing-kicker">{copy.hero.eyebrow}</p>
            <h1 id="marketing-title">{copy.hero.title}</h1>
            <p className="marketing-hero-lead">{copy.hero.lead}</p>
            <div className="marketing-actions">
              <button type="button" className="marketing-button primary" onClick={onRegister}>{copy.hero.primary}</button>
              <a className="marketing-button secondary" href="#product">{copy.hero.secondary}</a>
              <button type="button" className="marketing-button secondary marketing-demo-button" onClick={onDemo} disabled={demoLoading}>
                <span aria-hidden="true">↗</span>{demoLoading ? openingLabel : copy.hero.demo}
              </button>
            </div>
            <div className="marketing-hero-proof">
              <span><i />{dynamicCopy.hero.signal}</span>
              <span>{dynamicCopy.hero.web}</span>
            </div>
          </div>
          <figure data-reveal className="marketing-hero-product marketing-real-product">
            <picture>
              <img
                src="/landing/demo-dashboard-desktop.webp"
                alt={copy.origin.desktopAlt}
                width="1440"
                height="920"
                fetchPriority="high"
              />
            </picture>
            <figcaption><span>{copy.origin.demoLabel}</span><strong>{copy.origin.desktopCaption}</strong></figcaption>
          </figure>
        </section>

        <section className="marketing-value-strip" aria-label={copy.origin.eyebrow} data-reveal>
          {copy.value.map((item, index) => (
            <article key={item.title}>
              <span><LandingIcon name={iconNames[index]} /></span>
              <div><h2>{item.title}</h2><p>{item.body}</p></div>
            </article>
          ))}
        </section>

        <section id="product" className="marketing-section marketing-origin-section">
          <div className="marketing-origin-copy" data-reveal>
            <p className="marketing-kicker">{copy.origin.eyebrow}</p>
            <h2>{copy.origin.title}</h2>
            <p>{copy.origin.body}</p>
            <p className="marketing-origin-signature">{copy.origin.signature}</p>
          </div>
          <figure className="marketing-origin-device" data-reveal>
            <img src="/landing/demo-dashboard-mobile.webp" alt={copy.origin.mobileAlt} width="390" height="844" />
            <figcaption><span>{copy.origin.demoLabel}</span>{copy.origin.mobileCaption}</figcaption>
          </figure>
        </section>

        <section id="maturity" className="marketing-section marketing-maturity-section">
          <div className="marketing-section-copy" data-reveal>
            <p className="marketing-kicker">{copy.maturity.eyebrow}</p>
            <h2>{copy.maturity.title}</h2>
            <p>{copy.maturity.body}</p>
            <div className="marketing-stage-key">
              {copy.maturity.stages.map((stage, index) => <span key={stage}><i className={`stage-${index}`} />{stage}</span>)}
            </div>
          </div>
          <div data-reveal><MaturityVisual copy={copy} /><small className="marketing-legal-note">{copy.maturity.note}</small></div>
        </section>

        <section id="sommelier" className="marketing-section marketing-sommelier-section">
          <div className="marketing-section-copy" data-reveal>
            <p className="marketing-kicker">{copy.sommelier.eyebrow}</p>
            <h2>{copy.sommelier.title}</h2>
            <p>{copy.sommelier.body}</p>
          </div>
          <div data-reveal><SommelierVisual copy={copy} /></div>
        </section>

        <section id="insights" className="marketing-section marketing-insights-section">
          <div className="marketing-section-copy" data-reveal>
            <p className="marketing-kicker">{copy.insights.eyebrow}</p>
            <h2>{copy.insights.title}</h2>
            <p>{copy.insights.body}</p>
          </div>
          <div data-reveal><InsightsVisual copy={copy} locale={locale} /></div>
        </section>

        <section className="marketing-section marketing-restaurant-section" data-reveal>
          <div className="marketing-restaurant-copy">
            <p className="marketing-kicker">{copy.restaurant.eyebrow}</p>
            <h2>{copy.restaurant.title}</h2>
            <p>{copy.restaurant.body}</p>
          </div>
          <aside>
            <span>{copy.restaurant.availability}</span>
            <small>{copy.restaurant.initialFee}</small>
            <RestaurantContactButton label={copy.restaurant.contact} />
          </aside>
          <figure className="marketing-restaurant-dashboard">
            <img src={locale === "it" ? "/landing/restaurant-dashboard-preview.png" : "/landing/restaurant-dashboard-preview-en.png"} alt={copy.restaurant.dashboardAlt} width="1536" height="1024" loading="lazy" />
          </figure>
        </section>

        <section className="marketing-section marketing-seo-section" aria-labelledby="seo-title" data-reveal>
          <div className="marketing-section-copy">
            <p className="marketing-kicker">{seo.eyebrow}</p>
            <h2 id="seo-title">{seo.title}</h2>
            <p>{seo.body}</p>
          </div>
          <div className="marketing-seo-regions">
            <h3>{seo.regionsTitle}</h3>
            <p>{seo.regionsBody}</p>
            <ul>{seo.regions.map((region) => <li key={region}>{region}</li>)}</ul>
          </div>
          <div className="marketing-seo-faq">
            <h3>{seo.faqTitle}</h3>
            {seo.faq.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}
          </div>
        </section>

        <section id="access" className="marketing-closing-section" data-reveal>
          <div>
            <p className="marketing-kicker">{copy.closing.eyebrow}</p>
            <h2>{copy.closing.title}</h2>
            <p>{copy.closing.body}</p>
            <div className="marketing-actions">
              <button type="button" className="marketing-button primary" onClick={onRegister}>{copy.closing.primary}</button>
              <button type="button" className="marketing-button secondary" onClick={onDemo} disabled={demoLoading}>{demoLoading ? openingLabel : copy.closing.demo}</button>
            </div>
          </div>
          <aside aria-label={copy.nav.pricing}>
            {dynamicCopy.closing.tiers.map((tier, index) => <div className="marketing-tier" key={tier.name}>
              {index ? <i /> : null}
              <span>{tier.label}</span><strong>{tier.name}</strong><small>{tier.body}</small><small>{tier.note}</small>
            </div>)}
            <p><b>AI</b>{copy.closing.aiNote}</p>
          </aside>
        </section>
      </main>

      <footer className="marketing-footer">
        <a className="marketing-brand" href="#top" aria-label="Vinaris"><img src="/icons/icon-192.png" alt="" width="38" height="38" /><span><strong>Vinaris</strong><small>{copy.footer.statement}</small></span></a>
        <nav aria-label={locale === "it" ? "Informazioni legali" : "Legal information"}>
          <a href={`/privacy?lang=${locale}`}>{copy.footer.privacy}</a>
          <a href={`/privacy?lang=${locale}#cookies`}>{copy.footer.cookies}</a>
          <a href={`/terms?lang=${locale}`}>{copy.footer.terms}</a>
        </nav>
        <small>© {new Date().getFullYear()} Vinaris</small>
      </footer>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
    </div>
  );
}
