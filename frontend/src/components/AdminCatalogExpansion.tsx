import { useEffect, useState } from "react";
import { api } from "../services/api";
import type { Locale } from "../types";
import "./AdminCatalogRecovery.css";
import "./AdminCatalogCompletion.css";
import "./AdminCatalogExpansion.css";

type ExpansionJob = {
  id: string;
  status: "running" | "done";
  stage: "discovering" | "researching" | "done";
  stop_reason: "" | "finished" | "budget" | "cancelled" | "failed";
  producers_total: number;
  producers_done: number;
  producers_not_found: string[];
  created: number;
  existing: number;
  unsupported: number;
  cost_usd: string | number;
  budget_usd: string | number;
  error: string;
};
type Proposal = { id: string; name: string; producer: string; appellation: string; region: string; country: string; type: string; grapes_text: string; description: string; source_url: string };
type ExpansionStatus = { pending_count: number; pending: Proposal[]; job: ExpansionJob | null };

const URL = "/api/v1/catalog-expansion";
const usd = (value: string | number) => `$${Number(value || 0).toFixed(2)}`;

// Italy and France first: the areas offered as suggestions; any other area can be typed.
const AREAS: Record<string, string[]> = {
  Italia: ["Barolo", "Barbaresco", "Langhe", "Roero", "Alto Piemonte", "Valpolicella", "Soave", "Franciacorta", "Alto Adige", "Trentino", "Friuli Colli Orientali", "Collio", "Chianti Classico", "Brunello di Montalcino", "Bolgheri", "Montepulciano", "Umbria", "Marche", "Abruzzo", "Campania", "Taurasi", "Puglia", "Etna", "Sicilia", "Sardegna", "Valtellina", "Oltrepò Pavese", "Liguria", "Valle d’Aosta"],
  Francia: ["Champagne", "Chablis", "Côte de Nuits", "Côte de Beaune", "Côte Chalonnaise", "Mâconnais", "Beaujolais", "Médoc", "Pauillac", "Saint-Émilion", "Pomerol", "Pessac-Léognan", "Sauternes", "Côte-Rôtie", "Hermitage", "Châteauneuf-du-Pape", "Rhône méridional", "Alsace", "Sancerre", "Vouvray", "Chinon", "Jura", "Savoie", "Provence", "Bandol", "Languedoc", "Roussillon", "Sud-Ouest", "Corse"],
};

