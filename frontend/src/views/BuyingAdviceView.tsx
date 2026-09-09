import { CSSProperties, FormEvent } from "react";
import { EmptyState } from "../components/AppUi";
import { reasoningEffortTranslationKey } from "../i18n";

type BuyingAdviceResult = {
  summary: string;
  warning: string;
  profile_applied: boolean;
  availability_checked: boolean;
  model: string;
  reasoning_effort: string;
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
  buyingWineType: string;
  buyingRegion: string;
  buyingUseTasteProfile: boolean;
  buyingCheckAvailability: boolean;
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
  setBuyingWineType: (value: string) => void;
  setBuyingRegion: (value: string) => void;
  setBuyingUseTasteProfile: (value: boolean) => void;
  setBuyingCheckAvailability: (value: boolean) => void;
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
  buyingWineType,
  buyingRegion,
  buyingUseTasteProfile,
  buyingCheckAvailability,
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
  setBuyingWineType,
  setBuyingRegion,
  setBuyingUseTasteProfile,
  setBuyingCheckAvailability,
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
            <span>{buyingCheckAvailability ? (locale === "it" ? "Ricerca disponibilità" : "Availability search") : (locale === "it" ? "Consiglio personale" : "Personal advice")}</span>
            <h2>{locale === "it" ? "Sommelier acquisti" : "AI buying sommelier"}</h2>
          </div>
          {buyingAdviceResult?.estimated_cost_usd ? <small>{t("aiRequestCost")}: {formatAiBudget(buyingAdviceResult.estimated_cost_usd)}<br />{buyingAdviceResult.model} · {t("reasoningEffort")}: {t(reasoningEffortTranslationKey(buyingAdviceResult.reasoning_effort))}</small> : null}
        </div>
        <form className="pairing-form buying-advice-form" onSubmit={onGenerateBuyingAdvice}>
          <div className="buying-search-mode" role="group" aria-label={locale === "it" ? "Tipo di consiglio" : "Advice mode"}>
            <button type="button" className={!buyingCheckAvailability ? "active" : "secondary"} aria-pressed={!buyingCheckAvailability} onClick={() => setBuyingCheckAvailability(false)} disabled={!canGenerateAi || busy}>
              <strong>{locale === "it" ? "Consigliami cosa acquistare" : "Recommend what to buy"}</strong>
              <span>{locale === "it" ? "Scelta su misura per gusto, qualità e budget." : "A tailored choice based on taste, quality, and budget."}</span>
            </button>
            <button type="button" className={buyingCheckAvailability ? "active" : "secondary"} aria-pressed={buyingCheckAvailability} onClick={() => setBuyingCheckAvailability(true)} disabled={!canGenerateAi || busy}>
              <strong>{locale === "it" ? "Trova dove acquistarlo ora" : "Find where to buy it now"}</strong>
              <span>{locale === "it" ? "Verifica offerte e disponibilità vicino a te." : "Check offers and availability near you."}</span>
            </button>
          </div>
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
              <span>{locale === "it" ? "Tipologia" : "Wine type"}</span>
              <select value={buyingWineType} onChange={(event) => setBuyingWineType(event.target.value)} disabled={!canGenerateAi || busy}>
                <option value="">{locale === "it" ? "Qualsiasi tipologia" : "Any type"}</option>
                <option value="Red">{locale === "it" ? "Rosso" : "Red"}</option>
                <option value="White">{locale === "it" ? "Bianco" : "White"}</option>
                <option value="Rose">Rosé</option>
                <option value="Sparkling">{locale === "it" ? "Spumante" : "Sparkling"}</option>
                <option value="Sweet">{locale === "it" ? "Dolce" : "Sweet"}</option>
                <option value="Fortified">{locale === "it" ? "Fortificato" : "Fortified"}</option>
                <option value="Other">{locale === "it" ? "Altro" : "Other"}</option>
              </select>
            </label>
            <label>
              <span>{locale === "it" ? "Regione o denominazione" : "Region or appellation"}</span>
              <input value={buyingRegion} onChange={(event) => setBuyingRegion(event.target.value)} placeholder={locale === "it" ? "Es. Ticino, Piemonte, Champagne" : "E.g. Ticino, Piedmont, Champagne"} disabled={!canGenerateAi || busy} />
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
          {buyingCheckAvailability ? (
            <fieldset className="buying-availability-fields">
              <legend>{locale === "it" ? "Disponibilità immediata" : "Immediate availability"}</legend>
              <label>
                <span>{locale === "it" ? "Quando ti serve?" : "When do you need it?"}</span>
                <select value={buyingNeededBy} onChange={(event) => setBuyingNeededBy(event.target.value as typeof buyingNeededBy)} disabled={!canGenerateAi || busy}>
                  <option value="today">{locale === "it" ? "Oggi" : "Today"}</option>
                  <option value="tomorrow">{locale === "it" ? "Domani" : "Tomorrow"}</option>
                  <option value="can_wait">{locale === "it" ? "Posso aspettare" : "I can wait"}</option>
                </select>
              </label>
              <label>
                <span>{locale === "it" ? "Dove vuoi acquistare o ricevere?" : "Where do you want to buy or receive it?"}</span>
                <input required value={buyingLocation} onChange={(event) => setBuyingLocation(event.target.value)} placeholder={locale === "it" ? "Es. Lugano, Svizzera" : "E.g. Lugano, Switzerland"} disabled={!canGenerateAi || busy} />
              </label>
            </fieldset>
          ) : null}
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
          <label className="pairing-option">
            <input type="checkbox" checked={buyingUseTasteProfile} onChange={(event) => setBuyingUseTasteProfile(event.target.checked)} disabled={!canGenerateAi || busy} />
            <span>{locale === "it" ? "Considera il mio profilo di gusto" : "Consider my taste profile"}</span>
          </label>
          <small>{buyingCheckAvailability
            ? (buyingNeededBy === "can_wait"
              ? (locale === "it" ? "Cercherò offerte verificabili, includendo i rivenditori online che consegnano nella zona indicata." : "I will look for verifiable offers, including online retailers delivering to the selected area.")
              : (locale === "it" ? "Cercherò negozi raggiungibili e disponibilità pubblicata per il ritiro rapido." : "I will look for reachable shops and published availability for quick pickup."))
            : (locale === "it" ? "La disponibilità non verrà considerata: il consiglio privilegia affinità personale, qualità e criteri indicati." : "Availability will not be considered: advice prioritizes personal fit, quality, and your criteria.")}</small>
          <button type="submit" disabled={!canGenerateAi || busy}>{busy ? t("generating") : buyingCheckAvailability ? (locale === "it" ? "Cerca offerte disponibili" : "Find available offers") : (locale === "it" ? "Ottieni i consigli" : "Get recommendations")}</button>
          {busy ? <div className="loading-state compact" role="status" aria-live="polite"><span>{t("generating")}</span></div> : null}
          {!canGenerateAi ? <EmptyState title={t("noApiKey")} icon="glass-sparkle" compact /> : null}
        </form>
        {buyingAdviceResult ? (
          <div className="buying-advice-result">
            <div className="buying-recommendation-badges">
              <span>
                {buyingAdviceResult.profile_applied
                  ? (locale === "it" ? "Profilo personale considerato" : "Personal taste profile applied")
                  : (locale === "it" ? "Consiglio indipendente dal profilo personale" : "Advice independent of your personal profile")}
              </span>
              <span>{buyingAdviceResult.availability_checked ? (locale === "it" ? "Disponibilità verificata" : "Availability checked") : (locale === "it" ? "Selezione per affinità" : "Taste-led selection")}</span>
            </div>
            <p className="pairing-summary">{buyingAdviceResult.summary}</p>
            {buyingAdviceResult.warning ? <p className="buying-advice-warning">{buyingAdviceResult.warning}</p> : null}
            <div className="buying-recommendation-grid">
              {buyingAdviceResult.recommendations.map((item) => (
                <article key={item.source_url} className="buying-recommendation">
                  <div className="buying-recommendation-badges">
                    <span>{buyingAdviceResult.availability_checked ? (item.local ? (locale === "it" ? "Negozio locale" : "Local shop") : "Online") : (locale === "it" ? "Consigliato" : "Recommended")}</span>
                    <span>{confidenceLabel(item.confidence)}</span>
                  </div>
                  <h3>{item.name}{item.vintage ? ` ${item.vintage}` : ""}</h3>
                  {item.producer ? <p>{item.producer}</p> : null}
                  {item.merchant ? <strong>{item.merchant}</strong> : null}
                  {item.price ? <span>{item.currency} {item.price}</span> : null}
                  {item.availability ? <span>{item.availability}</span> : null}
                  {item.delivery_estimate ? <span>{item.delivery_estimate}</span> : null}
                  <p>{item.reason}</p>
                  <a href={item.source_url} target="_blank" rel="noreferrer">{buyingAdviceResult.availability_checked ? (locale === "it" ? "Apri l'offerta verificata" : "Open verified offer") : (locale === "it" ? "Consulta la fonte" : "View source")}</a>
                </article>
              ))}
            </div>
            {!buyingAdviceResult.recommendations.length ? <EmptyState title={buyingAdviceResult.availability_checked ? (locale === "it" ? "Nessuna offerta verificabile trovata per questi criteri." : "No verifiable offer found for these criteria.") : (locale === "it" ? "Nessun consiglio sufficientemente supportato trovato per questi criteri." : "No sufficiently supported recommendation found for these criteria.")} icon="search" /> : null}
          </div>
        ) : null}
      </section>
    </section>
  );
}
