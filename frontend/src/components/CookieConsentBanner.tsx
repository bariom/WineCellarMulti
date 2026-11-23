import { useEffect, useRef, useState } from "react";
import { analytics as heycatch } from "@heycatch/sdk";

import { COOKIE_CONSENT_SETTINGS_EVENT, readCookieConsent, saveCookieConsent } from "../services/cookieConsent";
import { updateGoogleConsent } from "../services/googleAds";
import "./CookieConsentBanner.css";

type BannerLocale = "it" | "en";

/** The page language as the app sets it; before the app runs, the same rule it uses. */
function pageLocale(): BannerLocale {
  const lang = document.documentElement.getAttribute("data-app-lang");
  if (lang === "it" || lang === "en") return lang;
  const requested = new URLSearchParams(window.location.search).get("lang");
  if (requested === "it" || requested === "en") return requested;
  return navigator.language.toLowerCase().startsWith("it") ? "it" : "en";
}

const COPY = {
  it: {
    title: "Le tue preferenze cookie",
    text: "Usiamo i cookie essenziali per far funzionare Vinaris. Con il tuo consenso attiviamo Google Analytics per capire come viene usata l’app e Google Ads per misurare le conversioni degli abbonamenti.",
    privacy: "Leggi l’informativa privacy",
    analytics: ["Statistiche di utilizzo", "Google Analytics misura in forma aggregata visite e pagine usate."],
    marketing: ["Marketing e misurazione", "Google Ads può misurare la conversione dopo un checkout riuscito."],
    reject: "Rifiuta",
    customize: "Personalizza",
    save: "Salva preferenze",
    accept: "Accetta",
  },
  en: {
    title: "Your cookie preferences",
    text: "We use essential cookies to make Vinaris work. With your consent we turn on Google Analytics to understand how the app is used and Google Ads to measure subscription conversions.",
    privacy: "Read the privacy policy",
    analytics: ["Usage statistics", "Google Analytics measures visits and pages used, in aggregate."],
    marketing: ["Marketing and measurement", "Google Ads may measure the conversion after a successful checkout."],
    reject: "Reject",
    customize: "Customize",
    save: "Save preferences",
    accept: "Accept",
  },
} as const;

export function CookieConsentBanner() {
  const [consent, setConsent] = useState(() => readCookieConsent());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [marketing, setMarketing] = useState(consent?.marketing || false);
  const [analytics, setAnalytics] = useState(consent?.analytics || false);
  const [locale, setLocale] = useState<BannerLocale>(pageLocale);
  const banner = useRef<HTMLElement | null>(null);
  const visible = !consent || settingsOpen;

  useEffect(() => {
    const openSettings = () => {
      const currentConsent = readCookieConsent();
      if (currentConsent) {
        setConsent(currentConsent);
        setMarketing(currentConsent.marketing);
        setAnalytics(currentConsent.analytics);
      }
      setSettingsOpen(true);
    };
    window.addEventListener(COOKIE_CONSENT_SETTINGS_EVENT, openSettings);
    return () => window.removeEventListener(COOKIE_CONSENT_SETTINGS_EVENT, openSettings);
  }, []);

  // Follow the language the visitor picks on the page.
  useEffect(() => {
    const observer = new MutationObserver(() => setLocale(pageLocale()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-app-lang"] });
    return () => observer.disconnect();
  }, []);

  // Dialogs such as sign-up keep their fields above the banner while it is open.
  useEffect(() => {
    const root = document.documentElement;
    const element = banner.current;
    if (!visible || !element || typeof ResizeObserver === "undefined") {
      root.style.removeProperty("--cookie-banner-space");
      return;
    }
    const observer = new ResizeObserver(() => root.style.setProperty("--cookie-banner-space", `${Math.ceil(element.getBoundingClientRect().height) + 16}px`));
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--cookie-banner-space");
    };
  }, [visible, settingsOpen]);

  function save(marketingEnabled: boolean, analyticsEnabled: boolean) {
    const nextConsent = saveCookieConsent(marketingEnabled, analyticsEnabled);
    updateGoogleConsent(nextConsent);
    if (nextConsent.analytics) heycatch.optInCapturing();
    else heycatch.optOutCapturing();
    setConsent(nextConsent);
    setMarketing(nextConsent.marketing);
    setAnalytics(nextConsent.analytics);
    setSettingsOpen(false);
  }

  if (!visible) return null;
  const copy = COPY[locale];

  return (
    <section ref={banner} className="cookie-consent-banner" role="dialog" aria-modal="true" aria-labelledby="cookie-consent-title" lang={locale}>
      <div>
        <p>PRIVACY</p>
        <h2 id="cookie-consent-title">{copy.title}</h2>
        <span>{copy.text}</span>
        <a href={`/privacy?lang=${locale}#cookies`}>{copy.privacy}</a>
      </div>
      {settingsOpen ? (
        <label className="cookie-consent-option">
          <input type="checkbox" checked={analytics} onChange={(event) => setAnalytics(event.target.checked)} />
          <span><strong>{copy.analytics[0]}</strong><small>{copy.analytics[1]}</small></span>
        </label>
      ) : null}
      {settingsOpen ? (
        <label className="cookie-consent-option">
          <input type="checkbox" checked={marketing} onChange={(event) => setMarketing(event.target.checked)} />
          <span><strong>{copy.marketing[0]}</strong><small>{copy.marketing[1]}</small></span>
        </label>
      ) : null}
      <div className="cookie-consent-actions">
        <button className="secondary" type="button" onClick={() => save(false, false)}>{copy.reject}</button>
        {!settingsOpen ? <button className="secondary" type="button" onClick={() => setSettingsOpen(true)}>{copy.customize}</button> : null}
        <button type="button" onClick={() => (settingsOpen ? save(marketing, analytics) : save(true, true))}>{settingsOpen ? copy.save : copy.accept}</button>
      </div>
    </section>
  );
}
