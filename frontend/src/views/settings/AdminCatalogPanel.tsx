import AdminCatalogMetadataEditor from "../../components/AdminCatalogMetadataEditor";
import AdminCatalogPhotoEnrichment from "../../components/AdminCatalogPhotoEnrichment";
import AdminCatalogRecovery from "../../components/AdminCatalogRecovery";
import { translate, type TranslationKey } from "../../i18n";
import type { CatalogWine, Locale } from "../../types";
import { localizeRegion, localizeCountry } from "../../domain/places";

type AdminCatalogPanelProps = {
  locale: Locale;
  saving: boolean;
  canWriteWine: boolean;
  pendingEntries: CatalogWine[];
  onReloadPending: () => void;
  onRecovered: () => Promise<void>;
  query: string;
  onQueryChange: (query: string) => void;
  onSearch: () => void;
  results: CatalogWine[];
  onApprove: (entry: CatalogWine) => void;
  onDelete: (entry: CatalogWine) => void;
  onMetadataSaved: (entry: CatalogWine) => void;
};

/** Operations → catalogue: new wines to approve, and a search to fix or remove any entry. */
export default function AdminCatalogPanel({
  locale,
  saving,
  canWriteWine,
  pendingEntries,
  onReloadPending,
  onRecovered,
  query,
  onQueryChange,
  onSearch,
  results,
  onApprove,
  onDelete,
  onMetadataSaved,
}: AdminCatalogPanelProps) {
  const t = (key: TranslationKey) => translate(locale, key);
  return (
    <>
      <details className="operations-disclosure"><summary>{locale === "it" ? "Arricchisci da foto" : "Enrich from photos"}<span>{locale === "it" ? "Leggi le etichette di uno scaffale o di una bottiglia" : "Read the labels on a shelf or a bottle"}</span></summary>
        <AdminCatalogPhotoEnrichment locale={locale} disabled={saving} />
      </details>
      <details className="operations-disclosure"><summary>{locale === "it" ? "Nuovi vini da approvare" : "New wines to approve"}</summary>
        <section className="settings-card settings-card-wide settings-admin-card">
          <div className="settings-card-heading">
            <div>
              <span>{t("labelRecognitionAccess")}</span>
              <h3>{t("pendingCatalogEntries")}</h3>
            </div>
            <div className="member-actions">
              <strong>{pendingEntries.length}</strong>
              <button type="button" className="secondary compact" disabled={saving} onClick={onReloadPending}>
                {t("loadingData")}
              </button>
            </div>
          </div>
          {pendingEntries.length ? (
            <div className="member-list">
              {pendingEntries.map((entry) => (
                <div className="catalog-admin-entry" key={entry.id || `${entry.producer}-${entry.name}`}>
                <div className="member-row">
                  <div>
                    <strong>{[entry.producer, entry.name].filter(Boolean).join(" - ") || entry.name}</strong>
                    <span>{[localizeRegion(entry.region, locale), entry.appellation, entry.type].filter(Boolean).join(" - ") || t("noActionItems")}</span>
                    {entry.country || entry.grapes_text ? <span>{[localizeCountry(entry.country, locale), entry.grapes_text].filter(Boolean).join(" - ")}</span> : null}
                  </div>
                  <div className="member-actions">
                    <button type="button" className="compact" disabled={saving} onClick={() => onApprove(entry)}>
                      {t("approveCatalogEntry")}
                    </button>
                    <button type="button" className="danger compact" disabled={saving} onClick={() => onDelete(entry)}>
                      {t("rejectCatalogEntry")}
                    </button>
                  </div>
                </div>
                <AdminCatalogMetadataEditor entry={entry} locale={locale} disabled={saving} onSaved={onMetadataSaved} />
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-state">{t("noPendingCatalogEntries")}</p>
          )}
        </section>
      </details>
      <details className="operations-disclosure"><summary>{locale === "it" ? "Cerca e gestisci le schede" : "Search and manage entries"}</summary>
        <section className="settings-card settings-card-wide">
          <div className="settings-card-heading">
            <div>
              <span>{t("labelRecognitionAccess")}</span>
              <h3>{t("catalogAdminSearch")}</h3>
              <small>{t("catalogAdminSearchHelp")}</small>
            </div>
          </div>
          <AdminCatalogRecovery locale={locale} disabled={saving || !canWriteWine} onRecovered={onRecovered} />
          <form className="inline-row-form" onSubmit={(event) => { event.preventDefault(); onSearch(); }}>
            <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Dogaia, 36 lune..." />
            <button type="submit" className="secondary compact" disabled={saving || !query.trim()}>{t("search")}</button>
          </form>
          {results.length ? (
            <div className="member-list">
              {results.map((entry) => (
                <div className="catalog-admin-entry" key={entry.id || `${entry.producer}-${entry.name}`}>
                <div className="member-row">
                  <div>
                    <strong>{[entry.producer, entry.name].filter(Boolean).join(" - ") || entry.name}</strong>
                    <span>{[localizeRegion(entry.region, locale), entry.appellation, entry.type].filter(Boolean).join(" - ") || t("noActionItems")}</span>
                    <span className={entry.is_active ? "status-pill configured" : "status-pill"}>{entry.is_active ? "active" : "pending"}</span>
                  </div>
                  <div className="member-actions">
                    {!entry.is_active ? (
                      <button type="button" className="compact" disabled={saving} onClick={() => onApprove(entry)}>
                        {t("approveCatalogEntry")}
                      </button>
                    ) : null}
                    <button type="button" className="danger compact" disabled={saving} onClick={() => onDelete(entry)}>
                      {t("deleteCatalogEntry")}
                    </button>
                  </div>
                </div>
                <AdminCatalogMetadataEditor entry={entry} locale={locale} disabled={saving} onSaved={onMetadataSaved} />
                </div>
              ))}
            </div>
          ) : query.trim() ? (
            <p className="empty-state">{t("noCatalogAdminResults")}</p>
          ) : null}
        </section>
      </details>
    </>
  );
}
