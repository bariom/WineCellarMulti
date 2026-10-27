import { useId, useRef } from "react";
import { useChartReveal } from "./chartMotion";

/** Line icons for the cellar figures on the dashboard. */
export function dashboardStatSvgIcon(kind: "mine" | "shared" | "total" | "drink_now" | "drink_soon" | "past_window" | "future_deliveries" | "to_collect" | "missing_data") {
  if (kind === "mine") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10 3h4" />
        <path d="M11 3v4l-3.5 5.2A4.5 4.5 0 0 0 7 14.7V18a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3v-3.3a4.5 4.5 0 0 0-.5-2.5L13 7V3" />
        <path d="M8.5 13h7" />
      </svg>
    );
  }
  if (kind === "shared") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="8" cy="8" r="3" />
        <circle cx="16" cy="9" r="3" />
        <path d="M3.5 19a4.5 4.5 0 0 1 9 0" />
        <path d="M11.5 19a4.5 4.5 0 0 1 9 0" />
      </svg>
    );
  }
  if (kind === "drink_now") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 4h12" />
        <path d="M8 4v5a4 4 0 0 0 8 0V4" />
        <path d="M12 13v7" />
        <path d="M9 20h6" />
        <circle cx="18" cy="6" r="2.5" />
      </svg>
    );
  }
  if (kind === "drink_soon") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v5l3 2" />
      </svg>
    );
  }
  if (kind === "past_window") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 4v8" />
        <path d="M12 16h.01" />
        <path d="M10.3 4.8 4.9 14.2A2 2 0 0 0 6.7 17h10.6a2 2 0 0 0 1.8-2.8l-5.4-9.4a2 2 0 0 0-3.4 0Z" />
      </svg>
    );
  }
  if (kind === "future_deliveries") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 7h11v8H3z" />
        <path d="M14 10h3l3 3v2h-6z" />
        <circle cx="7" cy="17" r="2" />
        <circle cx="17" cy="17" r="2" />
      </svg>
    );
  }
  if (kind === "to_collect") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 7h12v9H4z" />
        <path d="M16 10h2.5l1.5 2v4H16z" />
        <path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h1A1.5 1.5 0 0 1 12 5.5V7" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    );
  }
  if (kind === "missing_data") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 6h10" />
        <path d="M8 12h10" />
        <path d="M8 18h10" />
        <path d="M4 6h.01" />
        <path d="M4 12h.01" />
        <path d="M4 18h.01" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M6 7V5.5A1.5 1.5 0 0 1 7.5 4h9A1.5 1.5 0 0 1 18 5.5V7" />
      <path d="M5 7v10.5A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5V7" />
      <path d="M9 12h6" />
      <path d="M12 9v6" />
    </svg>
  );
}

/** A small area chart of the cellar value over time; nothing until there are two points. */
export function PortfolioValueSparkline({ points, label }: { points: Array<{ recorded_at: string; value: string }>; label: string }) {
  const chartRef = useRef<SVGSVGElement | null>(null);
  // The history arrives asynchronously. Re-run the reveal once the SVG is
  // actually rendered, otherwise its animated paths can remain transparent.
  const pointsKey = points.map((point) => `${point.recorded_at}:${point.value}`).join("|");
  useChartReveal(chartRef, pointsKey);
  const gradientId = `portfolio-value-area-${useId().replace(/:/g, "")}`;
  const values = points.map((point) => Number(point.value)).filter(Number.isFinite);
  if (values.length < 2) return null;
  const minimum = Math.min(...values);
  const range = Math.max(Math.max(...values) - minimum, 1);
  const coordinates = values.map((value, index) => ({
    x: (index / (values.length - 1)) * 100,
    y: 29 - ((value - minimum) / range) * 25,
  }));
  const path = coordinates.map(({ x, y }, index) => `${index ? "L" : "M"}${x} ${y}`).join(" ");
  const areaPath = `${path} L100 32 L0 32 Z`;
  const latest = coordinates[coordinates.length - 1];
  return (
    <svg className="portfolio-value-sparkline" ref={chartRef} viewBox="0 0 100 32" role="img" aria-label={label}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="var(--primary)" stopOpacity="0.3" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0.04" />
        </linearGradient>
      </defs>
      <path className="portfolio-value-area" d={areaPath} fill={`url(#${gradientId})`} />
      <path className="portfolio-value-line" d={path} />
      <circle className="portfolio-value-latest" cx={latest.x} cy={latest.y} r="1.8" />
    </svg>
  );
}
