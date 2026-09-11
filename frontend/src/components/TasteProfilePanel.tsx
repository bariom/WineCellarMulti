import { lazy, Suspense, useEffect, useState } from "react";
import type { CSSProperties } from "react";
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

const sensoryGroups = [
  { key: "structure", dimensions: ["body", "tannin", "sweetness"] },
  { key: "freshness", dimensions: ["acidity", "minerality"] },
  { key: "aromas", dimensions: ["aromatic_intensity", "fruit", "spice", "wood"] },
] as const;

function selectDimensions(dimensions: TasteProfile["dimensions"], keys: readonly string[]) {
  return Object.fromEntries(keys.flatMap((key) => dimensions[key] ? [[key, dimensions[key]]] : [])) as TasteProfile["dimensions"];
}

function naturalList(values: string[], italian: boolean) {
  if (values.length < 2) return values[0] || "";
  const conjunction = italian ? " e " : " and ";
  return `${values.slice(0, -1).join(", ")}${conjunction}${values.at(-1)}`;
}

function categoryNarrative(
  profile: TasteProfile,
  overall: TasteProfile,
  label: (key: string) => string,
  italian: boolean,
) {
  const differences = Object.entries(profile.dimensions)
    .flatMap(([dimension, value]) => overall.dimensions[dimension]
      ? [{ dimension, delta: value.preference - overall.dimensions[dimension].preference }]
      : [])
    .filter(({ delta }) => Math.abs(delta) >= 0.04)
    .sort((first, second) => Math.abs(second.delta) - Math.abs(first.delta))
    .slice(0, 4);
  const higher = differences.filter(({ delta }) => delta > 0).map(({ dimension }) => label(dimension).toLocaleLowerCase());
  const lower = differences.filter(({ delta }) => delta < 0).map(({ dimension }) => label(dimension).toLocaleLowerCase());
  if (!differences.length) {
    return italian
      ? "Questa tipologia segue da vicino l’equilibrio del tuo profilo generale."
      : "This style closely follows the balance of your overall profile.";
  }
  if (italian) {
    if (higher.length && lower.length) return `Emergono ${naturalList(higher, true)}, con ${naturalList(lower, true)} più misurati rispetto al tuo profilo medio.`;
    if (higher.length) return `Qui cerchi soprattutto ${naturalList(higher, true)}, più presenti rispetto al tuo profilo medio.`;
    return `${naturalList(lower, true)} risultano più misurati rispetto al tuo profilo medio.`;
  }
  if (higher.length && lower.length) return `${naturalList(higher, false)} stand out, while ${naturalList(lower, false)} are more restrained than in your average profile.`;
  if (higher.length) return `You seek ${naturalList(higher, false)} most clearly here, above your average profile.`;
  return `${naturalList(lower, false)} are more restrained than in your average profile.`;
}

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

