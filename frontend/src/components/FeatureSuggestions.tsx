import type { Locale } from "../types";
import { AppIcon, type AppIconName } from "./AppIcon";
import "./FeatureSuggestions.css";

export type FeatureId =
  | "add-quick" | "add-detailed" | "add-receipt" | "tasting" | "wishlist-add"
  | "assistant" | "pairing-home" | "pairing-restaurant" | "shelf" | "buying" | "strategy"
  | "moments" | "tastings" | "archived" | "sales" | "pulse"
  | "value" | "readiness" | "timeline" | "data-quality" | "taste" | "personal-dashboard"
  | "subscription" | "settings-ai" | "storage" | "tags" | "cellars" | "data" | "help" | "news";

type Feature = { id: FeatureId; icon: AppIconName; it: [string, string]; en: [string, string]; keywords: string };

// Title, one line on what it does, and the words people use for it, in both languages.
const FEATURES: Feature[] = [
  { id: "add-quick", icon: "camera", it: ["Inserimento veloce", "Fotografa le bottiglie e aggiungile"], en: ["Quick add", "Photograph bottles and add them"], keywords: "aggiungi inserisci nuovo foto fotografa bottiglie veloce add photo bottles quick new" },
  { id: "add-detailed", icon: "edit", it: ["Inserimento dettagliato", "Un vino con tutti i dati"], en: ["Detailed entry", "One wine with every detail"], keywords: "aggiungi inserisci nuovo vino scheda modulo add new wine form detailed" },
  { id: "add-receipt", icon: "import", it: ["Da scontrino o fattura", "Importa un acquisto"], en: ["From a receipt or invoice", "Import a purchase"], keywords: "scontrino fattura ricevuta acquisto pdf importa receipt invoice purchase import" },
  { id: "tasting", icon: "tasting", it: ["Registra una bevuta", "Voto, occasione e foto"], en: ["Record a tasting", "Rating, occasion and photo"], keywords: "bevuta bevuto bevo degustazione registra apri aperta tasting drank drink record opened" },
  { id: "wishlist-add", icon: "wishlist", it: ["Aggiungi alla wishlist", "Un vino da comprare"], en: ["Add to the wishlist", "A wine to buy"], keywords: "wishlist desideri comprare lista add wish buy list" },
  { id: "assistant", icon: "assistant", it: ["Chiedi alla tua cantina", "L'assistente AI, anche a voce"], en: ["Ask your cellar", "The AI assistant, by voice too"], keywords: "assistente chiedi domanda voce parla chat ai assistant ask question voice talk" },
  { id: "pairing-home", icon: "glass-sparkle", it: ["Abbinamento a casa", "Il vino giusto per il piatto"], en: ["Pairing at home", "The right wine for the dish"], keywords: "abbinamento abbina piatto cena cibo mangiare sommelier pairing pair dish dinner food" },
  { id: "pairing-restaurant", icon: "tasting", it: ["Al ristorante", "Analizza la carta dei vini"], en: ["At the restaurant", "Analyse the wine list"], keywords: "ristorante carta vini menu ordinare restaurant wine list order" },
  { id: "shelf", icon: "camera", it: ["Scaffale AI", "In enoteca: quale comprare"], en: ["Shelf scanner", "At the shop: which to buy"], keywords: "scaffale enoteca negozio supermercato scegliere shelf shop store scanner" },
  { id: "buying", icon: "buying", it: ["Cosa comprare", "Consigli d'acquisto"], en: ["What to buy", "Buying advice"], keywords: "comprare acquistare consiglio acquisti spesa buy buying advice shopping" },
  { id: "strategy", icon: "dashboard-cards", it: ["Strategia della cantina", "Obiettivi e piano d'azione"], en: ["Cellar strategy", "Goals and action plan"], keywords: "strategia piano obiettivi intelligence gestione strategy plan goals" },
  { id: "moments", icon: "camera", it: ["Momenti", "I ricordi delle tue bevute"], en: ["Moments", "Memories of your tastings"], keywords: "momenti ricordi foto polaroid album memorie moments memories photos" },
  { id: "tastings", icon: "calendar", it: ["Bottiglie bevute", "Nel Diario"], en: ["Bottles drunk", "In the Journal"], keywords: "diario storico bevute degustazioni bevuto journal history tastings" },
  { id: "archived", icon: "calendar", it: ["Vini archiviati", "I vini finiti"], en: ["Archived wines", "Finished wines"], keywords: "archiviati archivio finiti esauriti archived finished" },
  { id: "sales", icon: "chart", it: ["Vendite", "Bottiglie vendute e plusvalenze"], en: ["Sales", "Bottles sold and gains"], keywords: "vendite venduto vendita plusvalenza sales sold" },
  { id: "pulse", icon: "pulse", it: ["Wine Pulse", "Notizie dal mondo del vino"], en: ["Wine Pulse", "News from the wine world"], keywords: "notizie news articoli pulse giornale" },
  { id: "value", icon: "chart", it: ["Valore della cantina", "Quotazioni e andamento"], en: ["Cellar value", "Prices and trend"], keywords: "valore prezzo quotazione mercato portafoglio value price market worth" },
  { id: "readiness", icon: "calendar", it: ["Finestra di beva", "Cosa è pronto da bere"], en: ["Drinking window", "What is ready to drink"], keywords: "finestra beva maturità pronti apice bere drinking window ready maturity peak" },
  { id: "timeline", icon: "status-shipped", it: ["Timeline", "Consegne e scadenze"], en: ["Timeline", "Deliveries and deadlines"], keywords: "timeline consegne arrivi ordini scadenze deliveries orders" },
  { id: "data-quality", icon: "dashboard-cards", it: ["Qualità dati", "Completa i dati con l'AI"], en: ["Data quality", "Complete data with AI"], keywords: "qualità dati mancanti completa incompleti prezzi aggiorna data quality missing complete" },
  { id: "taste", icon: "grapes", it: ["Il mio gusto", "Il tuo profilo di gusto"], en: ["My taste", "Your taste profile"], keywords: "gusto profilo preferenze palato taste profile preferences" },
  { id: "personal-dashboard", icon: "dashboard", it: ["La mia dashboard", "Scegli i tuoi riquadri"], en: ["My dashboard", "Choose your widgets"], keywords: "dashboard personalizza riquadri widget customise customize" },
  { id: "subscription", icon: "star", it: ["Abbonamento e AI Pack", "Piano e credito AI"], en: ["Subscription and AI Pack", "Plan and AI credit"], keywords: "abbonamento riserva piano credito pack pagamento subscription plan credit billing" },
  { id: "settings-ai", icon: "assistant", it: ["Impostazioni AI", "Modelli e uso AI"], en: ["AI settings", "Models and AI usage"], keywords: "impostazioni ai modelli chiave openai costi uso audit settings models key usage cost" },
  { id: "storage", icon: "location", it: ["Collocazione", "Scaffali e posizioni"], en: ["Storage", "Racks and places"], keywords: "collocazione posizione scaffale cantinetta frigo storage location rack" },
  { id: "tags", icon: "edit", it: ["Tag", "Le tue etichette"], en: ["Tags", "Your labels"], keywords: "tag etichette categorie tags labels" },
  { id: "cellars", icon: "users", it: ["Cantine e membri", "Inviti e comproprietà"], en: ["Cellars and members", "Invites and co-ownership"], keywords: "cantine membri invita condividi comproprietà famiglia cellars members invite share co-ownership" },
  { id: "data", icon: "export", it: ["Esporta o importa", "Backup e CellarTracker"], en: ["Export or import", "Backup and CellarTracker"], keywords: "esporta importa backup dati cellartracker json export import" },
  { id: "help", icon: "grapes", it: ["Guida", "Come funziona Vinaris"], en: ["Guide", "How Vinaris works"], keywords: "guida aiuto come funziona help guide" },
  { id: "news", icon: "newspaper", it: ["Novità", "Le ultime funzioni"], en: ["What's new", "The latest features"], keywords: "novità aggiornamenti nuove funzioni new updates features" },
];

