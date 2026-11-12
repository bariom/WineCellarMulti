import type { Locale } from "../types";

/**
 * Countries and wine regions are free text, written in whatever language the catalog,
 * the admin, a cellar or the AI used ("Toscana", "Tuscany", "Italia", "Italy"). They are
 * recognised here and shown in the reader's language; names not recognised are shown as
 * written. Appellations and localities are proper names and are never translated.
 */

/** Lowercase, without accents, apostrophes or punctuation, single-spaced. */
export function normalizePlace(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’'`´]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Wine regions whose name differs between Italian and English, with the other names
// they are commonly written with (local, French, German, Spanish). Regions with the same
// name everywhere (Bordeaux, Champagne, Veneto, Rioja, Napa Valley…) need no entry.
const REGIONS: Array<{ it: string; en: string; aliases?: string[] }> = [
  // Italy
  { it: "Piemonte", en: "Piedmont", aliases: ["Piemont"] },
  { it: "Lombardia", en: "Lombardy", aliases: ["Lombardei", "Lombardie"] },
  { it: "Toscana", en: "Tuscany", aliases: ["Toskana", "Toscane"] },
  { it: "Sicilia", en: "Sicily", aliases: ["Sizilien", "Sicile"] },
  { it: "Sardegna", en: "Sardinia", aliases: ["Sardinien", "Sardaigne", "Cerdena"] },
  { it: "Puglia", en: "Apulia", aliases: ["Apulien", "Pouilles"] },
  { it: "Valle d'Aosta", en: "Aosta Valley", aliases: ["Vallee d Aoste", "Aostatal"] },
  { it: "Lazio", en: "Lazio", aliases: ["Latium"] },
  { it: "Trentino-Alto Adige", en: "Trentino-South Tyrol", aliases: ["Trentino Alto Adige", "Trentino-Südtirol"] },
  { it: "Alto Adige", en: "South Tyrol", aliases: ["Südtirol", "Sudtirol"] },
  { it: "Friuli-Venezia Giulia", en: "Friuli-Venezia Giulia", aliases: ["Friuli Venezia Giulia", "Friuli"] },
  { it: "Marche", en: "Marche", aliases: ["The Marches", "Marken"] },
  // France
  { it: "Borgogna", en: "Burgundy", aliases: ["Bourgogne", "Burgund", "Borgona"] },
  { it: "Valle del Rodano", en: "Rhône Valley", aliases: ["Rhone", "Rodano", "Vallee du Rhone", "Rhonetal", "Cotes du Rhone region"] },
  { it: "Valle della Loira", en: "Loire Valley", aliases: ["Loire", "Loira", "Val de Loire", "Vallee de la Loire"] },
  { it: "Alsazia", en: "Alsace", aliases: ["Elsass", "Alsacia"] },
  { it: "Provenza", en: "Provence", aliases: ["Provenza"] },
  { it: "Linguadoca", en: "Languedoc" },
  { it: "Linguadoca-Rossiglione", en: "Languedoc-Roussillon", aliases: ["Languedoc Roussillon"] },
  { it: "Rossiglione", en: "Roussillon" },
  { it: "Sud-Ovest", en: "South West France", aliases: ["Sud Ouest", "Southwest France", "Sud-Ouest"] },
  { it: "Savoia", en: "Savoie", aliases: ["Savoy", "Savoyen"] },
  { it: "Corsica", en: "Corsica", aliases: ["Corse", "Korsika"] },
  // Spain
  { it: "Catalogna", en: "Catalonia", aliases: ["Cataluna", "Catalunya", "Katalonien", "Catalogne"] },
  { it: "Andalusia", en: "Andalusia", aliases: ["Andalucia", "Andalusien", "Andalousie"] },
  { it: "Castiglia e León", en: "Castile and León", aliases: ["Castilla y Leon", "Castiglia e Leon"] },
  { it: "Castiglia-La Mancia", en: "Castile-La Mancha", aliases: ["Castilla-La Mancha", "Castilla La Mancha"] },
  { it: "Navarra", en: "Navarre", aliases: ["Navarra"] },
  { it: "Paesi Baschi", en: "Basque Country", aliases: ["Pais Vasco", "Euskadi"] },
  { it: "Isole Canarie", en: "Canary Islands", aliases: ["Canarias", "Islas Canarias", "Canarie"] },
  { it: "Isole Baleari", en: "Balearic Islands", aliases: ["Baleares", "Islas Baleares"] },
  // Germany and Austria
  { it: "Mosella", en: "Mosel", aliases: ["Moselle", "Mosel-Saar-Ruwer"] },
  { it: "Palatinato", en: "Palatinate", aliases: ["Pfalz"] },
  { it: "Franconia", en: "Franconia", aliases: ["Franken"] },
  { it: "Assia Renana", en: "Rheinhessen", aliases: ["Rhine Hesse", "Rhinehessen"] },
  { it: "Bassa Austria", en: "Lower Austria", aliases: ["Niederösterreich", "Niederosterreich"] },
  { it: "Stiria", en: "Styria", aliases: ["Steiermark"] },
  // Switzerland
  { it: "Vallese", en: "Valais", aliases: ["Wallis"] },
  { it: "Grigioni", en: "Grisons", aliases: ["Graubünden", "Graubunden"] },
  { it: "Ginevra", en: "Geneva", aliases: ["Genève", "Geneve", "Genf"] },
  { it: "Vaud", en: "Vaud", aliases: ["Waadt"] },
  { it: "Neuchâtel", en: "Neuchâtel", aliases: ["Neuenburg"] },
  // Elsewhere
  { it: "Australia Meridionale", en: "South Australia" },
  { it: "Australia Occidentale", en: "Western Australia" },
  { it: "Peloponneso", en: "Peloponnese", aliases: ["Peloponnisos"] },
  { it: "Creta", en: "Crete", aliases: ["Kreta"] },
  { it: "Macedonia", en: "Macedonia", aliases: ["Makedonia"] },
];

const regionsByName = new Map<string, (typeof REGIONS)[number]>();
for (const region of REGIONS) {
  for (const name of [region.it, region.en, ...(region.aliases || [])]) {
    regionsByName.set(normalizePlace(name), region);
  }
}

// Country names Intl does not produce, or produces differently.
const COUNTRY_ALIASES: Record<string, string> = {
  usa: "US", "u s a": "US", us: "US", "united states of america": "US", "stati uniti d america": "US", america: "US",
  uk: "GB", "great britain": "GB", "gran bretagna": "GB", england: "GB", inghilterra: "GB", scotland: "GB",
  holland: "NL", olanda: "NL", "czech republic": "CZ", "repubblica ceca": "CZ",
  macedonia: "MK", "north macedonia": "MK", moldavia: "MD", "sud africa": "ZA",
};
const NAME_LOCALES = ["it", "en", "fr", "de", "es", "pt"];

type DisplayNames = { of(code: string): string | undefined };
type DisplayNamesConstructor = new (locales: string[], options: { type: "region" }) => DisplayNames;

function displayNames(locale: string): DisplayNames | null {
  const constructor = (Intl as unknown as { DisplayNames?: DisplayNamesConstructor }).DisplayNames;
  if (!constructor) return null;
  try {
    return new constructor([locale], { type: "region" });
  } catch {
    return null;
  }
}

let countriesByName: Map<string, string> | null = null;

/** Every country's name in the common wine languages, built once from the browser's data. */
function countryIndex(): Map<string, string> {
  if (countriesByName) return countriesByName;
  const index = new Map<string, string>(Object.entries(COUNTRY_ALIASES));
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const namers = NAME_LOCALES.map(displayNames).filter((namer): namer is DisplayNames => namer !== null);
  for (const first of letters) {
    for (const second of letters) {
      const code = first + second;
      for (const namer of namers) {
        let name: string | undefined;
        try {
          name = namer.of(code);
        } catch {
          name = undefined;
        }
        if (name && name !== code) {
          const key = normalizePlace(name);
          if (!index.has(key)) index.set(key, code);
        }
      }
    }
  }
  countriesByName = index;
  return index;
}

/** The ISO code of a country written in any common language, or "" when not recognised. */
export function countryCode(value: string): string {
  const key = normalizePlace(value);
  if (!key) return "";
  if (/^[a-z]{2}$/.test(key) && !(key in COUNTRY_ALIASES)) {
    const code = key.toUpperCase();
    if (displayNames("en")?.of(code) && displayNames("en")?.of(code) !== code) return code;
  }
  return countryIndex().get(key) || "";
}

/** A country's name in the reader's language; unknown names are shown as written. */
export function localizeCountry(value: string | null | undefined, locale: Locale): string {
  const text = (value || "").trim();
  if (!text) return "";
  const code = countryCode(text);
  return (code && displayNames(locale)?.of(code)) || text;
}

/** A wine region's name in the reader's language; unknown names are shown as written. */
export function localizeRegion(value: string | null | undefined, locale: Locale): string {
  const text = (value || "").trim();
  if (!text) return "";
  const region = regionsByName.get(normalizePlace(text));
  if (region) return locale === "it" ? region.it : region.en;
  // The region field sometimes holds a country ("Portugal").
  return localizeCountry(text, locale);
}

/** The same key for a region whatever language it is written in, for grouping. */
export function regionKey(value: string | null | undefined): string {
  const text = (value || "").trim();
  if (!text) return "";
  const region = regionsByName.get(normalizePlace(text));
  if (region) return `region:${normalizePlace(region.en)}`;
  const code = countryCode(text);
  return code ? `country:${code}` : normalizePlace(text);
}

/** A place's names in both app languages, so a search in either finds it. */
export function placeSearchText(value: string | null | undefined): string {
  const text = (value || "").trim();
  if (!text) return "";
  return [...new Set([text, localizeRegion(text, "it"), localizeRegion(text, "en")])].join(" ");
}
