import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../services/api";
import type { TastingArchivePage, Wine } from "../types";

// The provider is keyed by account/household. Requests are shared only within
// that mounted dashboard, including widgets added in the editor.
const Resources = createContext<(url: string) => Promise<unknown>>(() => Promise.reject(new Error("Missing dashboard provider")));
export function DashboardSummaryData({ children }: { children: ReactNode }) {
  const mounted = useRef(false);
  const resources = useMemo(() => new Map<string, { promise: Promise<unknown>; controller: AbortController }>(), []);
  const load = useMemo(() => (url: string): Promise<unknown> => {
    const cached = resources.get(url);
    if (cached) return cached.promise;
    const controller = new AbortController();
    const promise = (async () => {
      const first = await api<unknown>(url, { signal: controller.signal });
      if (!url.includes("/tasting-archive?")) return first;
      const result = first as TastingArchivePage;
      const items = [...result.items];
      while (items.length < result.total) {
        const nextUrl = new URL(url, location.origin);
        nextUrl.searchParams.set("offset", String(items.length));
        const next = await api<TastingArchivePage>(nextUrl.pathname + nextUrl.search, { signal: controller.signal });
        if (!next.items.length) throw new Error("Incomplete tasting archive");
        items.push(...next.items);
      }
      return { ...result, items };
    })().catch(error => { if (resources.get(url)?.controller === controller) resources.delete(url); throw error; });
    resources.set(url, { promise, controller });
    return promise;
  }, [resources]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // StrictMode immediately reconnects effects. Only a real unmount should
      // abort the shared requests; otherwise every widget fetches twice in dev.
      queueMicrotask(() => {
        if (!mounted.current) { resources.forEach(({ controller }) => controller.abort()); resources.clear(); }
      });
    };
  }, [resources]);
  return <Resources.Provider value={load}>{children}</Resources.Provider>;
}

export function useDashboardResource<T>(url: string | null) {
  const load = useContext(Resources);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ url: string | null; data?: T; error?: boolean }>({ url: null });
  useEffect(() => {
    let active = true;
    setState({ url });
    if (url) load(url).then(data => { if (active) setState({ url, data: data as T }); }).catch(() => { if (active) setState({ url, error: true }); });
    return () => { active = false; };
  }, [url, load, attempt]);
  return { data: state.url === url ? state.data : undefined, error: state.url === url && state.error, retry: () => setAttempt(value => value + 1) };
}

export type SummarySlice = { label: string; value: number };
export const summaryPalette = ["#426b5a", "#ac7841", "#8b405a", "#65889b", "#a29367", "#7e7294"];
export function sumBottles(wines: Wine[]) { return wines.reduce((sum, wine) => sum + Math.max(0, wine.quantity), 0); }
export function recordedValue(wine: Wine) {
  const current = Number(wine.current_value);
  return Number.isFinite(current) && current > 0 ? current : Math.max(0, Number(wine.price) || 0);
}
export function groupSummary(wines: Wine[], key: (wine: Wine) => string, value: (wine: Wine) => number = wine => wine.quantity): SummarySlice[] {
  const groups = new Map<string, number>();
  for (const wine of wines) { const label = key(wine); groups.set(label, (groups.get(label) || 0) + value(wine)); }
  return [...groups].map(([label, value]) => ({ label, value })).filter(item => item.value > 0).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}
export function topSummary(items: SummarySlice[], other: string, limit = 5) {
  if (items.length <= limit) return items;
  const selected = items.slice(0, limit).map(item => ({ ...item }));
  const remainder = items.slice(limit).reduce((sum, item) => sum + item.value, 0);
  const existing = selected.find(item => item.label === other);
  if (existing) existing.value += remainder;
  else selected.push({ label: other, value: remainder });
  return selected;
}
export function validWindow(wine: Wine) { return Boolean(wine.drink_from && wine.drink_to && wine.drink_from <= wine.drink_to); }
export function historyChange(wine: Wine) {
  const points = wine.value_history.filter(point => point.currency === wine.currency && Number(point.value) > 0 && Number.isFinite(Date.parse(point.recorded_at))).sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at));
  if (points.length < 2) return null;
  return { points, percent: (Number(points[points.length - 1].value) / Number(points[0].value) - 1) * 100 };
}
