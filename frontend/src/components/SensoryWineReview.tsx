import { useState } from "react";
import { api } from "../services/api";
import type { Locale, SensoryTraitReview, WineEvidenceReview } from "../types";
import "./SensoryReferencesPanel.css";
import SensoryReviewWorkflow from "./SensoryReviewWorkflow";

const names: Record<string, string> = { body: "Corpo", acidity: "Acidità", tannin: "Tannini", sweetness: "Dolcezza", aromatic_intensity: "Intensità aromatica", fruit: "Frutto", wood: "Legno", spice: "Spezie", minerality: "Mineralità" };

export function SensoryTraitReviews({ traits, locale }: { traits: SensoryTraitReview[]; locale: Locale }) {
  const it = locale === "it";
  const labels = it ? { described: "Descrizione sostenuta da fonti", conflicting: "Descrizioni discordanti", context_only: "Solo contesto: intensità non determinabile", no_evidence: "Nessun riscontro disponibile" } : { described: "Source-supported description", conflicting: "Conflicting descriptions", context_only: "Context only: intensity undetermined", no_evidence: "No evidence available" };
  return <div>{traits.map(trait => <section className="sensory-reference-trait" key={trait.dimension} aria-label={it ? names[trait.dimension] : trait.dimension}>
    <strong>{it ? names[trait.dimension] : trait.dimension.replace(/_/g, " ")}</strong>
    <p>{it ? "Valore attuale" : "Current value"}: {trait.current_value ?? "—"} · {it ? "Intensità non validata" : "Intensity not validated"}</p>
    <p><b>{labels[trait.status]}</b></p><p>{trait.rationale}</p>
    {trait.evidence.map((item, index) => <div className="sensory-review-source" key={index}><p>{item.summary}</p><a href={item.source_url} target="_blank" rel="noopener noreferrer">{item.publisher}</a>{item.note_date && <p>{it ? "Data della nota" : "Note date"}: {item.note_date}</p>}</div>)}
  </section>)}</div>;
}

export default function SensoryWineReview({ identityId, locale, onChanged }: { identityId: string; locale: Locale; onChanged?: () => void }) {
  const it = locale === "it";
  const [review, setReview] = useState<WineEvidenceReview | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function load() {
    setBusy(true); setError(false);
    try {
      setReview(await api<WineEvidenceReview>(`/api/v1/taste-profile/admin/references/profiles/${identityId}`));
      setOpen(true);
    } catch { setError(true); }
    finally { setBusy(false); }
  }
  return <div className="sensory-wine-review">
    <button type="button" className="secondary compact" disabled={busy} onClick={() => open ? setOpen(false) : void load()}>{busy ? (it ? "Caricamento…" : "Loading…") : open ? (it ? "Chiudi riscontri" : "Close evidence") : (it ? "Esamina riscontri" : "Review evidence")}</button>
    {error && <p role="alert">{it ? "Impossibile caricare i riscontri. Riprova." : "Unable to load evidence. Try again."}</p>}
    {open && review && <section className="sensory-references" aria-label={it ? "Revisione documentale" : "Documentary review"}>
      <h4>{review.name} · {review.vintage}</h4>
      <SensoryReviewWorkflow identityId={identityId} locale={locale} onChanged={() => { void load(); onChanged?.(); }} />
      <p>{it ? "Revisione delle fonti curate disponibili, senza nuove ricerche a pagamento. I numeri restano stime da rivalidare; le descrizioni non ne certificano l’accuratezza." : "Review of available curated sources, without new paid research. Numbers remain estimates requiring review; descriptions do not certify their accuracy."}</p>
      {review.previously_approved && <p>{it ? "Approvato in precedenza: la revisione documentale resta necessaria." : "Previously approved: documentary review is still required."}</p>}
      {review.dossier ? <p>{it ? "Fonti controllate il" : "Sources checked on"} {review.dossier.checked_on}. {it ? "Sintesi redazionali in italiano." : "Editorial summaries in Italian."}</p> : <p>{it ? "Nessun dossier per questa esatta identità e annata. Non vengono utilizzate prove di altri vini." : "No dossier for this exact identity and vintage. Evidence from other wines is not substituted."}</p>}
      <details><summary>{it ? "Consulta il dossier completo e i limiti delle fonti" : "Read the full dossier and source limitations"}</summary>
        <SensoryTraitReviews traits={review.traits} locale={locale} />
        {review.dossier && <ul>{review.dossier.limitations.map(item => <li key={item}>{item}</li>)}</ul>}
      </details>
    </section>}
  </div>;
}
