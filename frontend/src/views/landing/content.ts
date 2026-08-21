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
  origin: {
    eyebrow: string;
    title: string;
    body: string;
    signature: string;
    demoLabel: string;
    desktopCaption: string;
    mobileCaption: string;
    desktopAlt: string;
    mobileAlt: string;
  };
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
  restaurant: {
    eyebrow: string;
    title: string;
    body: string;
    availability: string;
    initialFee: string;
    contact: string;
    dashboardAlt: string;
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
    tiers: Array<{ label: string; name: string; body: string; note: string }>;
    aiNote: string;
  };
  footer: { statement: string; privacy: string; cookies: string; terms: string; login: string };
  meta: { title: string; description: string };
};

export const landingCopy: Record<Locale, LandingCopy> = {
  it: {
    nav: { product: "Prodotto", maturity: "Finestra di beva", sommelier: "Sommelier", insights: "Analisi", pricing: "Accesso" },
    header: { login: "Accedi", register: "Inizia", menu: "Apri menu", close: "Chiudi menu", language: "Lingua" },
    hero: {
      eyebrow: "Private Cellar Intelligence",
      title: "Il vino giusto. Al momento giusto.",
      lead: "Gestisci la cantina, segui la maturità di ogni bottiglia e ricevi indicazioni costruite sui vini che possiedi davvero.",
      primary: "Crea la tua cantina",
      secondary: "Scopri come funziona",
      demo: "Esplora la cantina demo",
      signal: "Gratis con tutte le funzioni private fino a 15 etichette attive",
      web: "Web app privata · piano gratuito disponibile",
    },
    value: [
      { title: "Trova ogni bottiglia", body: "Ricerca, filtri, fotografie, formati e posizione: la collezione resta leggibile mentre cresce." },
      { title: "Aprila al momento giusto", body: "Finestre di beva e priorità mostrano cosa è pronto, cosa aspettare e cosa non dimenticare." },
      { title: "Comprendi la cantina", body: "Valore, maturità, acquisti e degustazioni diventano una visione coerente della collezione." },
    ],
    origin: {
      eyebrow: "Nato da una cantina reale",
      title: "Nato in cantina, non in un brief.",
      body: "Ho costruito Vinaris perché fogli di calcolo e app generiche non bastavano più a seguire acquisti, attese, finestre di beva e memoria della mia collezione. Oggi lo uso ogni giorno e continuo a progettarlo per cantine da 20 a oltre 1.000 bottiglie.",
      signature: "Il collezionista dietro Vinaris, partendo dalla propria cantina.",
      demoLabel: "Interfaccia reale",
      desktopCaption: "Cantina demo · vista desktop",
      mobileCaption: "La stessa cantina, su mobile",
      desktopAlt: "Dashboard desktop reale della cantina demo Vinaris",
      mobileAlt: "Dashboard mobile reale della cantina demo Vinaris",
    },
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
    restaurant: {
      eyebrow: "Per il servizio del vino",
      title: "Vinaris anche per il ristorante.",
      body: "Gestisci carta vini, giacenze, mescite, vendite, ricavi e margini in un unico spazio operativo.",
      availability: "La modalità ristorante è disponibile solo su richiesta.",
      initialFee: "Configurazione, condizioni e disponibilità vengono definite direttamente con Vinaris.",
      contact: "Contatta Vinaris per informazioni",
      dashboardAlt: "Anteprima della dashboard operativa Vinaris per ristoranti",
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
      primary: "Inizia con Degustazione",
      demo: "Guarda la cantina demo",
      tiers: [
        { label: "Piano gratuito", name: "Degustazione", body: "Tutte le funzioni private, fino a 15 etichette attive.", note: "Le funzioni AI si usano con un AI Pack." },
        { label: "Per collezionisti", name: "Riserva", body: "Per collezioni oltre 15 etichette attive e per chi desidera ancora più libertà.", note: "AI Pack o chiave OpenAI personale inclusi." },
      ],
      aiNote: "AI Pack è disponibile quando vuoi, anche con Degustazione.",
    },
    footer: { statement: "Private cellar intelligence per collezionisti di vino.", privacy: "Privacy", cookies: "Cookie", terms: "Condizioni d’uso", login: "Accesso" },
    meta: { title: "Vinaris | Cantina digitale e sommelier AI per collezionisti", description: "Gestisci bottiglie, finestre di beva, valore, consegne, wishlist e memoria degustativa in una cantina privata e intelligente." },
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
      signal: "Free with every private feature for up to 15 active labels",
      web: "Private web app · free tier available",
    },
    value: [
      { title: "Find every bottle", body: "Search, filters, photographs, formats, and location keep the collection readable as it grows." },
      { title: "Open it at the right moment", body: "Drinking windows and priorities show what is ready, what should wait, and what needs attention." },
      { title: "Understand your cellar", body: "Value, maturity, purchases, and tastings become one coherent view of the collection." },
    ],
    origin: {
      eyebrow: "Built from a real cellar",
      title: "Born in a cellar, not in a brief.",
      body: "I built Vinaris because spreadsheets and generic apps were no longer enough to follow purchases, waiting periods, drinking windows, and the memory of my collection. I now use it every day and keep designing it for cellars ranging from 20 to more than 1,000 bottles.",
      signature: "The collector behind Vinaris, starting from a real working cellar.",
      demoLabel: "Real interface",
      desktopCaption: "Demo cellar · desktop view",
      mobileCaption: "The same cellar, on mobile",
      desktopAlt: "Real desktop dashboard of the Vinaris demo cellar",
      mobileAlt: "Real mobile dashboard of the Vinaris demo cellar",
    },
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
    restaurant: {
      eyebrow: "For wine service",
      title: "Vinaris for restaurants, too.",
      body: "Manage your wine list, stock, by-the-glass service, sales, revenue, and margins in one operational space.",
      availability: "Restaurant mode is available by request only.",
      initialFee: "Configuration, terms and availability are defined directly with Vinaris.",
      contact: "Contact Vinaris for information",
      dashboardAlt: "Preview of the Vinaris restaurant operations dashboard",
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
      primary: "Start with Tasting",
      demo: "View the demo cellar",
      tiers: [
        { label: "Free plan", name: "Tasting", body: "Every private feature, for up to 15 active labels.", note: "AI features use an AI Pack." },
        { label: "For collectors", name: "Reserve", body: "For collections over 15 active labels and those who want more freedom.", note: "Use an AI Pack or a personal OpenAI key." },
      ],
      aiNote: "An AI Pack is available whenever you need it, including with Tasting.",
    },
    footer: { statement: "Private cellar intelligence for wine collectors.", privacy: "Privacy", cookies: "Cookies", terms: "Terms", login: "Log in" },
    meta: { title: "Vinaris | Digital wine cellar management and AI sommelier", description: "Manage bottles, drinking windows, value, deliveries, wishlist, and tasting memory in one private intelligent cellar." },
  },
};
