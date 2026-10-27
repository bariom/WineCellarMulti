import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import { appActionSvgIcon } from "../../components/actionIcons";
import { ButtonBusyContent, LoadingState } from "../../components/AppUi";
import { translate, type TranslationKey } from "../../i18n";
import type { ExportSelection, ImportMode, ImportPreview, ImportResult, ImportSelection, Locale, Session } from "../../types";

type DataSettingsTabProps = {
  locale: Locale;
  session: Session | null;
  saving: boolean;
  importCellarTrackerFile: (event: ChangeEvent<HTMLInputElement>) => void;
  importLegacyFile: (event: ChangeEvent<HTMLInputElement>) => void;
  importMode: ImportMode;
  setImportMode: (mode: ImportMode) => void;
  importPreview: ImportPreview | null;
  importFileName: string;
  importResult: ImportResult | null;
  exportBlocks: ReadonlyArray<{ key: keyof ExportSelection; label: string }>;
  importSelection: ImportSelection;
  setImportSelection: Dispatch<SetStateAction<ImportSelection>>;
  importPayload: Record<string, unknown> | null;
  cellarTrackerCsvText: string;
  runLegacyImport: () => void;
  exportSelection: ExportSelection;
  toggleExportSelection: (key: keyof ExportSelection) => void;
  hasSelectedExportBlock: boolean;
  exportJson: () => void;
  emptyCellar: () => void;
};

