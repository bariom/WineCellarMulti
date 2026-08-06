import { useEffect, useState } from "react";
import { AppIcon, AppIconName } from "../components/AppIcon";
import TastingArchiveInsights from "./TastingArchiveInsights";

type TastingEnjoyment = "" | "positive" | "negative";

type WineLike = {
  id: string;
  name: string;
  producer: string;
  vintage: string;
  format: string;
  type: string;
  region: string;
  appellation: string;
};

type TastingArchiveEntry = {
  id: string;
  wine: WineLike;
  consumed_at: string;
  note: string;
  rating: number;
  enjoyment: TastingEnjoyment;
  occasion: string;
  pairing: string;
  companions: string;
  sommelier_feedback: string;
  sommelier_pairing_score: number | null;
  sommelier_pairing_advice: string;
  sommelier_feedback_cost_usd: string | null;
  sommelier_feedback_at: string | null;
  created_at: string;
};

type ConsumeWineDraft = {
  consumed_at: string;
  note: string;
  tasting_rating: string;
  tasting_enjoyment: TastingEnjoyment;
  tasting_occasion: string;
  tasting_pairing: string;
  tasting_companions: string;
};

type TastingArchiveSectionProps = {
  canGenerateAi: boolean;
  canWrite: boolean;
  formatAiBudget: (value: string | number) => string;
  entries: TastingArchiveEntry[];
  locale: "en" | "it";
  saving: boolean;
  displayValue: (value: string | null | undefined, locale: "en" | "it", group: string) => string;
  onDeleteEntry: (wine: any, entryId: string) => Promise<void>;
  onOpenWine: (wine: any) => void;
  onGenerateReflection: (entry: { id: string; wine: { id: string } }, personalFeedback: string) => Promise<void>;
  onUpdateEntry: (wine: any, entryId: string, payload: ConsumeWineDraft) => Promise<void>;
  t: (key: any) => string;
  wineTone: (type: string) => string;
};

function emptyConsumeWineDraft(): ConsumeWineDraft {
  return {
    consumed_at: new Date().toISOString().slice(0, 10),
    note: "",
    tasting_rating: "0",
    tasting_enjoyment: "",
    tasting_occasion: "",
    tasting_pairing: "",
    tasting_companions: "",
  };
}

function consumeDraftFromTastingEntry(entry: TastingArchiveEntry): ConsumeWineDraft {
  return {
    consumed_at: entry.consumed_at || new Date().toISOString().slice(0, 10),
    note: entry.note || "",
    tasting_rating: String(entry.rating || 0),
    tasting_enjoyment: entry.enjoyment || "",
    tasting_occasion: entry.occasion || "",
    tasting_pairing: entry.pairing || "",
    tasting_companions: entry.companions || "",
  };
}

function formatDisplayDate(value: string | null | undefined) {
  if (!value) return "";
  const [date] = value.split("T");
  const [year, month, day] = date.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function TastingEnjoymentInput({
  value,
  disabled,
  t,
  onChange,
}: {
  value: TastingEnjoyment;
  disabled: boolean;
  t: (key: any) => string;
  onChange: (value: TastingEnjoyment) => void;
}) {
  const options: Array<{ value: Exclude<TastingEnjoyment, "">; label: string; icon: AppIconName }> = [
    { value: "positive", label: "tastingEnjoymentPositive", icon: "sentiment-positive" },
    { value: "negative", label: "tastingEnjoymentNegative", icon: "sentiment-negative" },
  ];
  return (
    <div className="tasting-enjoyment-input" role="radiogroup" aria-label={t("tastingEnjoyment")}>
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          className={value === option.value ? `selected ${option.value}` : option.value}
          disabled={disabled}
          aria-checked={value === option.value}
          role="radio"
          onClick={() => onChange(value === option.value ? "" : option.value)}
        >
          <span aria-hidden="true"><AppIcon name={option.icon} /></span>
          {t(option.label)}
        </button>
      ))}
    </div>
  );
}

