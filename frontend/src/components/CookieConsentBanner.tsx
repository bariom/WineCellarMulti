import { useEffect, useState } from "react";

import { COOKIE_CONSENT_SETTINGS_EVENT, readCookieConsent, saveCookieConsent } from "../services/cookieConsent";
import { updateGoogleConsent } from "../services/googleAds";
import "./CookieConsentBanner.css";

export function CookieConsentBanner() {
  const [consent, setConsent] = useState(() => readCookieConsent());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [marketing, setMarketing] = useState(consent?.marketing || false);
  const [analytics, setAnalytics] = useState(consent?.analytics || false);

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

  function save(marketingEnabled: boolean, analyticsEnabled: boolean) {
    const nextConsent = saveCookieConsent(marketingEnabled, analyticsEnabled);
    updateGoogleConsent(nextConsent);
    setConsent(nextConsent);
    setMarketing(nextConsent.marketing);
    setAnalytics(nextConsent.analytics);
    setSettingsOpen(false);
  }

  if (consent && !settingsOpen) return null;

  return (
    <section className="cookie-consent-banner" role="dialog" aria-modal="true" aria-labelledby="cookie-consent-title">
      <div>
        <p>PRIVACY</p>
        <h2 id="cookie-consent-title">Le tue preferenze cookie</h2>
        <span>Usiamo i cookie essenziali per far funzionare Vinaris. Con il tuo consenso attiviamo Google Analytics per capire come viene usata l’app e Google Ads per misurare le conversioni degli abbonamenti.</span>
        <a href="/privacy?lang=it#cookies">Leggi l’informativa privacy</a>
      </div>
      {settingsOpen ? (
        <label className="cookie-consent-option">
          <input type="checkbox" checked={analytics} onChange={(event) => setAnalytics(event.target.checked)} />
          <span><strong>Statistiche di utilizzo</strong><small>Google Analytics misura in forma aggregata visite e pagine usate.</small></span>
        </label>
      ) : null}
      {settingsOpen ? (
        <label className="cookie-consent-option">
          <input type="checkbox" checked={marketing} onChange={(event) => setMarketing(event.target.checked)} />
          <span><strong>Marketing e misurazione</strong><small>Google Ads può misurare la conversione dopo un checkout riuscito.</small></span>
        </label>
      ) : null}
      <div className="cookie-consent-actions">
        <button className="secondary" type="button" onClick={() => save(false, false)}>Rifiuta</button>
        {!settingsOpen ? <button className="secondary" type="button" onClick={() => setSettingsOpen(true)}>Personalizza</button> : null}
        <button type="button" onClick={() => (settingsOpen ? save(marketing, analytics) : save(true, true))}>{settingsOpen ? "Salva preferenze" : "Accetta"}</button>
      </div>
    </section>
  );
}
