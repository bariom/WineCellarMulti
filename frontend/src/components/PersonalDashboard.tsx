import { DashboardSummaryData } from "./dashboardSummaryData";
import { WidgetPickerCard } from "./WidgetPickerCard";
import { AppIcon } from "./AppIcon";
import { ApiError } from "../services/api";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useWidgetDrag } from "./useWidgetDrag";
import type { Locale, PersonalDashboardWidget, PersonalDashboardWidgetId } from "../types";
import "./PersonalDashboard.css";
import { personalDashboardCatalogue as catalogue, normalizeDashboardLayout } from "./personalDashboardCatalogue";

const initialLayout: PersonalDashboardWidget[] = [
  { id: "ready", width: "half" }, { id: "recent", width: "half" },
  { id: "regions", width: "full" }, { id: "maturity", width: "full" },
];

export function PersonalDashboard({ locale, widgets, readOnly, isDemo = false, isDefault, onSave, onMakeDefault, renderWidget }: {
  locale: Locale;
  widgets: PersonalDashboardWidget[] | null | undefined;
  readOnly: boolean;
  isDemo?: boolean;
  isDefault: boolean;
  onSave: (widgets: PersonalDashboardWidget[]) => Promise<void>;
  onMakeDefault: () => Promise<void>;
  renderWidget: (widget: PersonalDashboardWidget, preview?: boolean) => ReactNode;
}) {
  const it = locale === "it";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PersonalDashboardWidget[]>([]);
  const [quickLayout, setQuickLayout] = useState<PersonalDashboardWidget[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reorderNotice, setReorderNotice] = useState("");
  const [search, setSearch] = useState("");
  const matchingWidgets = catalogue.filter(widget => widget[locale].join(" ").toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const saved = normalizeDashboardLayout(widgets ?? initialLayout);
  const layout = editing ? draft : quickLayout ?? saved;
  const titleFor = (id: PersonalDashboardWidgetId) => catalogue.find(item => item.id === id)?.[locale][0] ?? id;
  useEffect(() => setQuickLayout(null), [widgets]);
  function reordered(source: PersonalDashboardWidget[], from: PersonalDashboardWidgetId, to: PersonalDashboardWidgetId) {
    const start = source.findIndex(widget => widget.id === from);
    const end = source.findIndex(widget => widget.id === to);
    if (start < 0 || end < 0 || start === end) return source;
    const next = [...source];
    next.splice(end, 0, ...next.splice(start, 1));
    return next;
  }
  function reorder(from: PersonalDashboardWidgetId, to: PersonalDashboardWidgetId) {
    const next = reordered(draft, from, to);
    if (next === draft) return;
    const end = next.findIndex(widget => widget.id === from);
    setDraft(next);
    setReorderNotice(it ? `${titleFor(from)} spostato in posizione ${end + 1} di ${next.length}.` : `${titleFor(from)} moved to position ${end + 1} of ${next.length}.`);
  }
  async function quickReorder(from: PersonalDashboardWidgetId, to: PersonalDashboardWidgetId) {
    const previous = layout;
    const next = reordered(previous, from, to);
    if (next === previous) return;
    const end = next.findIndex(widget => widget.id === from);
    setQuickLayout(next); setSaving(true); setError(""); setNotice("");
    setReorderNotice(it ? `${titleFor(from)} spostato in posizione ${end + 1} di ${next.length}. Salvataggio in corso.` : `${titleFor(from)} moved to position ${end + 1} of ${next.length}. Saving.`);
    try {
      await onSave(next);
      setNotice(it ? "Nuovo ordine salvato." : "New order saved.");
    } catch {
      setQuickLayout(previous);
      setError(it ? "Non è stato possibile salvare il nuovo ordine; la disposizione precedente è stata ripristinata." : "The new order could not be saved; the previous layout has been restored.");
    } finally { setSaving(false); }
  }
  const { gridRef, drag, handleProps } = useWidgetDrag(!saving && !readOnly, (from, to) => editing ? reorder(from, to) : void quickReorder(from, to));
  function move(index: number, direction: number) {
    if (draft[index + direction]) reorder(draft[index].id, draft[index + direction].id);
  }
  async function save() {
    setSaving(true); setError("");
    try {
      await onSave(draft);
      setEditing(false);
      setNotice(it ? "Dashboard salvata nel tuo account." : "Dashboard saved to your account.");
    } catch (cause) {
      const code = cause instanceof ApiError ? cause.status : undefined;
      const reason = code === 401 ? (it ? "La sessione è scaduta." : "Your session has expired.")
        : code === 403 ? (it ? "Il server non autorizza questa modifica." : "The server does not allow this change.")
        : code === 422 ? (it ? "Il server ha rifiutato la configurazione dei widget." : "The server rejected the widget configuration.")
        : code && code >= 500 ? (it ? "Il server ha incontrato un errore." : "The server encountered an error.")
        : "";
      setError(`${it ? "Salvataggio non riuscito. Le modifiche sono ancora qui: riprova." : "Could not save. Your changes are still here: try again."}${reason ? ` ${reason}` : ""}${code ? ` (HTTP ${code})` : ""}`);
    } finally { setSaving(false); }
  }
  return <DashboardSummaryData><section className="personal-dashboard" aria-label={it ? "La mia dashboard" : "My dashboard"}>
    <header className="personal-dashboard-header">
      <div><p className="eyebrow">{it ? "Il tuo spazio in cantina" : "Your space in the cellar"}</p><h2>{it ? "La mia dashboard" : "My dashboard"}</h2><p>{it ? "La tua cantina a colpo d’occhio. Scegli i widget e disponili nel tuo ordine." : "Your cellar at a glance. Choose your widgets and arrange them your way."}</p></div>
      <div className="personal-dashboard-actions">
        {!editing && <button type="button" className="secondary personal-dashboard-customize" disabled={readOnly || saving} onClick={() => { setDraft(layout.map(widget => ({ ...widget }))); setEditing(true); setError(""); setNotice(""); }}><AppIcon name="edit" detailLevel="compact" />{it ? "Personalizza" : "Customize"}</button>}
        {!editing && !isDefault && <button type="button" className="secondary" disabled={readOnly || saving} onClick={() => void onMakeDefault()}>{it ? "Usa come iniziale" : "Use as default"}</button>}
      </div>
    </header>
    {readOnly && <p>{it ? "La personalizzazione richiede un account personale e una connessione attiva." : "Customization requires a personal account and an active connection."}</p>}
    {isDemo && !readOnly && <p>{it ? "Prova liberamente: le modifiche alla dashboard sono temporanee. Ricaricando la demo riparti dalla versione iniziale." : "Try it freely: dashboard changes are temporary. Reloading the demo restores the initial layout."}</p>}
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert">{error}</p>}
    {editing && <fieldset className="personal-widget-picker" disabled={saving}>
      <legend>{it ? "Scegli i tuoi widget" : "Choose your widgets"}</legend>
      <label className="personal-widget-search">{it ? "Cerca widget" : "Find widgets"}<input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <p>{it ? `${draft.length} selezionati · ${catalogue.length} disponibili` : `${draft.length} selected · ${catalogue.length} available`}</p>
      {!matchingWidgets.length && <p>{it ? "Nessun widget corrisponde alla ricerca." : "No widgets match your search."}</p>}
      <div className="personal-widget-catalogue">{matchingWidgets.map(widget => {
        const [title, description] = widget[locale];
        const selected = draft.some(item => item.id === widget.id);
        return <WidgetPickerCard key={widget.id} title={title} description={description} selected={selected} it={it} onSelect={() => setDraft(selected ? draft.filter(item => item.id !== widget.id) : [...draft, { id: widget.id, width: "full" }])} renderPreview={() => renderWidget(draft.find(item => item.id === widget.id) ?? { id: widget.id, width: "half" }, true)} />;
      })}</div>
      <p>{it ? "Trascina i widget dalla maniglia oppure usa Su e Giù. La larghezza si applica su desktop; sul telefono ogni widget occupa una riga." : "Drag widgets by their handle or use Up and Down. Width applies on desktop; on phones each widget takes a row."}</p>
      <div className="personal-dashboard-actions"><button type="button" onClick={() => void save()}>{saving ? (it ? "Salvataggio…" : "Saving…") : (it ? "Salva dashboard" : "Save dashboard")}</button><button type="button" className="secondary" onClick={() => { setEditing(false); setError(""); }}>{it ? "Annulla" : "Cancel"}</button></div>
    </fieldset>}
    {layout.length === 0 && <p className="empty-state">{it ? "La tua dashboard è vuota. Seleziona Personalizza per aggiungere i primi widget." : "Your dashboard is empty. Choose Customize to add your first widgets."}</p>}
    <p className="sr-only" aria-live="polite" aria-atomic="true">{drag ? (it ? `Trascinamento di ${titleFor(drag.id)}. Premi Esc per annullare.` : `Dragging ${titleFor(drag.id)}. Press Escape to cancel.`) : reorderNotice}</p>
    <div ref={gridRef} className="personal-widget-grid">{layout.map((widget, index) => {
      const title = catalogue.find(item => item.id === widget.id)?.[locale][0] ?? widget.id;
      return <section key={widget.id} data-widget-id={widget.id} className={`personal-widget personal-widget-${widget.width}${drag?.id === widget.id ? " is-dragging" : ""}${drag?.over === widget.id && drag.id !== widget.id ? " is-drop-target" : ""}`} aria-label={title}>
        {!editing && !readOnly && <button type="button" className="secondary personal-widget-direct-handle" disabled={saving} aria-label={`${it ? "Trascina per riordinare" : "Drag to reorder"}: ${title}`} title={it ? "Trascina o usa le frecce Su/Giù; il nuovo ordine viene salvato automaticamente" : "Drag or use the Up/Down arrows; the new order is saved automatically"} {...handleProps(widget.id)} onKeyDown={event => {
          if ((event.key === "ArrowUp" || event.key === "ArrowDown") && !drag) { event.preventDefault(); const target = layout[index + (event.key === "ArrowUp" ? -1 : 1)]; if (target) void quickReorder(widget.id, target.id); }
        }}><span aria-hidden="true">⠿</span></button>}
        {editing && <div className="personal-widget-toolbar">
          <div className="personal-widget-heading"><button type="button" className="secondary personal-widget-drag-handle" disabled={saving || readOnly} aria-label={`${it ? "Trascina per riordinare" : "Drag to reorder"}: ${title}`} title={it ? "Trascina oppure usa le frecce Su/Giù sulla tastiera" : "Drag or use the Up/Down arrow keys"} {...handleProps(widget.id)} onKeyDown={event => {
            if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); if (!drag) move(index, event.key === "ArrowUp" ? -1 : 1); }
          }}><span aria-hidden="true">⠿</span></button><strong>{index + 1}. {title}</strong></div>
          <div><button type="button" className="secondary" disabled={saving || index === 0} aria-label={`${it ? "Sposta su" : "Move up"}: ${title}`} onClick={() => move(index, -1)}>↑ {it ? "Su" : "Up"}</button><button type="button" className="secondary" disabled={saving || index === draft.length - 1} aria-label={`${it ? "Sposta giù" : "Move down"}: ${title}`} onClick={() => move(index, 1)}>↓ {it ? "Giù" : "Down"}</button>
            <label><span className="sr-only">{it ? "Larghezza" : "Width"}: {title}</span><select aria-label={`${it ? "Larghezza" : "Width"}: ${title}`} disabled={saving} value={widget.width} onChange={event => setDraft(draft.map(item => item.id === widget.id ? { ...item, width: event.target.value as "half" | "full" } : item))}><option value="full">{it ? "Intera riga" : "Full row"}</option><option value="half">{it ? "Mezza riga" : "Half row"}</option></select></label>
            {widget.id === "value_distribution" && <label><span className="sr-only">{it ? "Raggruppa valore" : "Group value"}</span><select aria-label={it ? "Raggruppa valore" : "Group value"} value={widget.group_by ?? "region"} onChange={event => setDraft(draft.map(item => item.id === widget.id ? { ...item, group_by: event.target.value as "region" | "producer" | "type" } : item))}><option value="region">{it ? "Regione" : "Region"}</option><option value="producer">{it ? "Produttore" : "Producer"}</option><option value="type">{it ? "Tipologia" : "Style"}</option></select></label>}
            <button type="button" className="secondary" disabled={saving} aria-label={`${it ? "Rimuovi" : "Remove"}: ${title}`} onClick={() => setDraft(draft.filter(item => item.id !== widget.id))}>{it ? "Rimuovi" : "Remove"}</button></div>
        </div>}
        <div className="personal-widget-content">{renderWidget(widget)}</div>
      </section>;
    })}</div>
    {drag && createPortal(<div className="personal-widget-drag-preview" aria-hidden="true" style={{ left: Math.max(8, Math.min(drag.x + 14, window.innerWidth - 248)), top: Math.max(8, Math.min(drag.y + 18, window.innerHeight - 96)) }}><span>⠿</span>{titleFor(drag.id)}<small>{drag.over && drag.over !== drag.id ? (it ? `Rilascia ${layout.findIndex(widget => widget.id === drag.id) < layout.findIndex(widget => widget.id === drag.over) ? "dopo" : "prima di"} ${titleFor(drag.over)}` : `Drop ${layout.findIndex(widget => widget.id === drag.id) < layout.findIndex(widget => widget.id === drag.over) ? "after" : "before"} ${titleFor(drag.over)}`) : (it ? "Trascina su un altro widget" : "Drag over another widget")}</small></div>, document.body)}
  </section></DashboardSummaryData>;
}
