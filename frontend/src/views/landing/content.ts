import type { Locale } from "../../types";

export type LandingCopy = {
  nav: { product: string; maturity: string; sommelier: string; insights: string; pricing: string };
  header: { login: string; register: string; menu: string; close: string; language: string };
  hero: {
    eyebrow: string;
    title: string;
    lead: string;
    primary: string;
    secondary: string;
    demo: string;
    signal: string;
    web: string;
  };
  value: Array<{ title: string; body: string }>;
  journey: {
    eyebrow: string;
    title: string;
    body: string;
    steps: Array<{ title: string; body: string }>;
    capture: string;
    recognised: string;
    enriched: string;
  };
  maturity: {
    eyebrow: string;
    title: string;
    body: string;
    stages: [string, string, string, string];
    bottle: string;
    ideal: string;
    peak: string;
    risk: string;
    note: string;
  };
  sommelier: {
    eyebrow: string;
    title: string;
    body: string;
    question: string;
    answer: string;
    cellarLabel: string;
    ready: string;
    alternative: string;
  };
  insights: {
    eyebrow: string;
    title: string;
    body: string;
    bottles: string;
    value: string;
    ready: string;
    regions: string;
    deliveries: string;
    growth: string;
    regionNames: [string, string, string];
  };
  features: {
    eyebrow: string;
    title: string;
    items: Array<{ title: string; body: string; stat: string }>;
  };
  closing: {
    eyebrow: string;
    title: string;
    body: string;
    primary: string;
    demo: string;
    monthly: string;
    annual: string;
    annualNote: string;
    aiNote: string;
  };
  footer: { statement: string; privacy: string; terms: string; login: string };
  meta: { title: string; description: string };
};

