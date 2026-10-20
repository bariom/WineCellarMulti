import type { Locale, TastePreferenceEntry } from "../types";
import "./PreferenceRankingChart.css";

/**
 * "stars": the score is an average on the 1–6 star scale, shrunk for few
 * experiences. "relative": profiles saved before that, a sum of experiences
 * shown relative to the top entry.
 */
export function PreferenceRankingChart({ values, title, locale, scale = "relative" }: {
  values: TastePreferenceEntry[]; title: string; locale: Locale; scale?: "stars" | "relative";
}) {
  const stars = scale === "stars";
  const italian = locale === "it";
  const average = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  // Why an entry ranks where it does: bottles drunk and how they were rated.
  const evidence = ([, , drunk, plainAverage]: TastePreferenceEntry) => {
    const parts: string[] = [];
    if (typeof drunk === "number" && drunk > 0) parts.push(italian ? `${drunk} ${drunk === 1 ? "bevuta" : "bevute"}` : `${drunk} ${drunk === 1 ? "bottle drunk" : "bottles drunk"}`);
    if (typeof plainAverage === "number" && plainAverage > 0) {
      parts.push(stars
        ? (italian ? `media semplice ${average.format(plainAverage)}` : `plain average ${average.format(plainAverage)}`)
        : (italian ? `media ${average.format(plainAverage)} su 6` : `average ${average.format(plainAverage)} of 6`));
    }
    return parts.join(" · ");
  };
  const ranked = values.filter(([name, weight]) => name.trim() && Number.isFinite(weight) && weight > 0)
    .sort((first, second) => second[1] - first[1]).slice(0, 5);
  const maximum = ranked[0]?.[1] ?? 0;
  return <figure className="taste-preference-ranking" aria-label={`${italian ? "Grafico" : "Chart"}: ${title}`}>
    <figcaption>{title}</figcaption>
    {ranked.length ? <>
      <p className="taste-preference-scale">{stars
        ? (italian ? "Gradimento su 6 · media delle tue valutazioni, prudente quando le bevute sono poche" : "Enjoyment out of 6 · average of your ratings, cautious when bottles are few")
        : (italian ? "Riscontro relativo · primo classificato = 100 · somma di bevute e valutazioni" : "Relative support · top ranked = 100 · sum of bottles drunk and ratings")}</p>
      <ol>{ranked.map((entry, index) => {
        const [name, weight] = entry;
        const score = Math.round(weight / maximum * 100);
        // Stars: the bar spans the 1–6 scale, so neighbours with close averages look close.
        const width = stars ? Math.max(0, Math.min(100, (weight - 1) / 5 * 100)) : weight / maximum * 100;
        const shown = stars ? average.format(weight) : String(score);
        const detail = evidence(entry);
        return <li key={name}>
          <div className="taste-preference-label"><span><small aria-hidden="true">{String(index + 1).padStart(2, "0")}</small><strong>{name}</strong>{detail ? <em className="taste-preference-evidence">{detail}</em> : null}</span>
            <span className="taste-preference-value" aria-label={stars ? `${italian ? "Gradimento" : "Enjoyment"}: ${shown} ${italian ? "su 6" : "of 6"}` : `${italian ? "Riscontro relativo" : "Relative support"}: ${score}/100`}>{shown}{stars ? <small> /6</small> : null}</span>
          </div>
          <div className="taste-preference-track" aria-hidden="true"><span style={{ width: `${width}%` }} /></div>
        </li>;
      })}</ol>
    </> : <p className="taste-preference-empty">{italian ? "Non ci sono ancora riscontri sufficienti. Registra degustazioni con voto e completa le uve nella scheda dei vini." : "There is not enough evidence yet. Record rated tastings and complete the grapes in your wine details."}</p>}
  </figure>;
}
