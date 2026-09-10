import { lazy, Suspense, useEffect, useState } from "react";
import { translate } from "../i18n";
import type { LegacyTastingClaimResult, LegacyTastingClaimStatus, Locale, TasteProfile, TasteProfileCollection, Wine } from "../types";
import { api } from "../services/api";

const WineGeographyMap = lazy(() => import("../views/WineGeographyMap"));

type ExternalTastingEnrichmentPreview = { missing_count: number };
type ExternalTastingEnrichmentResult = TasteProfileCollection & {
  processed_count: number;
  enriched_count: number;
  unresolved_count: number;
};

const sensoryDimensionOrder = ["body", "acidity", "tannin", "sweetness", "aromatic_intensity", "fruit", "wood", "spice", "minerality"];

function SensorySignatureBars({
  dimensions,
  labels,
  reference,
  compact = false,
}: {
  dimensions: TasteProfile["dimensions"];
  labels: Record<string, string>;
  reference?: TasteProfile["dimensions"];
  compact?: boolean;
}) {
  const entries = sensoryDimensionOrder
    .map((dimension) => [dimension, dimensions[dimension]] as const)
    .filter(([, value]) => Boolean(value));
  return <div className={`sensory-signature-bars${compact ? " is-compact" : ""}`}>
    {entries.map(([dimension, value]) => {
      const referenceValue = reference?.[dimension];
      return <div className="sensory-signature-row" key={dimension}>
        <span>{labels[dimension] || dimension.replace(/_/g, " ")}</span>
        <div className="sensory-signature-track" aria-label={`${labels[dimension] || dimension}: ${Math.round(value.preference * 100)} su 100`}>
          {referenceValue ? <i className="sensory-signature-reference" style={{ left: `${Math.round(referenceValue.preference * 100)}%` }} /> : null}
          <b style={{ width: `${Math.round(value.preference * 100)}%` }} />
        </div>
        <strong>{Math.round(value.preference * 100)}<small>/100</small></strong>
      </div>;
    })}
  </div>;
}

