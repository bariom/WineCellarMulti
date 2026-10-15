import type { Locale } from "../../types";

// Copy for the landing story: what Vinaris is, the essentials every cellar
// app needs, and the features that set Vinaris apart. Kept apart from
// content.ts so the existing news, plans and FAQ copy stays untouched.

export type StoryFeatureId = "scan" | "sommelier" | "taste" | "memories" | "ownership" | "restaurant";

export type LandingStory = {
  hero: { eyebrow: string; titleLines: [string, string, string]; title: string; lead: string };
  phone: {
    label: string; title: string; summary: string; perBottle: string; bottles: (count: number) => string;
    rows: Array<{ name: string; vintage: string; producer: string; count: number; value: string; tone: string; years: [string, string, string]; peak: [number, number]; today: number; phase: string; phaseTone: "wait" | "ideal" | "soon" }>;
  };
  pillars: { eyebrow: string; title: string; items: Array<{ title: string; body: string; chip: string }> };
  essentials: {
    eyebrow: string; title: string; body: string;
    items: Array<{ icon: EssentialIcon; title: string; body: string }>;
    switchTitle: string; switchBody: string; switchAction: string;
  };
  beyond: {
    eyebrow: string; title: string; titleAccent: string; body: string;
    features: Array<{ id: StoryFeatureId; tag: string; title: string; body: string; points: string[] }>;
    moreTitle: string; more: Array<{ title: string; body: string }>;
  };
  visuals: {
    scan: { shop: string; lines: string[]; total: string; rows: Array<{ name: string; count: string; price: string; note?: string }>; confirm: string };
    sommelier: { question: string; label: string; answer: string; picks: Array<{ name: string; place: string; window: string; tone: string }> };
    taste: { axes: [string, string, string, string, string, string]; title: string; matches: Array<{ name: string; score: string }> };
    memories: Array<{ title: string; meta: string }>;
    ownership: { title: string; owners: string; people: Array<{ initials: string; name: string; bottles: string; share: number; tone: string }> };
    restaurantAlt: string;
  };
};

export type EssentialIcon = "list" | "pin" | "window" | "trend" | "camera" | "note" | "heart" | "truck" | "filter" | "import" | "house" | "devices";

const RED = "#7a2232";
const WHITE = "#c9a63c";
const SPARKLING = "#b39550";