/** App administrators: add the wines of more producers to the catalog, as proposals to approve. */
export default function AdminCatalogExpansion({ locale, disabled, onApproved }: { locale: Locale; disabled: boolean; onApproved: () => void }) {
  const it = locale === "it";
  const [status, setStatus] = useState<ExpansionStatus | null>(null);
  const [mode, setMode] = useState<"area" | "producers">("area");
  const [country, setCountry] = useState("Italia");
  const [area, setArea] = useState("");
  const [count, setCount] = useState("10");
  const [producers, setProducers] = useState("");
  const [budget, setBudget] = useState("25");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const running = status?.job?.status === "running";

  useEffect(() => {
    let active = true;
    api<ExpansionStatus>(URL).then((next) => { if (active) setStatus(next); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      api<ExpansionStatus>(URL).then(setStatus).catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [running]);

  async function send(path: string, body?: unknown): Promise<boolean> {
    setBusy(true); setError("");
    try {
      setStatus(await api<ExpansionStatus>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }));
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      return false;
    } finally { setBusy(false); }
  }
  function start() {
    const names = producers.split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
    const wanted = Math.round(Number(count));
    const cap = Number(budget);
    if (!(cap > 0 && cap <= 100)) { setError(it ? "Indica un tetto di spesa fino a 100 USD." : "Enter a spending cap up to 100 USD."); return; }
    if (mode === "producers" ? !names.length || names.length > 40 : !area.trim() || !(wanted >= 1 && wanted <= 40)) {
      setError(mode === "producers"
        ? (it ? "Scrivi da 1 a 40 produttori, uno per riga." : "Write 1 to 40 producers, one per line.")
        : (it ? "Indica una zona e da 1 a 40 produttori da cercare." : "Enter an area and 1 to 40 producers to look for."));
      return;
    }
    const howMany = mode === "producers" ? names.length : wanted;
    const message = it
      ? `Cercare sul web la gamma di ${howMany} produttori? La ricerca si ferma prima di superare ${usd(cap)}; il costo è a carico della chiave AI dell’applicazione. I vini trovati restano da approvare.`
      : `Research the range of ${howMany} producers on the web? The research stops before exceeding ${usd(cap)}; the application's AI key pays for it. The wines found wait for approval.`;
    if (!window.confirm(message)) return;
    void send(URL, mode === "producers"
      ? { producers: names, country: country.trim(), budget_usd: cap }
      : { area: area.trim(), country: country.trim(), producer_count: wanted, budget_usd: cap });
  }
  async function review(action: "approve" | "discard", ids: string[]) {
    if (ids.length > 1 && !window.confirm(action === "approve"
      ? (it ? `Approvare ${ids.length} vini? Compariranno nei suggerimenti di tutte le cantine.` : `Approve ${ids.length} wines? They will appear in every cellar's suggestions.`)
      : (it ? `Scartare ${ids.length} vini proposti?` : `Discard ${ids.length} proposed wines?`))) return;
    if (await send(`${URL}/${action}`, { ids }) && action === "approve") onApproved();
  }

  const job = status?.job ?? null;
  const pending = status?.pending ?? [];
  const groups = new Map<string, Proposal[]>();
  for (const proposal of pending) groups.set(proposal.producer, [...(groups.get(proposal.producer) ?? []), proposal]);
  const stopLabel = job ? ({
    "": "",
    finished: it ? "Ricerca completata." : "Research finished.",
    budget: it ? "Ricerca fermata al tetto di spesa." : "Research stopped at the spending cap.",
    cancelled: it ? "Ricerca interrotta." : "Research stopped.",
    failed: it ? "Ricerca interrotta per errori." : "Research stopped after errors.",
  })[job.stop_reason] : "";

  return <section className="admin-catalog-recovery admin-catalog-expansion" aria-label={it ? "Aggiungi vini al catalogo" : "Add wines to the catalog"}>
    <h4>{it ? "Aggiungi i vini di altri produttori" : "Add the wines of more producers"}</h4>
    <p>{it
      ? "L’AI legge il sito del produttore e propone i vini della sua gamma con denominazione, vitigni e fonte. I vini già nel catalogo non vengono toccati; quelli nuovi restano da approvare."
      : "AI reads the producer's site and proposes the wines of its range with appellation, grapes and source. Wines already in the catalog stay untouched; new ones wait for approval."}</p>
    {!running ? <>
      <div className="admin-catalog-expansion-mode" role="group" aria-label={it ? "Come scegliere i produttori" : "How to choose the producers"}>
        <button type="button" aria-pressed={mode === "area"} className={mode === "area" ? "" : "secondary"} onClick={() => setMode("area")}>{it ? "Per zona" : "By area"}</button>
        <button type="button" aria-pressed={mode === "producers"} className={mode === "producers" ? "" : "secondary"} onClick={() => setMode("producers")}>{it ? "Elenco produttori" : "Producer list"}</button>
      </div>
      <div className="admin-catalog-completion-form">
        <label>{it ? "Paese" : "Country"}<input list="catalog-expansion-countries" value={country} onChange={(event) => setCountry(event.target.value)} /></label>
        <datalist id="catalog-expansion-countries">{Object.keys(AREAS).map((name) => <option key={name} value={name} />)}</datalist>
        {mode === "area" ? <>
          <label>{it ? "Zona o denominazione" : "Area or appellation"}<input list="catalog-expansion-areas" value={area} placeholder={country === "Francia" ? "Champagne, Chablis…" : "Barolo, Etna…"} onChange={(event) => setArea(event.target.value)} /></label>
          <datalist id="catalog-expansion-areas">{(AREAS[country] ?? []).map((name) => <option key={name} value={name} />)}</datalist>
          <label>{it ? "Produttori da cercare" : "Producers to look for"}<input type="number" inputMode="numeric" min={1} max={40} value={count} onChange={(event) => setCount(event.target.value)} /></label>
        </> : <label className="admin-catalog-expansion-list">{it ? "Produttori, uno per riga" : "Producers, one per line"}<textarea rows={4} value={producers} placeholder={"Giacomo Conterno\nDomaine Leflaive"} onChange={(event) => setProducers(event.target.value)} /></label>}
        <label>{it ? "Tetto di spesa (USD)" : "Spending cap (USD)"}<input type="number" inputMode="decimal" min={1} max={100} step="1" value={budget} onChange={(event) => setBudget(event.target.value)} /></label>
        <button type="button" className="secondary" disabled={disabled || busy} onClick={start}>{it ? "Cerca i vini con AI" : "Find the wines with AI"}</button>
      </div>
    </> : null}
    {job ? <div className="admin-catalog-completion-job" role="status">
      {running && job.stage === "researching" ? <progress max={job.producers_total} value={job.producers_done} aria-label={it ? "Avanzamento della ricerca" : "Research progress"} /> : null}
      <p>{running
        ? (job.stage === "discovering" ? (it ? "Cerco i produttori della zona… " : "Looking for the area's producers… ") : (it ? "Ricerca in corso: " : "Researching: "))
        : `${stopLabel} `}
        {job.stage === "discovering" && running ? "" : it
          ? `${job.producers_done} di ${job.producers_total} produttori · ${job.created} vini nuovi · ${job.existing} già nel catalogo${job.unsupported ? ` · ${job.unsupported} scartati perché senza fonte` : ""} · costo ${usd(job.cost_usd)} su ${usd(job.budget_usd)}.`
          : `${job.producers_done} of ${job.producers_total} producers · ${job.created} new wines · ${job.existing} already in the catalog${job.unsupported ? ` · ${job.unsupported} dropped for lack of a source` : ""} · cost ${usd(job.cost_usd)} of ${usd(job.budget_usd)}.`}</p>
      {!running && job.producers_not_found.length ? <p>{it ? "Nessun vino trovato per: " : "No wine found for: "}{job.producers_not_found.join(", ")}.</p> : null}
      {running ? <button type="button" className="secondary compact" disabled={busy} onClick={() => void send(`${URL}/cancel`)}>{it ? "Interrompi" : "Stop"}</button> : null}
      {job.error ? <p role="alert">{job.error}</p> : null}
    </div> : null}
    {error ? <p role="alert">{error}</p> : null}
    {pending.length ? <div className="admin-catalog-expansion-pending">
      <div className="admin-catalog-expansion-pending-head">
        <strong>{status?.pending_count} {it ? "vini proposti da approvare" : "proposed wines to approve"}</strong>
        <button type="button" className="compact" disabled={disabled || busy} onClick={() => void review("approve", pending.map((item) => item.id))}>{it ? `Approva tutti (${pending.length})` : `Approve all (${pending.length})`}</button>
      </div>
      {[...groups.entries()].map(([producer, wines]) => <details key={producer} className="admin-catalog-expansion-producer">
        <summary><strong>{producer}</strong><span>{wines.length} {it ? "vini" : "wines"}</span></summary>
        <div className="admin-catalog-expansion-producer-actions">
          <button type="button" className="secondary compact" disabled={disabled || busy} onClick={() => void review("approve", wines.map((item) => item.id))}>{it ? "Approva questo produttore" : "Approve this producer"}</button>
          <button type="button" className="secondary compact" disabled={disabled || busy} onClick={() => void review("discard", wines.map((item) => item.id))}>{it ? "Scarta questo produttore" : "Discard this producer"}</button>
        </div>
        <ul>{wines.map((wine) => <li key={wine.id}>
          <div>
            <strong>{wine.name}</strong>
            <small>{[wine.type, wine.appellation, wine.region, wine.country].filter(Boolean).join(" · ")}</small>
            {wine.grapes_text ? <small>{wine.grapes_text}</small> : null}
            {wine.source_url ? <a href={wine.source_url} target="_blank" rel="noreferrer noopener">{it ? "Fonte" : "Source"}</a> : null}
          </div>
          <button type="button" className="secondary compact" disabled={disabled || busy} aria-label={it ? `Scarta ${wine.name}` : `Discard ${wine.name}`} onClick={() => void review("discard", [wine.id])}>{it ? "Scarta" : "Discard"}</button>
        </li>)}</ul>
      </details>)}
    </div> : null}
  </section>;
}
