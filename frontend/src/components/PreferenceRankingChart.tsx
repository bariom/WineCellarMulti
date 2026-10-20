import type { Locale, TastePreferenceEntry } from "../types";
import "./PreferenceRankingChart.css";

export function PreferenceRankingChart({ values, title, locale }: {
  values: TastePreferenceEntry[]; title: string; locale: Locale;
}) {
  const italian = locale === "it";
  const average = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  // Why an entry ranks where it does: bottles drunk and how they were rated.
  const evidence = ([, , drunk, stars]: TastePreferenceEntry) => {
    const parts: string[] = [];
    if (typeof drunk === "number" && drunk > 0) parts.push(italian ? `${drunk} ${drunk === 1 ? "bevuta" : "bevute"}` : `${drunk} ${drunk === 1 ? "bottle drunk" : "bottles drunk"}`);
    if (typeof stars === "number" && stars > 0) parts.push(italian ? `media ${average.format(stars)} su 6` : `average ${average.format(stars)} of 6`);
    return parts.join(" · ");
  };
  const ranked = values.filter(([name, weight]) => name.trim() && Number.isFinite(weight) && weight > 0)
    .sort((first, second) => second[1] - first[1]).slice(0, 5);
  const maximum = ranked[0]?.[1] ?? 0;
  return <figure className="taste-preference-ranking" aria-label={`${italian ? "Grafico" : "Chart"}: ${title}`}>
    <figcaption>{title}</figcaption>
    {ranked.length ? <>
      <p className="taste-preference-scale">{italian ? "Riscontro relativo · primo classificato = 100 · somma di bevute e valutazioni" : "Relative support · top ranked = 100 · sum of bottles drunk and ratings"}</p>
      <ol>{ranked.map((entry, index) => {
        const [name, weight] = entry;
        const score = Math.round(weight / maximum * 100);
        const detail = evidence(entry);
        return <li key={name}>
          <div className="taste-preference-label"><span><small aria-hidden="true">{String(index + 1).padStart(2, "0")}</small><strong>{name}</strong>{detail ? <em className="taste-preference-evidence">{detail}</em> : null}</span>
            <span className="taste-preference-value" aria-label={`${italian ? "Riscontro relativo" : "Relative support"}: ${score}/100`}>{score}</span>
          </div>
          <div className="taste-preference-track" aria-hidden="true"><span style={{ width: `${weight / maximum * 100}%` }} /></div>
        </li>;
      })}</ol>
    </> : <p className="taste-preference-empty">{italian ? "Non ci sono ancora riscontri sufficienti. Registra degustazioni con voto e completa le uve nella scheda dei vini." : "There is not enough evidence yet. Record rated tastings and complete the grapes in your wine details."}</p>}
  </figure>;
}