export const landingCopy: Record<Locale, LandingCopy> = {
  it: {
    nav: { product: "Prodotto", maturity: "Finestra di beva", sommelier: "Sommelier", insights: "Analisi", pricing: "Accesso" },
    header: { login: "Accedi", register: "Inizia", menu: "Apri menu", close: "Chiudi menu", language: "Lingua" },
    hero: {
      eyebrow: "Private Cellar Intelligence",
      title: "Sai cosa bere. Sai cosa aspettare.",
      lead: "Gestisci la cantina, segui la maturità di ogni bottiglia e ricevi indicazioni costruite sui vini che possiedi davvero.",
      primary: "Crea la tua cantina",
      secondary: "Scopri come funziona",
      demo: "Esplora la cantina demo",
      signal: "Pensato per collezioni da 20 a oltre 1.000 bottiglie",
      web: "Web app privata · da CHF 6 al mese",
    },
    value: [
      { title: "Trova ogni bottiglia", body: "Ricerca, filtri, fotografie, formati e posizione: la collezione resta leggibile mentre cresce." },
      { title: "Aprila al momento giusto", body: "Finestre di beva e priorità mostrano cosa è pronto, cosa aspettare e cosa non dimenticare." },
      { title: "Comprendi la cantina", body: "Valore, maturità, acquisti e degustazioni diventano una visione coerente della collezione." },
    ],
    journey: {
      eyebrow: "Dalle bottiglie alle decisioni",
      title: "Inserisci una bottiglia. Vinaris costruisce il contesto.",
      body: "Ogni dato serve a una decisione concreta: trovare, aspettare, aprire, acquistare o ricordare.",
      steps: [
        { title: "Aggiungi o riconosci", body: "Parti dall’etichetta, da una ricerca o dall’inserimento manuale." },
        { title: "Organizza i dati", body: "Produttore, annata, formato, stato, proprietà e fotografie restano collegati." },
        { title: "Segui ciò che cambia", body: "Maturità, valore, consegne e qualità dei dati diventano segnali operativi." },
        { title: "Decidi sulla tua cantina", body: "Filtri e suggerimenti usano la collezione reale, non un catalogo astratto." },
      ],
      capture: "Riconoscimento etichetta",
      recognised: "Bottiglia riconosciuta",
      enriched: "Scheda pronta da verificare",
    },
    maturity: {
      eyebrow: "La finestra di beva",
      title: "Non dimenticare una bottiglia in fondo alla cantina.",
      body: "Vinaris trasforma la maturità in una timeline leggibile: sai quando aspettare, quando il vino entra nella fase ideale e quando è il momento di agire.",
      stages: ["Troppo giovane", "Pronta", "Al picco", "Da bere presto"],
      bottle: "Barbaresco Basarin · 2023",
      ideal: "Finestra ideale",
      peak: "Picco 2030–2036",
      risk: "Valore da proteggere",
      note: "Le finestre sono indicazioni gestionali: conservazione e condizioni della singola bottiglia restano determinanti.",
    },
    sommelier: {
      eyebrow: "Sommelier AI",
      title: "Un consiglio costruito sui vini che hai già.",
      body: "Descrivi il piatto o l’occasione. Il Sommelier considera stile, maturità e preferenze per proporti bottiglie presenti nella tua cantina.",
      question: "Cosa apro con un risotto ai funghi?",
      answer: "Nella tua cantina, queste bottiglie sono oggi nella finestra ideale e hanno struttura e freschezza adatte al piatto.",
      cellarLabel: "Dalla tua cantina",
      ready: "Pronta ora",
      alternative: "Alternativa più evoluta",
    },
    insights: {
      eyebrow: "Controllo della collezione",
      title: "La cantina, letta come un insieme.",
      body: "Dalla singola bottiglia alla distribuzione del capitale: una dashboard per vedere priorità, concentrazioni e movimenti senza perdere il dettaglio.",
      bottles: "Bottiglie",
      value: "Valore totale",
      ready: "Da bere ora",
      regions: "Regioni principali",
      deliveries: "Consegne attese",
      growth: "Evoluzione collezione",
      regionNames: ["Toscana", "Bordeaux", "Piemonte"],
    },
    features: {
      eyebrow: "Il resto, nello stesso sistema",
      title: "Dall’acquisto alla memoria della bottiglia.",
      items: [
        { title: "Wishlist", body: "Prezzi obiettivo, priorità e strategia prima dell’acquisto.", stat: "Acquista con metodo" },
        { title: "Consegne e futures", body: "Ordini, en primeur, ritiri e capitale impegnato su una timeline.", stat: "4 in arrivo" },
        { title: "Storico degustativo", body: "Note, occasioni, voti e abbinamenti restano nella memoria della cantina.", stat: "Ricorda ciò che hai bevuto" },
        { title: "Valore", body: "Prezzo pagato, stima corrente e storico per vino e collezione.", stat: "CHF 9’312" },
        { title: "Filtri avanzati", body: "Trova subito per regione, stato, maturità, valore, formato o proprietario.", stat: "Una cantina leggibile" },
        { title: "Statistiche", body: "Distribuzione, qualità dei dati e rischio oltre finestra in una vista operativa.", stat: "Decisioni, non grafici vuoti" },
      ],
    },
    closing: {
      eyebrow: "La tua storia di cantina",
      title: "La collezione esiste già. Vinaris ti aiuta a comprenderla.",
      body: "Costruisci un archivio privato che accompagna acquisti, attese, aperture e memoria nel tempo.",
      primary: "Inizia a costruire la cantina",
      demo: "Guarda la cantina demo",
      monthly: "CHF 6 / mese",
      annual: "CHF 60 / anno",
      annualNote: "Due mesi risparmiati con il piano annuale",
      aiNote: "Un credito AI iniziale permette di provare le funzioni avanzate.",
    },
    footer: { statement: "Private cellar intelligence per collezionisti di vino.", privacy: "Privacy", terms: "Condizioni d’uso", login: "Accesso" },
    meta: { title: "Vinaris · Private Cellar Intelligence", description: "Gestisci bottiglie, finestre di beva, valore, consegne, wishlist e memoria degustativa in una cantina privata e intelligente." },
  },
  en: {
    nav: { product: "Product", maturity: "Drinking window", sommelier: "Sommelier", insights: "Insights", pricing: "Access" },
    header: { login: "Log in", register: "Get started", menu: "Open menu", close: "Close menu", language: "Language" },
    hero: {
      eyebrow: "Private Cellar Intelligence",
      title: "Know what to drink. Know what to keep.",
      lead: "Manage your cellar, follow every bottle’s maturity, and get intelligent recommendations based on the wines you actually own.",
      primary: "Build your cellar",
      secondary: "See how it works",
      demo: "Explore the demo cellar",
      signal: "Designed for collections from 20 to more than 1,000 bottles",
      web: "Private web app · from CHF 6 per month",
    },
    value: [
      { title: "Find every bottle", body: "Search, filters, photographs, formats, and location keep the collection readable as it grows." },
      { title: "Open it at the right moment", body: "Drinking windows and priorities show what is ready, what should wait, and what needs attention." },
      { title: "Understand your cellar", body: "Value, maturity, purchases, and tastings become one coherent view of the collection." },
    ],
    journey: {
      eyebrow: "From bottles to intelligence",
      title: "Add a bottle. Vinaris builds the context.",
      body: "Every field supports a concrete decision: find, hold, open, buy, or remember.",
      steps: [
        { title: "Add or recognise", body: "Start from a label, a search, or a manual cellar record." },
        { title: "Organise the data", body: "Producer, vintage, format, status, ownership, and photographs stay connected." },
        { title: "Follow what changes", body: "Maturity, value, deliveries, and data quality become operational signals." },
        { title: "Decide from your cellar", body: "Filters and recommendations use your real collection, not an abstract catalogue." },
      ],
      capture: "Label recognition",
      recognised: "Bottle recognised",
      enriched: "Record ready to review",
    },
    maturity: {
      eyebrow: "The drinking window",
      title: "Never forget a bottle at the back of your cellar.",
      body: "Vinaris turns maturity into a readable timeline: know when to wait, when a wine enters its ideal phase, and when it is time to act.",
      stages: ["Too young", "Ready", "At peak", "Drink soon"],
      bottle: "Barbaresco Basarin · 2023",
      ideal: "Ideal window",
      peak: "Peak 2030–2036",
      risk: "Value to protect",
      note: "Windows are management guidance: storage and the condition of each bottle remain decisive.",
    },
    sommelier: {
      eyebrow: "AI Sommelier",
      title: "Advice built around bottles you already own.",
      body: "Describe the dish or occasion. The Sommelier considers style, maturity, and preferences to recommend bottles from your cellar.",
      question: "What should I open with mushroom risotto?",
      answer: "Based on your cellar, these bottles are currently in their ideal window and have the structure and freshness for the dish.",
      cellarLabel: "From your cellar",
      ready: "Ready now",
      alternative: "More evolved alternative",
    },
    insights: {
      eyebrow: "Collection control",
      title: "Your cellar, understood as a whole.",
      body: "From one bottle to capital allocation: a dashboard for priorities, concentrations, and movement without losing the detail.",
      bottles: "Bottles",
      value: "Total value",
      ready: "Drink now",
      regions: "Leading regions",
      deliveries: "Expected deliveries",
      growth: "Collection evolution",
      regionNames: ["Tuscany", "Bordeaux", "Piedmont"],
    },
    features: {
      eyebrow: "Everything else, connected",
      title: "From purchase intent to bottle memory.",
      items: [
        { title: "Wishlist", body: "Target prices, priorities, and strategy before you buy.", stat: "Buy with intent" },
        { title: "Deliveries and futures", body: "Orders, en primeur, collections, and committed capital on one timeline.", stat: "4 incoming" },
        { title: "Tasting history", body: "Notes, occasions, ratings, and pairings remain in cellar memory.", stat: "Remember what you drank" },
        { title: "Valuation", body: "Purchase price, current estimate, and history for each wine and the full collection.", stat: "CHF 9’312" },
        { title: "Advanced filters", body: "Find by region, status, maturity, value, format, or owner without friction.", stat: "A readable cellar" },
        { title: "Cellar statistics", body: "Distribution, data quality, and past-window risk in an operational view.", stat: "Decisions, not empty charts" },
      ],
    },
    closing: {
      eyebrow: "Your cellar story",
      title: "Your cellar already has a story. Vinaris helps you understand it.",
      body: "Build a private archive that supports purchases, patience, openings, and memory over time.",
      primary: "Start building your cellar",
      demo: "View the demo cellar",
      monthly: "CHF 6 / month",
      annual: "CHF 60 / year",
      annualNote: "Save two months with the annual plan",
      aiNote: "Starter AI credit lets you try the advanced features.",
    },
    footer: { statement: "Private cellar intelligence for wine collectors.", privacy: "Privacy", terms: "Terms", login: "Log in" },
    meta: { title: "Vinaris · Private Cellar Intelligence", description: "Manage bottles, drinking windows, value, deliveries, wishlist, and tasting memory in one private intelligent cellar." },
  },
};
