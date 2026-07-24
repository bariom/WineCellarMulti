import type { Locale } from "../types";

export type HelpGuide = {
  eyebrow: string;
  title: string;
  intro: string;
  sections: Array<{ title: string; body: string; bullets: string[] }>;
};

export const helpGuideContentV2: Record<Locale, HelpGuide> = {
  en: {
    eyebrow: "Guide",
    title: "How to use Vinaris",
    intro:
      "This guide is designed as a practical operating manual for collectors. Start with setup, then use the later sections as a working reference for cellar routines, buying decisions, AI, and shared workflows.",
    sections: [
      {
        title: "1. Start with your cellar",
        body: "The Cellar view is where your real collection lives. Add delivered bottles first, then ordered bottles, future deliveries, and shared positions.",
        bullets: [
          "Use Add wine to register producer, vintage, quantity, bottle format, status, and purchase price.",
          "Vintage supports classic years plus NV or MV for non-vintage cuvees.",
          "For shared bottles, define ownership and percentages directly in the wine record.",
          "If you already have structured data, import it from Settings > Data.",
        ],
      },
      {
        title: "2. Use the dashboard to decide what matters now",
        body: "Home is not just a summary. It is your operational screen for drinking decisions, upcoming deliveries, and data cleanup.",
        bullets: [
          "Start from the focus bar at the top: Collector focus, Drink well today, and Balanced cellar reorganize the summary and the cards around your current goal.",
          "Timeline helps you track futures and expected arrivals over time.",
          "Value and data views help you spot concentration, missing fields, and stale pricing faster.",
        ],
      },
      {
        title: "3. Build a buying workflow with Wishlist",
        body: "Wishlist keeps future purchases separate from the active cellar until you are ready to convert them into real positions.",
        bullets: [
          "Create multiple wishlist lists when you want to separate themes such as reds, Champagne, restaurant buys, or short-term opportunities.",
          "Add target prices, priority, purpose, merchant notes, and optional AI context notes.",
          "[AI] Use AI suggestions, if configured, to refine buying strategy, purpose, and live market price.",
          "Convert wishlist items into cellar positions when you buy them, or delete a whole list knowing its items are deleted with it.",
        ],
      },
      {
        title: "4. Use wine details as your decision screen",
        body: "Open any wine to see the full card with value, drinking window, notes, ownership, grapes, scores, and value history.",
        bullets: [
          "[AI] The drinking window shows young, ideal, and past-window periods with the current year marker when AI window data has been generated.",
          "[AI] Market price checks can enrich the wine card with AI-assisted live pricing and source-backed value context.",
          "Value evolution tracks the historical pricing points you record over time.",
          "Edit mode is the place to update scores, tags, grapes, quantities, format, and delivery state.",
        ],
      },
      {
        title: "5. Record consumption and preserve tasting memory",
        body: "When a bottle is consumed, Vinaris reduces the cellar quantity and stores the tasting information in History.",
        bullets: [
          "Use Bottle consumed from the wine detail to register date, note, occasion, pairing, companions, and tasting rating.",
          "Once the last bottle is gone, the wine moves out of the active cellar and remains available in History.",
          "History is your long-term tasting archive, not just a deleted-bottles list.",
          "Consumed entries can be edited later if you want to add details you forgot during the first tasting registration.",
        ],
      },
      {
        title: "6. Activate AI only if you want it",
        body: "Vinaris works without AI, but it becomes more powerful when you connect your own OpenAI key or use an in-app AI Pack.",
        bullets: [
          "AI can help with tasting notes, drinking windows, price checks, grapes, wishlist strategy, pairings, and direct wine comparisons.",
          "If you do not want to use your own key, buy an AI Pack directly in the app and let Vinaris handle the AI usage.",
          "Your own token is encrypted and stored securely, while AI Pack usage is tracked inside your account budget.",
          "All AI settings live in Settings > AI and remain under your control.",
        ],
      },
      {
        title: "7. Use the sommelier and comparison tools",
        body: "Vinaris is not only a cellar ledger. It also helps you decide what to open, what to buy, and how two bottles differ.",
        bullets: [
          "[AI] Pairing lets you enter a dish and ask the AI sommelier for the best matches from your cellar or from the market.",
          "You can save personal pairing preferences and optionally ignore them for a single request when you want a neutral recommendation.",
          "Set a max pairing budget when you want a good match under a price ceiling, not necessarily the best bottle in the cellar.",
          "Wine comparison helps you place two wines side by side before opening or buying.",
          "[AI] AI comparison works best on two wines and returns style, readiness, occasion, and cellar-value judgment.",
        ],
      },
      {
        title: "8. Manage cellars, access, and shared workflows",
        body: "Vinaris supports multiple cellars per user, cellar invitations, and mirrored shared positions between collectors.",
        bullets: [
          "Use Settings > Cellars to rename the active cellar, create a new one, or switch between existing cellars.",
          "Anyone you invite to a cellar must already have their own Vinaris account.",
          "For shared wines, first grant visibility to shared bottles, then send the shared position so it appears in the other collector's cellar too.",
        ],
      },
      {
        title: "9. Follow notifications and data quality",
        body: "Notifications and data-quality views help you keep the cellar operational instead of slowly drifting out of date.",
        bullets: [
          "Notifications help you track invites, redeem codes, approvals, expiring access, incoming shared positions, future deliveries, and wines waiting to be collected.",
          "Data Quality highlights missing value, drink window, grapes, and scores so you know what to complete next.",
          "Wines without a usable vintage such as NV or MV are excluded from drink-window missing-data checks where appropriate.",
        ],
      },
      {
        title: "10. Import, export, and move data safely",
        body: "Vinaris supports structured export and import so each cellar can be backed up or restored with intent.",
        bullets: [
          "Use Settings > Data to export the active cellar and choose which blocks to include.",
          "Vinaris JSON import is meant for Vinaris exports and can restore more than wines alone depending on the selected blocks.",
          "Be careful when importing shared data such as members, invites, and ownership because those blocks can grant access to other accounts.",
          "Offline backup loading appears when you are without network, or after a failed login caused by missing connectivity, so you can still browse a cellar snapshot in read-only mode.",
        ],
      },
    ],
  },
  it: {
    eyebrow: "Guida",
    title: "Come usare Vinaris",
    intro:
      "Questa guida è pensata come manuale operativo per il collezionista. Parti dalla configurazione iniziale e poi usa le sezioni successive come riferimento pratico per routine di cantina, acquisti, AI e condivisioni.",
    sections: [
      {
        title: "1. Parti dalla tua cantina",
        body: "La vista Cantina è il luogo dove vive la collezione reale. Inserisci prima i vini già in cantina, poi ordini, consegne future e posizioni condivise.",
        bullets: [
          "Usa Aggiungi vino per registrare produttore, annata, quantità, formato bottiglia, stato e prezzo di acquisto.",
          "L'annata supporta gli anni classici ma anche NV o MV per cuvée non millesimate.",
          "Per le bottiglie condivise, definisci proprietà e percentuali direttamente nella scheda vino.",
          "Se hai già dati strutturati, importali da Impostazioni > Data.",
        ],
      },
      {
        title: "2. Usa la dashboard per capire cosa conta adesso",
        body: "La Home non è solo un riepilogo. È la schermata operativa per decidere cosa bere, cosa arriverà e quali dati completare.",
        bullets: [
          "Parti dalla barra dei focus in alto: Focus collezionista, Bere bene oggi e Cantina equilibrata riorganizzano il riepilogo e le schede in base al tuo obiettivo del momento.",
          "Timeline ti aiuta a seguire futures ed arrivi attesi nel tempo.",
          "Le viste valore e qualità dati ti aiutano a vedere più rapidamente concentrazione, campi mancanti e prezzi da aggiornare.",
        ],
      },
      {
        title: "3. Costruisci il flusso acquisti con la Wishlist",
        body: "La Wishlist tiene separate le bottiglie future dalla cantina attiva finché non decidi di comprarle o convertirle in posizioni reali.",
        bullets: [
          "Crea più liste wishlist quando vuoi separare temi diversi, come rossi, Champagne, acquisti da ristorante o opportunità di breve periodo.",
          "Aggiungi prezzi target, priorità, scopo, note merchant e, se utile, una nota contesto AI.",
          "[AI] Usa i suggerimenti AI, se configurati, per affinare strategia di acquisto, scopo e prezzo di mercato live.",
          "Converti gli elementi wishlist in posizioni di cantina quando acquisti, oppure elimina una lista sapendo che anche i suoi elementi verranno eliminati.",
        ],
      },
      {
        title: "4. Usa il dettaglio vino come schermo decisionale",
        body: "Apri un vino per vedere la scheda completa con valore, finestra di beva, note, proprietà, uve, punteggi e storico del valore.",
        bullets: [
          "[AI] La finestra di beva evidenzia il periodo giovane, ideale e oltre finestra con l'indicatore dell'anno corrente quando hai generato i dati AI della finestra.",
          "[AI] I controlli di prezzo possono arricchire la scheda vino con valore di mercato live assistito da AI e fonti verificate.",
          "L'evoluzione valore tiene traccia dei punti prezzo che registri nel tempo.",
          "La modalità modifica è il posto giusto per aggiornare punteggi, tag, uve, quantità, formato e stato consegna.",
        ],
      },
      {
        title: "5. Registra il consumo e conserva la memoria degustativa",
        body: "Quando una bottiglia viene bevuta, Vinaris scala la quantità in cantina e salva i dati della degustazione nello Storico.",
        bullets: [
          "Usa Bevuta 1 dal dettaglio vino per registrare data, nota, occasione, abbinamento, compagni e voto degustativo.",
          "Quando finisce l'ultima bottiglia, il vino esce dalla cantina attiva ma resta consultabile nello Storico.",
          "Lo Storico è il tuo archivio degustativo di lungo periodo, non solo una lista di bottiglie eliminate.",
          "Le bevute registrate possono essere modificate in un secondo momento se vuoi completare note o dettagli dimenticati.",
        ],
      },
      {
        title: "6. Attiva l'AI solo se ti serve",
        body: "Vinaris funziona anche senza AI, ma diventa più potente quando colleghi la tua chiave OpenAI oppure usi un AI Pack in-app.",
        bullets: [
          "L'AI può aiutarti con note degustative, finestre di beva, controlli di valore, uvaggi, strategia wishlist, abbinamenti e confronti diretti tra vini.",
          "Se non vuoi usare una chiave personale, puoi acquistare un AI Pack direttamente nell'app e lasciare a Vinaris la gestione dell'uso AI.",
          "Il tuo token personale viene criptato e archiviato in modo sicuro, mentre l'AI Pack usa il budget interno del tuo account.",
          "Tutte le impostazioni AI vivono in Impostazioni > AI e restano sotto il tuo controllo.",
        ],
      },
      {
        title: "7. Usa sommelier AI e confronto vini",
        body: "Vinaris non è solo un registro di cantina. Ti aiuta anche a decidere cosa aprire, cosa comprare e come due bottiglie si differenziano.",
        bullets: [
          "[AI] Abbinamento ti permette di inserire un piatto e chiedere al sommelier AI i match migliori dalla tua cantina o dal mercato.",
          "Puoi salvare i tuoi gusti personali per gli abbinamenti e ignorarli su una singola richiesta quando vuoi un responso più neutro.",
          "Puoi fissare un budget massimo per ottenere un abbinamento buono entro una certa soglia di prezzo, non per forza la bottiglia migliore in assoluto.",
          "Confronto vini ti aiuta a mettere due fino a quattro bottiglie fianco a fianco prima di aprirle o comprarle.",
          "[AI] Il confronto AI funziona al meglio su due vini e restituisce stile, prontezza, occasione ideale e giudizio cantina/valore.",
        ],
      },
      {
        title: "8. Gestisci cantine, accessi e flussi condivisi",
        body: "Vinaris supporta più cantine per utente, inviti in cantina e rispecchiamento delle posizioni condivise tra collezionisti.",
        bullets: [
          "Usa Impostazioni > Cantine per rinominare la cantina attiva, crearne una nuova o passare da una cantina all'altra.",
          "Chi inviti in una cantina deve comunque essere già titolare di un account Vinaris.",
          "Per i vini condivisi, prima concedi visibilità alle sole bottiglie condivise e poi invia la posizione così comparirà anche nella cantina dell'altro collezionista.",
        ],
      },
      {
        title: "9. Segui notifiche e qualità dati",
        body: "Notifiche e controlli qualità dati servono a mantenere la cantina operativa, non semplicemente popolata.",
        bullets: [
          "Le notifiche ti aiutano a seguire inviti, codici redeem, approvazioni, accessi in scadenza, posizioni condivise in arrivo, consegne future e vini da ritirare.",
          "Qualità dati evidenzia valori mancanti, finestre di beva assenti, uve mancanti e punteggi non ancora censiti.",
          "I vini senza annata utile, come NV o MV, vengono esclusi dai controlli sulla finestra di beva quando non è sensato richiederla.",
        ],
      },
      {
        title: "10. Importa, esporta e sposta i dati con criterio",
        body: "Vinaris supporta export e import strutturati così ogni cantina può essere salvata o ripristinata in modo intenzionale.",
        bullets: [
          "Usa Impostazioni > Data per esportare la cantina attiva e scegliere quali blocchi includere.",
          "L'import JSON Vinaris è pensato per gli export Vinaris e può ripristinare più elementi dei soli vini, a seconda dei blocchi selezionati.",
          "Fai attenzione ai dati condivisi come membri, inviti e proprietà perché quei blocchi possono dare accesso anche ad altri account.",
          "Il backup offline compare quando sei senza rete, oppure dopo un login fallito per assenza di connessione, così puoi comunque consultare uno snapshot in sola lettura.",
        ],
      },
    ],
  },
};
