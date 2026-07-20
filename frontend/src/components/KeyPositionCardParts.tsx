type KeyPositionKpiTone = "value" | "total" | "neutral" | "positive" | "negative";

export function KeyPositionKpi({ label, value, tone }: { label: string; value: string; tone: KeyPositionKpiTone }) {
  return (
    <div className={`key-position-metric key-position-metric--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
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
  rangeLabel: string;
  currentYearLabel: string;
  currentYear: number;
  hasWindow: boolean;
  peakLeft: number;
  peakWidth: number;
  currentProgress: number;
};

export function KeyPositionMaturityTimeline({
  label,
  rangeLabel,
  currentYearLabel,
  currentYear,
  hasWindow,
  peakLeft,
  peakWidth,
  currentProgress,
}: KeyPositionMaturityTimelineProps) {
  const peakEnd = Math.min(100, peakLeft + peakWidth);

  return (
    <section className="key-position-maturity" aria-label={label}>
      <div className="key-position-maturity-heading">
        <span>{label}</span>
        <strong>{rangeLabel}</strong>
      </div>
      <div
        className={`key-position-maturity-track${hasWindow ? " has-window" : ""}`}
        role="img"
        aria-label={`${label}: ${rangeLabel}. ${currentYearLabel}: ${currentYear}`}
      >
        {peakWidth ? (
          <>
            <span className="key-position-maturity-before" style={{ width: `${peakLeft}%` }} />
            <span className="key-position-maturity-peak" style={{ left: `${peakLeft}%`, width: `${peakWidth}%` }} />
            <span className="key-position-maturity-after" style={{ left: `${peakEnd}%` }} />
          </>
        ) : null}
        {hasWindow ? (
          <span
            className="key-position-maturity-current"
            style={{ left: `${currentProgress}%` }}
            title={`${currentYearLabel}: ${currentYear}`}
            aria-hidden="true"
          />
        ) : null}
      </div>
    </section>
  );
}
