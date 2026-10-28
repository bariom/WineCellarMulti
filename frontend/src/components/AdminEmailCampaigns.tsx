import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { api } from "../services/api";
import type { EmailAssetItem, EmailBlock, EmailBlockType, EmailCampaignSummary, EmailDraft, EmailRecipient, Locale } from "../types";
import "./AdminEmailCampaigns.css";

/*
 * News e-mail composer (docs/EMAIL_CAMPAIGNS.md): describe, let the AI compose
 * structured blocks, edit them, preview the server-rendered e-mail, send a test
 * to yourself, then pick recipients by hand and send.
 */

const endpoint = "/api/v1/admin/email-campaigns";

const APP_PATHS: Array<{ path: string; it: string; en: string }> = [
  { path: "/", it: "Home", en: "Home" },
  { path: "/?open=cellar", it: "Cantina", en: "Cellar" },
  { path: "/?open=wishlist", it: "Wishlist", en: "Wishlist" },
  { path: "/?open=history", it: "Diario", en: "Diary" },
  { path: "/?open=pulse", it: "Wine Pulse", en: "Wine Pulse" },
  { path: "/?open=sommelier", it: "Sommelier AI", en: "AI Sommelier" },
  { path: "/help", it: "Guida", en: "Help" },
];

const BLOCK_LABELS: Record<EmailBlockType, { it: string; en: string }> = {
  heading: { it: "Titolo", en: "Heading" },
  paragraph: { it: "Paragrafo", en: "Paragraph" },
  image: { it: "Immagine", en: "Image" },
  button: { it: "Pulsante", en: "Button" },
};

function emptyBlock(type: EmailBlockType): EmailBlock {
  return { type, text: "", asset_id: "", caption: "", path: type === "button" ? "/" : "" };
}

