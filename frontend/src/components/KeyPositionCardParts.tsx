import { useRef, useState } from "react";
import { useChartReveal } from "./chartMotion";

function KeyPositionWineIllustration() {
  return (
    <div className="key-position-wine-illustration" aria-hidden="true">
      <svg viewBox="0 0 120 190" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M35 30 25 80c-3 20 12 37 34 37s37-17 34-37L84 30" />
        <path d="M59 117v43M35 173h48M59 160l-24 13M59 160l24 13" />
        <path d="M31 77c11 1 18 10 28 10 13 0 18-13 28-19" />
        <path d="M37 88c12 12 30 15 45 4" opacity=".55" />
        <circle cx="50" cy="20" r="4" /><circle cx="64" cy="10" r="3.5" /><circle cx="72" cy="29" r="5" /><circle cx="46" cy="42" r="3" />
      </svg>
    </div>
  );
}

export function KeyPositionBottleVisual({ photoUrl }: { photoUrl: string }) {
  const [imageFailed, setImageFailed] = useState(false);
  const hasPhoto = Boolean(photoUrl) && !imageFailed;

  return (
    <div className={`key-position-bottle-visual${hasPhoto ? " has-photo" : ""}`} aria-hidden="true">
      {hasPhoto ? <img src={photoUrl} alt="" loading="lazy" onError={() => setImageFailed(true)} /> : <KeyPositionWineIllustration />}
    </div>
  );
}

export function KeyPositionCircularKpi({ label, value, tone = "total" }: { label: string; value: string; tone?: "total" | "count" }) {
  return (
    <section className={`key-position-metric key-position-metric--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </section>
  );
}

type TrendPoint = { value: number; label: string; timestamp?: number };

function sparklinePath(points: TrendPoint[]) {
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const timestamps = points.map((point) => point.timestamp).filter((timestamp): timestamp is number => Number.isFinite(timestamp));
  const firstTimestamp = timestamps.length === points.length ? Math.min(...timestamps) : null;
  const lastTimestamp = timestamps.length === points.length ? Math.max(...timestamps) : null;
  const timeRange = firstTimestamp !== null && lastTimestamp !== null ? lastTimestamp - firstTimestamp : 0;
  const coordinates = points.map((point, index) => {
    const x = timeRange > 0 && point.timestamp !== undefined && firstTimestamp !== null
      ? ((point.timestamp - firstTimestamp) / timeRange) * 100
      : points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
    const y = 34 - ((point.value - min) / range) * 28;
    return { x, y };
  });
  if (coordinates.length < 2) return coordinates.length ? `M${coordinates[0].x.toFixed(2)} ${coordinates[0].y.toFixed(2)}` : "";
  if (coordinates.length === 2) return `M${coordinates[0].x.toFixed(2)} ${coordinates[0].y.toFixed(2)} L${coordinates[1].x.toFixed(2)} ${coordinates[1].y.toFixed(2)}`;

  const clampY = (value: number) => Math.min(36, Math.max(4, value));
  const segments = coordinates.slice(1).map((current, index) => {
    const start = coordinates[index];
    const previous = coordinates[Math.max(0, index - 1)];
    const next = coordinates[Math.min(coordinates.length - 1, index + 2)];
    const controlStartX = Math.min(current.x, start.x + (current.x - previous.x) / 6);
    const controlStartY = clampY(start.y + (current.y - previous.y) / 6);
    const controlEndX = Math.max(start.x, current.x - (next.x - start.x) / 6);
    const controlEndY = clampY(current.y - (next.y - start.y) / 6);
    return `C${controlStartX.toFixed(2)} ${controlStartY.toFixed(2)} ${controlEndX.toFixed(2)} ${controlEndY.toFixed(2)} ${current.x.toFixed(2)} ${current.y.toFixed(2)}`;
  });
  return `M${coordinates[0].x.toFixed(2)} ${coordinates[0].y.toFixed(2)} ${segments.join(" ")}`;
}

export function KeyPositionTrendKpi({ label, points, changeLabel, rangeLabel, unavailableLabel }: {
  label: string;
  points: TrendPoint[];
  changeLabel: string | null;
  rangeLabel: string | null;
  unavailableLabel: string;
}) {
  const chartRef = useRef<SVGSVGElement | null>(null);
  useChartReveal(chartRef);
  const hasTrend = points.length >= 2;
  const path = hasTrend ? sparklinePath(points) : "";
  const trendDescription = hasTrend ? `${label}: ${rangeLabel || ""}, ${changeLabel || ""}` : `${label}: ${unavailableLabel}`;

  return (
    <section className="key-position-trend" aria-label={trendDescription}>
      <span>{label}</span>
      {hasTrend ? (
        <svg ref={chartRef} viewBox="0 0 100 42" role="img" aria-label={trendDescription} preserveAspectRatio="none">
          <path className="key-position-trend-area" d={`${path} L100 42 L0 42 Z`} />
          <path className="key-position-trend-line" d={path} />
        </svg>
      ) : <em>{unavailableLabel}</em>}
      <strong>{hasTrend ? changeLabel || "—" : "—"}</strong>
      <small>{hasTrend ? rangeLabel : null}</small>
    </section>
  );
}

export function KeyPositionActionBadge({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className={`recommendation-badge recommendation-badge--${tone}`} aria-label={`${label}: ${value}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

type KeyPositionMaturityTimelineProps = {
  label: string;
  startYear: number | null;
  peakEndYear: number | null;
  endYear: number | null;
  currentYearLabel: string;
  currentYear: number;
  hasWindow: boolean;
  peakLeft: number;
  peakWidth: number;
  currentProgress: number;
};

export function KeyPositionMaturityTimeline({ label, startYear, peakEndYear, endYear, currentYearLabel, currentYear, hasWindow, peakLeft, peakWidth, currentProgress }: KeyPositionMaturityTimelineProps) {
  const peakEnd = Math.min(100, peakLeft + peakWidth);
  const rangeLabel = endYear ? String(endYear) : "—";

  return (
    <section className="key-position-maturity" aria-label={label}>
      <div className="key-position-maturity-heading"><span>{label}</span><strong>{rangeLabel}</strong></div>
      <div className={`key-position-maturity-track${hasWindow ? " has-window" : ""}`} role="img" aria-label={`${label}: ${startYear || "—"}–${endYear || "—"}. ${currentYearLabel}: ${currentYear}`}>
        {hasWindow ? <><span className="key-position-maturity-before" style={{ width: `${peakLeft}%` }} /><span className="key-position-maturity-peak" style={{ left: `${peakLeft}%`, width: `${peakWidth}%` }} /><span className="key-position-maturity-after" style={{ left: `${peakEnd}%` }} /></> : null}
        {hasWindow ? <span className="key-position-maturity-current" style={{ left: `${currentProgress}%` }} aria-hidden="true"><i>{currentYear}</i></span> : null}
      </div>
      <div className="key-position-maturity-years" aria-hidden="true">
        <span>{startYear || ""}</span><span>{peakEndYear || ""}</span><span>{endYear || ""}</span>
      </div>
    </section>
  );
}
