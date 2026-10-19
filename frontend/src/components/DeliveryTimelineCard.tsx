import { AppIcon } from "./AppIcon";
import { formatDisplayDate, wineTone } from "./panelSupport";
import type { Locale, Wine } from "../types";

/**
 * The delivery timeline card of the Timeline view: missed deliveries first,
 * then the future ones on a time axis. Loaded on demand with that view.
 */
export default function DeliveryTimelineCard({ locale, t, timelineItems, missedItems, onOpenWine }: {
  locale: Locale;
  t: (key: any) => string;
  timelineItems: Array<{ wine: Wine; days: number; dateMs: number }>;
  missedItems: Array<{ wine: Wine; daysLate: number }>;
  onOpenWine: (wine: Wine) => void;
}) {
  const first = timelineItems[0] || null;
  const last = timelineItems[timelineItems.length - 1] || null;
  const start = first?.dateMs || Date.now();
  const range = Math.max((last?.dateMs || start + 365 * 86400000) - start, 1);
  return (
    <article className="dashboard-card wide-card timeline-card">
      <div className="card-heading">
        <div>
          <span>{t("futureDeliveries")}</span>
          <h2>{t("timeline")}</h2>
        </div>
        {first && last ? (
          <strong>{formatDisplayDate(first.wine.expected_delivery)} - {formatDisplayDate(last.wine.expected_delivery)}</strong>
        ) : null}
      </div>
      {missedItems.length ? (
        <section className="delivery-missed" aria-label={t("missedDeliveries")}>
          <h3><AppIcon name="status-shipped" />{t("missedDeliveries")} <span>{missedItems.length}</span></h3>
          <div className="delivery-events">
            {missedItems.map(({ wine, daysLate }) => (
              <button type="button" className="delivery-event is-missed" key={wine.id} onClick={() => onOpenWine(wine)}>
                <span className="delivery-date">{formatDisplayDate(wine.expected_delivery)}</span>
                <span className="delivery-identity">
                  <span className="delivery-name"><i className={`wine-dot tone-${wineTone(wine.type)}`} />{[wine.name, wine.vintage].filter(Boolean).join(" · ")}</span>
                  <span className="delivery-date" style={{ fontSize: "0.76rem" }}>{[wine.producer || t("noProducer"), wine.merchant].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="delivery-missed-badge">
                  <b>{t("missedDelivery")}</b>
                  <small>{locale === "it" ? `${daysLate} g di ritardo` : `${daysLate}d late`}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {first && last ? (
        <div className="delivery-timeline">
          <div className="delivery-axis">
            <span>{formatDisplayDate(first.wine.expected_delivery)}</span>
            <span>{formatDisplayDate(last.wine.expected_delivery)}</span>
          </div>
          <div className="delivery-track" aria-hidden="true">
            {timelineItems.map(({ wine, dateMs }) => (
              <span
                className={`delivery-marker tone-${wineTone(wine.type)}`}
                key={wine.id}
                style={{ left: `${Math.min(Math.max(((dateMs - start) / range) * 100, 0), 100)}%` }}
              />
            ))}
          </div>
          <div className="delivery-events">
            {timelineItems.map(({ wine, days, dateMs }) => (
              <button type="button" className="delivery-event" key={wine.id} onClick={() => onOpenWine(wine)}>
                <span className="delivery-date">{formatDisplayDate(wine.expected_delivery)}</span>
                <span className="delivery-identity">
                  <span className="delivery-name"><i className={`wine-dot tone-${wineTone(wine.type)}`} />{[wine.name, wine.vintage].filter(Boolean).join(" · ")}</span>
                  <span className="delivery-date" style={{ fontSize: "0.76rem" }}>{wine.producer || t("noProducer")}</span>
                </span>
                <strong>{days}d</strong>
                <span className="delivery-event-position" style={{ left: `${Math.min(Math.max(((dateMs - start) / range) * 100, 0), 100)}%` }} />
              </button>
            ))}
          </div>
        </div>
      ) : missedItems.length ? null : (
        <p className="empty-state">{t("noActionItems")}</p>
      )}
    </article>
  );
}
