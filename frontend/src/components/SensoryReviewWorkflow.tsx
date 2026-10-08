import { useState } from "react";
import type { GuidedSensoryProposal, Locale } from "../types";
import { api } from "../services/api";
import { SensoryTraitReviews } from "./SensoryWineReview";

const names: Record<string, string> = { body: "Corpo", acidity: "Acidità", tannin: "Tannini", sweetness: "Dolcezza", aromatic_intensity: "Intensità aromatica", fruit: "Frutto", wood: "Legno", spice: "Spezie", minerality: "Mineralità" };
const number = (value: number | null) => value === null ? "—" : value.toFixed(2);

export default function SensoryReviewWorkflow({ identityId, locale, onChanged }: { identityId: string; locale: Locale; onChanged?: () => void }) {
  const it = locale === "it";
  const [proposal, setProposal] = useState<GuidedSensoryProposal | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const base = `/api/v1/taste-profile/admin/references/profiles/${identityId}`;
  async function run(action: "load" | "apply" | "undo") {
    setBusy(true); setMessage("");
    try {
      if (action === "apply") {
        const result = await api<{ proposal: GuidedSensoryProposal; history_id: string }>(`${base}/apply`, { method: "POST", body: JSON.stringify({ revision: proposal?.revision, dimensions: selected, acknowledged: ack }) });
        setProposal(result.proposal); setHistory(result.history_id); setSaved(true); onChanged?.();
      } else if (action === "undo") {
        setProposal(await api<GuidedSensoryProposal>(`${base}/undo/${history}`, { method: "POST", body: JSON.stringify({ revision: proposal?.revision }) }));
        setHistory(null); setSaved(false); setMessage(it ? "Versione precedente ripristinata." : "Previous version restored."); onChanged?.();
      } else { const result = await api<GuidedSensoryProposal>(`${base}/proposal`); setProposal(result); setHistory(result.undo_history_id); setSaved(false); }
      setSelected([]); setAck(false);
    } catch {
      setMessage(it ? "Operazione non completata. Ricarica la proposta prima di riprovare: il profilo o le prove potrebbero essere cambiati." : "Operation not completed. Reload the proposal: the profile or evidence may have changed.");
      setSelected([]); setAck(false);
    } finally { setBusy(false); }
  }
  const eligible = proposal?.choices.filter(c => c.action === "retain" || c.action === "adjust") ?? [];
  const changes = proposal?.choices.filter(c => selected.includes(c.trait.dimension) && c.action === "adjust").length ?? 0;
  const corrections = eligible.filter(c => c.action === "adjust").length;
  const linkable = eligible.filter(c => c.action === "retain").length;
  const blocked = proposal?.choices.filter(c => c.action === "blocked") ?? [];
  const recorded = proposal?.choices.filter(c => c.action === "recorded") ?? [];
  function choiceCard(c: GuidedSensoryProposal["choices"][number]) {
    const advice = c.action !== "blocked" ? c.advice : c.trait.current_value === null
      ? (it ? "Manca il valore iniziale: completa prima il profilo del vino." : "The starting value is missing: complete the wine profile first.")
      : (it ? "Nessun aggiornamento proponibile con le prove disponibili." : "No update can be proposed with the available evidence.");
    return <article className="sensory-reference-card" key={c.trait.dimension}>
      <strong>{it ? names[c.trait.dimension] : c.trait.dimension}</strong>
      <p>{c.action === "adjust" ? `${number(c.trait.current_value)} → ${number(c.proposed_value)}` : `${it ? "Valore conservato" : "Value retained"}: ${number(c.trait.current_value)}`}</p>
      {c.lower !== null && <p>{it ? "Intervallo editoriale" : "Editorial range"}: {number(c.lower)}–{number(c.upper)}</p>}
      <p>{advice}</p>
      {(c.action === "retain" || c.action === "adjust") && <label className="sensory-reference-select"><input type="checkbox" disabled={busy} checked={selected.includes(c.trait.dimension)} onChange={e => setSelected(e.target.checked ? [...selected, c.trait.dimension] : selected.filter(d => d !== c.trait.dimension))} />{c.action === "retain" ? (it ? "Mantieni e collega prove" : "Retain and link evidence") : (it ? "Approva correzione proposta" : "Approve proposed correction")}: {it ? names[c.trait.dimension] : c.trait.dimension}</label>}
      <details><summary>{it ? "Esamina le prove" : "Review evidence"}</summary><SensoryTraitReviews traits={[c.trait]} locale={locale} /></details>
    </article>;
  }
  return <section className="sensory-guided" aria-label={it ? "Revisione guidata" : "Guided review"}>
    {!proposal && <><h5>{it ? "Percorso consigliato" : "Recommended workflow"}</h5>
    <ol><li>{it ? "Controlla identità, annata e fonti qui sotto." : "Check identity, vintage and sources below."}</li><li>{it ? "Prepara la proposta gratuita e seleziona solo ciò che approvi." : "Prepare the free proposal and select only what you approve."}</li><li>{it ? "Controlla il riepilogo e applica. Potrai annullare l’ultima applicazione." : "Check the summary and apply. You can undo the last application."}</li></ol>
    </>}
    {!proposal && <button type="button" disabled={busy} onClick={() => void run("load")}>{it ? "Prepara proposta gratuita" : "Prepare free proposal"}</button>}
    {message && <p role="alert">{message}</p>}
    {proposal && <>
      <section aria-label={it ? "Esito della proposta" : "Proposal result"}>
        <h5>{saved ? (it ? "Revisione registrata" : "Review recorded") : (it ? "Cosa puoi fare ora" : "What you can do now")}</h5>
        <p><strong>{it ? `${corrections} correzioni · ${linkable} prove collegabili · ${blocked.length} caratteristiche da approfondire` : `${corrections} corrections · ${linkable} descriptions to link · ${blocked.length} traits need further evidence`}</strong></p>
        {!!recorded.length && <p>{it ? `Prove già collegate: ${recorded.length}.` : `Evidence already linked: ${recorded.length}.`}</p>}
        {!!linkable && !corrections && <p>{it ? "Non sono proposte modifiche ai numeri. Seleziona le caratteristiche descritte per collegare le fonti al profilo, dopo averle esaminate." : "No numerical changes are proposed. Select described traits to link their sources to the profile after reviewing them."}</p>}
        {!!corrections && <p>{it ? "Esamina prima le correzioni proposte. Puoi anche collegare le prove alle caratteristiche il cui valore resta uguale." : "Review the proposed corrections first. You can also link evidence to traits whose values stay unchanged."}</p>}
      </section>
      <button type="button" className="secondary" disabled={busy} onClick={() => void run("load")}>{it ? "Ricarica proposta" : "Reload proposal"}</button>
      <details><summary>{it ? "Come interpretare numeri e intervalli" : "How to interpret numbers and ranges"}</summary>
      <p>{it ? "Gli intervalli sono regole editoriali sperimentali, non misure o intervalli statistici. Manteniamo il valore se compatibile; altrimenti proponiamo il limite più vicino. La sola presenza di un aroma non basta per cambiarne l’intensità." : "Ranges are experimental editorial rules, not measurements or statistical intervals. Compatible values are retained; otherwise the nearest boundary is proposed. Aroma presence alone does not justify changing intensity."}</p>
      <p>{it ? "I numeri sono visualizzati con due decimali; quelli conservati mantengono la precisione originale." : "Numbers display two decimals; retained values keep their original precision."}</p>
      </details>
      {saved && <p role="status">{it ? "Prove collegate e selezione applicata. Il profilo resta una stima da validare, anche se approvato in precedenza. La versione precedente è conservata." : "Evidence linked and selection applied. The profile remains an estimate requiring validation. The previous version is retained."}</p>}
      {!eligible.length && !saved && <p>{it ? "Nessuna modifica consigliata ora. Le prove sono già registrate oppure insufficienti: mantieni il profilo e completa i metadati o raccogli altre fonti prima di riprovare." : "No change recommended now. Evidence is already recorded or insufficient: retain the profile and complete metadata or collect more sources."}</p>}
      {[...eligible.filter(c => c.action === "adjust"), ...eligible.filter(c => c.action === "retain")].map(choiceCard)}
      {!!blocked.length && <details><summary>{it ? `Da approfondire (${blocked.length}) — valori conservati` : `Needs further evidence (${blocked.length}) — values retained`}</summary>{blocked.map(choiceCard)}</details>}
      {!!recorded.length && <details><summary>{it ? `Già registrate (${recorded.length})` : `Already recorded (${recorded.length})`}</summary>{recorded.map(choiceCard)}</details>}
      {!!eligible.length && <>
        <h5>{it ? "Conferma la selezione" : "Confirm selection"}</h5>
        <p>{it ? `Selezionate: ${selected.length}. Valori da modificare: ${changes}. Valori da conservare con prove: ${selected.length - changes}.` : `Selected: ${selected.length}. Values to change: ${changes}. Values to retain with evidence: ${selected.length - changes}.`}</p>
        {!selected.length && <p>{it ? "Seleziona almeno una caratteristica qui sopra per procedere." : "Select at least one trait above to continue."}</p>}
        <label className="sensory-reference-select"><input type="checkbox" disabled={busy} checked={ack} onChange={e => setAck(e.target.checked)} />{it ? "Ho esaminato le prove. Confermo la revisione del profilo condiviso; le stime non diventano misurazioni validate." : "I reviewed the evidence and confirm this shared-profile revision; estimates do not become validated measurements."}</label>
        <button type="button" disabled={busy || !ack || !selected.length} onClick={() => void run("apply")}>{it ? "Applica selezione" : "Apply selection"}</button>
      </>}
      {history && <button type="button" className="secondary" disabled={busy} onClick={() => void run("undo")}>{it ? "Annulla ultima applicazione" : "Undo last application"}</button>}
    </>}
  </section>;
}
