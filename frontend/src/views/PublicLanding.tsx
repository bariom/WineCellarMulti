import { useEffect } from "react";
import type { Locale } from "../types";
import LandingHeader from "./landing/LandingHeader";
import { landingCopy } from "./landing/content";
import {
  BottleJourneyVisual,
  InsightsVisual,
  LandingIcon,
  MaturityVisual,
  ProductPreview,
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
const featureIcons = ["spark", "window", "cellar", "insights", "search", "camera"] as const;

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

export default function PublicLanding({
  locale,
  onLocaleChange,
  onRegister,
  onLogin,
  onDemo,
  demoLoading = false,
}: PublicLandingProps) {
  const copy = landingCopy[locale];
  const openingLabel = locale === "it" ? "Apertura…" : "Opening…";

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = copy.meta.title;
    ensureMeta("description", copy.meta.description);
    ensureMeta("og:title", copy.meta.title, true);
    ensureMeta("og:description", copy.meta.description, true);
    ensureMeta("og:type", "website", true);
  }, [copy.meta.description, copy.meta.title, locale]);

  return (
    <div className="marketing-site">
      <LandingHeader
        copy={copy}
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
              <span><i />{copy.hero.signal}</span>
              <span>{copy.hero.web}</span>
            </div>
          </div>
          <div data-reveal className="marketing-hero-product"><ProductPreview copy={copy} locale={locale} /></div>
        </section>

        <section className="marketing-value-strip" aria-label={copy.journey.eyebrow} data-reveal>
          {copy.value.map((item, index) => (
            <article key={item.title}>
              <span><LandingIcon name={iconNames[index]} /></span>
              <div><h2>{item.title}</h2><p>{item.body}</p></div>
            </article>
          ))}
        </section>

        <section id="product" className="marketing-section marketing-journey-section">
          <div className="marketing-section-copy" data-reveal>
            <p className="marketing-kicker">{copy.journey.eyebrow}</p>
            <h2>{copy.journey.title}</h2>
            <p>{copy.journey.body}</p>
          </div>
          <BottleJourneyVisual copy={copy} />
          <ol className="marketing-journey-steps">
            {copy.journey.steps.map((step, index) => (
              <li key={step.title} data-reveal>
                <span>0{index + 1}</span><h3>{step.title}</h3><p>{step.body}</p>
              </li>
            ))}
          </ol>
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

        <section className="marketing-section marketing-features-section">
          <div className="marketing-section-copy" data-reveal>
            <p className="marketing-kicker">{copy.features.eyebrow}</p>
            <h2>{copy.features.title}</h2>
          </div>
          <div className="marketing-feature-grid">
            {copy.features.items.map((feature, index) => (
              <article key={feature.title} data-reveal>
                <LandingIcon name={featureIcons[index]} />
                <span>0{index + 1}</span>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
                <strong>{feature.stat}</strong>
              </article>
            ))}
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
            <div><span>{locale === "it" ? "Accesso flessibile" : "Flexible access"}</span><strong>{copy.closing.monthly}</strong></div>
            <i />
            <div><span>{locale === "it" ? "Scelta collezionista" : "Collector choice"}</span><strong>{copy.closing.annual}</strong><small>{copy.closing.annualNote}</small></div>
            <p><b>AI</b>{copy.closing.aiNote}</p>
          </aside>
        </section>
      </main>

      <footer className="marketing-footer">
        <a className="marketing-brand" href="#top" aria-label="Vinaris"><img src="/icons/icon-192.png" alt="" width="38" height="38" /><span><strong>Vinaris</strong><small>{copy.footer.statement}</small></span></a>
        <nav aria-label={locale === "it" ? "Informazioni legali" : "Legal information"}>
          <a href={`/privacy?lang=${locale}`}>{copy.footer.privacy}</a>
          <a href={`/terms?lang=${locale}`}>{copy.footer.terms}</a>
        </nav>
        <small>© {new Date().getFullYear()} Vinaris</small>
      </footer>
    </div>
  );
}