function TastingEnjoymentBadge({ value, t }: { value: TastingEnjoyment; t: (key: any) => string }) {
  if (!value) return null;
  const positive = value === "positive";
  const iconStyle = {
    display: "inline-grid",
    placeItems: "center",
    width: "1.7em",
    height: "1.7em",
    borderRadius: "50%",
    color: positive ? "var(--drink-ideal)" : "var(--drink-past)",
    background: positive
      ? "color-mix(in srgb, var(--drink-ideal) 22%, var(--surface))"
      : "color-mix(in srgb, var(--drink-past) 22%, var(--surface))",
  };
  return (
    <span className={`tasting-enjoyment-badge ${positive ? "positive" : "negative"}`} aria-label={t(positive ? "tastingEnjoymentPositive" : "tastingEnjoymentNegative")} title={t(positive ? "tastingEnjoymentPositive" : "tastingEnjoymentNegative")}>
      <span aria-hidden="true" style={iconStyle}><AppIcon name={positive ? "sentiment-positive" : "sentiment-negative"} /></span>
    </span>
  );
}

function TastingEntryEditor({
  draft,
  setDraft,
  saving,
  t,
  onSave,
  onCancel,
  onDelete,
}: {
  draft: ConsumeWineDraft;
  setDraft: (updater: (current: ConsumeWineDraft) => ConsumeWineDraft) => void;
  saving: boolean;
  t: (key: any) => string;
  onSave: () => Promise<void>;
  onCancel: () => void;
  onDelete: () => Promise<void>;
}) {
  return (
    <div className="tasting-entry-editor">
      <div className="detail-grid consume-grid">
        <label>
          <span>{t("tastingDate")}</span>
          <input
            type="date"
            value={draft.consumed_at}
            onChange={(event) => setDraft((current) => ({ ...current, consumed_at: event.target.value }))}
            disabled={saving}
          />
        </label>
        <label>
          <span>{t("tastingRating")}</span>
          <select
            value={draft.tasting_rating}
            onChange={(event) => setDraft((current) => ({ ...current, tasting_rating: event.target.value }))}
            disabled={saving}
          >
            {Array.from({ length: 7 }).map((_, index) => (
              <option key={index} value={String(index)}>
                {index === 0 ? t("notSpecified") : `${index}/6`}
              </option>
            ))}
          </select>
        </label>
        <label className="tasting-enjoyment-field">
          <span>{t("tastingEnjoyment")}</span>
          <TastingEnjoymentInput
            value={draft.tasting_enjoyment}
            disabled={saving}
            t={t}
            onChange={(value) => setDraft((current) => ({ ...current, tasting_enjoyment: value }))}
          />
        </label>
        <label>
          <span>{t("tastingOccasion")}</span>
          <input
            value={draft.tasting_occasion}
            onChange={(event) => setDraft((current) => ({ ...current, tasting_occasion: event.target.value }))}
            disabled={saving}
          />
        </label>
        <label>
          <span>{t("tastingPairing")}</span>
          <input
            value={draft.tasting_pairing}
            onChange={(event) => setDraft((current) => ({ ...current, tasting_pairing: event.target.value }))}
            disabled={saving}
          />
        </label>
      </div>
      <label>
        <span>{t("tastingCompanions")}</span>
        <input
          value={draft.tasting_companions}
          onChange={(event) => setDraft((current) => ({ ...current, tasting_companions: event.target.value }))}
          disabled={saving}
        />
      </label>
      <label>
        <span>{t("notes")}</span>
        <textarea
          rows={3}
          value={draft.note}
          onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
          disabled={saving}
        />
      </label>
      <div className="tasting-entry-actions">
        <button type="button" disabled={saving} onClick={() => onSave().catch(() => undefined)}>
          {saving ? t("saving") : t("saveChanges")}
        </button>
        <button type="button" className="secondary compact" disabled={saving} onClick={onCancel}>
          {t("cancel")}
        </button>
        <button type="button" className="danger compact" disabled={saving} onClick={() => onDelete().catch(() => undefined)}>
          {t("delete")}
        </button>
      </div>
    </div>
  );
}

