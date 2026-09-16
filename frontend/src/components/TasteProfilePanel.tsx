import { lazy, Suspense, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { translate } from "../i18n";
import type { LegacyTastingClaimResult, LegacyTastingClaimStatus, Locale, TasteProfile, TasteProfileAlgorithmDiagnostics, TasteProfileCollection, TasteProfileEvidence, Wine } from "../types";
import { api } from "../services/api";

const WineGeographyMap = lazy(() => import("../views/WineGeographyMap"));

type ExternalTastingEnrichmentPreview = {
  missing_count: number;
  items: Array<{ id: string; name: string; producer: string; vintage: string; type: string; region: string; appellation: string }>;
};
type ExternalTastingEnrichmentResult = TasteProfileCollection & {
  processed_count: number;
  enriched_count: number;
  unresolved_count: number;
  catalog_pending_count: number;
  catalog_existing_count: number;
  results: Array<{
    id: string;
    name: string;
    profile_status: "available" | "unresolved";
    catalog_status: "pending" | "existing" | "not_proposed" | "failed";
    issue: "" | "missing_name" | "missing_producer" | "missing_vintage" | "profile_generation_failed" | "catalog_save_failed" | "processing_error";
  }>;
  estimated_cost_usd: string | number;
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
  return `${values.slice(0, -1).join(", ")}${conjunction}${values[values.length - 1]}`;
}

function meaningfulDifferences(profile: TasteProfile, overall: TasteProfile) {
  return Object.entries(profile.dimensions)
    .flatMap(([dimension, value]) => {
      const reference = overall.dimensions[dimension];
      if (!reference) return [];
      const confidence = Math.min(value.confidence || 0, reference.confidence || 0);
      const threshold = 0.03 + (1 - confidence) * 0.02;
      const delta = value.preference - reference.preference;
      return Math.abs(delta) >= threshold ? [{ dimension, value, delta }] : [];
    })
    .sort((first, second) => Math.abs(second.delta) - Math.abs(first.delta));
}

function categoryNarrative(
  profile: TasteProfile,
  overall: TasteProfile,
  label: (key: string) => string,
  italian: boolean,
) {
  const differences = meaningfulDifferences(profile, overall).slice(0, 4);
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
      const delta = referenceValue ? Math.round((value.preference - referenceValue.preference) * 100) : null;
      const ariaValue = `${labels[dimension] || dimension}: ${Math.round(value.preference * 100)} su 100${referenceValue ? `; profilo generale ${Math.round(referenceValue.preference * 100)}; differenza ${delta! >= 0 ? "+" : ""}${delta}` : ""}`;
      return <div className="sensory-signature-row" key={dimension}>
        <span>{labels[dimension] || dimension.replace(/_/g, " ")}</span>
        <div className="sensory-signature-track" aria-label={ariaValue}>
          {referenceValue ? <i aria-hidden="true" className="sensory-signature-reference" style={{ left: `${Math.round(referenceValue.preference * 100)}%` }} /> : null}
          <b style={{ width: `${Math.round(value.preference * 100)}%` }} />
        </div>
        <strong>{Math.round(value.preference * 100)}<small>/100</small>{delta !== null ? <em>Δ {delta >= 0 ? "+" : ""}{delta}</em> : null}</strong>
      </div>;
    })}
  </div>;
}