/** Settings → Data: import from CellarTracker or a backup, export the cellar, or empty it. */
export default function DataSettingsTab({
  locale,
  session,
  saving,
  importCellarTrackerFile,
  importLegacyFile,
  importMode,
  setImportMode,
  importPreview,
  importFileName,
  importResult,
  exportBlocks,
  importSelection,
  setImportSelection,
  importPayload,
  cellarTrackerCsvText,
  runLegacyImport,
  exportSelection,
  toggleExportSelection,
  hasSelectedExportBlock,
  exportJson,
  emptyCellar,
}: DataSettingsTabProps) {
  const t = (key: TranslationKey) => translate(locale, key);
  return (
    <>
      <section className="settings-card data-import-card" aria-labelledby="data-import-title">
        <div className="settings-card-heading">
          <div>
            <span>{t("importLegacy")}</span>
            <h3 id="data-import-title">{t("importSection")}</h3>
          </div>
        </div>
        <p className="data-import-intro">{t("importSupports")}</p>
        <div className="data-import-sources" role="group" aria-label={locale === "it" ? "Origine dei dati" : "Data source"}>
          <section className="data-import-source data-import-source--cellartracker" aria-labelledby="cellartracker-import-title">
            <span className="data-import-source-tag">{locale === "it" ? "Vieni da CellarTracker?" : "Coming from CellarTracker?"}</span>
            <h4 id="cellartracker-import-title">{locale === "it" ? "Importa da CellarTracker" : "Import from CellarTracker"}</h4>
            <p>{locale === "it" ? "Esporta la tua collezione “My Cellar” da CellarTracker in formato CSV e carica qui il file." : "Export your “My Cellar” collection from CellarTracker as a CSV file and upload it here."}</p>
            <label><span>{locale === "it" ? "Carica CSV CellarTracker" : "Upload CellarTracker CSV"}</span><input type="file" accept="text/csv,.csv" onChange={importCellarTrackerFile} disabled={saving} /></label>
          </section>
          <section className="data-import-source" aria-labelledby="vinaris-import-title">
            <span className="data-import-source-tag">{locale === "it" ? "Hai un backup Vinaris?" : "Have a Vinaris backup?"}</span>
            <h4 id="vinaris-import-title">{locale === "it" ? "Ripristina un backup" : "Restore a backup"}</h4>
            <p>{locale === "it" ? "Carica un file JSON esportato da Vinaris o un backup precedente compatibile." : "Upload a JSON file exported from Vinaris or a compatible older backup."}</p>
            <small>{t("exportHistoryIncluded")}</small>
            <label><span>{locale === "it" ? "Carica backup JSON Vinaris" : "Upload Vinaris JSON backup"}</span><input type="file" accept="application/json,.json" onChange={importLegacyFile} disabled={saving} /></label>
          </section>
        </div>
        <p className="data-import-preview-help">{locale === "it" ? "Il caricamento prepara solo un’anteprima: vedrai i vini nuovi e i possibili duplicati prima di confermare." : "Uploading only prepares a preview: review new wines and possible duplicates before confirming."}</p>
        <label>
          <span>{t("importMode")}</span>
          <select aria-label={t("importMode")} aria-describedby="data-import-mode-help" value={importMode} onChange={(event) => setImportMode(event.target.value as ImportMode)} disabled={saving}>
            <option value="skip_duplicates">{t("importModeSkip")}</option>
            <option value="update_existing">{t("importModeUpdate")}</option>
            <option value="add_all">{t("importModeAdd")}</option>
            <option value="replace_all">{t("importModeReplace")}</option>
          </select>
          <small id="data-import-mode-help">{importMode === "replace_all"
            ? (locale === "it" ? "Attenzione: elimina tutti i vini e la wishlist della cantina attiva prima di importare il file." : "Warning: deletes all wines and the wishlist in the active cellar before importing the file.")
            : importMode === "update_existing"
              ? (locale === "it" ? "Aggiorna i vini già presenti con i dati del file e aggiunge quelli nuovi." : "Updates existing wines with data from the file and adds new wines.")
              : importMode === "add_all"
                ? (locale === "it" ? "Importa tutte le righe, anche se il vino potrebbe essere già presente." : "Imports every row, even if the wine may already be in your cellar.")
                : (locale === "it" ? "Aggiunge i vini nuovi e salta quelli che risultano già presenti. È la scelta consigliata per iniziare." : "Adds new wines and skips likely existing ones. Recommended for getting started.")}</small>
        </label>
        {saving && !importPreview && !importResult ? <LoadingState label={t("loadingData")} compact /> : null}
        {importPreview ? (
          <div className="token-box">
            <strong>{t("importReady")}: {importFileName}</strong>
            <span>{importPreview.format === "vinaris" ? "Vinaris export v2" : importPreview.format === "cellartracker" ? "CellarTracker My Cellar CSV" : locale === "it" ? "JSON legacy compatibile" : "Compatible legacy JSON"}</span>
            {importPreview.included_blocks.length ? <span>{importPreview.included_blocks.join(", ")}</span> : null}
            <span>{t("wines")}: {importPreview.wine_new} {t("newItems")}, {importPreview.wine_duplicates} {t("probableDuplicates")} {t("of")} {importPreview.wines_total}</span>
            <span>{t("wishlist")}: {importPreview.wishlist_new} {t("newItems")}, {importPreview.wishlist_duplicates} {t("probableDuplicates")} {t("of")} {importPreview.wishlist_total}</span>
            {session?.is_free_tier && typeof importPreview.free_tier_label_limit === "number" ? (
              <span>
                {(() => {
                  const missing = Math.max(
                    importPreview.free_tier_labels_required - Math.max(importPreview.free_tier_label_limit - importPreview.free_tier_active_labels, 0),
                    0,
                  );
                  if (!missing) return locale === "it"
                    ? `Piano gratuito: puoi importare tutti i ${importPreview.wines_total} vini.`
                    : `Free plan: you can import all ${importPreview.wines_total} wines.`;
                  return locale === "it"
                    ? `Piano gratuito: importabili ${importPreview.free_tier_importable_wines ?? 0} di ${importPreview.wines_total} vini. Servono ${missing} posti aggiuntivi oppure un abbonamento.`
                    : `Free plan: ${importPreview.free_tier_importable_wines ?? 0} of ${importPreview.wines_total} wines can be imported. ${missing} more label slots or a subscription are required.`;
                })()}
              </span>
            ) : null}
            {importPreview.members_total || importPreview.invites_total || importPreview.share_offers_total || importPreview.user_tags_total || importPreview.ai_audit_total ? (
              <small>
                {[
                  importPreview.members_total ? `${t("members")}: ${importPreview.members_total}` : "",
                  importPreview.invites_total ? `${t("invites")}: ${importPreview.invites_total}` : "",
                  importPreview.share_offers_total ? `${t("exportIncludesShareOffers")}: ${importPreview.share_offers_total}` : "",
                  importPreview.user_tags_total ? `${t("tags")}: ${importPreview.user_tags_total}` : "",
                  importPreview.ai_audit_total ? `${t("aiAudit")}: ${importPreview.ai_audit_total}` : "",
                  importPreview.sales_total ? `${t("exportIncludesSales")}: ${importPreview.sales_total}` : "",
                ].filter(Boolean).join(" | ")}
              </small>
            ) : null}
            {[...importPreview.sample_wine_duplicates, ...importPreview.sample_wishlist_duplicates].length ? (
              <small>{[...importPreview.sample_wine_duplicates, ...importPreview.sample_wishlist_duplicates].join(", ")}</small>
            ) : null}
          </div>
        ) : null}
        {importPreview?.format === "vinaris" ? (
          <div className="token-box">
            <strong>{t("importSelection")}</strong>
            <span>{t("importSelectionHelp")}</span>
            <div className="export-options-grid">
              {exportBlocks
                .filter(({ key }) => importPreview.included_blocks.includes(key))
                .map((block) => (
                  <label className="export-option" key={`import-${block.key}`}>
                    <input
                      type="checkbox"
                      checked={importSelection[block.key]}
                      onChange={() => setImportSelection((current) => ({ ...current, [block.key]: !current[block.key] }))}
                    />
                    <span>{block.label}</span>
                  </label>
                ))}
            </div>
          </div>
        ) : null}
        <div className="inline-form">
          <button type="button" disabled={saving || (!importPayload && !cellarTrackerCsvText)} onClick={runLegacyImport}>
            <ButtonBusyContent busy={saving && Boolean(importPayload || cellarTrackerCsvText)} idleLabel={t("importRun")} busyLabel={t("loadingData")} icon={appActionSvgIcon("import")} />
          </button>
        </div>
        {importResult ? (
          <div className="token-box">
            <strong>{t("importSummary")}</strong>
            {(importResult.wines_deleted || importResult.wishlist_deleted) ? <span>{t("emptyCellar")}: {importResult.wines_deleted} {t("wines").toLowerCase()}, {importResult.wishlist_deleted} {t("wishlist").toLowerCase()}</span> : null}
            <span>{t("wines")}: +{importResult.wines_imported}, {t("updatedItems")} {importResult.wines_updated}, {t("skipped")} {importResult.wines_skipped}</span>
            <span>{t("wishlist")}: +{importResult.wishlist_imported}, {t("updatedItems")} {importResult.wishlist_updated}, {t("skipped")} {importResult.wishlist_skipped}</span>
            {(importResult.sales_imported || importResult.sales_updated || importResult.sales_skipped) ? <span>{t("exportIncludesSales")}: +{importResult.sales_imported}, {t("updatedItems")} {importResult.sales_updated}, {t("skipped")} {importResult.sales_skipped}</span> : null}
            {(importResult.members_imported || importResult.members_updated || importResult.members_skipped) ? <span>{t("members")}: +{importResult.members_imported}, {t("updatedItems")} {importResult.members_updated}, {t("skipped")} {importResult.members_skipped}</span> : null}
            {(importResult.invites_imported || importResult.invites_updated || importResult.invites_skipped) ? <span>{t("invites")}: +{importResult.invites_imported}, {t("updatedItems")} {importResult.invites_updated}, {t("skipped")} {importResult.invites_skipped}</span> : null}
            {(importResult.share_offers_imported || importResult.share_offers_updated || importResult.share_offers_skipped) ? <span>{t("exportIncludesShareOffers")}: +{importResult.share_offers_imported}, {t("updatedItems")} {importResult.share_offers_updated}, {t("skipped")} {importResult.share_offers_skipped}</span> : null}
            {(importResult.user_tags_imported || importResult.user_tags_updated || importResult.user_tags_skipped) ? <span>{t("tags")}: +{importResult.user_tags_imported}, {t("updatedItems")} {importResult.user_tags_updated}, {t("skipped")} {importResult.user_tags_skipped}</span> : null}
            {(importResult.ai_audit_imported || importResult.ai_audit_updated || importResult.ai_audit_skipped) ? <span>{t("aiAudit")}: +{importResult.ai_audit_imported}, {t("updatedItems")} {importResult.ai_audit_updated}, {t("skipped")} {importResult.ai_audit_skipped}</span> : null}
          </div>
        ) : null}
        <div className="token-box">
          <strong>{t("exportData")}</strong>
          <span>{t("exportFullCellarHelp")}</span>
          <small>{t("exportHistoryIncluded")}</small>
          <small>{t("exportSensitiveNote")}</small>
        </div>
        <div className="export-options-grid">
          {exportBlocks.map((block) => (
            <label className="export-option" key={block.key}>
              <input
                type="checkbox"
                checked={exportSelection[block.key]}
                onChange={() => toggleExportSelection(block.key)}
              />
              <span>{block.label}</span>
            </label>
          ))}
        </div>
        <div className="inline-form">
          <button type="button" className="secondary" disabled={saving || !hasSelectedExportBlock} onClick={exportJson}>
            <span className="action-icon" aria-hidden="true">{appActionSvgIcon("export")}</span>
            <span className="action-label">{t("exportJson")}</span>
          </button>
        </div>
        <div className="error-banner">
          <strong>{t("emptyCellar")}</strong>
          <span>{t("emptyCellarWarning")}</span>
          <button type="button" className="danger compact" disabled={saving} onClick={emptyCellar}>
            <span className="action-icon" aria-hidden="true">{appActionSvgIcon("delete")}</span>
            <span className="action-label">{t("emptyCellar")}</span>
          </button>
        </div>
      </section>
    </>
  );
}
