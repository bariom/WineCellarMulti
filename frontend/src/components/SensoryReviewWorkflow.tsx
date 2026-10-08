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
  return <section className="sensory-guided" aria-label={it ? "Revisione guidata" : "Guided review"}>
    <h5>{it ? "Percorso consigliato" : "Recommended workflow"}</h5>
    <ol><li>{it ? "Controlla identità, annata e fonti qui sotto." : "Check identity, vintage and sources below."}</li><li>{it ? "Prepara la proposta gratuita e seleziona solo ciò che approvi." : "Prepare the free proposal and select only what you approve."}</li><li>{it ? "Controlla il riepilogo e applica. Potrai annullare l’ultima applicazione." : "Check the summary and apply. You can undo the last application."}</li></ol>
    <button type="button" disabled={busy} onClick={() => void run("load")}>{proposal ? (it ? "Ricarica proposta" : "Reload proposal") : (it ? "Prepara proposta gratuita" : "Prepare free proposal")}</button>
    {message && <p role="alert">{message}</p>}
    {proposal && <>
      <h5>{saved ? (it ? "3. Revisione registrata" : "3. Review recorded") : (it ? "2. Scegli le caratteristiche" : "2. Choose traits")}</h5>
      <p>{it ? "Gli intervalli sono regole editoriali sperimentali, non misure o intervalli statistici. Manteniamo il valore se compatibile; altrimenti proponiamo il limite più vicino. La sola presenza di un aroma non basta per cambiarne l’intensità." : "Ranges are experimental editorial rules, not measurements or statistical intervals. Compatible values are retained; otherwise the nearest boundary is proposed. Aroma presence alone does not justify changing intensity."}</p>
      <p>{it ? "I numeri sono visualizzati con due decimali; quelli conservati mantengono la precisione originale." : "Numbers display two decimals; retained values keep their original precision."}</p>
      {saved && <p role="status">{it ? "Prove collegate e selezione applicata. Il profilo resta una stima da validare, anche se approvato in precedenza. La versione precedente è conservata." : "Evidence linked and selection applied. The profile remains an estimate requiring validation. The previous version is retained."}</p>}
      {!eligible.length && !saved && <p>{it ? "Nessuna modifica consigliata ora. Le prove sono già registrate oppure insufficienti: mantieni il profilo e completa i metadati o raccogli altre fonti prima di riprovare." : "No change recommended now. Evidence is already recorded or insufficient: retain the profile and complete metadata or collect more sources."}</p>}
      {proposal.choices.map(c => <article className="sensory-reference-card" key={c.trait.dimension}>
        <strong>{it ? names[c.trait.dimension] : c.trait.dimension}</strong>
        <p>{number(c.trait.current_value)} → {number(c.proposed_value)}</p>
        {c.lower !== null && <p>{it ? "Intervallo editoriale" : "Editorial range"}: {number(c.lower)}–{number(c.upper)}</p>}
        <p>{c.advice}</p>
        {(c.action === "retain" || c.action === "adjust") && <label className="sensory-reference-select"><input type="checkbox" disabled={busy} checked={selected.includes(c.trait.dimension)} onChange={e => setSelected(e.target.checked ? [...selected, c.trait.dimension] : selected.filter(d => d !== c.trait.dimension))} />{c.action === "retain" ? (it ? "Mantieni e collega prove" : "Retain and link evidence") : (it ? "Approva correzione proposta" : "Approve proposed correction")}: {it ? names[c.trait.dimension] : c.trait.dimension}</label>}
        <details><summary>{it ? "Esamina le prove prima di scegliere" : "Review evidence before selecting"}</summary><SensoryTraitReviews traits={[c.trait]} locale={locale} /></details>
      </article>)}
      {!!eligible.length && <>
        <h5>{it ? "3. Riepilogo prima di applicare" : "3. Summary before applying"}</h5>
        <p>{it ? `${selected.length} caratteristiche selezionate: ${changes} valori cambiano, ${selected.length - changes} conservano il valore e ricevono le prove. Le altre caratteristiche restano invariate.` : `${selected.length} traits selected: ${changes} values change, ${selected.length - changes} retain values and receive evidence. Other traits remain unchanged.`}</p>
        <label className="sensory-reference-select"><input type="checkbox" disabled={busy} checked={ack} onChange={e => setAck(e.target.checked)} />{it ? "Ho esaminato le prove. Confermo la revisione del profilo condiviso; le stime non diventano misurazioni validate." : "I reviewed the evidence and confirm this shared-profile revision; estimates do not become validated measurements."}</label>
        <button type="button" disabled={busy || !ack || !selected.length} onClick={() => void run("apply")}>{it ? "Applica selezione" : "Apply selection"}</button>
      </>}
      {history && <button type="button" className="secondary" disabled={busy} onClick={() => void run("undo")}>{it ? "Annulla ultima applicazione" : "Undo last application"}</button>}
    </>}
  </section>;
}
