import { FormEvent } from "react";

type BuyingAdviceResult = {
  summary: string;
  warning: string;
  model: string;
  recommendations: Array<{
    name: string;
    producer: string;
    vintage: string;
    merchant: string;
    merchant_type: "local_shop" | "online";
    price: string;
    currency: string;
    availability: string;
    delivery_estimate: string;
    source_url: string;
    reason: string;
    local: boolean;
    confidence: "high" | "medium" | "low";
  }>;
  estimated_cost_usd: string;
};

type BuyingAdviceViewProps = {
  canGenerateAi: boolean;
  generatingAi: string;
  locale: "en" | "it";
  buyingPurpose: "drink_now" | "cellar" | "pairing";
  buyingPairingWith: string;
  buyingPreferences: string;
  buyingNeededBy: "today" | "tomorrow" | "can_wait";
  buyingLocation: string;
  buyingMinPrice: string;
  buyingMaxPrice: string;
  buyingAdviceResult: BuyingAdviceResult | null;
  formatAiBudget: (value: string | number) => string;
  onGenerateBuyingAdvice: (event: FormEvent<HTMLFormElement>) => void;
  setBuyingPurpose: (value: "drink_now" | "cellar" | "pairing") => void;
  setBuyingPairingWith: (value: string) => void;
  setBuyingPreferences: (value: string) => void;
  setBuyingNeededBy: (value: "today" | "tomorrow" | "can_wait") => void;
  setBuyingLocation: (value: string) => void;
  setBuyingMinPrice: (value: string) => void;
  setBuyingMaxPrice: (value: string) => void;
  t: (key: any) => string;
};

