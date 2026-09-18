import type { Wine } from "../types";

// Use the same comparison for selection and its explanation. Gift prices below
// one currency unit are not meaningful investment baselines.
export function featuredValue(wine: Wine) {
  const positive = (value: unknown) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
  const history = wine.value_history
    .filter(entry => entry.currency === wine.currency)
    .map(entry => ({ value: positive(entry.value), timestamp: Date.parse(entry.recorded_at) }))
    .filter((entry): entry is { value: number; timestamp: number } => entry.value !== null && Number.isFinite(entry.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);
  const purchase = positive(wine.price);
  const fromPurchase = purchase !== null && purchase >= 1;
  const baseline = fromPurchase ? purchase : history[0]?.value ?? null;
  const latest = history[history.length - 1];
  const currentEstimate = positive(wine.current_value);
  const current = currentEstimate ?? latest?.value ?? null;
  const baselineTimestamp = fromPurchase ? Date.parse(wine.order_date || "") : history[0]?.timestamp;
  const estimatedAt = Date.parse(wine.ai_value_estimated_at || "");
  const currentTimestamp = Number.isFinite(estimatedAt) && currentEstimate !== null
    ? estimatedAt : latest?.value === current ? latest?.timestamp : undefined;
  const points = baseline !== null && Number.isFinite(baselineTimestamp) && currentTimestamp !== undefined && currentTimestamp > baselineTimestamp!
    ? [{ value: baseline, timestamp: baselineTimestamp! },
      ...history.filter(point => point.timestamp > baselineTimestamp! && point.timestamp < currentTimestamp),
      { value: current!, timestamp: currentTimestamp }]
    : [];
  return { baseline, current, fromPurchase, baselineTimestamp, currentTimestamp, points,
    changePct: baseline !== null && current !== null ? (current - baseline) / baseline * 100 : null };
}