export const landingStory: Record<Locale, LandingStory> = {
  it: {
    hero: {
      eyebrow: "L’app per i vini che possiedi",
      titleLines: ["Sai cosa hai.", "Sai cosa aprire.", "Sai quanto vale."],
      title: "Sai cosa hai. Sai cosa aprire. Sai quanto vale.",
      lead: "Vinaris è la tua cantina digitale: ogni bottiglia con la sua finestra di beva, il suo valore e la sua storia. Dal computer o dal telefono, senza installare nulla.",
    },
    phone: {
      label: "Esempio dell’elenco della cantina in Vinaris su telefono",
      title: "La cantina", summary: "48 vini · 212 bottiglie · CHF 18’430", perBottle: "CHF / bt",
      bottles: (count) => `${count} ${count === 1 ? "bottiglia" : "bottiglie"}`,
      rows: [
        { name: "Barolo Riserva", vintage: "2016", producer: "Giacomo Conterno", count: 6, value: "180", tone: RED, years: ["2024", "2030–2036", "2040"], peak: [38, 36], today: 12, phase: "Da attendere fino al 2030", phaseTone: "wait" },
        { name: "Chablis 1er Cru", vintage: "2020", producer: "Raveneau", count: 3, value: "95", tone: WHITE, years: ["2024", "2026–2028", "2032"], peak: [25, 25], today: 30, phase: "Ideale fino al 2028", phaseTone: "ideal" },
        { name: "Franciacorta Brut", vintage: "2018", producer: "Ca’ del Bosco", count: 2, value: "45", tone: SPARKLING, years: ["2021", "2023–2026", "2027"], peak: [33, 50], today: 88, phase: "Da bere entro il 2027", phaseTone: "soon" },
      ],
    },
    pillars: {
      eyebrow: "Cosa fa Vinaris",
      title: "Quattro cose che una cantina chiede ogni giorno.",
      items: [
        { title: "Ritrova", body: "Ogni bottiglia con annata, formato, quantità e posizione esatta. Anche quando sono centinaia.", chip: "Cantina -1 · Ripiano 2" },
        { title: "Apri al momento giusto", body: "La finestra di beva dice quando aspettare, quando è il momento ideale e quando non rimandare.", chip: "Ideale fino al 2028" },
        { title: "Segui il valore", body: "Prezzo pagato, valore attuale e andamento nel tempo, per vino e per l’intera collezione.", chip: "CHF 140 → CHF 180" },
        { title: "Ricorda", body: "Note, voti, occasioni e foto della serata restano anche quando la bottiglia è finita.", chip: "Una cena, un vino, una storia" },
      ],
    },
    essentials: {
      eyebrow: "Le basi, fatte con cura",
      title: "Tutto quello che serve per gestire una cantina.",
      body: "Gli strumenti che ti aspetti, pensati per lavorare insieme e restare semplici, che tu abbia 20 bottiglie o più di 1.000.",
      items: [
        { icon: "list", title: "Inventario completo", body: "Produttore, annata, formato, quantità e stato." },
        { icon: "pin", title: "Posizioni e scaffali", body: "Sai dove si trova ogni bottiglia e la sposti in un tocco." },
        { icon: "window", title: "Finestre di beva", body: "Troppo giovane, ideale, da bere presto." },
        { icon: "trend", title: "Valore e storico", body: "Stime di mercato e andamento nel tempo." },
        { icon: "camera", title: "Riconoscimento etichetta", body: "Fotografi la bottiglia, la scheda si compila." },
        { icon: "note", title: "Note e valutazioni", body: "Il tuo giudizio, bevuta dopo bevuta." },
        { icon: "heart", title: "Wishlist", body: "Prezzi obiettivo e priorità prima di comprare." },
        { icon: "truck", title: "Ordini e consegne", body: "En primeur, ritiri e arrivi su una timeline." },
        { icon: "filter", title: "Filtri e statistiche", body: "Per regione, stato, maturità, valore, formato." },
        { icon: "import", title: "Import ed esportazione", body: "Da CSV di CellarTracker o da un backup Vinaris." },
        { icon: "house", title: "Più cantine", body: "Casa, seconda casa, cantina di famiglia: un solo account." },
        { icon: "devices", title: "Computer e telefono", body: "Nel browser, senza installare nulla." },
      ],
      switchTitle: "Arrivi da un’altra app o da un foglio di calcolo?",
      switchBody: "Importi la tua cantina e riparti da dove eri.",
      switchAction: "Crea il tuo account e importa",
    },
    beyond: {
      eyebrow: "Perché Vinaris",
      title: "E poi, quello che una cantina",
      titleAccent: "non si aspetta.",
      body: "Vinaris nasce da una collezione vera. Per questo va oltre l’inventario e segue il vino come lo vive un collezionista: dall’acquisto al brindisi, e oltre.",
      features: [
        { id: "scan", tag: "Dalla fattura alla cantina", title: "Fotografi lo scontrino. Le bottiglie entrano da sole.", body: "Scatta una foto a fattura o scontrino, oppure carica un PDF: Vinaris riconosce vini, annate, quantità e prezzi. Tu controlli e confermi.", points: ["Ogni acquisto resta collegato al documento originale", "Lotti e prezzi separati per ogni acquisto", "Riconosce i vini che hai già in cantina"] },
        { id: "sommelier", tag: "Sommelier della tua cantina", title: "Un consiglio che parte dai vini che hai già.", body: "Descrivi il piatto o l’occasione. Il Sommelier sceglie tra le tue bottiglie quelle nel momento giusto, e ti avvisa quando una merita di essere aperta.", points: ["Abbinamenti solo con vini presenti in cantina", "Tiene conto di maturità e preferenze", "Al ristorante, ti aiuta a scegliere dalla carta"] },
        { id: "taste", tag: "Il tuo gusto, misurato", title: "Vinaris impara cosa ti piace davvero.", body: "Dalle tue valutazioni nasce un’impronta sensoriale personale: corpo, acidità, tannini, aromi. E ogni vino ti dice quanto è in sintonia con te.", points: ["Profilo che si affina bevuta dopo bevuta", "Le regioni e le uve che ami, in evidenza", "Nuove scoperte coerenti con il tuo palato"] },
        { id: "memories", tag: "Ricordi, non solo note", title: "Il vino finisce. La serata resta.", body: "Aggiungi una foto alla bevuta: persone, luogo, occasione. I tuoi brindisi diventano un album da sfogliare, su un tavolo di polaroid o su una mappa del mondo.", points: ["Ogni ricordo collegato al vino e alla sua scheda", "Cerca per mese o per occasione", "Ritrovi le serate anche su una mappa dei luoghi"] },
        { id: "ownership", tag: "Una cantina, più proprietari", title: "Le bottiglie condivise, finalmente chiare.", body: "Una cassa comprata in tre, una cantina di famiglia, un acquisto tra amici: Vinaris tiene conto delle quote di ognuno e delle bottiglie che spettano a chi.", points: ["Quote in percentuale per ogni vino", "Inviti con accesso completo o in sola lettura", "Valore e bottiglie calcolati sulla tua parte"] },
        { id: "restaurant", tag: "Anche per il ristorante", title: "Dalla cantina privata alla carta dei vini.", body: "La stessa Vinaris, in modalità ristorante: carta dei vini pubblica, vendite a bottiglia e al calice, margini e scorte da riordinare, in un unico spazio.", points: ["Carta dei vini sempre aggiornata, da condividere con un link", "Ricavi, costi e margini per periodo", "Avvisi sulle referenze in esaurimento"] },
      ],
      moreTitle: "E ancora",
      more: [
        { title: "Strategia di cantina", body: "Un piano che bilancia consumo, attesa e capitale." },
        { title: "Consigli d’acquisto", body: "Proposte coerenti con il tuo gusto, anche disponibili vicino a te." },
        { title: "Offerte valutate", body: "Un prezzo in wishlist, confrontato con il mercato." },
        { title: "Dashboard tua", body: "Scegli, sposta e ridimensiona i riquadri che contano per te." },
        { title: "Wine Pulse", body: "Le notizie dal mondo del vino, con la fonte." },
      ],
    },
    visuals: {
      scan: {
        shop: "Enoteca Centrale", lines: ["Barolo Ris. 2016 ×6", "Chablis 1er 2020 ×3", "Franciacorta ×2"], total: "Totale CHF 1’415",
        rows: [
          { name: "Barolo Riserva 2016", count: "6 bt", price: "CHF 140 / bt", note: "✓ Già in cantina, nuovo lotto" },
          { name: "Chablis 1er Cru 2020", count: "3 bt", price: "CHF 95 / bt" },
          { name: "Franciacorta Brut 2018", count: "2 bt", price: "CHF 45 / bt" },
        ],
        confirm: "Aggiungi 11 bottiglie",
      },
      sommelier: {
        question: "Stasera risotto ai funghi. Cosa apro?", label: "Sommelier",
        answer: "Dalla tua cantina, questi due sono oggi nella finestra ideale e hanno la freschezza giusta per il piatto.",
        picks: [
          { name: "Nebbiolo Langhe 2019", place: "Cantina -1 · Ripiano 3", window: "Ideale fino al 2028", tone: RED },
          { name: "Chablis 1er Cru 2020", place: "Frigo vini", window: "Ideale fino al 2028", tone: WHITE },
        ],
      },
      taste: {
        axes: ["Corpo", "Acidità", "Tannini", "Frutto", "Legno", "Aromi"],
        title: "Il tuo gusto cerca freschezza e frutto.",
        matches: [{ name: "Chablis 1er Cru", score: "92% in sintonia" }, { name: "Nebbiolo Langhe", score: "86% in sintonia" }, { name: "Amarone", score: "54% in sintonia" }],
      },
      memories: [
        { title: "Il compleanno di Marta", meta: "Barolo Riserva 2016 · marzo" },
        { title: "Una sera sul lago", meta: "Chablis 1er Cru · luglio" },
        { title: "In cantina dal produttore", meta: "Langhe · settembre" },
      ],
      ownership: {
        title: "Sassicaia 2019 · cassa da 6", owners: "3 proprietari",
        people: [
          { initials: "TU", name: "Tu", bottles: "3 bottiglie", share: 50, tone: "#245142" },
          { initials: "LM", name: "Luca", bottles: "2 bottiglie", share: 30, tone: "#b8964c" },
          { initials: "SR", name: "Sara", bottles: "1 bottiglia", share: 20, tone: "#d07a8c" },
        ],
      },
      restaurantAlt: "Schermata reale della modalità ristorante: ricavi, costi, margine e andamento delle vendite",
    },
  },
  en: {
    hero: {
      eyebrow: "The app for the wines you own",
      titleLines: ["Know what you have.", "Know what to open.", "Know what it’s worth."],
      title: "Know what you have. Know what to open. Know what it’s worth.",
      lead: "Vinaris is your digital cellar: every bottle with its drinking window, its value and its story. On your computer or phone, with nothing to install.",
    },
    phone: {
      label: "Example of the Vinaris cellar list on a phone",
      title: "The cellar", summary: "48 wines · 212 bottles · CHF 18,430", perBottle: "CHF / btl",
      bottles: (count) => `${count} ${count === 1 ? "bottle" : "bottles"}`,
      rows: [
        { name: "Barolo Riserva", vintage: "2016", producer: "Giacomo Conterno", count: 6, value: "180", tone: RED, years: ["2024", "2030–2036", "2040"], peak: [38, 36], today: 12, phase: "Wait until 2030", phaseTone: "wait" },
        { name: "Chablis 1er Cru", vintage: "2020", producer: "Raveneau", count: 3, value: "95", tone: WHITE, years: ["2024", "2026–2028", "2032"], peak: [25, 25], today: 30, phase: "Ideal until 2028", phaseTone: "ideal" },
        { name: "Franciacorta Brut", vintage: "2018", producer: "Ca’ del Bosco", count: 2, value: "45", tone: SPARKLING, years: ["2021", "2023–2026", "2027"], peak: [33, 50], today: 88, phase: "Drink by 2027", phaseTone: "soon" },
      ],
    },
    pillars: {
      eyebrow: "What Vinaris does",
      title: "Four things a cellar asks of you every day.",
      items: [
        { title: "Find", body: "Every bottle with vintage, format, quantity and exact location. Even when there are hundreds.", chip: "Cellar -1 · Rack 2" },
        { title: "Open at the right time", body: "The drinking window tells you when to wait, when it is ideal and when not to put it off.", chip: "Ideal until 2028" },
        { title: "Follow the value", body: "Price paid, current value and its trend over time, per wine and for the whole collection.", chip: "CHF 140 → CHF 180" },
        { title: "Remember", body: "Notes, scores, occasions and photos of the evening stay even after the bottle is gone.", chip: "One dinner, one wine, one story" },
      ],
    },
    essentials: {
      eyebrow: "The essentials, done with care",
      title: "Everything you need to run a cellar.",
      body: "The tools you expect, designed to work together and stay simple, whether you have 20 bottles or more than 1,000.",
      items: [
        { icon: "list", title: "Complete inventory", body: "Producer, vintage, format, quantity and status." },
        { icon: "pin", title: "Locations and racks", body: "Know where every bottle is and move it in a tap." },
        { icon: "window", title: "Drinking windows", body: "Too young, ideal, drink soon." },
        { icon: "trend", title: "Value and history", body: "Market estimates and their trend over time." },
        { icon: "camera", title: "Label recognition", body: "Photograph the bottle and the record fills itself in." },
        { icon: "note", title: "Notes and scores", body: "Your judgement, bottle after bottle." },
        { icon: "heart", title: "Wishlist", body: "Target prices and priorities before you buy." },
        { icon: "truck", title: "Orders and deliveries", body: "En primeur, collections and arrivals on a timeline." },
        { icon: "filter", title: "Filters and statistics", body: "By region, status, maturity, value, format." },
        { icon: "import", title: "Import and export", body: "From a CellarTracker CSV or a Vinaris backup." },
        { icon: "house", title: "Several cellars", body: "Home, second home, family cellar: one account." },
        { icon: "devices", title: "Computer and phone", body: "In your browser, nothing to install." },
      ],
      switchTitle: "Coming from another app or a spreadsheet?",
      switchBody: "Import your cellar and pick up where you left off.",
      switchAction: "Create your account and import",
    },
    beyond: {
      eyebrow: "Why Vinaris",
      title: "And then, what a cellar",
      titleAccent: "doesn’t expect.",
      body: "Vinaris was born from a real collection. That is why it goes beyond inventory and follows wine the way a collector lives it: from purchase to the toast, and beyond.",
      features: [
        { id: "scan", tag: "From invoice to cellar", title: "Photograph the receipt. The bottles add themselves.", body: "Take a photo of an invoice or receipt, or upload a PDF: Vinaris recognises wines, vintages, quantities and prices. You check and confirm.", points: ["Every purchase stays linked to its original document", "Separate lots and prices for each purchase", "Recognises the wines already in your cellar"] },
        { id: "sommelier", tag: "Your cellar’s sommelier", title: "Advice that starts from the wines you already own.", body: "Describe the dish or the occasion. The Sommelier picks the bottles in your cellar that are at the right moment, and tells you when one deserves to be opened.", points: ["Pairings only with wines in your cellar", "Takes maturity and preferences into account", "At a restaurant, helps you choose from the list"] },
        { id: "taste", tag: "Your taste, measured", title: "Vinaris learns what you really like.", body: "Your ratings build a personal sensory signature: body, acidity, tannins, aromas. And every wine shows how well it matches you.", points: ["A profile that sharpens with every bottle", "The regions and grapes you love, highlighted", "New discoveries that suit your palate"] },
        { id: "memories", tag: "Memories, not just notes", title: "The wine ends. The evening stays.", body: "Add a photo to a tasting: people, place, occasion. Your toasts become an album to browse, on a table of polaroids or on a world map.", points: ["Every memory linked to the wine and its record", "Search by month or occasion", "Find your evenings on a map of places"] },
        { id: "ownership", tag: "One cellar, several owners", title: "Shared bottles, finally clear.", body: "A case bought by three, a family cellar, a purchase among friends: Vinaris keeps track of everyone’s share and which bottles belong to whom.", points: ["Percentage shares for every wine", "Invitations with full or read-only access", "Value and bottles calculated on your share"] },
        { id: "restaurant", tag: "For restaurants too", title: "From private cellar to wine list.", body: "The same Vinaris in restaurant mode: a public wine list, sales by the bottle and by the glass, margins and stock to reorder, in one place.", points: ["An always up-to-date wine list to share with a link", "Revenue, costs and margins by period", "Alerts on references running low"] },
      ],
      moreTitle: "And more",
      more: [
        { title: "Cellar strategy", body: "A plan that balances drinking, ageing and capital." },
        { title: "Buying advice", body: "Suggestions that suit your taste, including ones available near you." },
        { title: "Offers assessed", body: "A wishlist price, compared with the market." },
        { title: "Your dashboard", body: "Choose, move and resize the widgets that matter to you." },
        { title: "Wine Pulse", body: "News from the wine world, with its source." },
      ],
    },
    visuals: {
      scan: {
        shop: "Central Wine Shop", lines: ["Barolo Ris. 2016 ×6", "Chablis 1er 2020 ×3", "Franciacorta ×2"], total: "Total CHF 1,415",
        rows: [
          { name: "Barolo Riserva 2016", count: "6 btl", price: "CHF 140 / btl", note: "✓ Already in your cellar, new lot" },
          { name: "Chablis 1er Cru 2020", count: "3 btl", price: "CHF 95 / btl" },
          { name: "Franciacorta Brut 2018", count: "2 btl", price: "CHF 45 / btl" },
        ],
        confirm: "Add 11 bottles",
      },
      sommelier: {
        question: "Mushroom risotto tonight. What should I open?", label: "Sommelier",
        answer: "From your cellar, these two are in their ideal window today and have the right freshness for the dish.",
        picks: [
          { name: "Nebbiolo Langhe 2019", place: "Cellar -1 · Rack 3", window: "Ideal until 2028", tone: RED },
          { name: "Chablis 1er Cru 2020", place: "Wine fridge", window: "Ideal until 2028", tone: WHITE },
        ],
      },
      taste: {
        axes: ["Body", "Acidity", "Tannins", "Fruit", "Oak", "Aromas"],
        title: "Your taste looks for freshness and fruit.",
        matches: [{ name: "Chablis 1er Cru", score: "92% match" }, { name: "Nebbiolo Langhe", score: "86% match" }, { name: "Amarone", score: "54% match" }],
      },
      memories: [
        { title: "Marta’s birthday", meta: "Barolo Riserva 2016 · March" },
        { title: "An evening by the lake", meta: "Chablis 1er Cru · July" },
        { title: "At the producer’s cellar", meta: "Langhe · September" },
      ],
      ownership: {
        title: "Sassicaia 2019 · case of 6", owners: "3 owners",
        people: [
          { initials: "YO", name: "You", bottles: "3 bottles", share: 50, tone: "#245142" },
          { initials: "LM", name: "Luca", bottles: "2 bottles", share: 30, tone: "#b8964c" },
          { initials: "SR", name: "Sara", bottles: "1 bottle", share: 20, tone: "#d07a8c" },
        ],
      },
      restaurantAlt: "Real screenshot of restaurant mode: revenue, costs, margin and sales trend",
    },
  },
};
