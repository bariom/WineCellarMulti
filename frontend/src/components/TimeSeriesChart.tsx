import { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import "./TimeSeriesChart.css";

export type TimeSeriesPoint = {
  timestampMs: number;
  value: number;
  tone?: "default" | "ai" | "manual" | "imported" | "shared";
};

type TimeSeriesChartProps = {
  points: TimeSeriesPoint[];
  ariaLabel: string;
  locale: "it" | "en";
  currency?: string;
  height?: number;
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

export default function TimeSeriesChart({ points, ariaLabel, locale, currency = "", height = 190 }: TimeSeriesChartProps) {
  const chartHostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const chartHost = chartHostRef.current;
    if (!chartHost || !points.length) return;

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
    };
    const timestamps = points.map((point) => point.timestampMs / 1000);
    const values = points.map((point) => point.value);
    const dateLocale = locale === "it" ? "it-CH" : "en-GB";
    const dateFormat = new Intl.DateTimeFormat(dateLocale, { day: "2-digit", month: "short" });
    const valueFormat = new Intl.NumberFormat(dateLocale, { maximumFractionDigits: 0 });
    const splinePath = uPlot.paths.spline?.();
    const data: uPlot.AlignedData = [timestamps, values];
    const options: uPlot.Options = {
      width: Math.floor(chartHost.clientWidth) || 520,
      height,
      padding: [12, 8, 2, 4],
      scales: { x: { time: true }, y: { auto: true } },
      axes: [
        {
          stroke: textColor,
          font: "600 10px system-ui, -apple-system, sans-serif",
          size: 30,
          gap: 7,
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
      cursor: { show: false, drag: { x: false, y: false, setScale: false } },
      hooks: {
        draw: [
          (chart) => {
            const ratio = window.devicePixelRatio || 1;
            const context = chart.ctx;
            context.save();
            points.forEach((point, index) => {
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
    let resizeFrame = 0;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.floor(entry.contentRect.width);
      if (!width || width === chart.width) return;
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => chart.setSize({ width, height }));
    });
    observer.observe(chartHost);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(resizeFrame);
      chart.destroy();
    };
  }, [ariaLabel, currency, height, locale, points]);

  return <div className="time-series-chart" ref={chartHostRef} role="img" aria-label={ariaLabel} />;
}