export function TasteProfilePanel({ locale, variant = "settings", wines, isAppAdmin = false }: { locale: Locale; variant?: "settings" | "insight"; wines?: Wine[]; isAppAdmin?: boolean }) {
  const italian = locale === "it";
  const insight = variant === "insight";
  const [profiles, setProfiles] = useState<TasteProfile[]>([]);
  const [evidence, setEvidence] = useState<TasteProfileEvidence | null>(null);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [unassignedTastings, setUnassignedTastings] = useState(0);
  const [claimingTastings, setClaimingTastings] = useState(false);
  const [claimMessage, setClaimMessage] = useState("");
  const [externalTastingsMissingProfile, setExternalTastingsMissingProfile] = useState(0);
  const [externalTastingsMissingProfileItems, setExternalTastingsMissingProfileItems] = useState<ExternalTastingEnrichmentPreview["items"]>([]);
  const [enrichingExternalTastings, setEnrichingExternalTastings] = useState(false);
  const [externalEnrichmentMessage, setExternalEnrichmentMessage] = useState("");
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [categoryView, setCategoryView] = useState<"differences" | "all">("differences");
  const [algorithmDiagnostics, setAlgorithmDiagnostics] = useState<TasteProfileAlgorithmDiagnostics | null>(null);
  const [diagnosticsVisible, setDiagnosticsVisible] = useState(false);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticsError, setDiagnosticsError] = useState("");

  const load = () => {
    api<TasteProfileCollection>("/api/v1/taste-profile/me")
      .then((result) => {
        setProfiles(result.profiles);
        setEvidence(result.evidence ?? null);
        const mostSupportedCategory = result.profiles
          .filter((profile) => profile.category !== "global")
          .sort((first, second) => second.sample_count - first.sample_count)[0];
        setOpenCategory((current) => current ?? mostSupportedCategory?.category ?? null);
      })
      .finally(() => setLoading(false));
    void api<LegacyTastingClaimStatus>("/api/v1/taste-profile/me/legacy-tastings")
      .then((result) => setUnassignedTastings(result.unassigned_count))
      .catch(() => setUnassignedTastings(0));
    void api<ExternalTastingEnrichmentPreview>("/api/v1/taste-profile/me/external-tastings/enrichment-preview")
      .then((result) => {
        setExternalTastingsMissingProfile(result.missing_count);
        setExternalTastingsMissingProfileItems(result.items);
      })
      .catch(() => {
        setExternalTastingsMissingProfile(0);
        setExternalTastingsMissingProfileItems([]);
      });
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
    : (italian ? "Il tuo profilo sta prendendo forma." : "Your taste profile is taking shape.");
  const profileVoice = signatureConcepts.length
    ? (italian
      ? "Questi sono i tratti che emergono con maggiore continuità dalle tue valutazioni."
      : "These are the traits that emerge most consistently from your ratings.")
    : (italian ? "Registra nuove degustazioni o completa i dati sensoriali mancanti per renderlo più preciso." : "Record more tastings or complete missing sensory data to make it more precise.");
  const visibleStarRatingCount = wines
    ? evidence?.direct_rating_count ?? wines.filter((wine) => Number(wine.rating) > 0).length
    : overall?.star_rating_count ?? 0;
  const attributeOrder = ["preferred_grapes", "preferred_regions", "preferred_appellations", "preferred_producers", "preferred_price_ranges", "preferred_countries"];
  const attributeEntries = overall
    ? attributeOrder.flatMap((key) => overall.attributes[key]?.length
      ? [[key, overall.attributes[key]] as [string, Array<[string, number]>]]
      : [])
    : [];
  const totalSensorySignals = (evidence?.sensory_covered_count ?? 0) + (evidence?.sensory_missing_count ?? 0);
  const sensoryCoverage = totalSensorySignals
    ? Math.round(((evidence?.sensory_covered_count ?? 0) / totalSensorySignals) * 100)
    : 0;
  const updatedAt = overall?.rebuilt_at
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(overall.rebuilt_at))
    : "";
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
      setEvidence(result.evidence ?? null);
      setAlgorithmDiagnostics(null);
      setDiagnosticsVisible(false);
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
      setEvidence(result.evidence ?? null);
      setUnassignedTastings(0);
      setClaimMessage(italian ? `${result.claimed_count} degustazioni attribuite al tuo profilo.` : `${result.claimed_count} tastings assigned to your profile.`);
    } catch (error) {
      setClaimMessage(error instanceof Error ? error.message : (italian ? "Impossibile attribuire le degustazioni." : "Unable to assign tastings."));
    } finally { setClaimingTastings(false); }
  }

  async function toggleAlgorithmDiagnostics() {
    if (diagnosticsVisible) {
      setDiagnosticsVisible(false);
      return;
    }
    setDiagnosticsVisible(true);
    if (algorithmDiagnostics || diagnosticsLoading) return;
    setDiagnosticsLoading(true);
    setDiagnosticsError("");
    try {
      setAlgorithmDiagnostics(await api<TasteProfileAlgorithmDiagnostics>("/api/v1/taste-profile/me/algorithm-diagnostics"));
    } catch {
      setDiagnosticsError(italian ? "Confronto non disponibile. Riprova dopo il ricalcolo del profilo." : "Comparison unavailable. Try again after recalculating the profile.");
    } finally {
      setDiagnosticsLoading(false);
    }
  }

  async function enrichHistoricalExternalTastings() {
    const message = italian
      ? `Cercare dati verificabili e generare il profilo sensoriale per ${externalTastingsMissingProfile} degustazioni? Saranno usati il modello AI economy e la tua chiave o i tuoi crediti disponibili; al termine vedrai il costo effettivo.`
      : `Research verified data and generate sensory profiles for ${externalTastingsMissingProfile} outside-cellar tastings? The economy AI model will use your configured key or available credits; the final cost will be shown afterwards.`;
    if (!window.confirm(message)) return;
    setEnrichingExternalTastings(true);
    setExternalEnrichmentMessage("");
    try {
      const result = await api<ExternalTastingEnrichmentResult>("/api/v1/taste-profile/me/external-tastings/enrich", { method: "POST" });
      setProfiles(result.profiles);
      setEvidence(result.evidence ?? null);
      setExternalTastingsMissingProfile(result.unresolved_count);
      const unresolvedIds = new Set(result.results.filter((item) => item.profile_status === "unresolved").map((item) => item.id));
      setExternalTastingsMissingProfileItems((current) => current.filter((item) => unresolvedIds.has(item.id)));
      const issueLabels: Record<string, string> = italian ? {
        missing_name: "nome mancante",
        missing_producer: "produttore mancante",
        missing_vintage: "annata assente e vino non verificato come NV/MV",
        profile_generation_failed: "profilo sensoriale non generato",
        catalog_save_failed: "profilo creato, ma salvataggio nel catalogo non riuscito",
        processing_error: "errore durante l’elaborazione",
      } : {
        missing_name: "missing name",
        missing_producer: "missing producer",
        missing_vintage: "missing vintage and wine not verified as NV/MV",
        profile_generation_failed: "sensory profile was not generated",
        catalog_save_failed: "profile created, but catalog save failed",
        processing_error: "processing error",
      };
      const issueSummary = result.results
        .filter((item) => item.issue)
        .map((item) => `${item.name}: ${issueLabels[item.issue] || item.issue}`)
        .join("; ");
      const catalogNotProposed = result.results.filter((item) => item.catalog_status === "not_proposed").length;
      const addedProfileLabel = italian
        ? `${result.enriched_count} ${result.enriched_count === 1 ? "profilo sensoriale aggiunto" : "profili sensoriali aggiunti"}`
        : `${result.enriched_count} sensory ${result.enriched_count === 1 ? "profile" : "profiles"} added`;
      setExternalEnrichmentMessage(italian
        ? `${addedProfileLabel}.${result.enriched_count ? " Il tuo profilo gusto è stato aggiornato." : " Il profilo gusto non è cambiato."} Catalogo centrale: ${result.catalog_pending_count} da approvare, ${result.catalog_existing_count} già presenti, ${catalogNotProposed} non proposti.${issueSummary ? ` Dettagli: ${issueSummary}.` : ""} Costo AI: $${Number(result.estimated_cost_usd || 0).toFixed(4)}.`
        : `${addedProfileLabel}.${result.enriched_count ? " Your taste profile was updated." : " Your taste profile did not change."} Central catalog: ${result.catalog_pending_count} pending approval, ${result.catalog_existing_count} already present, ${catalogNotProposed} not submitted.${issueSummary ? ` Details: ${issueSummary}.` : ""} AI cost: $${Number(result.estimated_cost_usd || 0).toFixed(4)}.`);
    } catch (error) {
      setExternalEnrichmentMessage(error instanceof Error ? error.message : (italian ? "Impossibile completare le degustazioni." : "Unable to complete the tastings."));
    } finally { setEnrichingExternalTastings(false); }
  }

  return <section className={insight ? "dashboard-card taste-profile-panel taste-profile-panel--insight" : "settings-card settings-card-wide taste-profile-panel"}>
    <div className={`${insight ? "card-heading" : "settings-card-heading"} taste-profile-page-heading`}>
      <div><span>{italian ? "Approfondimento personale" : "Personal insight"}</span>{insight ? <h2>{italian ? "Il mio gusto" : "My Taste"}</h2> : <h3>{italian ? "Il mio gusto" : "My Taste"}</h3>}</div>
    </div>
    {unassignedTastings ? <div className="taste-profile-legacy"><div><strong>{italian ? "Degustazioni storiche da attribuire" : "Historical tastings to assign"}</strong><span>{italian ? `${unassignedTastings} degustazioni senza autore non entrano ancora nel tuo profilo.` : `${unassignedTastings} tastings without an author are not yet included in your profile.`}</span></div><button type="button" className="secondary compact" disabled={claimingTastings} onClick={() => void claimLegacyTastings()}>{claimingTastings ? (italian ? "Attribuzione…" : "Assigning…") : italian ? "Attribuisci a me" : "Assign to me"}</button></div> : null}
    {externalTastingsMissingProfile ? <div className="taste-profile-legacy taste-profile-external-enrichment"><div><strong>{italian ? `Abbiamo trovato ${externalTastingsMissingProfile} degustazioni senza profilo sensoriale` : `We found ${externalTastingsMissingProfile} tastings without a sensory profile`}</strong><span>{italian ? "L’AI cerca prima dati verificabili sul vino, poi genera acidità, corpo, tannini e intensità aromatica per rendere più precisi il tuo gusto e le affinità dei consigli." : "AI first researches verifiable wine data, then generates acidity, body, tannin, and aromatic intensity to refine your taste profile and recommendation affinity."}</span><small>{italian ? "Useremo il modello economy e la tua chiave o i tuoi crediti AI. Il costo effettivo viene mostrato al termine." : "The economy model uses your configured key or AI credits. The final cost is shown afterwards."}</small>{externalTastingsMissingProfileItems.length ? <ul className="taste-profile-external-tasting-list">{externalTastingsMissingProfileItems.map((tasting) => <li key={tasting.id}><strong>{[tasting.producer, tasting.name, tasting.vintage].filter(Boolean).join(" · ")}</strong><small>{[tasting.type, tasting.appellation, tasting.region].filter(Boolean).join(" · ") || (italian ? "Identità da completare con la ricerca AI" : "Identity to complete with AI research")}</small></li>)}</ul> : null}</div><button type="button" className="secondary compact" disabled={enrichingExternalTastings} onClick={() => void enrichHistoricalExternalTastings()}>{enrichingExternalTastings ? (italian ? "Analisi in corso…" : "Analysing…") : italian ? `Completa ${externalTastingsMissingProfile} degustazioni con AI` : `Complete ${externalTastingsMissingProfile} tastings with AI`}</button></div> : null}
    {claimMessage ? <p className="taste-profile-claim-message" role="status">{claimMessage}</p> : null}
    {externalEnrichmentMessage ? <p className="taste-profile-claim-message" role="status">{externalEnrichmentMessage}</p> : null}
    {loading ? <p className="empty-state">{italian ? "Caricamento profilo…" : "Loading taste profile…"}</p> : !overall || overall.sample_count === 0 ? <p className="empty-state">{italian ? "Valuta alcuni vini degustati per iniziare a costruire il tuo profilo." : "Rate a few wines you have tasted to start building your profile."}</p> : <>
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
            <div><strong>{evidence?.unique_wine_count ?? overall.tasting_count ?? overall.sample_count}</strong><span>{italian ? "vini distinti" : "unique wines"}</span></div>
            <div><strong>{visibleStarRatingCount}</strong><span>{italian ? "stelline personali" : "personal star ratings"}</span></div>
            <small>{confidenceLabel}{totalSensorySignals ? ` · ${italian ? "copertura" : "coverage"} ${sensoryCoverage}%` : ""}</small>
          </div>
        </div>
      </section>

      {categoryProfiles.length ? <section className="taste-profile-categories" aria-labelledby="taste-category-heading">
        <div className="taste-profile-section-heading">
          <span>{italian ? "Firme per tipologia" : "Signatures by wine style"}</span>
          <h3 id="taste-category-heading">{italian ? "Come cambia il tuo gusto" : "How your taste changes"}</h3>
          <p>{italian ? "Il confronto usa il tuo profilo generale, non la media degli altri utenti." : "The comparison uses your overall profile, not other users' average."}</p>
          <div className="taste-profile-category-view" role="group" aria-label={italian ? "Indicatori mostrati" : "Displayed indicators"}>
            <button type="button" className={categoryView === "differences" ? "is-active" : ""} aria-pressed={categoryView === "differences"} onClick={() => setCategoryView("differences")}>{italian ? "Differenze" : "Differences"}</button>
            <button type="button" className={categoryView === "all" ? "is-active" : ""} aria-pressed={categoryView === "all"} onClick={() => setCategoryView("all")}>{italian ? "Tutti gli indicatori" : "All indicators"}</button>
          </div>
        </div>
        <div className="taste-profile-category-list">{categoryProfiles.map((profile) => {
          const differences = meaningfulDifferences(profile, overall);
          const significantDimensions = Object.fromEntries(differences.slice(0, 4).map(({ dimension, value }) => [dimension, value])) as TasteProfile["dimensions"];
          const displayedDimensions = categoryView === "all" ? profile.dimensions : significantDimensions;
          return <details className="taste-profile-category" key={profile.category} open={openCategory === profile.category}>
            <summary onClick={(event) => {
              event.preventDefault();
              setOpenCategory((current) => current === profile.category ? null : profile.category);
            }}><span>{label(profile.category)}</span><small>{profile.sample_count} {italian ? "esperienze" : "experiences"}</small></summary>
            <div className="taste-profile-category-content">
              <div className="taste-profile-category-explanation">
                <p>{categoryNarrative(profile, overall, label, italian)}</p>
                <small>{differences.length} {italian ? `differenz${differences.length === 1 ? "a" : "e"} rilevant${differences.length === 1 ? "e" : "i"} su ${Object.keys(profile.dimensions).length}` : `relevant difference${differences.length === 1 ? "" : "s"} out of ${Object.keys(profile.dimensions).length}`}</small>
              </div>
              <div>
                {Object.keys(displayedDimensions).length ? <>
                  <div className="taste-profile-comparison-legend"><span><i />{italian ? "Tipologia" : "Wine style"}</span><span><b />{italian ? "Profilo generale" : "Overall profile"}</span></div>
                  <SensorySignatureBars dimensions={displayedDimensions} labels={labels} reference={overall.dimensions} compact />
                </> : <p className="taste-profile-no-differences">{italian ? "Nessuno scostamento abbastanza solido da evidenziare. Scegli “Tutti gli indicatori” per vedere il profilo completo." : "No difference is strong enough to highlight. Choose “All indicators” to see the complete profile."}</p>}
              </div>
            </div>
          </details>;
        })}</div>
      </section> : null}

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

      <details className="taste-profile-method">
        <summary>{italian ? "Come Vinaris ha costruito questo profilo" : "How Vinaris built this profile"}</summary>
        <div>
          <p>{italian ? "Vinaris usa solo le degustazioni che hai registrato tu. Il voto resta il segnale principale: vicino al valore neutro pesa poco, mentre un voto alto o basso rafforza o riduce l’affinità per le caratteristiche del vino." : "Vinaris uses only the tastings you recorded. Your rating is the main signal: a neutral rating has little effect, while high or low ratings strengthen or reduce affinity for a wine’s characteristics."}</p>
          <ul>
            <li>{italian ? "Le caratteristiche sensoriali appartengono al vino e sono dati condivisi Vinaris." : "Sensory characteristics belong to the wine and are shared Vinaris data."}</li>
            <li>{italian ? "Le informazioni mancanti vengono escluse dal calcolo, non considerate pari a zero." : "Missing information is excluded from the calculation, never treated as zero."}</li>
            <li>{italian ? "Il profilo è privato: le valutazioni di altri utenti non lo influenzano." : "Your profile is private: other users’ ratings never influence it."}</li>
          </ul>
          {evidence ? <p className="taste-profile-evidence-detail">{italian
            ? `${evidence.tasting_rating_count} degustazioni con voto · ${evidence.enjoyment_only_count} giudizi senza voto · ${evidence.direct_rating_count} stelline personali · ${evidence.sensory_missing_count} segnali senza dati sensoriali.`
            : `${evidence.tasting_rating_count} rated tastings · ${evidence.enjoyment_only_count} verdicts without a rating · ${evidence.direct_rating_count} personal star ratings · ${evidence.sensory_missing_count} signals without sensory data.`}</p> : null}
          <div className="taste-profile-maintenance">
            {updatedAt ? <small>{italian ? `Aggiornato automaticamente: ${updatedAt}` : `Automatically updated: ${updatedAt}`}</small> : null}
            <button type="button" className="secondary compact" disabled={rebuilding} onClick={() => void rebuild()}>{rebuilding ? (italian ? "Ricalcolo…" : "Recalculating…") : (italian ? "Ricalcola dai dati originali" : "Recalculate from source data")}</button>
          </div>
          {isAppAdmin ? <section className="taste-profile-algorithm-diagnostics" aria-label={italian ? "Diagnostica algoritmo gusto" : "Taste algorithm diagnostics"}>
            <div className="taste-profile-algorithm-heading">
              <div><span>{italian ? "Solo amministratori · modalità shadow" : "Administrators only · shadow mode"}</span><strong>{italian ? "Confronto algoritmo V2/V3" : "V2/V3 algorithm comparison"}</strong></div>
              <button type="button" className="secondary compact" aria-expanded={diagnosticsVisible} onClick={() => void toggleAlgorithmDiagnostics()}>{diagnosticsVisible ? (italian ? "Nascondi confronto" : "Hide comparison") : (italian ? "Mostra confronto" : "Show comparison")}</button>
            </div>
            {diagnosticsVisible ? <div className="taste-profile-algorithm-content">
              <p>{italian ? "Il V2 resta attivo. Il V3 è solo osservato e non modifica affinità o suggerimenti." : "V2 remains active. V3 is observed only and does not change affinities or recommendations."}</p>
              <p>{italian ? "Le colonne hanno significati diversi: V2 indica l’affinità associata ai vini apprezzati; V3 stima il livello sensoriale ideale. La loro distanza non è una variazione di gradimento." : "The columns have different meanings: V2 indicates affinity associated with liked wines; V3 estimates the ideal sensory level. Their distance is not a change in enjoyment."}</p>
              {diagnosticsLoading ? <p role="status">{italian ? "Caricamento confronto…" : "Loading comparison…"}</p> : null}
              {diagnosticsError ? <p className="taste-profile-algorithm-error" role="alert">{diagnosticsError}</p> : null}
              {algorithmDiagnostics ? <>
                <section className={`taste-profile-algorithm-validation is-${algorithmDiagnostics.validation.status}`} aria-label={italian ? "Validazione retrospettiva" : "Retrospective validation"}>
                  <div><span>{italian ? "Validazione retrospettiva" : "Retrospective validation"}</span><strong>Leave-one-experience-out</strong></div>
                  {algorithmDiagnostics.validation.status === "ready" ? <>
                    <p>{italian ? `${algorithmDiagnostics.validation.tested_experiences} esperienze confrontabili: ${algorithmDiagnostics.validation.positive_experiences} positive e ${algorithmDiagnostics.validation.negative_experiences} negative.` : `${algorithmDiagnostics.validation.tested_experiences} comparable experiences: ${algorithmDiagnostics.validation.positive_experiences} positive and ${algorithmDiagnostics.validation.negative_experiences} negative.`}</p>
                    <div className="taste-profile-algorithm-validation-metrics"><span><small>{italian ? "Errore medio V2" : "V2 mean error"}</small><strong>{Math.round((algorithmDiagnostics.validation.v2_mean_absolute_error ?? 0) * 100)} pt</strong></span><span><small>{italian ? "Errore medio V3" : "V3 mean error"}</small><strong>{Math.round((algorithmDiagnostics.validation.v3_mean_absolute_error ?? 0) * 100)} pt</strong></span></div>
                    <p className="taste-profile-algorithm-verdict">{algorithmDiagnostics.validation.winner === "v3" ? (italian ? "Il V3 predice meglio le esperienze escluse, ma resta in osservazione." : "V3 predicts held-out experiences better, but remains under observation.") : algorithmDiagnostics.validation.winner === "v2" ? (italian ? "Il V2 predice meglio le esperienze escluse: il V3 non è pronto." : "V2 predicts held-out experiences better: V3 is not ready.") : (italian ? "Le prestazioni sono equivalenti: non ci sono ancora motivi per sostituire il V2." : "Performance is equivalent: there is not yet a reason to replace V2.")}</p>
                  </> : <p>{italian ? `Dati insufficienti: ${algorithmDiagnostics.validation.tested_experiences} esperienze confrontabili, di cui ${algorithmDiagnostics.validation.positive_experiences} positive e ${algorithmDiagnostics.validation.negative_experiences} negative. Servono almeno 8 esperienze, incluse 2 positive e 2 negative.` : `Insufficient data: ${algorithmDiagnostics.validation.tested_experiences} comparable experiences, including ${algorithmDiagnostics.validation.positive_experiences} positive and ${algorithmDiagnostics.validation.negative_experiences} negative. At least 8 experiences are required, including 2 positive and 2 negative.`}</p>}
                </section>
                <div className="taste-profile-algorithm-categories">{algorithmDiagnostics.categories.map((category) => <article key={category.category}>
                <header><div><strong>{label(category.category)}</strong><small>{category.sample_count} {italian ? "esperienze" : "experiences"}</small></div><div><span>{italian ? "Affidabilità evidenze" : "Evidence confidence"} {Math.round(category.v2_confidence * 100)}%</span></div></header>
                {category.dimensions.length ? <div className="taste-profile-algorithm-table">
                  <div className="taste-profile-algorithm-row taste-profile-algorithm-labels"><span>{italian ? "Indicatore" : "Indicator"}</span><span>{italian ? "Affinità V2" : "V2 affinity"}</span><span>{italian ? "Ideale V3" : "V3 ideal"}</span></div>
                  {category.dimensions.map((dimension) => <div className="taste-profile-algorithm-row" key={dimension.dimension}><strong>{label(dimension.dimension)}</strong><span>{dimension.v2_preference === null ? "—" : Math.round(dimension.v2_preference * 100)}</span><span>{dimension.v3_preference === null ? "—" : Math.round(dimension.v3_preference * 100)}</span></div>)}
                </div> : <p>{italian ? "Nessun indicatore calcolato." : "No calculated indicators."}</p>}
              </article>)}</div></> : null}
            </div> : null}
          </section> : null}
        </div>
      </details>
    </>}
  </section>;
}

export default TasteProfilePanel;
