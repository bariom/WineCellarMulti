import { useEffect, useMemo, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import "./TimeSeriesChart.css";
import { useChartReveal } from "./chartMotion";

export type TimeSeriesPoint = {
  timestampMs: number;
  value: number;
  tone?: "default" | "ai" | "manual" | "imported" | "shared" | "purchase";
};

type TimeSeriesChartProps = {
  points: TimeSeriesPoint[];
  ariaLabel: string;
  locale: "it" | "en";
  currency?: string;
  height?: number;
  mobileHeight?: number;
};

function resolvedColor(host: HTMLElement, value: string, fallback: string) {
  const probe = document.createElement("span");
  probe.style.color = value;
  probe.style.display = "none";
  host.appendChild(probe);
  const color = getComputedStyle(probe).color || fallback;
  probe.remove();
  return color;
}

export default function TimeSeriesChart({ points, ariaLabel, locale, currency = "", height = 190, mobileHeight }: TimeSeriesChartProps) {
  const chartHostRef = useRef<HTMLDivElement | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(() => window.matchMedia("(max-width: 640px)").matches);
  const chartHeight = isMobileViewport && mobileHeight ? mobileHeight : height;
  // Callers often prepare chart points inline. Keep the chart mounted when that
  // creates a new array with the same values, otherwise uPlot is destroyed and
  // recreated on every parent render (a visible flash on the sales dashboard).
  const pointsKey = points.map((point) => `${point.timestampMs}:${point.value}:${point.tone || "default"}`).join("|");
  useChartReveal(chartHostRef, pointsKey);
  const chartPoints = useMemo(() => {
    const byTimestamp = new Map<number, TimeSeriesPoint>();
    points.forEach((point) => {
      const existing = byTimestamp.get(point.timestampMs);
      if (existing) {
        existing.value += point.value;
        return;
      }
      byTimestamp.set(point.timestampMs, { ...point });
    });
    return [...byTimestamp.values()].sort((first, second) => first.timestampMs - second.timestampMs);
  }, [pointsKey]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 640px)");
    const updateViewport = () => setIsMobileViewport(media.matches);
    updateViewport();
    media.addEventListener("change", updateViewport);
    return () => media.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    const chartHost = chartHostRef.current;
    if (!chartHost || !chartPoints.length) return;

    const styles = getComputedStyle(chartHost);
    const textColor = styles.getPropertyValue("--text-muted").trim() || "#66716b";
    const borderColor = styles.getPropertyValue("--border").trim() || "#d9d5c8";
    const lineColor = resolvedColor(chartHost, "var(--primary)", "#386d5a");
    const fillColor = resolvedColor(chartHost, "color-mix(in srgb, var(--primary) 12%, transparent)", "rgba(56, 109, 90, 0.12)");
    const surfaceColor = resolvedColor(chartHost, "var(--surface)", "#ffffff");
    const pointColors = {
      default: resolvedColor(chartHost, "var(--accent)", "#a88538"),
      ai: resolvedColor(chartHost, "var(--danger)", "#b54155"),
      manual: resolvedColor(chartHost, "var(--drink-ideal)", "#3f8d72"),
      imported: resolvedColor(chartHost, "var(--primary)", "#386d5a"),
      shared: resolvedColor(chartHost, "var(--accent)", "#a88538"),
      purchase: resolvedColor(chartHost, "var(--primary)", "#386d5a"),
    };
    const timestamps = chartPoints.map((point) => point.timestampMs / 1000);
    const values = chartPoints.map((point) => point.value);
    // uPlot can generate multiple intra-day ticks. Since the labels intentionally
    // show only day/month, use a compact subset of actual sale dates instead.
    const tickCount = Math.min(timestamps.length, 6);
    const xAxisSplits = Array.from({ length: tickCount }, (_, index) => {
      const pointIndex = tickCount === 1 ? 0 : Math.round((index * (timestamps.length - 1)) / (tickCount - 1));
      return timestamps[pointIndex];
    }).filter((timestamp, index, all) => index === 0 || timestamp !== all[index - 1]);
    const dateLocale = locale === "it" ? "it-CH" : "en-GB";
    const dateFormat = new Intl.DateTimeFormat(dateLocale, { day: "2-digit", month: "short" });
    const tooltipDateFormat = new Intl.DateTimeFormat(dateLocale, { day: "2-digit", month: "short", year: "numeric" });
    const valueFormat = new Intl.NumberFormat(dateLocale, { maximumFractionDigits: 0 });
    const splinePath = uPlot.paths.spline?.();
    const data: uPlot.AlignedData = [timestamps, values];
    const tooltip = document.createElement("div");
    tooltip.className = "time-series-tooltip";
    tooltip.setAttribute("role", "status");
    tooltip.setAttribute("aria-live", "polite");
    const tooltipDate = document.createElement("span");
    const tooltipValue = document.createElement("strong");
    tooltip.append(tooltipDate, tooltipValue);
    const options: uPlot.Options = {
      width: Math.floor(chartHost.clientWidth) || 520,
      height: chartHeight,
      padding: [12, 8, 2, 4],
      scales: { x: { time: true }, y: { auto: true } },
      axes: [
        {
          stroke: textColor,
          font: "600 10px system-ui, -apple-system, sans-serif",
          size: 30,
          gap: 7,
          splits: xAxisSplits,
          grid: { show: false },
          ticks: { stroke: borderColor, width: 1, size: 4 },
          values: (_chart, ticks) => ticks.map((value) => dateFormat.format(new Date(value * 1000))),
        },
        {
          side: 3,
          stroke: textColor,
          font: "600 10px system-ui, -apple-system, sans-serif",
          size: 52,
          gap: 7,
          grid: { stroke: borderColor, width: 1 },
          ticks: { stroke: borderColor, width: 1, size: 4 },
          values: (_chart, ticks) => ticks.map((value) => `${currency} ${valueFormat.format(value)}`.trim()),
        },
      ],
      series: [
        {},
        {
          label: ariaLabel,
          stroke: lineColor,
          fill: fillColor,
          width: 2.5,
          paths: splinePath,
          points: { show: false },
          value: (_chart, value) => value === null || value === undefined ? "—" : `${currency} ${valueFormat.format(Number(value))}`.trim(),
        },
      ],
      legend: { show: false },
      cursor: { show: true, drag: { x: false, y: false, setScale: false }, points: { size: 7 } },
      hooks: {
        init: [(chart) => chart.over.appendChild(tooltip)],
        setCursor: [
          (chart) => {
            const index = chart.cursor.idx;
            if (index === null || index === undefined || index < 0) {
              tooltip.classList.remove("visible");
              return;
            }
            tooltipDate.textContent = tooltipDateFormat.format(new Date(timestamps[index] * 1000));
            tooltipValue.textContent = `${currency} ${valueFormat.format(values[index])}`.trim();
            const left = chart.valToPos(timestamps[index], "x");
            const top = chart.valToPos(values[index], "y");
            tooltip.style.left = `${Math.max(48, Math.min(chart.over.clientWidth - 48, left))}px`;
            tooltip.style.top = `${Math.max(34, top)}px`;
            tooltip.classList.add("visible");
          },
        ],
        draw: [
          (chart) => {
            const ratio = window.devicePixelRatio || 1;
            const context = chart.ctx;
            context.save();
            chartPoints.forEach((point, index) => {
              const x = chart.valToPos(timestamps[index], "x", true);
              const y = chart.valToPos(point.value, "y", true);
              const color = pointColors[point.tone || "default"];
              context.beginPath();
              context.arc(x, y, 4.6 * ratio, 0, Math.PI * 2);
              context.fillStyle = surfaceColor;
              context.fill();
              context.lineWidth = 1.5 * ratio;
              context.strokeStyle = color;
              context.stroke();
              context.beginPath();
              context.arc(x, y, 2.2 * ratio, 0, Math.PI * 2);
              context.fillStyle = color;
              context.fill();
            });
            context.restore();
          },
        ],
      },
    };

    const chart = new uPlot(options, data, chartHost);
    let keyboardIndex = chartPoints.length - 1;
    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      keyboardIndex = Math.max(0, Math.min(chartPoints.length - 1, keyboardIndex + (event.key === "ArrowRight" ? 1 : -1)));
      chart.setCursor({
        left: chart.valToPos(timestamps[keyboardIndex], "x"),
        top: chart.valToPos(values[keyboardIndex], "y"),
      });
    };
    chartHost.addEventListener("keydown", handleKeyboard);
    let resizeFrame = 0;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.floor(entry.contentRect.width);
      if (!width || width === chart.width) return;
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => chart.setSize({ width, height: chartHeight }));
    });
    observer.observe(chartHost);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(resizeFrame);
      chartHost.removeEventListener("keydown", handleKeyboard);
      chart.destroy();
    };
  }, [ariaLabel, chartHeight, chartPoints, currency, locale, pointsKey]);

  return <div className="time-series-chart" ref={chartHostRef} role="img" aria-label={`${ariaLabel}. ${locale === "it" ? "Usa le frecce sinistra e destra per esplorare i valori." : "Use the left and right arrow keys to explore values."}`} tabIndex={0} />;
}
