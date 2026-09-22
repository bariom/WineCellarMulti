import type { Locale, Wine } from "../types";

/** A dated instrument: the pale band is the drinking window, the dark band its ideal period. */
export function CollectorMaturity({ wine, locale, compact = false, currentYear = new Date().getFullYear() }: {
  wine: Wine; locale: Locale; compact?: boolean; currentYear?: number;
}) {
  const it = locale === "it";
  const start = wine.drink_from || wine.drink_peak_from;
  const end = wine.drink_to || wine.drink_peak_to;
  const valid = Boolean(start && end && end >= start);
  const vintage = Number(wine.vintage);
  const reference = vintage > 0 ? vintage : start;
  const first = Math.min(reference || currentYear, start || currentYear, currentYear);
  const last = Math.max(end || currentYear, currentYear, first + 1);
  const position = (year: number) => Math.max(0, Math.min(100, (year - first) / (last - first) * 100));
  const peakStart = wine.drink_peak_from;
  const peakEnd = wine.drink_peak_to;
  const hasPeak = valid && peakStart && peakEnd && peakEnd >= peakStart && peakStart >= start! && peakEnd <= end!;
  const ideal = hasPeak ? `${peakStart}–${peakEnd}` : (it ? "Non definito" : "Not defined");
  const title = it ? "Mappa maturità" : "Maturity map";
  return <span className={`collector-maturity${compact ? " collector-maturity-compact" : ""}`}>
    <span className="collector-maturity-caption"><span>{compact ? (it ? "Finestra di beva" : "Drinking window") : title}</span><span>{it ? "Oggi" : "Today"} · {currentYear}</span></span>
    {valid ? <>
      <span className="collector-maturity-instrument" role="img" aria-label={`${title}: ${reference || first}; ${it ? "finestra" : "window"} ${start}–${end}; ${it ? "periodo ideale" : "ideal period"} ${ideal}; ${currentYear}`}>
        <span className="collector-maturity-window" style={{ left: `${position(start!)}%`, width: `${position(end!) - position(start!)}%` }} />
        {hasPeak ? <span className="collector-maturity-ideal" style={{ left: `${position(peakStart)}%`, width: `${position(peakEnd) - position(peakStart)}%` }} /> : null}
        <span className="collector-maturity-needle" style={{ left: `${position(currentYear)}%` }} />
      </span>
      {compact ? <span className="collector-maturity-endpoints"><span>{start}</span><span>{end}</span></span> : <span className="collector-maturity-dates">
        <span>{it ? "Riferimento" : "Reference"}<strong>{reference || first}</strong></span>
        <span>{it ? "Apertura" : "Opens"}<strong>{start}</strong></span>
        <span>{it ? "Ideale" : "Ideal"}<strong>{ideal}</strong></span>
        <span>{it ? "Fine finestra" : "Window ends"}<strong>{end}</strong></span>
      </span>}
    </> : <span className="collector-maturity-unavailable">{it ? "Finestra non disponibile" : "Window unavailable"}</span>}
  </span>;
}
