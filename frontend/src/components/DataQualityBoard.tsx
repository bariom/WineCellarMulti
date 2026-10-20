import type { ReactNode } from "react";
import { AppIcon } from "./AppIcon";
import { grapesSvgIcon, wineTone } from "./panelSupport";
import type { Locale, Wine } from "../types";
import "./DataQualityBoard.css";

type AiFeature = "value" | "drink-window" | "grapes" | "scores";

type DataCheck = {
  id: "value" | "drink-window" | "grapes" | "scores" | "purpose";
  label: string;
  hint: string;
  icon: ReactNode;
  wines: Wine[];
  feature?: AiFeature;
};

const previewLimit = 8;

/**
 * The data-quality view as one checklist: what still needs completing comes
 * first with its actions and wines, what is already complete stays compact.
 */
export default function DataQualityBoard({
  locale, t, wines, valueRefreshWines, missingValueCount, missingDrinkWindowWines, missingGrapesWines, missingScoresWines,
  missingPurposeWines, incompleteWineCount, valueRefreshDays, onValueRefreshDaysChange, canGenerateAi, canWriteWine, saving,
  generatingAi, selectedWineId, onGenerateAll, onGenerateOne, onExcludeScores, onOpenWine, onOpenIncomplete,
}: {
  locale: Locale;
  t: (key: any) => string;
  wines: Wine[];
  valueRefreshWines: Wine[];
  missingValueCount: number;
  missingDrinkWindowWines: Wine[];
  missingGrapesWines: Wine[];
  missingScoresWines: Wine[];
  missingPurposeWines: Wine[];
  incompleteWineCount: number;
  valueRefreshDays: string;
  onValueRefreshDaysChange: (value: string) => void;
  canGenerateAi: boolean;
  canWriteWine: boolean;
  saving: boolean;
  generatingAi: string;
  selectedWineId: string | null;
  onGenerateAll: (feature: AiFeature, wines: Wine[]) => void;
  onGenerateOne: (wine: Wine, feature: AiFeature) => void;
  onExcludeScores: (wine: Wine) => void;
  onOpenWine: (wine: Wine) => void;
  onOpenIncomplete: () => void;
}) {
  const it = locale === "it";
  const total = Math.max(wines.length, 1);
  const checks: DataCheck[] = [
    {
      id: "value", label: it ? "Valore di mercato" : "Market value", icon: <AppIcon name="chart" />, wines: valueRefreshWines, feature: "value",
      hint: missingValueCount
        ? (it ? `${missingValueCount} senza valore, gli altri da aggiornare.` : `${missingValueCount} without a value, the rest to refresh.`)
        : (it ? "Stima assente o più vecchia della soglia scelta." : "Estimate missing or older than the chosen threshold."),
    },
    { id: "drink-window", label: it ? "Finestra di beva" : "Drinking window", icon: <AppIcon name="calendar" />, wines: missingDrinkWindowWines, feature: "drink-window", hint: it ? "Quando aprire ogni annata." : "When to open each vintage." },
    { id: "grapes", label: it ? "Uvaggio" : "Grapes", icon: grapesSvgIcon(), wines: missingGrapesWines, feature: "grapes", hint: it ? "Vitigni e percentuali." : "Varieties and percentages." },
    { id: "scores", label: it ? "Punteggi della critica" : "Critic scores", icon: <AppIcon name="star" />, wines: missingScoresWines, feature: "scores", hint: it ? "Valutazioni con la fonte, oppure “non necessari”." : "Ratings with their source, or “not needed”." },
    { id: "purpose", label: it ? "Obiettivo in cantina" : "Cellar purpose", icon: <AppIcon name="assistant" />, wines: missingPurposeWines, hint: it ? "Da bere, da far maturare, investimento…: serve alla strategia." : "Drink, age, invest…: it feeds your cellar strategy." },
  ];
  const ordered = [...checks.filter((check) => check.wines.length), ...checks.filter((check) => !check.wines.length)];
  const allDone = incompleteWineCount === 0 && valueRefreshWines.length === 0;
  const busy = Boolean(generatingAi);

  return <section className="data-quality-board" aria-label={t("dataQuality")}>
    <header className={`dq-summary${allDone ? " is-done" : ""}`}>
      <span className="dq-summary-mark" aria-hidden="true">{allDone ? "✓" : <AppIcon name="filter" />}</span>
      <div>
        <h2>{allDone ? (it ? "Tutto in ordine" : "All in order") : (it ? `${incompleteWineCount} vini da completare` : `${incompleteWineCount} wines to complete`)}</h2>
        <p>{allDone
          ? (it ? `I dati essenziali dei tuoi ${wines.length} vini sono completi e aggiornati.` : `The essential data of your ${wines.length} wines is complete and up to date.`)
          : (it ? "Completa i dati mancanti con l'AI in un colpo solo, oppure apri i vini uno per uno." : "Fill the gaps with AI in one go, or open the wines one by one.")}</p>
      </div>
      {incompleteWineCount ? <button type="button" className="secondary compact" onClick={onOpenIncomplete}>{t("openFilteredCellar")}</button> : null}
    </header>

    <ul className="dq-checks">
      {ordered.map((check) => {
        const count = check.wines.length;
        const done = count === 0;
        const coverage = Math.round(((total - Math.min(count, total)) / total) * 100);
        const batchKey = check.feature ? `batch-${check.feature}` : "";
        return <li key={check.id} className={`dq-check${done ? " is-done" : " is-todo"}`}>
          <div className="dq-check-row">
            <span className="dq-check-icon" aria-hidden="true">{check.icon}</span>
            <div className="dq-check-main">
              <strong>{check.label}</strong>
              <span>{check.hint}</span>
              <div className="dq-bar" role="img" aria-label={it ? `Copertura ${coverage}%` : `Coverage ${coverage}%`}><i style={{ width: `${coverage}%` }} /></div>
            </div>
            <div className="dq-check-status">
              {done ? <b className="is-ok">✓ {it ? "Completo" : "Complete"}</b> : <b>{it ? `${count} da completare` : `${count} to complete`}</b>}
              <small>{coverage}%</small>
            </div>
          </div>
          {check.id === "value" ? <label className="dq-threshold">
            <span>{it ? "Da aggiornare dopo" : "Refresh after"}</span>
            <input type="number" min="0" inputMode="numeric" value={valueRefreshDays} onChange={(event) => onValueRefreshDaysChange(event.target.value)} />
            <span>{it ? "giorni" : "days"}</span>
          </label> : null}
          {!done ? <div className="dq-check-actions">
            {check.feature ? <button type="button" disabled={!canGenerateAi || busy} onClick={() => onGenerateAll(check.feature!, check.wines)}>
              <AppIcon name="glass-sparkle" variant="ai" />
              {generatingAi === batchKey ? t("generating") : (it ? `Completa con AI (${count})` : `Complete with AI (${count})`)}
            </button> : null}
            <details>
              <summary>{it ? `Vedi i vini (${count})` : `See the wines (${count})`}</summary>
              <ul className="dq-wines">
                {check.wines.slice(0, previewLimit).map((wine) => <li key={wine.id}>
                  <button type="button" className="dq-wine-open" onClick={() => onOpenWine(wine)}>
                    <i className={`wine-dot tone-${wineTone(wine.type)}`} />
                    <span className="dq-wine-identity">
                      <strong>{[wine.name, wine.vintage].filter(Boolean).join(" · ")}</strong>
                      {/* Same-named wines are common: the producer tells them apart. */}
                      <small>{wine.producer || (it ? "Produttore non indicato" : "No producer")}</small>
                    </span>
                  </button>
                  <div className="dq-wine-actions">
                    {check.feature ? <button type="button" className="secondary compact" disabled={!canGenerateAi || busy} onClick={() => onGenerateOne(wine, check.feature!)}>
                      {generatingAi === check.feature && selectedWineId === wine.id ? t("generating") : (it ? "Completa" : "Complete")}
                    </button> : <button type="button" className="secondary compact" onClick={() => onOpenWine(wine)}>{it ? "Assegna" : "Assign"}</button>}
                    {check.id === "scores" ? <button type="button" className="secondary compact" disabled={!canWriteWine || saving} onClick={() => onExcludeScores(wine)}>{t("noScoresNeeded")}</button> : null}
                  </div>
                </li>)}
              </ul>
              {count > previewLimit ? <button type="button" className="secondary compact dq-more" onClick={onOpenIncomplete}>{it ? `Altri ${count - previewLimit} in cantina` : `${count - previewLimit} more in the cellar`}</button> : null}
            </details>
          </div> : null}
        </li>;
      })}
    </ul>
  </section>;
}