const normalise = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Features whose name or words start with every word typed, best matches first. */
export function matchingFeatures(query: string, available: (id: FeatureId) => boolean, locale: Locale, limit = 4) {
  const words = normalise(query).split(/\s+/).filter((word) => word.length >= 3);
  if (!words.length) return [];
  return FEATURES
    .filter((feature) => available(feature.id))
    .map((feature) => {
      const title = normalise(feature[locale === "it" ? "it" : "en"][0]);
      const vocabulary = `${title} ${normalise(feature.keywords)}`.split(/\s+/);
      if (!words.every((word) => vocabulary.some((term) => term.startsWith(word)))) return null;
      return { feature, score: words.filter((word) => title.split(/\s+/).some((term) => term.startsWith(word))).length };
    })
    .filter((match): match is { feature: Feature; score: number } => match !== null)
    .sort((first, second) => second.score - first.score)
    .slice(0, limit)
    .map((match) => match.feature);
}

/**
 * Under the search field: the features that match what is typed, so a friend can
 * type "scaffale" or "esporta" instead of remembering where things are. The wine
 * search keeps working as before; this only adds shortcuts.
 */
export default function FeatureSuggestions({ query, locale, available, onOpen }: {
  query: string;
  locale: Locale;
  available: (id: FeatureId) => boolean;
  onOpen: (id: FeatureId) => void;
}) {
  const it = locale === "it";
  const features = matchingFeatures(query, available, locale);
  if (!features.length) return null;
  return <section className="feature-suggestions" aria-label={it ? "Funzioni" : "Features"}>
    <p>{it ? "Funzioni" : "Features"}</p>
    {features.map((feature) => {
      const [title, description] = feature[it ? "it" : "en"];
      return <button key={feature.id} type="button" onClick={() => onOpen(feature.id)}>
        <AppIcon name={feature.icon} variant="navigation" />
        <span><strong>{title}</strong><small>{description}</small></span>
        <span aria-hidden="true">→</span>
      </button>;
    })}
  </section>;
}
