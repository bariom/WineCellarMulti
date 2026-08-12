import { useEffect, useMemo, useState } from "react";
import { displayValue } from "../i18n";
import { api } from "../services/api";
import "./PublicRestaurantWineList.css";

type PublicWine = { name: string; producer: string; vintage: string; type: string; region: string; appellation: string; format: string; currency: string; sale_price: number | null; glass_price: number | null; pour_size_ml: number | null };
type PublicWineList = { restaurant_name: string; wines: PublicWine[] };
type Language = "it" | "en";

const labels = {
  it: { wineList: "Carta vini", bottles: "Bottiglia", byGlass: "Al calice", empty: "La carta è in aggiornamento.", print: "Stampa / PDF", language: "English", uncategorized: "Selezione" },
  en: { wineList: "Wine list", bottles: "Bottle", byGlass: "By the glass", empty: "The wine list is being updated.", print: "Print / PDF", language: "Italiano", uncategorized: "Selection" },
};

function money(value: number, currency: string, language: Language) {
  return new Intl.NumberFormat(language === "it" ? "it-CH" : "en-CH", { style: "currency", currency: currency || "CHF", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
}

export function PublicRestaurantWineList({ token }: { token: string }) {
  const [language, setLanguage] = useState<Language>(new URLSearchParams(window.location.search).get("lang") === "en" ? "en" : "it");
  const [list, setList] = useState<PublicWineList | null>(null);
  const [error, setError] = useState(false);
  const copy = labels[language];
  useEffect(() => { api<PublicWineList>(`/api/v1/restaurant-public-wine-list/${encodeURIComponent(token)}`).then(setList).catch(() => setError(true)); }, [token]);
  const groups = useMemo(() => {
    const grouped = new Map<string, PublicWine[]>();
    list?.wines.forEach((wine) => { const name = wine.type?.trim() || copy.uncategorized; grouped.set(name, [...(grouped.get(name) || []), wine]); });
    return [...grouped.entries()];
  }, [list, copy.uncategorized]);
  if (error) return <main className="public-wine-list public-wine-list--empty"><h1>{copy.wineList}</h1><p>{copy.empty}</p></main>;
  return <main className="public-wine-list"><header><p>Vinaris</p><h1>{list?.restaurant_name || copy.wineList}</h1><span>{copy.wineList}</span><div className="public-wine-list-actions"><button type="button" onClick={() => setLanguage(language === "it" ? "en" : "it")}>{copy.language}</button><button type="button" onClick={() => window.print()}>{copy.print}</button></div></header>{!list ? <p className="public-wine-list-loading">…</p> : groups.length ? <div className="public-wine-list-groups">{groups.map(([type, wines]) => <section key={type}><h2>{displayValue(type, language, "type")}</h2><div>{wines.map((wine, index) => <article key={`${wine.name}-${wine.producer}-${wine.vintage}-${index}`}><div><h3>{wine.name}{wine.vintage ? ` ${wine.vintage}` : ""}</h3><p>{[wine.producer, wine.appellation || wine.region, wine.format].filter(Boolean).join(" · ")}</p></div><dl>{wine.glass_price !== null ? <div><dt>{wine.pour_size_ml ? `${copy.byGlass} · ${wine.pour_size_ml} ml` : copy.byGlass}</dt><dd>{money(wine.glass_price, wine.currency, language)}</dd></div> : null}{wine.sale_price !== null ? <div><dt>{copy.bottles}</dt><dd>{money(wine.sale_price, wine.currency, language)}</dd></div> : null}</dl></article>)}</div></section>)}</div> : <p className="public-wine-list-loading">{copy.empty}</p>}</main>;
}
