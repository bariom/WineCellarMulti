import type { Locale } from "../types";

export const valuationMarkets: Array<[string, string, string]> = [
  ["CH", "Svizzera", "Switzerland"], ["IT", "Italia", "Italy"],
  ["DE", "Germania", "Germany"], ["US", "Stati Uniti", "United States"],
  ["AT", "Austria", "Austria"], ["BE", "Belgio", "Belgium"],
  ["FR", "Francia", "France"], ["ES", "Spagna", "Spain"],
  ["PT", "Portogallo", "Portugal"], ["GB", "Regno Unito", "United Kingdom"],
  ["IE", "Irlanda", "Ireland"], ["NL", "Paesi Bassi", "Netherlands"],
  ["LU", "Lussemburgo", "Luxembourg"], ["DK", "Danimarca", "Denmark"],
  ["SE", "Svezia", "Sweden"], ["NO", "Norvegia", "Norway"],
  ["FI", "Finlandia", "Finland"], ["PL", "Polonia", "Poland"],
  ["CZ", "Cechia", "Czechia"], ["GR", "Grecia", "Greece"],
  ["HU", "Ungheria", "Hungary"], ["RO", "Romania", "Romania"],
  ["HR", "Croazia", "Croatia"], ["SI", "Slovenia", "Slovenia"],
  ["CA", "Canada", "Canada"], ["AU", "Australia", "Australia"],
  ["NZ", "Nuova Zelanda", "New Zealand"], ["JP", "Giappone", "Japan"],
  ["SG", "Singapore", "Singapore"], ["HK", "Hong Kong", "Hong Kong"],
  ["CN", "Cina", "China"], ["BR", "Brasile", "Brazil"],
  ["ZA", "Sudafrica", "South Africa"], ["AR", "Argentina", "Argentina"],
  ["CL", "Cile", "Chile"], ["AE", "Emirati Arabi Uniti", "United Arab Emirates"],
];

export function valuationMarketLabel(country: string, locale: Locale): string {
  return valuationMarkets.find(([code]) => code === country)?.[locale === "it" ? 1 : 2] || country;
}

export function sourceMatchesMarket(sourceCountry: string, country: string): boolean {
  const normalize = (value: string) => value.trim().toLowerCase();
  const market = valuationMarkets.find(([code]) => code === country);
  const aliases: Record<string, string[]> = {
    CH: ["schweiz", "suisse", "swiss"], DE: ["deutschland"],
    US: ["usa", "united states of america"], GB: ["uk", "great britain"],
  };
  return [...(market || []), ...(aliases[country] || [])].some(value => normalize(value) === normalize(sourceCountry));
}
