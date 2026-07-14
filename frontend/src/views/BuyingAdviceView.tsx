import { CSSProperties, FormEvent } from "react";
import { EmptyState } from "../components/AppUi";

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
  // Keep the handles useful for the normal CHF 20–50 buying range. The
  // explicit "No limit" action still allows searches without a ceiling.
  const priceRangeMax = 200;
  const minPrice = Math.max(0, Math.min(Number(buyingMinPrice) || 0, priceRangeMax));
  const maxPrice = Math.max(minPrice, Math.min(Number(buyingMaxPrice) || priceRangeMax, priceRangeMax));
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
            <div className="buying-price-range">
              <div className="buying-price-range-heading">
                <span>{locale === "it" ? "Fascia di prezzo per bottiglia" : "Price range per bottle"}</span>
                <button type="button" className="secondary compact" disabled={!canGenerateAi || busy || (!buyingMinPrice && !buyingMaxPrice)} onClick={() => { setBuyingMinPrice(""); setBuyingMaxPrice(""); }}>
                  {locale === "it" ? "Nessun limite" : "No limit"}
                </button>
              </div>
              <div className="buying-price-values" aria-live="polite">
                <strong>{minPrice > 0 ? `CHF ${minPrice}` : (locale === "it" ? "Da qualsiasi prezzo" : "Any price")}</strong>
                <span>{maxPrice < priceRangeMax ? `CHF ${maxPrice}` : (locale === "it" ? "Fino a qualsiasi prezzo" : "Any price")}</span>
              </div>
              <div className="dual-range" style={{ "--range-start": `${(minPrice / priceRangeMax) * 100}%`, "--range-end": `${(maxPrice / priceRangeMax) * 100}%` } as CSSProperties}>
                <input
                  type="range"
                  min="0"
                  max={priceRangeMax}
                  step="5"
                  value={minPrice}
                  onChange={(event) => setBuyingMinPrice(Number(event.target.value) > 0 ? String(Math.min(Number(event.target.value), maxPrice)) : "")}
                  disabled={!canGenerateAi || busy}
                  aria-label={locale === "it" ? "Prezzo minimo per bottiglia" : "Minimum price per bottle"}
                />
                <input
                  type="range"
                  min="0"
                  max={priceRangeMax}
                  step="5"
                  value={maxPrice}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setBuyingMaxPrice(value < priceRangeMax ? String(Math.max(value, minPrice)) : "");
                  }}
                  disabled={!canGenerateAi || busy}
                  aria-label={locale === "it" ? "Prezzo massimo per bottiglia" : "Maximum price per bottle"}
                />
              </div>
              <small>{locale === "it" ? "Trascina le maniglie per escludere le proposte troppo economiche o fuori budget." : "Drag the handles to exclude overly cheap or over-budget offers."}</small>
            </div>
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
          {!canGenerateAi ? <EmptyState title={t("noApiKey")} icon="glass-sparkle" compact /> : null}
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
            {!buyingAdviceResult.recommendations.length ? <EmptyState title={locale === "it" ? "Nessuna offerta verificabile trovata per questi criteri." : "No verifiable offer found for these criteria."} icon="search" /> : null}
          </div>
        ) : null}
      </section>
    </section>
  );
}
