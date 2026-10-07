import type { Locale } from "../types";
import "./PreferenceRankingChart.css";

export function PreferenceRankingChart({ values, title, locale }: {
  values: Array<[string, number]>; title: string; locale: Locale;
}) {
  const italian = locale === "it";
  const ranked = values.filter(([name, weight]) => name.trim() && Number.isFinite(weight) && weight > 0)
    .sort(([, a], [, b]) => b - a).slice(0, 5);
  const maximum = ranked[0]?.[1] ?? 0;
  return <figure className="taste-preference-ranking" aria-label={`${italian ? "Grafico" : "Chart"}: ${title}`}>
    <figcaption>{title}</figcaption>
    {ranked.length ? <>
      <p className="taste-preference-scale">{italian ? "Riscontro relativo · primo classificato = 100" : "Relative support · top ranked = 100"}</p>
      <ol>{ranked.map(([name, weight], index) => {
        const score = Math.round(weight / maximum * 100);
        return <li key={name}>
          <div className="taste-preference-label"><span><small aria-hidden="true">{String(index + 1).padStart(2, "0")}</small><strong>{name}</strong></span>
            <span className="taste-preference-value" aria-label={`${italian ? "Riscontro relativo" : "Relative support"}: ${score}/100`}>{score}</span>
          </div>
          <div className="taste-preference-track" aria-hidden="true"><span style={{ width: `${weight / maximum * 100}%` }} /></div>
        </li>;
      })}</ol>
    </> : <p className="taste-preference-empty">{italian ? "Non ci sono ancora riscontri sufficienti. Registra degustazioni con voto e completa le uve nella scheda dei vini." : "There is not enough evidence yet. Record rated tastings and complete the grapes in your wine details."}</p>}
  </figure>;
}