export function TasteProfilePanel({ locale, variant = "settings", wines }: { locale: Locale; variant?: "settings" | "insight"; wines?: Wine[] }) {
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
      .then((result) => {
        setProfiles(result.profiles);
        setOpenCategory((current) => current ?? result.profiles.find((profile) => profile.category !== "global")?.category ?? null);
      })
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
    ? (italian ? "firma consolidata" : "established signature")
    : overall?.confidence_level === "probable"
      ? (italian ? "profilo delineato" : "defined profile")
      : (italian ? "profilo in scoperta" : "profile in discovery");
  const signatureConceptLabels: Record<string, string> = italian ? {
    body: "struttura", acidity: "freschezza", tannin: "trama tannica", sweetness: "morbidezza",
    aromatic_intensity: "intensità aromatica", fruit: "frutto", wood: "impronta del legno", spice: "spezie", minerality: "mineralità",
  } : {
    body: "structure", acidity: "freshness", tannin: "tannic texture", sweetness: "softness",
    aromatic_intensity: "aromatic intensity", fruit: "fruit", wood: "oak influence", spice: "spice", minerality: "minerality",
  };
  const signatureConcepts = [...new Set(strongest.map(([dimension]) => signatureConceptLabels[dimension] || label(dimension).toLocaleLowerCase()))].slice(0, 3);
  const portrait = signatureConcepts.length
    ? (italian ? `Il tuo gusto cerca ${naturalList(signatureConcepts, true)}.` : `Your taste seeks ${naturalList(signatureConcepts, false)}.`)
    : "";
  const profileVoice = signatureConcepts.length
    ? (italian
      ? `Ti attirano vini in cui ${naturalList(signatureConcepts, true)} trovano equilibrio, senza che un solo tratto domini il calice.`
      : `You are drawn to wines where ${naturalList(signatureConcepts, false)} find balance, without any single trait dominating the glass.`)
    : "";
  const visibleStarRatingCount = wines
    ? wines.filter((wine) => Number(wine.rating) > 0).length
    : overall?.star_rating_count ?? 0;
  const attributeEntries = overall
    ? Object.entries(overall.attributes).filter(([, values]) => values.length).slice(0, 3)
    : [];
  const preferredOrigins = overall ? [
    ...(overall.attributes.preferred_countries || []).map(([value]) => value),
    ...(overall.attributes.preferred_regions || []).map(([value]) => value),
  ] : [];
  const preferredOriginKinds = overall ? Object.fromEntries([
    ...(overall.attributes.preferred_countries || []).map(([value]) => [value, "country"] as const),
    ...(overall.attributes.preferred_regions || []).map(([value]) => [value, "region"] as const),
  ]) : {};

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
    <div className={`${insight ? "card-heading" : "settings-card-heading"} taste-profile-page-heading`}>
      <div><span>{italian ? "Approfondimento personale" : "Personal insight"}</span>{insight ? <h2>{italian ? "Il mio gusto" : "My Taste"}</h2> : <h3>{italian ? "Il mio gusto" : "My Taste"}</h3>}</div>
      <button type="button" className="secondary compact" disabled={rebuilding} onClick={() => void rebuild()}>{rebuilding ? (italian ? "Aggiornamento…" : "Updating…") : (italian ? "Aggiorna profilo" : "Refresh profile")}</button>
    </div>
    {unassignedTastings ? <div className="taste-profile-legacy"><div><strong>{italian ? "Degustazioni storiche da attribuire" : "Historical tastings to assign"}</strong><span>{italian ? `${unassignedTastings} degustazioni senza autore non entrano ancora nel tuo profilo.` : `${unassignedTastings} tastings without an author are not yet included in your profile.`}</span></div><button type="button" className="secondary compact" disabled={claimingTastings} onClick={() => void claimLegacyTastings()}>{claimingTastings ? (italian ? "Attribuzione…" : "Assigning…") : italian ? "Attribuisci a me" : "Assign to me"}</button></div> : null}
    {externalTastingsMissingProfile ? <div className="taste-profile-legacy taste-profile-external-enrichment"><div><strong>{italian ? `Abbiamo trovato ${externalTastingsMissingProfile} degustazioni senza profilo sensoriale` : `We found ${externalTastingsMissingProfile} tastings without a sensory profile`}</strong><span>{italian ? "Completandole con l’AI, Vinaris può usare anche acidità, corpo, tannini e intensità aromatica per rendere più precisi il tuo gusto e le affinità dei consigli." : "Completing them with AI lets Vinaris use acidity, body, tannin, and aromatic intensity to refine your taste profile and recommendation affinity."}</span><small>{italian ? "Analizziamo solo i vini senza profilo già disponibile, con il modello economy e la tua chiave o i tuoi crediti AI." : "Only wines without an existing profile are analysed, using the economy model and your configured key or AI credits."}</small></div><button type="button" className="secondary compact" disabled={enrichingExternalTastings} onClick={() => void enrichHistoricalExternalTastings()}>{enrichingExternalTastings ? (italian ? "Analisi in corso…" : "Analysing…") : italian ? `Completa ${externalTastingsMissingProfile} degustazioni con AI` : `Complete ${externalTastingsMissingProfile} tastings with AI`}</button></div> : null}
    {claimMessage ? <p className="taste-profile-claim-message" role="status">{claimMessage}</p> : null}
    {externalEnrichmentMessage ? <p className="taste-profile-claim-message" role="status">{externalEnrichmentMessage}</p> : null}
    {loading ? <p className="empty-state">{italian ? "Caricamento profilo…" : "Loading taste profile…"}</p> : !overall ? <p className="empty-state">{italian ? "Valuta alcuni vini degustati per iniziare a costruire il tuo profilo." : "Rate a few wines you have tasted to start building your profile."}</p> : <>
      <section className="taste-profile-premium-hero" aria-label={italian ? "Ritratto del gusto" : "Taste portrait"}>
        <div className="taste-profile-hero-copy">
          <span>{italian ? "La firma che emerge" : "The signature emerging"}</span>
          <h3>{portrait}</h3>
          <p>{profileVoice}</p>
          <small>{preferenceExplanation}</small>
        </div>
        <div className="taste-profile-hero-data">
          <div className="taste-profile-hero-metrics">
            {strongest.map(([dimension, value]) => <article key={dimension}>
              <span>{label(dimension)}</span>
              <strong>{Math.round(value.preference * 100)}<small>/100</small></strong>
              <i style={{ "--taste-score": `${Math.round(value.preference * 100)}%` } as CSSProperties} />
            </article>)}
          </div>
          <div className="taste-profile-evidence-summary">
            <div><strong>{overall.tasting_count ?? overall.sample_count}</strong><span>{italian ? "degustazioni valutate" : "rated tastings"}</span></div>
            <div><strong>{visibleStarRatingCount}</strong><span>{italian ? "vini con stelline" : "star-rated wines"}</span></div>
            <small>{confidenceLabel}</small>
          </div>
        </div>
      </section>

      <section className="taste-profile-sensory-story" aria-labelledby="taste-character-heading">
        <div className="taste-profile-section-heading">
          <span>{italian ? "La tua firma sensoriale" : "Your sensory signature"}</span>
          <h3 id="taste-character-heading">{italian ? "Il carattere del tuo gusto" : "The character of your taste"}</h3>
          <p>{signatureConcepts.map((concept) => concept.charAt(0).toLocaleUpperCase() + concept.slice(1)).join(" · ")}</p>
        </div>
        <div className="taste-profile-sensory-groups">
          {sensoryGroups.map((group) => {
            const groupDimensions = selectDimensions(overall.dimensions, group.dimensions);
            if (!Object.keys(groupDimensions).length) return null;
            const groupLabel = group.key === "structure"
              ? (italian ? "Struttura" : "Structure")
              : group.key === "freshness"
                ? (italian ? "Freschezza" : "Freshness")
                : (italian ? "Profilo aromatico" : "Aromatic profile");
            return <article className={`taste-profile-sensory-group is-${group.key}`} key={group.key}>
              <header><i aria-hidden="true" /><strong>{groupLabel}</strong></header>
              <SensorySignatureBars dimensions={groupDimensions} labels={labels} compact />
            </article>;
          })}
        </div>
      </section>

      {(attributeEntries.length || preferredOrigins.length) ? <section className="taste-profile-geography" aria-labelledby="taste-geography-heading">
        <div className="taste-profile-section-heading">
          <span>{italian ? "Geografia personale" : "Personal geography"}</span>
          <h3 id="taste-geography-heading">{italian ? "Le origini che cerchi" : "Origins you seek"}</h3>
          <p>{italian ? "I luoghi che ritornano più spesso nelle tue scelte." : "The places that return most often in your choices."}</p>
        </div>
        <div className="taste-profile-geography-layout">
          <div className="taste-profile-landmark-grid">
            {attributeEntries.map(([kind, values]) => <article key={kind}>
              <span>{label(kind)}</span>
              <div>{values.map(([name]) => <b key={name}>{label(name)}</b>)}</div>
            </article>)}
          </div>
          <div className="taste-profile-world-map">
            {preferredOrigins.length ? <Suspense fallback={<p className="empty-state">{italian ? "Caricamento mappa…" : "Loading map…"}</p>}><WineGeographyMap wines={[]} preferredOrigins={preferredOrigins} preferredOriginKinds={preferredOriginKinds} t={(key) => translate(locale, key)} onSelectRegion={() => undefined} locale={locale} /></Suspense> : <p className="empty-state">{italian ? "Le origini preferite appariranno qui con dati sufficienti." : "Preferred origins will appear here with enough data."}</p>}
          </div>
        </div>
      </section> : null}

      {categoryProfiles.length ? <section className="taste-profile-categories" aria-labelledby="taste-category-heading">
        <div className="taste-profile-section-heading">
          <span>{italian ? "Firme per tipologia" : "Signatures by wine style"}</span>
          <h3 id="taste-category-heading">{italian ? "Come cambia il tuo gusto" : "How your taste changes"}</h3>
          <p>{italian ? "Apri una tipologia per vedere solo ciò che la distingue davvero dal tuo profilo medio." : "Open a style to see only what truly distinguishes it from your average profile."}</p>
        </div>
        <div className="taste-profile-category-list">{categoryProfiles.map((profile) => {
          const significantDimensions = Object.fromEntries(Object.entries(profile.dimensions)
            .filter(([dimension, value]) => overall.dimensions[dimension] && Math.abs(value.preference - overall.dimensions[dimension].preference) >= 0.04)
            .sort(([firstKey, first], [secondKey, second]) => Math.abs(second.preference - overall.dimensions[secondKey].preference) - Math.abs(first.preference - overall.dimensions[firstKey].preference))
            .slice(0, 4)) as TasteProfile["dimensions"];
          return <details className="taste-profile-category" key={profile.category} open={openCategory === profile.category}>
            <summary onClick={(event) => {
              event.preventDefault();
              setOpenCategory((current) => current === profile.category ? null : profile.category);
            }}><span>{label(profile.category)}</span><small>{profile.sample_count} {italian ? "vini valutati" : "rated wines"}</small></summary>
            <div className="taste-profile-category-content">
              <p>{categoryNarrative(profile, overall, label, italian)}</p>
              <SensorySignatureBars dimensions={Object.keys(significantDimensions).length ? significantDimensions : profile.dimensions} labels={labels} reference={overall.dimensions} compact />
            </div>
          </details>;
        })}</div>
      </section> : null}

      <details className="taste-profile-method">
        <summary>{italian ? "Come Vinaris ha costruito questo profilo" : "How Vinaris built this profile"}</summary>
        <div>
          <p>{italian ? "Vinaris usa solo le degustazioni che hai registrato tu. Il voto resta il segnale principale: vicino al valore neutro pesa poco, mentre un voto alto o basso rafforza o riduce l’affinità per le caratteristiche del vino." : "Vinaris uses only the tastings you recorded. Your rating is the main signal: a neutral rating has little effect, while high or low ratings strengthen or reduce affinity for a wine’s characteristics."}</p>
          <ul>
            <li>{italian ? "Le caratteristiche sensoriali appartengono al vino e sono dati condivisi Vinaris." : "Sensory characteristics belong to the wine and are shared Vinaris data."}</li>
            <li>{italian ? "Le informazioni mancanti vengono escluse dal calcolo, non considerate pari a zero." : "Missing information is excluded from the calculation, never treated as zero."}</li>
            <li>{italian ? "Il profilo è privato: le valutazioni di altri utenti non lo influenzano." : "Your profile is private: other users’ ratings never influence it."}</li>
          </ul>
        </div>
      </details>
    </>}
  </section>;
}

export default TasteProfilePanel;
