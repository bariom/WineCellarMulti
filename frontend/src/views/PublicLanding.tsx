import { useCallback, useEffect, useState } from "react";
import type { Locale } from "../types";
import { api } from "../services/api";
import LandingHeader from "./landing/LandingHeader";
import NewsPanel from "./landing/NewsPanel";
import { landingCopy } from "./landing/content";
import { HeroPhone, StoryBeyond, StoryEssentials, StoryPillars } from "./landing/LandingStory";
import { landingStory } from "./landing/story";
import { landingProof } from "./landing/proof";
import "./PublicLanding.css";

type PublicLandingProps = {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  onRegister: () => void;
  onLogin: () => void;
  onDemo: () => void;
  demoLoading?: boolean;
};

const restaurantContactCodePoints = [105, 110, 102, 111, 64, 118, 105, 110, 97, 114, 105, 115, 46, 97, 112, 112];
const defaultFreeTierLabelLimit = 15;

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

export default function PublicLanding({
  locale,
  onLocaleChange,
  onRegister,
  onLogin,
  onDemo,
  demoLoading = false,
}: PublicLandingProps) {
  const [freeTierLabelLimit, setFreeTierLabelLimit] = useState(defaultFreeTierLabelLimit);
  const [newsOpen, setNewsOpen] = useState(false);
  const [newsFocusToken, setNewsFocusToken] = useState(0);
  const openNews = useCallback((open: boolean, userInitiated = false) => {
    setNewsOpen(open);
    if (open && userInitiated) setNewsFocusToken((token) => token + 1);
  }, []);
  const copy = landingCopy[locale];
  const story = landingStory[locale];
  const labelLimitPattern = /\b15\b/g;
  const dynamicCopy = {
    ...copy,
    news: { ...copy.news, note: copy.news.note.replace(labelLimitPattern, String(freeTierLabelLimit)) },
    hero: { ...copy.hero, signal: copy.hero.signal.replace(labelLimitPattern, String(freeTierLabelLimit)) },
    closing: {
      ...copy.closing,
      tiers: copy.closing.tiers.map((tier) => ({
        ...tier,
        body: tier.body.replace(labelLimitPattern, String(freeTierLabelLimit)),
        altPrice: tier.altPrice.replace(labelLimitPattern, String(freeTierLabelLimit)),
      })),
    },
  };
  const faqs = copy.conversion.faq.map((item) => ({ ...item, answer: item.answer.replace(labelLimitPattern, String(freeTierLabelLimit)) }));
  const desktopDemoImage = locale === "it" ? "/landing/vinaris-demo-desktop-it.png" : "/landing/vinaris-demo-desktop-en.png";
  const openingLabel = locale === "it" ? "Apertura…" : "Opening…";
  const pricingHref = locale === "it" ? "/it/prezzi/" : "/pricing/";
  const { founder, usage, testimonials, press } = landingProof;

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
    ensureMeta("og:locale", locale === "it" ? "it_IT" : "en_US", true);
    ensureMeta("og:url", "https://vinaris.app/", true);
    ensureMeta("og:image", `https://vinaris.app${desktopDemoImage}`, true);
    ensureMeta("twitter:title", copy.meta.title);
    ensureMeta("twitter:description", copy.meta.description);
    ensureMeta("twitter:image", `https://vinaris.app${desktopDemoImage}`);
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = "https://vinaris.app/";
  }, [desktopDemoImage, dynamicCopy.meta.description, dynamicCopy.meta.title, locale]);

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };

  return (
    <div className="marketing-site marketing-conversion">
      <LandingHeader
        copy={dynamicCopy}
        locale={locale}
        onLocaleChange={onLocaleChange}
        onLogin={onLogin}
        onRegister={onRegister}
        onOpenNews={() => openNews(true, true)}
      />

      <main id="top" className="marketing-landing">
        <section className="marketing-hero story-hero" aria-labelledby="marketing-title">
          <div className="marketing-hero-copy">
            <p className="marketing-kicker">{story.hero.eyebrow}</p>
            <h1 id="marketing-title" aria-label={story.hero.title}>{story.hero.titleLines.map((line) => <span key={line}>{line} </span>)}</h1>
            <p className="marketing-hero-lead">{story.hero.lead}</p>
            <div className="marketing-actions">
              <button type="button" className="marketing-button primary" onClick={onRegister} aria-describedby="hero-free-note">{copy.hero.primary}<span aria-hidden="true"> →</span></button>
              <button type="button" className="marketing-button secondary" onClick={onDemo} disabled={demoLoading} aria-describedby="demo-note">{demoLoading ? openingLabel : copy.hero.demo}</button>
            </div>
            <p id="demo-note" className="marketing-demo-note">{copy.hero.demoNote}</p>
            <div className="marketing-hero-proof">
              <span id="hero-free-note"><i />{dynamicCopy.hero.signal}</span>
              <span>{dynamicCopy.hero.web}</span>
              <span>{copy.hero.safety}</span>
              {usage ? <span>{usage.line[locale]}</span> : null}
            </div>
          </div>
          <HeroPhone story={story} />
        </section>

        <StoryPillars story={story} />
        <StoryEssentials story={story} onRegister={onRegister} />
        <StoryBeyond
          story={story}
          locale={locale}
          restaurantExtra={<p className="story-restaurant-contact">{copy.restaurant.availability} <RestaurantContactButton label={copy.restaurant.contact} /></p>}
        />

        <section id="product" className="marketing-section marketing-start" aria-labelledby="start-title">
          <div className="marketing-section-copy"><p className="marketing-kicker">{copy.nav.product}</p><h2 id="start-title">{copy.conversion.stepsTitle}</h2></div>
          <ol className="marketing-start-steps">
            {copy.conversion.steps.map((step, index) => <li key={step.title}><span aria-hidden="true">0{index + 1}</span><div><h3>{step.title}</h3><p>{step.body}</p></div></li>)}
          </ol>
        </section>

        {testimonials.length ? <section className="marketing-section marketing-testimonials" aria-labelledby="testimonials-title">
          <h2 id="testimonials-title">{locale === "it" ? "Chi lo usa, nella sua cantina." : "Collectors using it, in their own cellars."}</h2>
          <div className="marketing-testimonials-grid">
            {testimonials.map((item) => <figure key={item.firstName}>
              <blockquote>“{item.quote[locale]}”</blockquote>
              <figcaption>{item.photo ? <img src={item.photo} alt="" width="44" height="44" loading="lazy" /> : null}<span><strong>{item.firstName}</strong><small>{item.cellar[locale]}</small></span></figcaption>
            </figure>)}
          </div>
        </section> : null}

        <section id="access" className="marketing-section marketing-plans" aria-labelledby="plans-title">
          <div className="marketing-section-copy"><p className="marketing-kicker">{copy.nav.pricing}</p><h2 id="plans-title">{copy.conversion.planTitle}</h2><p>{copy.conversion.planBody} {copy.conversion.currencyNote}</p></div>
          <div className="marketing-plans-grid">
            {dynamicCopy.closing.tiers.map((tier) => <article key={tier.name} className={tier.badge ? "is-recommended" : undefined}>
              <span className="marketing-kicker">{tier.label}{tier.badge ? <em className="marketing-plan-badge">{tier.badge}</em> : null}</span>
              <h3>{tier.name}</h3>
              <p className="marketing-plan-price"><strong>{tier.price}</strong>{tier.period ? <span> {tier.period}</span> : null}</p>
              <small className="marketing-plan-alt">{tier.altPrice}</small>
              <p>{tier.body}</p><small>{tier.note}</small>
            </article>)}
          </div>
          <p className="marketing-plan-note">{copy.closing.aiNote} <a href={pricingHref}>{copy.conversion.pricingLink} →</a></p>
          <ul className="marketing-plan-safety">
            <li>{copy.conversion.safety}</li>
            <li>{copy.conversion.dataNote}</li>
          </ul>
          {usage || press.length ? <p className="marketing-credibility">
            {usage ? <span>{usage.line[locale]} <small>· {locale === "it" ? "aggiornato" : "updated"} <time dateTime={usage.updated}>{usage.updated}</time></small></span> : null}
            {press[0] ? <span><a href={press[0].url} target="_blank" rel="noopener">{press[0].source}</a> <small>· <time dateTime={press[0].date}>{press[0].date}</time></small></span> : null}
          </p> : null}
          <div className="marketing-faq" aria-labelledby="faq-title">
            <h3 id="faq-title">{copy.conversion.faqTitle}</h3>
            {faqs.map(({ question, answer }) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}
          </div>
        </section>

        <section className="marketing-section marketing-trust" aria-labelledby="trust-title">
          <div>
            <h2 id="trust-title">{copy.conversion.trustTitle}</h2>
            <p>{copy.conversion.trustBody}</p>
            {founder ? <div className="marketing-founder">
              {founder.photo ? <img src={founder.photo} alt={founder.name} width="64" height="64" loading="lazy" /> : null}
              <span><strong>{founder.name}</strong><small>{founder.credential[locale]}</small><a href={founder.profileUrl} rel="me noopener" target="_blank">{founder.profileLabel}</a></span>
            </div> : null}
            <p className="marketing-trust-contact"><RestaurantContactButton label={copy.conversion.trustContact} /></p>
            {press.length ? <ul className="marketing-press">{press.map((item) => <li key={item.url}>
              <a href={item.url} target="_blank" rel="noopener">{item.source}</a> · <time dateTime={item.date}>{item.date}</time> — “{item.quote[locale]}”
            </li>)}</ul> : null}
          </div>
        </section>

        <section className="marketing-conversion-close" aria-labelledby="closing-title">
          <div><h2 id="closing-title">{copy.closing.title}</h2><p>{copy.closing.body}</p></div>
          <div className="marketing-actions">
            <button type="button" className="marketing-button primary" onClick={onRegister}>{copy.closing.primary}<span aria-hidden="true"> →</span></button>
            <button type="button" className="marketing-button secondary" onClick={onDemo} disabled={demoLoading}>{demoLoading ? openingLabel : copy.closing.demo}</button>
          </div>
        </section>
      </main>

      <NewsPanel copy={dynamicCopy.news} locale={locale} open={newsOpen} focusToken={newsFocusToken} onOpenChange={openNews} onRegister={onRegister} />

      <footer className="marketing-footer">
        <a className="marketing-brand" href="#top" aria-label="Vinaris"><img src="/icons/icon-192.png" alt="" width="38" height="38" /><span><strong>Vinaris</strong><small>{copy.footer.statement}</small></span></a>
        <nav aria-label={locale === "it" ? "Informazioni legali" : "Legal information"}>
          <a href={pricingHref}>{copy.footer.pricing}</a>
          <a href={locale === "it" ? "/it/guide/" : "/en/guides/"}>{copy.footer.guides}</a>
          <a href={locale === "it" ? "/it/chi-siamo/" : "/about/"}>{copy.footer.about}</a>
          <a href="mailto:info@vinaris.app">{copy.footer.contact}</a>
          <a href={`/privacy?lang=${locale}`}>{copy.footer.privacy}</a>
          <a href={`/privacy?lang=${locale}#cookies`}>{copy.footer.cookies}</a>
          <a href={`/terms?lang=${locale}`}>{copy.footer.terms}</a>
        </nav>
        <small>© {new Date().getFullYear()} Vinaris{founder ? ` · ${founder.name}` : ""}</small>
      </footer>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
    </div>
  );
}
