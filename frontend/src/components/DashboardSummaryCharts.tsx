import { useId } from "react";
import { summaryPalette, type SummarySlice } from "./dashboardSummaryData";

export function SummaryBars({ items, format, onSelect, columns = false }: { items: SummarySlice[]; format: (value: number) => string; onSelect?: (label: string) => void; columns?: boolean }) {
  const max = Math.max(1, ...items.map(item => item.value));
  return <div className={columns ? "summary-columns" : "summary-bars"} role="list">{items.map((item, index) => {
    const content = <><span>{item.label}</span><i aria-hidden="true"><b style={{ [columns ? "height" : "width"]: `${item.value / max * 100}%`, background: summaryPalette[index % summaryPalette.length] }} /></i><strong>{format(item.value)}</strong></>;
    return onSelect ? <button type="button" key={item.label} onClick={() => onSelect(item.label)}>{content}</button> : <div role="listitem" key={item.label}>{content}</div>;
  })}</div>;
}

export function SummaryRing({ items, label, format }: { items: SummarySlice[]; label: string; format: (value: number) => string }) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  let offset = 0;
  return <div className="summary-ring-layout"><svg viewBox="0 0 180 180" role="img" aria-label={`${label}: ${items.map(item => `${item.label} ${format(item.value)}`).join(", ")}`}>
    <circle cx="90" cy="90" r="65" fill="none" stroke="var(--border)" strokeWidth="20" />
    {items.map((item, index) => { const share = total ? item.value / total * 100 : 0; const start = offset; offset += share; return <circle key={item.label} cx="90" cy="90" r="65" fill="none" pathLength="100" stroke={summaryPalette[index % summaryPalette.length]} strokeWidth="20" strokeDasharray={`${share} ${100 - share}`} strokeDashoffset={-start} transform="rotate(-90 90 90)" />; })}
    <text x="90" y="92" textAnchor="middle" className="summary-svg-number">{format(total)}</text><text x="90" y="114" textAnchor="middle">{label}</text>
  </svg><ul className="summary-legend">{items.map((item, index) => <li key={item.label}><i style={{ background: summaryPalette[index % summaryPalette.length] }} /><span>{item.label}</span><strong>{format(item.value)}</strong></li>)}</ul></div>;
}

export function SummaryRadar({ items, label }: { items: SummarySlice[]; label: string }) {
  const titleId = useId();
  const point = (index: number, radius: number) => { const angle = -Math.PI / 2 + index * Math.PI * 2 / items.length; return [160 + Math.cos(angle) * radius, 125 + Math.sin(angle) * radius]; };
  return <svg className="summary-radar" viewBox="0 0 320 255" role="img" aria-labelledby={titleId}>
    <title id={titleId}>{label}: {items.map(item => `${item.label} ${Math.round(item.value)} / 100`).join(", ")}</title>
    {[.25, .5, .75, 1].map(ratio => <polygon key={ratio} points={items.map((_, index) => point(index, ratio * 78).join(",")).join(" ")} fill="none" stroke="var(--border)" strokeDasharray={ratio === .5 ? "3 3" : undefined} />)}
    {items.map((item, index) => { const [x, y] = point(index, 105); return <g key={item.label}><line x1="160" y1="125" x2={point(index, 78)[0]} y2={point(index, 78)[1]} stroke="var(--border)" /><text x={x} y={y} textAnchor={x < 145 ? "end" : x > 175 ? "start" : "middle"} dominantBaseline="middle">{item.label}</text></g>; })}
    <polygon points={items.map((item, index) => point(index, Math.max(0, Math.min(100, item.value)) * .78).join(",")).join(" ")} fill="#426b5a33" stroke="#426b5a" strokeWidth="2.5" />
    {items.map((item, index) => <circle key={item.label} cx={point(index, item.value * .78)[0]} cy={point(index, item.value * .78)[1]} r="3" fill="#426b5a" />)}
  </svg>;
}

export function SummaryMosaic({ items, format }: { items: SummarySlice[]; format: (value: number) => string }) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  type Tile = SummarySlice & { x: number; y: number; width: number; height: number };
  // Six slices at most: recursively partition the longer edge by value so
  // rectangle areas remain proportional even when holdings are very unequal.
  function partition(values: SummarySlice[], x: number, y: number, width: number, height: number): Tile[] {
    if (values.length <= 1) return values.map(item => ({ ...item, x, y, width, height }));
    const sum = values.reduce((value, item) => value + item.value, 0);
    let split = 1, weight = values[0].value;
    while (split < values.length - 1 && weight + values[split].value <= sum / 2) weight += values[split++].value;
    const ratio = weight / sum;
    return width >= height
      ? [...partition(values.slice(0, split), x, y, width * ratio, height), ...partition(values.slice(split), x + width * ratio, y, width * (1 - ratio), height)]
      : [...partition(values.slice(0, split), x, y, width, height * ratio), ...partition(values.slice(split), x, y + height * ratio, width, height * (1 - ratio))];
  }
  const tiles = partition(items, 0, 0, 400, 190);
  return <div className="summary-mosaic"><svg viewBox="0 0 400 190" role="img" aria-label={items.map(item => `${item.label}: ${format(item.value)}`).join(", ")}>
    {tiles.map((tile, index) => <g key={tile.label}><rect x={tile.x} y={tile.y} width={tile.width} height={tile.height} fill={summaryPalette[index % summaryPalette.length]} stroke="var(--surface)" strokeWidth="2" /><title>{tile.label}: {format(tile.value)}</title>{tile.width > 80 && tile.height > 30 && <text x={tile.x + 10} y={tile.y + 22}>{Math.round(tile.value / total * 100)}%</text>}</g>)}
  </svg><ul className="summary-legend">{items.map((item, index) => <li key={item.label}><i style={{ background: summaryPalette[index % summaryPalette.length] }} /><span>{item.label}</span><strong>{format(item.value)}</strong></li>)}</ul></div>;
}