export function TasteProfilePanel({ locale, variant = "settings", wines, ratedTastingCount }: { locale: Locale; variant?: "settings" | "insight"; wines?: Wine[]; ratedTastingCount?: number }) {
  const italian = locale === "it";
  const insight = variant === "insight";
  const [profiles, setProfiles] = useState<TasteProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [unassignedTastings, setUnassignedTastings] = useState(0);
  const [claimingTastings, setClaimingTastings] = useState(false);
  const [claimMessage, setClaimMessage] = useState("");
  const [externalTastingsMissingProfile, setExternalTastingsMissingProfile] = useState(0);
  const [enrichingExternalTastings, setEnrichingExternalTastings] = useState(false);
  const [externalEnrichmentMessage, setExternalEnrichmentMessage] = useState("");
  const [openCategory, setOpenCategory] = useState<string | null>(null);

  const load = () => {
    api<TasteProfileCollection>("/api/v1/taste-profile/me")
      .then((result) => setProfiles(result.profiles))
      .finally(() => setLoading(false));
    void api<LegacyTastingClaimStatus>("/api/v1/taste-profile/me/legacy-tastings")
      .then((result) => setUnassignedTastings(result.unassigned_count))
      .catch(() => setUnassignedTastings(0));
    void api<ExternalTastingEnrichmentPreview>("/api/v1/taste-profile/me/external-tastings/enrichment-preview")
      .then((result) => setExternalTastingsMissingProfile(result.missing_count))
      .catch(() => setExternalTastingsMissingProfile(0));
  };

  useEffect(() => { void load(); }, []);
  const overall = profiles.find((profile) => profile.category === "global");
  const strongest = overall ? Object.entries(overall.dimensions)
    .sort(([, first], [, second]) => second.preference - first.preference)
    .slice(0, 4) : [];
  const categoryProfiles = profiles.filter((profile) => profile.category !== "global");
  const labels: Record<string, string> = italian ? {
    body: "Corpo", acidity: "Acidità", tannin: "Tannini", sweetness: "Dolcezza",
    aromatic_intensity: "Intensità aromatica", fruit: "Frutto", wood: "Legno", spice: "Spezie", minerality: "Mineralità",
    preferred_countries: "Paesi preferiti", preferred_regions: "Regioni preferite", preferred_appellations: "Denominazioni preferite",
    preferred_producers: "Produttori preferiti", preferred_grapes: "Uve preferite", preferred_price_ranges: "Fasce di prezzo preferite",
    global: "Generale", red: "Rossi", white: "Bianchi", rose: "Rosé", sparkling: "Spumanti", sweet: "Dolci", fortified: "Fortificati",
    under_30: "Sotto 30", "30_60": "30–60", over_60: "Oltre 60",
  } : {
    body: "Body", acidity: "Acidity", tannin: "Tannin", sweetness: "Sweetness",
    aromatic_intensity: "Aromatic intensity", fruit: "Fruit", wood: "Wood", spice: "Spice", minerality: "Minerality",
    preferred_countries: "Preferred countries", preferred_regions: "Preferred regions", preferred_appellations: "Preferred appellations",
    preferred_producers: "Preferred producers", preferred_grapes: "Preferred grapes", preferred_price_ranges: "Preferred price ranges",
    global: "Global", red: "Red", white: "White", rose: "Rosé", sparkling: "Sparkling", sweet: "Sweet", fortified: "Fortified",
    under_30: "Under 30", "30_60": "30–60", over_60: "Over 60",
  };
  const label = (key: string) => labels[key.toLowerCase()] || key.replace(/_/g, " ");
  const preferenceExplanation = italian
    ? "Indice individuale su scala 0–100: 50 è il punto neutro. I valori non sono percentuali da sommare."
    : "Individual index on a 0–100 scale: 50 is neutral. Values are not percentages to add together.";
  const confidenceLabel = overall?.confidence_level === "established"
    ? (italian ? "profilo consolidato" : "established profile")
    : overall?.confidence_level === "probable"
      ? (italian ? "profilo probabile" : "probable profile")
      : (italian ? "profilo in evoluzione" : "evolving profile");
  const signature = strongest.map(([dimension]) => label(dimension));
  const portrait = signature.length
    ? (italian ? `Vinaris riconosce una firma che mette in primo piano ${signature.join(", ")}.` : `Vinaris sees a signature led by ${signature.join(", ")}.`)
    : "";
  const visibleStarRatingCount = wines
    ? wines.filter((wine) => Number(wine.rating) > 0).length
    : overall?.star_rating_count ?? 0;

  async function rebuild() {
    setRebuilding(true);
    try {
      const result = await api<TasteProfileCollection>("/api/v1/taste-profile/me/rebuild", { method: "POST" });
      setProfiles(result.profiles);
    } finally { setRebuilding(false); }
  }

  async function claimLegacyTastings() {
    const message = italian
      ? `Attribuire a te ${unassignedTastings} degustazioni storiche senza autore? L'operazione non puo essere annullata automaticamente.`
      : `Assign ${unassignedTastings} unowned historical tastings to you? This cannot be automatically undone.`;
    if (!window.confirm(message)) return;
    setClaimingTastings(true);
    setClaimMessage("");
    try {
      const result = await api<LegacyTastingClaimResult>("/api/v1/taste-profile/me/legacy-tastings/claim", { method: "POST" });
      setProfiles(result.profiles);
      setUnassignedTastings(0);
      setClaimMessage(italian ? `${result.claimed_count} degustazioni attribuite al tuo profilo.` : `${result.claimed_count} tastings assigned to your profile.`);
    } catch (error) {
      setClaimMessage(error instanceof Error ? error.message : (italian ? "Impossibile attribuire le degustazioni." : "Unable to assign tastings."));
    } finally { setClaimingTastings(false); }
  }

  async function enrichHistoricalExternalTastings() {
    const message = italian
      ? `Analizzare ${externalTastingsMissingProfile} degustazioni esterne senza profilo sensoriale? Verrà usato il modello AI economy con la tua chiave o i tuoi crediti disponibili.`
      : `Analyse ${externalTastingsMissingProfile} outside-cellar tastings without a sensory profile? The economy AI model will use your configured key or available credits.`;
    if (!window.confirm(message)) return;
    setEnrichingExternalTastings(true);
    setExternalEnrichmentMessage("");
    try {
      const result = await api<ExternalTastingEnrichmentResult>("/api/v1/taste-profile/me/external-tastings/enrich", { method: "POST" });
      setProfiles(result.profiles);
      setExternalTastingsMissingProfile(result.unresolved_count);
      setExternalEnrichmentMessage(italian
        ? `${result.enriched_count} profili sensoriali aggiunti. Il tuo profilo gusto è stato aggiornato.${result.unresolved_count ? ` ${result.unresolved_count} vini non avevano dati sufficienti.` : ""}`
        : `${result.enriched_count} sensory profiles added. Your taste profile has been updated.${result.unresolved_count ? ` ${result.unresolved_count} wines did not have enough data.` : ""}`);
    } catch (error) {
      setExternalEnrichmentMessage(error instanceof Error ? error.message : (italian ? "Impossibile completare le degustazioni." : "Unable to complete the tastings."));
    } finally { setEnrichingExternalTastings(false); }
  }

  return <section className={insight ? "dashboard-card taste-profile-panel taste-profile-panel--insight" : "settings-card settings-card-wide taste-profile-panel"}>
    <div className={insight ? "card-heading" : "settings-card-heading"}>
      <div><span>{italian ? "Approfondimento personale" : "Personal insight"}</span>{insight ? <h2>{italian ? "Il mio gusto" : "My Taste"}</h2> : <h3>{italian ? "Il mio gusto" : "My Taste"}</h3>}</div>
      <button type="button" className="secondary compact" disabled={rebuilding} onClick={() => void rebuild()}>{rebuilding ? (italian ? "Aggiornamento…" : "Updating…") : (italian ? "Aggiorna profilo" : "Refresh profile")}</button>
    </div>
    {unassignedTastings ? <div className="taste-profile-legacy"><div><strong>{italian ? "Degustazioni storiche da attribuire" : "Historical tastings to assign"}</strong><span>{italian ? `${unassignedTastings} degustazioni senza autore non entrano ancora nel tuo profilo.` : `${unassignedTastings} tastings without an author are not yet included in your profile.`}</span></div><button type="button" className="secondary compact" disabled={claimingTastings} onClick={() => void claimLegacyTastings()}>{claimingTastings ? (italian ? "Attribuzione…" : "Assigning…") : italian ? "Attribuisci a me" : "Assign to me"}</button></div> : null}
    {externalTastingsMissingProfile ? <div className="taste-profile-legacy taste-profile-external-enrichment"><div><strong>{italian ? `Abbiamo trovato ${externalTastingsMissingProfile} degustazioni senza profilo sensoriale` : `We found ${externalTastingsMissingProfile} tastings without a sensory profile`}</strong><span>{italian ? "Completandole con l’AI, Vinaris può usare anche acidità, corpo, tannini e intensità aromatica per rendere più precisi il tuo gusto e le affinità dei consigli." : "Completing them with AI lets Vinaris use acidity, body, tannin, and aromatic intensity to refine your taste profile and recommendation affinity."}</span><small>{italian ? "Analizziamo solo i vini senza profilo già disponibile, con il modello economy e la tua chiave o i tuoi crediti AI." : "Only wines without an existing profile are analysed, using the economy model and your configured key or AI credits."}</small></div><button type="button" className="secondary compact" disabled={enrichingExternalTastings} onClick={() => void enrichHistoricalExternalTastings()}>{enrichingExternalTastings ? (italian ? "Analisi in corso…" : "Analysing…") : italian ? `Completa ${externalTastingsMissingProfile} degustazioni con AI` : `Complete ${externalTastingsMissingProfile} tastings with AI`}</button></div> : null}
    {claimMessage ? <p className="taste-profile-claim-message" role="status">{claimMessage}</p> : null}
    {externalEnrichmentMessage ? <p className="taste-profile-claim-message" role="status">{externalEnrichmentMessage}</p> : null}
    {loading ? <p className="empty-state">{italian ? "Caricamento profilo…" : "Loading taste profile…"}</p> : !overall ? <p className="empty-state">{italian ? "Valuta alcuni vini degustati per iniziare a costruire il tuo profilo." : "Rate a few wines you have tasted to start building your profile."}</p> : <>
      <section className="taste-profile-portrait" aria-label={italian ? "Ritratto del gusto" : "Taste portrait"}>
        <div className="taste-profile-portrait-copy"><span>{italian ? "La firma che emerge" : "The signature emerging"}</span><p>{portrait}</p><small>{preferenceExplanation}</small></div>
        <div className="taste-profile-evidence-summary"><div><strong>{ratedTastingCount ?? overall.tasting_count ?? overall.sample_count}</strong><span>{italian ? "degustazioni valutate" : "rated tastings"}</span></div><div><strong>{visibleStarRatingCount}</strong><span>{italian ? "vini con stelline" : "star-rated wines"}</span></div><small>{confidenceLabel}</small></div>
      </section>
      {Object.entries(overall.attributes).filter(([, values]) => values.length).length ? <section className="taste-profile-landmarks"><div className="taste-profile-section-heading"><span>{italian ? "Riferimenti che ritornano" : "Recurring landmarks"}</span><h3>{italian ? "I luoghi della tua curiosità" : "Places your curiosity returns to"}</h3></div><div className="taste-profile-landmark-grid">{Object.entries(overall.attributes).filter(([, values]) => values.length).slice(0, 3).map(([kind, values]) => <article key={kind}><span>{label(kind)}</span><strong>{values.map(([name]) => label(name)).join(", ")}</strong></article>)}</div></section> : null}
      {categoryProfiles.length ? <section className="taste-profile-categories"><strong>{italian ? "Firme per tipologia" : "Signatures by wine style"}</strong><small>{italian ? "Ogni firma confronta una tipologia con il tuo profilo generale." : "Each signature compares a wine style with your overall profile."}</small><div className="taste-profile-category-list">{categoryProfiles.map((profile) => <details className="taste-profile-category" key={profile.category} open={openCategory === profile.category} onToggle={(event) => setOpenCategory(event.currentTarget.open ? profile.category : null)}><summary><span>{label(profile.category)}</span><small>{profile.sample_count} {italian ? "vini valutati" : "rated wines"}</small></summary><div className="taste-profile-category-content"><p>{italian ? "La linea sottile indica il tuo profilo generale; la barra mostra cosa emerge in questa tipologia." : "The fine line marks your overall profile; the bar shows what emerges for this wine style."}</p><SensorySignatureBars dimensions={profile.dimensions} labels={labels} reference={overall?.dimensions} compact />{Object.entries(profile.attributes).filter(([, values]) => values.length).length ? <div className="detail-grid taste-profile-attribute-grid">{Object.entries(profile.attributes).filter(([, values]) => values.length).slice(0, 3).map(([kind, values]) => <div key={kind} className="detail-field taste-profile-attribute"><span>{label(kind)}</span><strong>{values.map(([name]) => label(name)).join(", ")}</strong></div>)}</div> : null}</div></details>)}</div></section> : null}
    </>}
  </section>;
}