export default function BuyingAdviceView({
  canGenerateAi,
  generatingAi,
  locale,
  buyingPurpose,
  buyingPairingWith,
  buyingPreferences,
  buyingNeededBy,
  buyingLocation,
  buyingMinPrice,
  buyingMaxPrice,
  buyingAdviceResult,
  formatAiBudget,
  onGenerateBuyingAdvice,
  setBuyingPurpose,
  setBuyingPairingWith,
  setBuyingPreferences,
  setBuyingNeededBy,
  setBuyingLocation,
  setBuyingMinPrice,
  setBuyingMaxPrice,
  t,
}: BuyingAdviceViewProps) {
  const busy = generatingAi === "buying-advice";
  const confidenceLabel = (value: BuyingAdviceResult["recommendations"][number]["confidence"]) => {
    if (locale === "it") return { high: "Attendibilità alta", medium: "Attendibilità media", low: "Attendibilità bassa" }[value];
    return { high: "High confidence", medium: "Medium confidence", low: "Low confidence" }[value];
  };

  return (
    <section className="pairing-card buying-advice-view">
      <section className="buying-advice-card">
        <div className="buying-advice-heading">
          <div>
            <span>{locale === "it" ? "Ricerca live" : "Live search"}</span>
            <h2>{locale === "it" ? "Cosa dovrei acquistare?" : "What should I buy?"}</h2>
          </div>
          {buyingAdviceResult?.estimated_cost_usd ? <small>{t("aiRequestCost")}: {formatAiBudget(buyingAdviceResult.estimated_cost_usd)}</small> : null}
        </div>
        <form className="pairing-form buying-advice-form" onSubmit={onGenerateBuyingAdvice}>
          <div className="buying-advice-fields">
            <label>
              <span>{locale === "it" ? "Obiettivo" : "Purpose"}</span>
              <select value={buyingPurpose} onChange={(event) => setBuyingPurpose(event.target.value as typeof buyingPurpose)} disabled={!canGenerateAi || busy}>
                <option value="drink_now">{locale === "it" ? "Da bere subito" : "Drink now"}</option>
                <option value="cellar">{locale === "it" ? "Da tenere in cantina" : "Hold in cellar"}</option>
                <option value="pairing">{locale === "it" ? "Da abbinare" : "Pair with food"}</option>
              </select>
            </label>
            <label>
              <span>{locale === "it" ? "Quando ti serve?" : "When do you need it?"}</span>
              <select value={buyingNeededBy} onChange={(event) => setBuyingNeededBy(event.target.value as typeof buyingNeededBy)} disabled={!canGenerateAi || busy}>
                <option value="today">{locale === "it" ? "Oggi" : "Today"}</option>
                <option value="tomorrow">{locale === "it" ? "Domani" : "Tomorrow"}</option>
                <option value="can_wait">{locale === "it" ? "Posso aspettare" : "I can wait"}</option>
              </select>
            </label>
            <label>
              <span>{locale === "it" ? "Località" : "Location"}</span>
              <input value={buyingLocation} onChange={(event) => setBuyingLocation(event.target.value)} placeholder={locale === "it" ? "Es. Lugano, Svizzera" : "E.g. Lugano, Switzerland"} disabled={!canGenerateAi || busy} />
            </label>
            <label>
              <span>{locale === "it" ? "Prezzo minimo per bottiglia (CHF)" : "Minimum price per bottle (CHF)"}</span>
              <input type="number" min="1" step="1" value={buyingMinPrice} onChange={(event) => setBuyingMinPrice(event.target.value)} placeholder="25" disabled={!canGenerateAi || busy} />
            </label>
            <label>
              <span>{locale === "it" ? "Prezzo massimo per bottiglia (CHF)" : "Maximum price per bottle (CHF)"}</span>
              <input type="number" min="1" step="1" value={buyingMaxPrice} onChange={(event) => setBuyingMaxPrice(event.target.value)} placeholder="80" disabled={!canGenerateAi || busy} />
            </label>
          </div>
          {buyingPurpose === "pairing" ? (
            <label>
              <span>{locale === "it" ? "Con cosa vuoi abbinarlo?" : "What are you pairing it with?"}</span>
              <input value={buyingPairingWith} onChange={(event) => setBuyingPairingWith(event.target.value)} placeholder={locale === "it" ? "Es. brasato, sushi, formaggi" : "E.g. braised beef, sushi, cheese"} disabled={!canGenerateAi || busy} />
            </label>
          ) : null}
          <label>
            <span>{locale === "it" ? "Altri criteri" : "Other criteria"}</span>
            <textarea rows={2} value={buyingPreferences} onChange={(event) => setBuyingPreferences(event.target.value)} placeholder={locale === "it" ? "Es. rosso, Piemonte, poco legno, regalo..." : "E.g. red, Piedmont, low oak, gift..."} disabled={!canGenerateAi || busy} />
          </label>
          <small>{buyingNeededBy === "can_wait"
            ? (locale === "it" ? "La ricerca considera anche rivenditori online che consegnano nella tua zona." : "The search also considers online retailers delivering to your area.")
            : (locale === "it" ? "La ricerca privilegia negozi locali e ritiro, verificando la disponibilità pubblicata." : "The search prioritizes local shops and pickup, checking published availability.")}</small>
          <button type="submit" disabled={!canGenerateAi || busy}>{busy ? t("generating") : (locale === "it" ? "Cerca vini da acquistare" : "Find wines to buy")}</button>
          {busy ? <div className="loading-state compact" role="status" aria-live="polite"><span>{t("generating")}</span></div> : null}
          {!canGenerateAi ? <p className="empty-state">{t("noApiKey")}</p> : null}
        </form>
        {buyingAdviceResult ? (
          <div className="buying-advice-result">
            <p className="pairing-summary">{buyingAdviceResult.summary}</p>
            {buyingAdviceResult.warning ? <p className="buying-advice-warning">{buyingAdviceResult.warning}</p> : null}
            <div className="buying-recommendation-grid">
              {buyingAdviceResult.recommendations.map((item) => (
                <article key={item.source_url} className="buying-recommendation">
                  <div className="buying-recommendation-badges">
                    <span>{item.local ? (locale === "it" ? "Locale" : "Local") : "Online"}</span>
                    <span>{confidenceLabel(item.confidence)}</span>
                  </div>
                  <h3>{item.name}{item.vintage ? ` ${item.vintage}` : ""}</h3>
                  {item.producer ? <p>{item.producer}</p> : null}
                  <strong>{item.merchant}</strong>
                  {item.price ? <span>{item.currency} {item.price}</span> : null}
                  {item.availability ? <span>{item.availability}</span> : null}
                  {item.delivery_estimate ? <span>{item.delivery_estimate}</span> : null}
                  <p>{item.reason}</p>
                  <a href={item.source_url} target="_blank" rel="noreferrer">{locale === "it" ? "Apri l'offerta verificata" : "Open verified offer"}</a>
                </article>
              ))}
            </div>
            {!buyingAdviceResult.recommendations.length ? <p className="empty-state">{locale === "it" ? "Nessuna offerta verificabile trovata per questi criteri." : "No verifiable offer found for these criteria."}</p> : null}
          </div>
        ) : null}
      </section>
    </section>
  );
}
