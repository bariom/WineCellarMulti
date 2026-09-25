import type { Locale, Wine } from "../types";
import { formatBottleCount, isWinePhysicallyInCellar } from "../domain/cellar";
import { AppIcon, type AppIconName } from "./AppIcon";
import { formatMoney } from "./panelSupport";

/** Counts and valuations use the same stock and currency rules as CollectorOverview. */
export function CellarHomeStats({ wines, readyCount, locale, currentYear }: {
  wines: Wine[]; readyCount: number; locale: Locale; currentYear: number;
}) {
  const it = locale === "it";
  const stock = wines.filter(wine => wine.quantity > 0);
  const totals = new Map<string, number>();
  let priced = 0;
  for (const wine of stock) {
    const current = Number(wine.current_value);
    const purchase = Number(wine.price);
    const value = Number.isFinite(current) && current > 0 ? current : Number.isFinite(purchase) && purchase > 0 ? purchase : 0;
    if (value) {
      priced++;
      totals.set(wine.currency, (totals.get(wine.currency) || 0) + value * wine.quantity);
    }
  }
  const monitoring = stock.filter(wine => isWinePhysicallyInCellar(wine)
    && wine.drink_from && wine.drink_to && wine.drink_from <= wine.drink_to && wine.drink_to <= currentYear).length;
  function metric(icon: AppIconName, label: string, values: string[], note: string) {
    return <article className="cellar-home-stat" aria-label={label}>
      <AppIcon name={icon} detailLevel="compact" />
      <h3>{label}</h3>
      <div className="cellar-home-stat-values">{values.map(value => <strong key={value}>{value}</strong>)}</div>
      <p>{note}</p>
    </article>;
  }
  return <div className="cellar-home-intro">
    <section className="cellar-home-stats" aria-label={it ? "Riepilogo cantina" : "Cellar summary"} tabIndex={0}>
      {metric("chart", it ? "Valore cantina" : "Cellar value",
        totals.size ? [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([currency, value]) => formatMoney(value, currency, locale)) : ["—"],
        it ? `Valori disponibili · ${priced}/${stock.length} vini` : `Available values · ${priced}/${stock.length} wines`)}
      {metric("tasting", it ? "Pronti da bere" : "Ready to drink", [String(readyCount)], it ? "Vini disponibili in cantina" : "Available wines in your cellar")}
      {metric("bell", it ? "Da monitorare" : "To review", [String(monitoring)], it ? "Vini a fine finestra o oltre" : "Wines at or past their window")}
    </section>
  </div>;
}

export function CellarHomeHero({ wines, locale }: { wines: Wine[]; locale: Locale }) {
  const it = locale === "it";
  const bottles = wines.reduce((sum, wine) => sum + wine.quantity, 0);
  return <section className="cellar-home-hero" aria-label={it ? "La mia cantina" : "My cellar"}>
    <p className="cellar-home-kicker">{it ? "Una collezione, una passione." : "A collection. A passion."}</p>
    <h2>{it ? "La mia cantina" : "My cellar"}</h2>
    <p className="cellar-home-count">{formatBottleCount(bottles, locale)} {it ? (bottles === 1 ? "bottiglia" : "bottiglie") : (bottles === 1 ? "bottle" : "bottles")} · {wines.length} {it ? (wines.length === 1 ? "vino" : "vini") : (wines.length === 1 ? "wine" : "wines")}</p>
  </section>;
}
