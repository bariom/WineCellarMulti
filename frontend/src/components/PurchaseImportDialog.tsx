import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { api, ApiError } from "../services/api";
import type { Locale, PendingPurchase, PurchaseImportPreview, PurchaseImportResult } from "../types";
import "./PurchaseImportDialog.css";

const PurchasePdfPreview = lazy(() => import("./PurchasePdfPreview"));

type ReviewRow = { name: string; producer: string; vintage: string; format: string; quantity: string; unit_price: string; existing_wine_id: string; source: number };

export default function PurchaseImportDialog({ locale, canAnalyze, included, isAdmin, onActivate, onAnalyzed, onClose, onImported }: {
  locale: Locale; canAnalyze: boolean; included: boolean; isAdmin: boolean; onActivate: () => void; onAnalyzed: () => Promise<void>; onClose: () => void; onImported: () => Promise<void>;
}) {
  const it = locale === "it";
  const dialog = useRef<HTMLDialogElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [documentExpanded, setDocumentExpanded] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<PurchaseImportPreview | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [supplier, setSupplier] = useState("");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState("");
  const [currency, setCurrency] = useState("");
  const [total, setTotal] = useState("");
  const [additional, setAdditional] = useState("");
  const [delivery, setDelivery] = useState("received");
  const [expected, setExpected] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [acceptDifference, setAcceptDifference] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PurchaseImportResult | null>(null);
  const [pending, setPending] = useState<PendingPurchase[]>([]);
  const [pendingError, setPendingError] = useState(false);

  useEffect(() => {
    const element = dialog.current!;
    const trigger = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    element.showModal(); document.body.style.overflow = "hidden";
    return () => { element.close(); document.body.style.overflow = overflow; trigger?.focus(); };
  }, []);
  useEffect(() => {
    if (!file) { setUrl(""); return; }
    const next = URL.createObjectURL(file); setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  useEffect(() => { void loadPending(); }, []);

  async function loadPending() {
    try { setPending(await api<PendingPurchase[]>("/api/v1/imports/purchases/pending")); setPendingError(false); }
    catch { setPendingError(true); }
  }
  function chooseDocument(next?: File) {
    if (!next) return;
    if (next.size > 10_000_000 || !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(next.type)) {
      setError(it ? "Scegli JPG, PNG, WebP o PDF fino a 10 MB." : "Choose JPG, PNG, WebP or PDF up to 10 MB."); return;
    }
    setFile(next); setPreview(null); setError("");
  }
  function failure(exc: unknown) {
    const status = exc instanceof ApiError ? exc.status : 0;
    if (exc instanceof ApiError && exc.message.includes("supplier document has already been imported")) {
      setError(it ? "Questo documento del fornitore risulta importato: controlla gli acquisti prima di riprovare." : "This supplier document is already imported: check your purchases before retrying.");
      return;
    }
    setError(status === 402 ? (it ? "Credito AI insufficiente. Ricarica e riprova." : "Insufficient AI credit. Top up and retry.")
      : status === 409 ? (it ? "L’acquisto non può essere completato. Verifica disponibilità e limite etichette della cantina." : "The purchase could not be completed. Check cellar availability and label limits.")
      : status === 403 ? (it ? "Non hai i permessi per questa operazione." : "You do not have permission for this action.")
      : (it ? "Operazione non riuscita. Controlla i dati e usa una foto leggibile o un PDF non protetto (massimo 10 pagine). Puoi riprovare senza duplicare l’acquisto." : "Something went wrong. Check the fields and use a readable photo or an unlocked PDF (up to 10 pages). Retrying will not duplicate the purchase."));
  }
  async function analyze() {
    if (!file || busy) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const data = new FormData(); data.append("document", file); data.append("locale", locale);
      const next = await api<PurchaseImportPreview>("/api/v1/imports/purchases/preview", { method: "POST", body: data });
      setPreview(next); setReviewed(false); setAcceptDifference(false);
      const p = next.extraction;
      setSupplier(p.supplier); setReference(p.reference); setDate(p.order_date || ""); setCurrency(p.currency || "");
      setTotal(p.document_total === null ? "" : String(p.document_total)); setAdditional(p.additional_costs === null ? "" : String(p.additional_costs));
      setRows(p.rows.map((row, source) => ({ name: row.name, producer: row.producer, vintage: row.vintage, format: row.format,
        quantity: row.quantity === null ? "" : String(row.quantity), unit_price: row.unit_price === null ? "" : String(row.unit_price), existing_wine_id: "", source })));
    } catch (exc) { failure(exc); } finally {
      setBusy(false);
      try { await onAnalyzed(); } catch { /* Keep the analysis result if account refresh fails. */ }
    }
  }
  function update(index: number, values: Partial<ReviewRow>) {
    setRows(current => current.map((row, i) => i === index ? { ...row, ...values } : row));
    setReviewed(false); setAcceptDifference(false);
  }
  const sum = rows.reduce((value, row) => value + Math.round(Number(row.unit_price || 0) * 100) * Number(row.quantity || 0), 0) / 100 + Number(additional || 0);
  const difference = total !== "" && Math.abs(sum - Number(total)) > .020001;
  const formatMoney = (value: number) => new Intl.NumberFormat(it ? "it-IT" : "en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  async function confirm(event: FormEvent) {
    event.preventDefault(); event.stopPropagation();
    if (!preview || busy || !reviewed) return;
    setBusy(true); setError("");
    try {
      const imported = await api<PurchaseImportResult>(`/api/v1/imports/purchases/${preview.id}/confirm`, { method: "POST", body: JSON.stringify({
        supplier, reference, order_date: date, currency, delivery, expected_delivery: delivery === "pending" ? expected || null : null,
        document_total: total === "" ? null : total, additional_costs: additional || "0", reviewed: true, accept_total_difference: acceptDifference,
        rows: rows.map(({ source: _source, ...row }) => ({ ...row, quantity: Number(row.quantity), existing_wine_id: row.existing_wine_id || null })),
      }) });
      setResult(imported); await loadPending();
      // The purchase is already committed; a failed refresh must never look like a failed import.
      try { await onImported(); } catch { /* The next cellar refresh will show the committed result. */ }
    } catch (exc) { failure(exc); } finally { setBusy(false); }
  }
  async function receive(id: string) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const imported = await api<PurchaseImportResult>(`/api/v1/imports/purchases/${id}/receive`, { method: "POST" });
      setResult(imported); await loadPending();
      try { await onImported(); } catch { /* Retain the successful delivery confirmation. */ }
    } catch (exc) { failure(exc); } finally { setBusy(false); }
  }

  return createPortal(<dialog ref={dialog} className="purchase-import" data-stage={preview ? "review" : "upload"} aria-labelledby="purchase-import-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className="purchase-import-heading"><div><span>Vinaris · {it ? "La tua cantina" : "Your cellar"}</span><h2 id="purchase-import-title">{it ? "Aggiungi un acquisto" : "Add a purchase"}</h2><p>{it ? "Da una ricevuta alla cantina, con il tuo ultimo sguardo." : "From receipt to cellar, with your final review."}</p></div><button type="button" className="secondary" onClick={onClose} disabled={busy}>{it ? "Chiudi" : "Close"}</button></header>
    {error ? <p role="alert" className="purchase-import-error">{error}</p> : null}
    {result ? <section className="purchase-import-success" role="status"><h3>{result.status === "pending" ? (it ? "Acquisto registrato, in attesa di consegna" : "Purchase saved, awaiting delivery") : (it ? "Acquisto aggiunto alla cantina" : "Purchase added to your cellar")}</h3><p>{result.bottles} {it ? "bottiglie" : "bottles"}. {result.status === "pending" ? (it ? "Le scorte disponibili aumenteranno quando registrerai la ricezione." : "Available stock will increase when you record delivery.") : (it ? "Quantità, fornitore e prezzi sono stati salvati nei lotti d’acquisto." : "Quantities, supplier and prices have been saved in purchase lots.")}</p><button type="button" className="secondary" onClick={() => { setResult(null); setPreview(null); setFile(null); }}>{it ? "Nuovo acquisto" : "New purchase"}</button></section>
    : <>
      {!canAnalyze ? <section className="purchase-import-activation" aria-labelledby="purchase-activation-title">
        <div><h3 id="purchase-activation-title">{included ? (it ? "Analisi temporaneamente indisponibile" : "Analysis temporarily unavailable") : (it ? "Attiva l’importazione con AI" : "Activate AI purchase import")}</h3>
          <p>{included ? (it ? "Il servizio di analisi è temporaneamente indisponibile. Riprova tra poco." : "The analysis service is temporarily unavailable. Please try again shortly.") : (it ? "Attiva un abbonamento per avere l’analisi inclusa, oppure ricarica un AI Pack per usarla nel piano gratuito." : "Activate a subscription for included analysis, or top up an AI Pack to use it on the free plan.")}</p>
          <small>{it ? "Puoi comunque registrare la ricezione degli acquisti in attesa." : "You can still record delivery of pending purchases."}</small>
        </div>
        {!included ? <button type="button" onClick={onActivate}>{it ? "Scopri abbonamenti e AI Pack" : "Explore subscriptions and AI Packs"}</button> : null}
      </section> : null}
      <div className="purchase-import-upload"><label><span>{it ? "Fotografa o carica ricevuta / fattura" : "Photograph or upload receipt / invoice"}</span><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={busy || !canAnalyze} onChange={event => chooseDocument(event.target.files?.[0])} /><small>{it ? "JPG, PNG, WebP o PDF · 10 MB · fino a 10 pagine / 60 vini. Il documento viene inviato al servizio AI; l’originale non viene archiviato." : "JPG, PNG, WebP or PDF · 10 MB · up to 10 pages / 60 wines. The document is sent to the AI service; the original is not stored."}</small></label><input ref={camera} hidden type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={event => chooseDocument(event.target.files?.[0])} /><button type="button" className="secondary purchase-import-camera" disabled={busy || !canAnalyze} onClick={() => camera.current?.click()}>{it ? "Scatta una foto" : "Take a photo"}</button><button type="button" disabled={!file || busy || !canAnalyze} onClick={() => void analyze()}>{busy ? (it ? "Elaborazione…" : "Processing…") : (it ? "Analizza acquisto" : "Analyze purchase")}</button></div>
      {canAnalyze ? <p className="purchase-import-access">{isAdmin ? (it ? "Accesso amministratore · analisi inclusa, senza consumo di credito AI." : "Administrator access · analysis included, without using AI credit.") : included ? (it ? "Analisi inclusa nell’abbonamento, senza consumo di credito AI." : "Analysis is included in your subscription, without using AI credit.") : (it ? "Con il piano gratuito, il costo dell’analisi viene scalato dal tuo AI Pack." : "On the free plan, the analysis cost is deducted from your AI Pack.")}</p> : null}
      {preview && preview.status !== "draft" ? <p role="status">{it ? "Questo documento è già stato importato. Non verrà aggiunto di nuovo." : "This document has already been imported and will not be added again."}</p> : null}
      {preview?.status === "draft" ? <div className="purchase-import-workspace">
        <aside className={`purchase-import-document${documentExpanded ? " is-expanded" : ""}`}><h3>{it ? "Il documento" : "Your document"}</h3><button className="secondary purchase-import-document-toggle" type="button" aria-expanded={documentExpanded} onClick={() => setDocumentExpanded(value => !value)}>{documentExpanded ? (it ? "Nascondi documento" : "Hide document") : (it ? "Mostra documento" : "Show document")}</button><div className="purchase-import-document-content">{url && file?.type === "application/pdf" ? <div className="purchase-import-pdf"><strong>PDF &middot; {file.name}</strong><Suspense fallback={<p role="status">{it ? "Caricamento anteprima..." : "Loading preview..."}</p>}><PurchasePdfPreview file={file} locale={locale} /></Suspense><a href={url} target="_blank" rel="noopener noreferrer">{it ? "Apri PDF originale" : "Open original PDF"} <span aria-hidden="true">&#8599;</span></a></div> : url ? <img src={url} alt={it ? "Ricevuta originale" : "Original receipt"} /> : null}<p>{it ? "Confronta le righe con l’originale: l’AI può sbagliare." : "Compare the rows with the original: AI can make mistakes."}</p></div></aside>
        <form className="purchase-import-review" onSubmit={confirm} onChange={() => setReviewed(false)}>
          <h3>{it ? "Verifica l’acquisto" : "Review your purchase"}</h3><small>{isAdmin ? (it ? "Stima AI · analisi inclusa per l’amministratore" : "AI estimate · analysis included for the administrator") : included ? (it ? "Stima AI · analisi inclusa nell’abbonamento" : "AI estimate · analysis included in your subscription") : `${it ? "Stima AI · addebito AI Pack USD" : "AI estimate · AI Pack charge USD"} ${Number(preview.estimated_cost_usd).toFixed(6)}`}</small>
          {preview.extraction.warnings.length ? <ul className="purchase-import-warnings">{preview.extraction.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul> : null}
          <fieldset disabled={busy}><legend>{it ? "Dati comuni" : "Purchase details"}</legend><div className="purchase-import-fields">
            <label>{it ? "Fornitore" : "Supplier"}<input value={supplier} maxLength={160} onChange={e => setSupplier(e.target.value)} /></label>
            <label>{it ? "Numero documento / ordine" : "Document / order reference"}<input value={reference} maxLength={160} onChange={e => setReference(e.target.value)} /></label>
            <label>{it ? "Data acquisto" : "Purchase date"}<input type="date" required value={date} onChange={e => setDate(e.target.value)} /></label>
            <label>{it ? "Valuta" : "Currency"}<input required pattern="[A-Z]{3}" maxLength={3} placeholder="CHF / EUR" value={currency} onChange={e => { setCurrency(e.target.value.toUpperCase()); setRows(current => current.map(row => ({ ...row, existing_wine_id: "" }))); }} /></label>
            <label>{it ? "Consegna" : "Delivery"}<select aria-label={it ? "Consegna" : "Delivery"} value={delivery} onChange={e => setDelivery(e.target.value)}><option value="received">{it ? "Bottiglie già ricevute" : "Bottles received"}</option><option value="pending">{it ? "In attesa di consegna" : "Awaiting delivery"}</option></select></label>
            {delivery === "pending" ? <label>{it ? "Consegna prevista" : "Expected delivery"}<input type="date" value={expected} onChange={e => setExpected(e.target.value)} /></label> : null}
          </div></fieldset>
          <p>{it ? "Quantità in bottiglie e prezzo per singola bottiglia, dopo eventuali sconti. Seleziona una scheda esistente per aggiungere un lotto." : "Enter bottle quantities and price per bottle after discounts. Select an existing record to add a purchase lot."}</p>
          {!rows.length ? <p role="status">{it ? "Nessun vino riconosciuto. Puoi aggiungere una riga o provare con un documento più leggibile." : "No wines recognized. Add a row or try a clearer document."}</p> : null}
          {rows.map((row, index) => <fieldset key={`${row.source}-${index}`} disabled={busy} className="purchase-import-row"><legend>{it ? "Vino" : "Wine"} {index + 1}</legend>
            {preview.extraction.rows[row.source]?.warnings.length ? <ul className="purchase-import-warnings">{preview.extraction.rows[row.source].warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul> : null}
            <div className="purchase-import-fields">
              <label>{it ? "Nome vino" : "Wine name"}<input required maxLength={200} value={row.name} onChange={e => update(index, { name: e.target.value, existing_wine_id: "" })} /></label>
              <label>{it ? "Produttore" : "Producer"}<input maxLength={200} value={row.producer} onChange={e => update(index, { producer: e.target.value, existing_wine_id: "" })} /></label>
              <label>{it ? "Annata" : "Vintage"}<input maxLength={16} placeholder={it ? "Non indicata" : "Not specified"} value={row.vintage} onChange={e => update(index, { vintage: e.target.value, existing_wine_id: "" })} /></label>
              <label>{it ? "Formato" : "Bottle format"}<input required maxLength={80} placeholder="750ml" value={row.format} onChange={e => update(index, { format: e.target.value, existing_wine_id: "" })} /></label>
              <label>{it ? "Bottiglie" : "Bottles"}<input type="number" min="1" max="10000" step="1" required value={row.quantity} onChange={e => update(index, { quantity: e.target.value })} /></label>
              <label>{it ? "Prezzo a bottiglia" : "Price per bottle"}<input type="number" min="0" max="99999999" step="0.01" required value={row.unit_price} onChange={e => update(index, { unit_price: e.target.value })} /></label>
            </div>
            {(preview.matches[row.source] || []).length ? <label>{it ? "Scheda in cantina" : "Cellar record"}<select aria-label={it ? "Scheda in cantina" : "Cellar record"} value={row.existing_wine_id} onChange={e => {
              const match = preview.matches[row.source].find(w => w.id === e.target.value);
              update(index, { existing_wine_id: e.target.value, ...(match ? { name: match.name, producer: match.producer, vintage: match.vintage, format: match.format } : {}) });
            }}><option value="">{it ? "Crea una nuova scheda" : "Create a new record"}</option>{preview.matches[row.source].map(w => <option key={w.id} value={w.id} disabled={w.currency !== currency}>{w.producer} {w.name} {w.vintage} · {w.format} · {w.currency}</option>)}</select><small>{it ? "Possibile corrispondenza: verifica prima di creare una nuova scheda." : "Possible match: check before creating a new record."}</small></label> : null}
            <div className="purchase-import-row-footer"><span>{it ? "Totale riga" : "Line total"}: {formatMoney(Number(row.unit_price || 0) * Number(row.quantity || 0))} {currency}{preview.extraction.rows[row.source]?.line_total != null ? ` · ${it ? "documento" : "document"}: ${formatMoney(Number(preview.extraction.rows[row.source].line_total))}` : ""}</span><button type="button" className="secondary" onClick={() => { setRows(current => current.filter((_, i) => i !== index)); setReviewed(false); }}>{it ? "Rimuovi vino" : "Remove wine"}</button></div>
          </fieldset>)}
          <button type="button" className="secondary" disabled={busy || rows.length >= 60} onClick={() => { setRows(current => [...current, { name: "", producer: "", vintage: "", format: "", quantity: "", unit_price: "", existing_wine_id: "", source: -current.length - 1 }]); setReviewed(false); }}>{it ? "Aggiungi riga" : "Add row"}</button>
          <fieldset disabled={busy}><legend>{it ? "Controllo importi" : "Check amounts"}</legend><div className="purchase-import-fields"><label>{it ? "Altri importi (spedizione, imposte, sconti)" : "Other amounts (shipping, taxes, discounts)"}<input type="number" step="0.01" value={additional} onChange={e => setAdditional(e.target.value)} /><small>{it ? "Sconti negativi. Non contare due volte imposte già incluse." : "Use negative discounts. Do not count included tax twice."}</small></label><label>{it ? "Totale documento" : "Document total"}<input type="number" min="0" step="0.01" value={total} onChange={e => setTotal(e.target.value)} /></label></div><p className="purchase-import-total">{it ? "Totale verificato" : "Reviewed total"} <strong>{formatMoney(sum)} {currency}</strong></p>
          {difference ? <label className="purchase-import-check purchase-import-warnings"><input type="checkbox" checked={acceptDifference} required onChange={e => setAcceptDifference(e.target.checked)} /><span>{it ? "Il totale non coincide con il documento. Ho verificato e accetto la differenza." : "The total differs from the document. I have checked and accept the difference."}</span></label> : null}
          </fieldset>
          <label className="purchase-import-check"><input type="checkbox" checked={reviewed} onChange={e => { e.stopPropagation(); setReviewed(e.target.checked); }} required disabled={busy} /><span>{it ? "Ho verificato vini, annate, bottiglie, prezzi e stato della consegna." : "I have checked wines, vintages, bottles, prices and delivery status."}</span></label>
          <button type="submit" className="purchase-import-confirm" disabled={busy || !reviewed || !rows.length || (difference && !acceptDifference)}>{busy ? (it ? "Salvataggio…" : "Saving…") : delivery === "pending" ? (it ? "Registra acquisto in attesa" : "Save pending purchase") : (it ? "Conferma acquisto in cantina" : "Confirm purchase in cellar")}</button>
        </form>
      </div> : null}
    </>}
    {pendingError ? <p role="alert">{it ? "Impossibile caricare gli acquisti in attesa." : "Unable to load pending purchases."} <button type="button" className="secondary" onClick={() => void loadPending()}>{it ? "Riprova" : "Retry"}</button></p> : null}
    {pending.length ? <section className="purchase-import-pending"><h3>{it ? "In attesa di consegna" : "Awaiting delivery"}</h3>{pending.map(p => <article key={p.id}><div><strong>{p.supplier || (it ? "Acquisto" : "Purchase")}</strong><p>{p.reference} · {p.bottles} {it ? "bottiglie" : "bottles"}{p.expected_delivery ? ` · ${p.expected_delivery}` : ""}</p></div><button type="button" className="secondary" disabled={busy} onClick={() => void receive(p.id)}>{it ? "Registra ricezione completa" : "Record full delivery"}</button></article>)}</section> : null}
  </dialog>, document.body);
}
