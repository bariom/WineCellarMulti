import { useEffect, useState } from "react";

import { COOKIE_CONSENT_SETTINGS_EVENT, readCookieConsent, saveCookieConsent } from "../services/cookieConsent";
import { updateGoogleAdsConsent } from "../services/googleAds";
import "./CookieConsentBanner.css";

export function CookieConsentBanner() {
  const [consent, setConsent] = useState(() => readCookieConsent());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [marketing, setMarketing] = useState(consent?.marketing || false);

  useEffect(() => {
    const openSettings = () => {
      const currentConsent = readCookieConsent();
      if (currentConsent) {
        setConsent(currentConsent);
        setMarketing(currentConsent.marketing);
      }
      setSettingsOpen(true);
    };
    window.addEventListener(COOKIE_CONSENT_SETTINGS_EVENT, openSettings);
    return () => window.removeEventListener(COOKIE_CONSENT_SETTINGS_EVENT, openSettings);
  }, []);

  function save(marketingEnabled: boolean) {
    const nextConsent = saveCookieConsent(marketingEnabled);
    updateGoogleAdsConsent(nextConsent.marketing);
    setConsent(nextConsent);
    setMarketing(nextConsent.marketing);
    setSettingsOpen(false);
  }

  if (consent && !settingsOpen) return null;

  return (
    <section className="cookie-consent-banner" role="dialog" aria-modal="true" aria-labelledby="cookie-consent-title">
      <div>
        <p>PRIVACY</p>
        <h2 id="cookie-consent-title">Le tue preferenze cookie</h2>
        <span>Usiamo i cookie essenziali per far funzionare Vinaris. Con il tuo consenso attiviamo Google Ads per misurare le conversioni degli abbonamenti.</span>
        <a href="/privacy?lang=it#cookies">Leggi l’informativa privacy</a>
      </div>
      {settingsOpen ? (
        <label className="cookie-consent-option">
          <input type="checkbox" checked={marketing} onChange={(event) => setMarketing(event.target.checked)} />
          <span><strong>Marketing e misurazione</strong><small>Google Ads può misurare la conversione dopo un checkout riuscito.</small></span>
        </label>
      ) : null}
      <div className="cookie-consent-actions">
        <button className="secondary" type="button" onClick={() => save(false)}>Rifiuta</button>
        {!settingsOpen ? <button className="secondary" type="button" onClick={() => setSettingsOpen(true)}>Personalizza</button> : null}
        <button type="button" onClick={() => save(settingsOpen ? marketing : true)}>{settingsOpen ? "Salva preferenze" : "Accetta"}</button>
      </div>
    </section>
  );
}