export function TasteProfileExplanation({ locale }: { locale: Locale }) {
  const italian = locale === "it";
  const [profile, setProfile] = useState<TasteProfile | null>(null);

  useEffect(() => {
    let active = true;
    api<TasteProfileCollection>("/api/v1/taste-profile/me")
      .then((result) => { if (active) setProfile(result.profiles.find((item) => item.category === "global") || null); })
      .catch(() => { if (active) setProfile(null); });
    return () => { active = false; };
  }, []);

  const preferredOrigins = [
    ...(profile?.attributes.preferred_countries || []).map(([value]) => value),
    ...(profile?.attributes.preferred_regions || []).map(([value]) => value),
  ];
  const preferredOriginKinds = Object.fromEntries([
    ...(profile?.attributes.preferred_countries || []).map(([value]) => [value, "country"] as const),
    ...(profile?.attributes.preferred_regions || []).map(([value]) => [value, "region"] as const),
  ]);
  const dimensionLabels: Record<string, string> = italian
    ? { body: "corpo", acidity: "acidità", tannin: "tannini", sweetness: "dolcezza", aromatic_intensity: "intensità aromatica", fruit: "frutto", wood: "legno", spice: "spezie", minerality: "mineralità" }
    : { body: "body", acidity: "acidity", tannin: "tannin", sweetness: "sweetness", aromatic_intensity: "aromatic intensity", fruit: "fruit", wood: "wood", spice: "spice", minerality: "minerality" };
  return <article className="dashboard-card taste-profile-explanation">
    <div className="card-heading"><div><span>{italian ? "Visuale personale" : "Personal view"}</span><h2>{italian ? "Il gusto sulla mappa" : "Taste on the map"}</h2></div></div>
    {profile ? <div className="taste-profile-existing-visuals">
      <section className="taste-profile-radar-wrap taste-profile-signature-chart" aria-label={italian ? "Firma sensoriale" : "Sensory signature"}>
        <header><span>{italian ? "Firma sensoriale" : "Sensory signature"}</span><strong>{italian ? "Il carattere del tuo gusto" : "The character of your taste"}</strong><small>{italian ? "Nove indicatori, letti insieme per mostrare i tratti che orientano le tue scelte." : "Nine indicators read together to show the traits that guide your choices."}</small></header>
        <SensorySignatureBars dimensions={profile.dimensions} labels={dimensionLabels} />
      </section>
      <section className="taste-profile-world-map" aria-label={italian ? "Mappa delle origini preferite" : "Map of preferred origins"}>
        <header><span>{italian ? "Geografia personale" : "Personal geography"}</span><strong>{italian ? "Le origini che cerchi" : "Origins you seek"}</strong><small>{italian ? "Paesi e regioni emersi dalle tue preferenze." : "Countries and regions emerging from your preferences."}</small></header>
        {preferredOrigins.length ? <Suspense fallback={null}><WineGeographyMap wines={[]} preferredOrigins={preferredOrigins} preferredOriginKinds={preferredOriginKinds} t={(key) => translate(locale, key)} onSelectRegion={() => undefined} locale={locale} /></Suspense> : <p className="empty-state">{italian ? "Le origini preferite appariranno qui con dati sufficienti." : "Preferred origins will appear here with enough data."}</p>}
      </section>
    </div> : null}
    <div className="taste-profile-method">
        <p>{italian ? "Vinaris usa solo le degustazioni che hai registrato tu. Il voto resta il segnale principale: vicino al valore neutro pesa poco, mentre un voto alto o basso rafforza o riduce l’affinità per le caratteristiche del vino." : "Vinaris uses only the tastings you recorded. Your rating is the main signal: a neutral rating has little effect, while high or low ratings strengthen or reduce affinity for a wine’s characteristics."}</p>
        <ul>
          <li>{italian ? "Le caratteristiche sensoriali (corpo, acidità, tannini e altre) appartengono al vino e sono dati condivisi Vinaris; non vengono generate durante una degustazione o mentre visualizzi questa pagina." : "Sensory characteristics (body, acidity, tannin, and more) belong to the wine and are shared Vinaris data; they are not generated while you rate a wine or view this page."}</li>
          <li>{italian ? "Le informazioni mancanti non valgono zero: vengono semplicemente escluse dal calcolo." : "Missing information is never treated as zero; it is simply excluded from the calculation."}</li>
          <li>{italian ? "Il risultato combina un profilo generale con profili distinti per rossi, bianchi, spumanti e dolci quando ci sono dati sufficienti." : "The result combines an overall profile with separate red, white, sparkling, and sweet profiles when enough data is available."}</li>
          <li>{italian ? "La confidenza cresce con numero, coerenza e qualità dei vini valutati. Il profilo è privato: le valutazioni di altri utenti non lo influenzano." : "Confidence grows with the number, consistency, and quality of rated wines. Your profile is private: other users’ ratings never influence it."}</li>
        </ul>
    </div>
  </article>;
}

export default TasteProfilePanel;