export default function TastingArchiveSection({
  canGenerateAi,
  canWrite,
  displayValue,
  entries,
  formatAiBudget,
  locale,
  onDeleteEntry,
  onOpenWine,
  onGenerateReflection,
  onUpdateEntry,
  saving,
  t,
  wineTone,
}: TastingArchiveSectionProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ConsumeWineDraft>(emptyConsumeWineDraft);
  const [reflectionEntryId, setReflectionEntryId] = useState<string | null>(null);
  const [reflectionDraft, setReflectionDraft] = useState("");
  const [reflectingEntryId, setReflectingEntryId] = useState<string | null>(null);

  useEffect(() => {
    if (!editingId) return;
    const matchingEntry = entries.find((entry) => entry.id === editingId);
    if (!matchingEntry) {
      setEditingId(null);
      setEditDraft(emptyConsumeWineDraft());
    }
  }, [entries, editingId]);

  return (
    <>
      <TastingArchiveInsights locale={locale} />
      <div className="tasting-archive-list">
        {entries.map((entry) => (
        <details className={`tasting-archive-entry tone-${wineTone(entry.wine.type)}`} key={entry.id}>
          <summary className="tasting-archive-entry-summary">
            <div className="tasting-archive-head">
              <div className="tasting-archive-title">
                <strong><i className={`wine-dot tone-${wineTone(entry.wine.type)}`} aria-hidden="true" />{entry.wine.name}</strong>
                <span>{[entry.wine.producer, entry.wine.vintage, entry.wine.region].filter(Boolean).join(" - ")}</span>
              </div>
              <div className="tasting-archive-summary">
                <span>{formatDisplayDate(entry.consumed_at)}</span>
                {entry.sommelier_pairing_score !== null ? <strong className="tasting-archive-ai-score"><small>AI</small>{entry.sommelier_pairing_score}/10</strong> : null}
                {canGenerateAi && entry.pairing && !entry.sommelier_feedback ? (
                  <button
                    type="button"
                    className="secondary compact tasting-archive-ai-trigger"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setReflectionEntryId(entry.id);
                      setReflectionDraft("");
                      const archiveEntry = event.currentTarget.closest("details");
                      if (archiveEntry) archiveEntry.open = true;
                    }}
                  >
                    <AppIcon name="glass-sparkle" />
                    {locale === "it" ? "Valuta con AI" : "Evaluate with AI"}
                  </button>
                ) : null}
                {entry.rating ? <strong>{entry.rating}/6</strong> : null}
                <TastingEnjoymentBadge value={entry.enjoyment} t={t} />
              </div>
            </div>
          </summary>
          <div className="tasting-archive-entry-body">
            <p className="tasting-archive-meta">
              {[displayValue(entry.wine.format, locale, "format"), displayValue(entry.wine.type, locale, "type"), entry.wine.appellation].filter(Boolean).join(" - ")}
            </p>
            {editingId === entry.id ? (
            <TastingEntryEditor
              draft={editDraft}
              setDraft={setEditDraft}
              saving={saving}
              t={t}
              onSave={async () => {
                await onUpdateEntry(entry.wine, entry.id, editDraft);
                setEditingId(null);
                setEditDraft(emptyConsumeWineDraft());
              }}
              onCancel={() => {
                setEditingId(null);
                setEditDraft(emptyConsumeWineDraft());
              }}
              onDelete={async () => {
                if (!window.confirm(t("delete"))) return;
                await onDeleteEntry(entry.wine, entry.id);
                setEditingId(null);
                setEditDraft(emptyConsumeWineDraft());
              }}
            />
          ) : (
            <>
              {entry.note ? <p className="tasting-archive-note">{entry.note}</p> : null}
              {entry.occasion || entry.pairing || entry.companions ? (
                <div className="chip-list">
                  {entry.occasion ? <span>{t("tastingOccasion")}: {entry.occasion}</span> : null}
                  {entry.pairing ? <span>{t("tastingPairing")}: {entry.pairing}</span> : null}
                  {entry.companions ? <span>{t("tastingCompanions")}: {entry.companions}</span> : null}
                </div>
              ) : null}
              {entry.sommelier_feedback ? (
                <details className="tasting-sommelier-feedback">
                  <summary className="tasting-sommelier-feedback-head">
                    <span><AppIcon name="glass-sparkle" />{locale === "it" ? "Valutazione AI dell'abbinamento" : "AI pairing evaluation"}</span>
                    {entry.sommelier_pairing_score !== null ? <strong>{entry.sommelier_pairing_score}<small>/10</small></strong> : null}
                  </summary>
                  <div className="tasting-sommelier-feedback-body">
                    <p>{entry.sommelier_feedback}</p>
                    {entry.sommelier_pairing_advice ? (
                      <p className="tasting-sommelier-advice"><b>{locale === "it" ? "Consiglio" : "Advice"}:</b> {entry.sommelier_pairing_advice}</p>
                    ) : null}
                    {entry.sommelier_feedback_cost_usd !== null ? (
                      <small className="tasting-sommelier-cost">{locale === "it" ? "Costo richiesta AI" : "AI request cost"}: {formatAiBudget(entry.sommelier_feedback_cost_usd)}</small>
                    ) : null}
                  </div>
                </details>
              ) : null}
              {canGenerateAi && entry.pairing ? (
                <aside className="tasting-sommelier-invite">
                  {reflectionEntryId === entry.id ? (
                    <>
                      <div>
                        <span><AppIcon name="glass-sparkle" />{locale === "it" ? "Dettagli per il Sommelier AI" : "Details for the AI Sommelier"}</span>
                        <strong>{locale === "it" ? "Che cosa rifaresti di questa esperienza?" : "What would you repeat from this experience?"}</strong>
                      </div>
                      <textarea
                        rows={2}
                        value={reflectionDraft}
                        onChange={(event) => setReflectionDraft(event.target.value)}
                        placeholder={locale === "it" ? "Facoltativo: una sensazione, un dettaglio della serata…" : "Optional: a feeling or detail from the occasion…"}
                        disabled={reflectingEntryId === entry.id}
                      />
                      <div className="tasting-sommelier-invite-actions">
                        <button
                          type="button"
                          disabled={reflectingEntryId === entry.id}
                          onClick={() => {
                            setReflectingEntryId(entry.id);
                            onGenerateReflection(entry, reflectionDraft)
                              .then(() => {
                                setReflectionEntryId(null);
                                setReflectionDraft("");
                              })
                              .finally(() => setReflectingEntryId(null));
                          }}
                        >
                          {reflectingEntryId === entry.id
                            ? (locale === "it" ? "Il Sommelier AI valuta…" : "AI Sommelier is evaluating…")
                            : (locale === "it" ? "Valuta con il Sommelier AI" : "Evaluate with the AI Sommelier")}
                        </button>
                        <button type="button" className="secondary compact" disabled={reflectingEntryId === entry.id} onClick={() => { setReflectionEntryId(null); setReflectionDraft(""); }}>
                          {t("cancel")}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <span><AppIcon name="glass-sparkle" />{locale === "it" ? "Sommelier AI della cantina" : "Cellar AI Sommelier"}</span>
                        <strong>{locale === "it" ? "Scopri quanto funziona l'abbinamento" : "See how well the pairing works"}</strong>
                      </div>
                      <button type="button" className="secondary compact" onClick={() => setReflectionEntryId(entry.id)}>
                        <AppIcon name="glass-sparkle" />{locale === "it" ? "Valuta con il Sommelier AI" : "Evaluate with the AI Sommelier"}
                      </button>
                    </>
                  )}
                </aside>
              ) : null}
              <div className="tasting-archive-actions">
                <button type="button" className="secondary compact" onClick={() => onOpenWine(entry.wine)}>
                  {t("openWine")}
                </button>
                {canWrite ? (
                  <button
                    type="button"
                    className="secondary compact"
                    disabled={saving}
                    onClick={() => {
                      setEditingId(entry.id);
                      setEditDraft(consumeDraftFromTastingEntry(entry));
                    }}
                  >
                    {t("edit")}
                  </button>
                ) : null}
              </div>
            </>
            )}
          </div>
        </details>
        ))}
      </div>
    </>
  );
}