export default function AdminEmailCampaigns({ locale }: { locale: Locale }) {
  const it = locale === "it";
  const [emailLocale, setEmailLocale] = useState<Locale>(locale);
  const [brief, setBrief] = useState("");
  const [subject, setSubject] = useState("");
  const [preheader, setPreheader] = useState("");
  const [blocks, setBlocks] = useState<EmailBlock[]>([]);
  const [assets, setAssets] = useState<EmailAssetItem[]>([]);
  const [previewHtml, setPreviewHtml] = useState("");
  const [query, setQuery] = useState("");
  const [recipients, setRecipients] = useState<EmailRecipient[]>([]);
  const [selected, setSelected] = useState<Record<string, EmailRecipient>>({});
  const [history, setHistory] = useState<EmailCampaignSummary[]>([]);
  const [busy, setBusy] = useState<"" | "compose" | "preview" | "test" | "send" | "upload">("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // Kept across retries so a resend after an error resumes the same campaign.
  const campaignId = useRef<string>(crypto.randomUUID());

  const draft: EmailDraft = useMemo(() => ({ locale: emailLocale, subject: subject.trim(), preheader: preheader.trim(), blocks }), [emailLocale, subject, preheader, blocks]);
  const draftReady = Boolean(draft.subject) && blocks.some((block) => block.type !== "image" ? block.text.trim() : block.asset_id);
  const selectedList = Object.values(selected);

  function fail(cause: unknown, fallback: string) {
    setError(cause instanceof Error ? cause.message : fallback);
  }

  async function loadAssets(nextLocale = emailLocale) {
    try { setAssets(await api<EmailAssetItem[]>(`${endpoint}/assets?locale=${nextLocale}`)); } catch (cause) { fail(cause, it ? "Immagini non disponibili." : "Images unavailable."); }
  }

  async function loadHistory() {
    try { setHistory(await api<EmailCampaignSummary[]>(endpoint)); } catch { setHistory([]); }
  }

  useEffect(() => { void loadAssets(); void loadHistory(); }, []);
  useEffect(() => { void loadAssets(emailLocale); }, [emailLocale]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      api<EmailRecipient[]>(`${endpoint}/recipients?q=${encodeURIComponent(query.trim())}`)
        .then((items) => { if (active) setRecipients(items); })
        .catch(() => { if (active) setRecipients([]); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query]);

  async function refreshPreview(nextDraft = draft) {
    if (!nextDraft.subject || !nextDraft.blocks.length) { setPreviewHtml(""); return; }
    setBusy("preview"); setError("");
    try {
      const result = await api<{ html: string }>(`${endpoint}/preview`, { method: "POST", body: JSON.stringify(nextDraft) });
      setPreviewHtml(result.html);
    } catch (cause) { fail(cause, it ? "Anteprima non riuscita." : "Preview failed."); }
    finally { setBusy(""); }
  }

  async function compose(event: FormEvent) {
    event.preventDefault();
    setBusy("compose"); setError(""); setNotice("");
    try {
      const result = await api<{ subject: string; preheader: string; blocks: EmailBlock[] }>(`${endpoint}/compose`, {
        method: "POST", body: JSON.stringify({ locale: emailLocale, brief: brief.trim() }),
      });
      setSubject(result.subject); setPreheader(result.preheader); setBlocks(result.blocks);
      campaignId.current = crypto.randomUUID();
      setConfirming(false);
      setBusy("");
      await refreshPreview({ locale: emailLocale, subject: result.subject, preheader: result.preheader, blocks: result.blocks });
    } catch (cause) { fail(cause, it ? "Composizione non riuscita." : "Composition failed."); setBusy(""); }
  }

  function updateBlock(index: number, patch: Partial<EmailBlock>) {
    setBlocks((current) => current.map((block, position) => position === index ? { ...block, ...patch } : block));
    setConfirming(false);
  }

  function moveBlock(index: number, offset: number) {
    setBlocks((current) => {
      const target = index + offset;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setConfirming(false);
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy("upload"); setError("");
    try {
      const asset = await api<EmailAssetItem>(`${endpoint}/assets`, { method: "POST", body: data });
      setAssets((current) => [...current, asset]);
      setNotice(it ? `Immagine «${asset.title}» caricata.` : `Image “${asset.title}” uploaded.`);
      form.reset();
    } catch (cause) { fail(cause, it ? "Caricamento non riuscito." : "Upload failed."); }
    finally { setBusy(""); }
  }

  async function sendTest() {
    setBusy("test"); setError(""); setNotice("");
    try {
      const result = await api<{ delivered: boolean; email: string }>(`${endpoint}/test`, { method: "POST", body: JSON.stringify(draft) });
      if (!result.delivered) throw new Error(it ? "L'invio email non è configurato sul server." : "E-mail delivery is not configured on the server.");
      setNotice(it ? `Prova inviata a ${result.email}.` : `Test sent to ${result.email}.`);
    } catch (cause) { fail(cause, it ? "Prova non inviata." : "Test not sent."); }
    finally { setBusy(""); }
  }

  async function send() {
    setBusy("send"); setError(""); setNotice("");
    try {
      const result = await api<EmailCampaignSummary>(endpoint, {
        method: "POST",
        body: JSON.stringify({ ...draft, id: campaignId.current, recipient_ids: selectedList.map((item) => item.id), confirm: true }),
      });
      setNotice(it
        ? `Email inviata a ${result.sent_count} destinatari${result.failed_count ? `; ${result.failed_count} non riusciti, puoi riprovare` : ""}.`
        : `E-mail sent to ${result.sent_count} recipients${result.failed_count ? `; ${result.failed_count} failed, you can retry` : ""}.`);
      if (!result.failed_count) { campaignId.current = crypto.randomUUID(); setSelected({}); }
      setConfirming(false);
      await loadHistory();
    } catch (cause) { fail(cause, it ? "Invio non riuscito. Riprova: le email già consegnate non vengono ripetute." : "Send failed. Retry: delivered e-mails are not repeated."); }
    finally { setBusy(""); }
  }

  function toggleRecipient(recipient: EmailRecipient) {
    if (recipient.opted_out) return;
    setSelected((current) => {
      const next = { ...current };
      if (next[recipient.id]) delete next[recipient.id];
      else next[recipient.id] = recipient;
      return next;
    });
    setConfirming(false);
  }

  function selectVisible() {
    setSelected((current) => {
      const next = { ...current };
      for (const recipient of recipients) if (!recipient.opted_out) next[recipient.id] = recipient;
      return next;
    });
    setConfirming(false);
  }

  const assetById = new Map(assets.map((asset) => [asset.id, asset]));

  return <section className="settings-card admin-email-campaigns" aria-labelledby="email-campaigns-title">
    <div className="settings-card-heading">
      <div>
        <span>{it ? "Comunicazioni" : "Communications"}</span>
        <h3 id="email-campaigns-title">{it ? "Email con le novità" : "News e-mail"}</h3>
      </div>
    </div>
    <p className="email-campaigns-intro">{it
      ? "Descrivi cosa raccontare: l'AI compone l'email con le schermate adatte. Controlla, invia una prova a te e scegli i destinatari. Chi si è disiscritto non riceve nulla."
      : "Describe what to tell: the AI composes the e-mail with fitting screenshots. Review it, send a test to yourself and pick the recipients. Unsubscribed users receive nothing."}</p>

    <form className="email-step" onSubmit={(event) => void compose(event)}>
      <h4><span>1</span>{it ? "Cosa vuoi raccontare?" : "What do you want to tell?"}</h4>
      <div className="email-language" role="radiogroup" aria-label={it ? "Lingua dell'email" : "E-mail language"}>
        {(["it", "en"] as const).map((value) => <button type="button" role="radio" aria-checked={emailLocale === value} className={emailLocale === value ? "is-active" : ""} key={value} onClick={() => setEmailLocale(value)}>{value === "it" ? "Italiano" : "English"}</button>)}
      </div>
      <label>
        <span>{it ? "Descrizione per l'AI" : "Brief for the AI"}</span>
        <textarea rows={5} value={brief} maxLength={4000} onChange={(event) => setBrief(event.target.value)} placeholder={it ? "Es.: annuncia la nuova vetrina in home, il Diario più compatto e i temi d'autore; tono caldo, invito ad aprire la cantina." : "E.g.: announce the home showcase, the more compact Diary and the signature themes; warm tone, invite to open the cellar."} />
      </label>
      <button type="submit" disabled={busy !== "" || brief.trim().length < 10}>{busy === "compose" ? (it ? "Compongo…" : "Composing…") : (it ? "Componi con l'AI" : "Compose with AI")}</button>
    </form>

    {blocks.length || subject ? <div className="email-step">
      <h4><span>2</span>{it ? "Rivedi il testo" : "Review the text"}</h4>
      <label><span>{it ? "Oggetto" : "Subject"}</span><input value={subject} maxLength={160} onChange={(event) => { setSubject(event.target.value); setConfirming(false); }} /></label>
      <label><span>{it ? "Anteprima nella casella di posta" : "Inbox preview text"}</span><input value={preheader} maxLength={200} onChange={(event) => { setPreheader(event.target.value); setConfirming(false); }} /></label>
      <ol className="email-blocks">
        {blocks.map((block, index) => <li key={index} className={`email-block is-${block.type}`}>
          <div className="email-block-head">
            <strong>{BLOCK_LABELS[block.type][it ? "it" : "en"]}</strong>
            <div className="email-block-tools">
              <button type="button" className="secondary compact" aria-label={it ? "Sposta su" : "Move up"} disabled={index === 0} onClick={() => moveBlock(index, -1)}>↑</button>
              <button type="button" className="secondary compact" aria-label={it ? "Sposta giù" : "Move down"} disabled={index === blocks.length - 1} onClick={() => moveBlock(index, 1)}>↓</button>
              <button type="button" className="secondary compact" aria-label={it ? "Elimina blocco" : "Delete block"} onClick={() => setBlocks((current) => current.filter((_, position) => position !== index))}>×</button>
            </div>
          </div>
          {block.type === "heading" || block.type === "paragraph" ? <textarea aria-label={BLOCK_LABELS[block.type][it ? "it" : "en"]} rows={block.type === "heading" ? 1 : 4} value={block.text} onChange={(event) => updateBlock(index, { text: event.target.value })} /> : null}
          {block.type === "image" ? <div className="email-image-block">
            {assetById.get(block.asset_id) ? <img src={assetById.get(block.asset_id)!.url} alt="" /> : <span className="email-image-missing">{it ? "Scegli un'immagine" : "Pick an image"}</span>}
            <label><span>{it ? "Immagine" : "Image"}</span><select value={block.asset_id} onChange={(event) => updateBlock(index, { asset_id: event.target.value })}>
              <option value="">—</option>
              {assets.map((asset) => <option value={asset.id} key={asset.id}>{asset.kind === "upload" ? "↑ " : ""}{asset.title}</option>)}
            </select></label>
            <label><span>{it ? "Didascalia" : "Caption"}</span><input value={block.caption} maxLength={200} onChange={(event) => updateBlock(index, { caption: event.target.value })} /></label>
          </div> : null}
          {block.type === "button" ? <div className="email-button-block">
            <label><span>{it ? "Testo del pulsante" : "Button text"}</span><input value={block.text} maxLength={60} onChange={(event) => updateBlock(index, { text: event.target.value })} /></label>
            <label><span>{it ? "Apre" : "Opens"}</span><select value={block.path} onChange={(event) => updateBlock(index, { path: event.target.value })}>
              {APP_PATHS.map((item) => <option value={item.path} key={item.path}>{it ? item.it : item.en}</option>)}
            </select></label>
          </div> : null}
        </li>)}
      </ol>
      <div className="email-add-blocks" role="group" aria-label={it ? "Aggiungi blocco" : "Add block"}>
        {(Object.keys(BLOCK_LABELS) as EmailBlockType[]).map((type) => <button type="button" className="secondary compact" key={type} onClick={() => { setBlocks((current) => [...current, emptyBlock(type)]); setConfirming(false); }}>+ {BLOCK_LABELS[type][it ? "it" : "en"]}</button>)}
      </div>
      <details className="email-library">
        <summary>{it ? `Immagini disponibili (${assets.length})` : `Available images (${assets.length})`}</summary>
        <ul>{assets.map((asset) => <li key={asset.id}><img src={asset.url} alt="" loading="lazy" /><span>{asset.title}</span><small>{asset.kind === "library" ? (it ? "Libreria" : "Library") : (it ? "Caricata" : "Uploaded")}</small></li>)}</ul>
        <form className="email-upload" onSubmit={(event) => void upload(event)}>
          <label><span>{it ? "Carica un'immagine (PNG o JPEG)" : "Upload an image (PNG or JPEG)"}</span><input type="file" name="file" accept="image/png,image/jpeg" required /></label>
          <label><span>{it ? "Titolo" : "Title"}</span><input name="title" maxLength={120} required /></label>
          <label><span>{it ? "Cosa mostra (aiuta l'AI a sceglierla)" : "What it shows (helps the AI pick it)"}</span><input name="description" maxLength={600} /></label>
          <button type="submit" className="secondary" disabled={busy !== ""}>{busy === "upload" ? (it ? "Carico…" : "Uploading…") : (it ? "Carica" : "Upload")}</button>
        </form>
      </details>
    </div> : null}

    {blocks.length ? <div className="email-step">
      <h4><span>3</span>{it ? "Anteprima" : "Preview"}</h4>
      <div className="email-preview-actions">
        <button type="button" className="secondary" disabled={busy !== "" || !draftReady} onClick={() => void refreshPreview()}>{busy === "preview" ? (it ? "Aggiorno…" : "Updating…") : (it ? "Aggiorna anteprima" : "Refresh preview")}</button>
        <button type="button" className="secondary" disabled={busy !== "" || !draftReady} onClick={() => void sendTest()}>{busy === "test" ? (it ? "Invio la prova…" : "Sending test…") : (it ? "Invia una prova a me" : "Send me a test")}</button>
      </div>
      {previewHtml ? <iframe className="email-preview-frame" title={it ? "Anteprima email" : "E-mail preview"} sandbox="" srcDoc={previewHtml} /> : null}
    </div> : null}

    {blocks.length ? <div className="email-step">
      <h4><span>4</span>{it ? "Destinatari" : "Recipients"}</h4>
      <div className="email-recipient-tools">
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={it ? "Cerca per nome o email" : "Search by name or e-mail"} aria-label={it ? "Cerca destinatari" : "Search recipients"} />
        <button type="button" className="secondary compact" onClick={selectVisible}>{it ? "Seleziona tutti i visibili" : "Select all shown"}</button>
        {selectedList.length ? <button type="button" className="secondary compact" onClick={() => { setSelected({}); setConfirming(false); }}>{it ? "Deseleziona tutti" : "Clear selection"}</button> : null}
      </div>
      <ul className="email-recipients" aria-label={it ? "Utenti" : "Users"}>
        {recipients.map((recipient) => <li key={recipient.id} className={recipient.opted_out ? "is-opted-out" : ""}>
          <label>
            <input type="checkbox" checked={Boolean(selected[recipient.id])} disabled={recipient.opted_out} onChange={() => toggleRecipient(recipient)} />
            <span><strong>{recipient.display_name || recipient.email}</strong><small>{recipient.email} · {recipient.locale.toUpperCase()}{recipient.opted_out ? (it ? " · disiscritto" : " · unsubscribed") : ""}</small></span>
          </label>
        </li>)}
      </ul>
      <p className="email-selection-count" aria-live="polite">{it ? `${selectedList.length} destinatari selezionati` : `${selectedList.length} recipients selected`}</p>
      {!confirming ? <button type="button" disabled={busy !== "" || !draftReady || !selectedList.length} onClick={() => setConfirming(true)}>{it ? `Invia a ${selectedList.length} destinatari` : `Send to ${selectedList.length} recipients`}</button>
        : <div className="email-confirm" role="group" aria-label={it ? "Conferma invio" : "Confirm send"}>
          <p>{it ? `Stai per inviare «${draft.subject}» a ${selectedList.length} destinatari. Non si può annullare.` : `You are about to send “${draft.subject}” to ${selectedList.length} recipients. This cannot be undone.`}</p>
          <div>
            <button type="button" className="secondary" disabled={busy !== ""} onClick={() => setConfirming(false)}>{it ? "Annulla" : "Cancel"}</button>
            <button type="button" disabled={busy !== ""} onClick={() => void send()}>{busy === "send" ? (it ? "Invio in corso…" : "Sending…") : (it ? "Conferma e invia" : "Confirm and send")}</button>
          </div>
        </div>}
    </div> : null}

    {error ? <p className="email-error" role="alert">{error}</p> : null}
    {notice ? <p className="email-notice" role="status">{notice}</p> : null}

    {history.length ? <details className="email-history">
      <summary>{it ? `Invii precedenti (${history.length})` : `Previous sends (${history.length})`}</summary>
      <ul>{history.map((item) => <li key={item.id}><strong>{item.subject}</strong><small>{new Date(item.created_at).toLocaleString(it ? "it-CH" : "en-GB")} · {it ? `${item.sent_count} inviate` : `${item.sent_count} sent`}{item.failed_count ? (it ? ` · ${item.failed_count} non riuscite` : ` · ${item.failed_count} failed`) : ""}</small></li>)}</ul>
    </details> : null}
  </section>;
}
