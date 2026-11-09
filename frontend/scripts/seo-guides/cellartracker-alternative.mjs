// CellarTracker facts on this page come from CellarTracker's own pages, checked
// on 2026-11-09: support.cellartracker.com articles 20 (automatic valuation),
// 25 (voluntary payment / subscription), 28 (Ready to Drink report),
// 29 (exporting data), 32 (what can be tracked), 39 (professional reviews)
// and mobileapp.cellartracker.com. Recheck them before changing any claim.
// Vinaris import facts come from backend/app/api/routes/imports.py
// (cellartracker_wines / cellartracker_wine_data): Location and Bin become
// Vinaris locations and bins; one-row-per-bottle exports are counted per row.
export default {
  id: "cellartracker-alternative",
  published: "2026-11-09",
  it: {
    slug: "alternativa-a-cellartracker",
    title: "Alternativa a CellarTracker: Vinaris a confronto",
    description: "Vinaris e CellarTracker a confronto: cosa importa Vinaris dall'export, ubicazioni, finestre di beva, stima del valore e prezzi. Riserva CHF 60 all'anno.",
    lead: "CellarTracker è lo strumento con cui molti collezionisti hanno iniziato, e resta il più completo per le note della community. Questa pagina mette a confronto le due app su quello che conta quando cambi: cosa porti con te, come ritrovi le bottiglie, come leggi le finestre di beva, come segui il valore e quanto paghi.",
    sections: [
      {
        heading: "Perché cercare un'alternativa a CellarTracker?",
        paragraphs: [
          "Di solito si cerca un'alternativa a CellarTracker per tre motivi: un'interfaccia più semplice da usare in cantina, i prezzi in franchi invece che in dollari, e un'app pensata per la propria collezione privata più che per la community.",
          "CellarTracker nasce come grande database condiviso: milioni di note di degustazione, punteggi, finestre di beva proposte da altri utenti e da critici. Se è questo che usi ogni giorno, difficilmente troverai di meglio. Vinaris parte dall'altra parte: dalla tua cantina. Ogni bottiglia ha la sua posizione, la sua finestra di beva divisa in fasi, il prezzo pagato e una stima di valore con le fonti linkate, e il sommelier AI suggerisce cosa aprire scegliendo solo tra le bottiglie che possiedi.",
          "Non è una questione di migliore o peggiore in assoluto. È una scelta tra due modi di lavorare, e la tabella qui sotto prova a mostrarla senza giri di parole.",
        ],
      },
      {
        heading: "Come si confrontano Vinaris e CellarTracker?",
        paragraphs: [
          "In breve: CellarTracker vince su community, recensioni professionali e dati d'asta; Vinaris punta su una cantina privata più semplice da tenere in ordine, con valore e finestre di beva spiegati bottiglia per bottiglia e prezzi in CHF.",
        ],
        table: {
          caption: "Confronto verificato il 9 novembre 2026",
          columns: ["", "Vinaris", "CellarTracker"],
          rows: [
            ["Prezzo", "Gratis fino a 15 etichette attive. Riserva: CHF 6 al mese o CHF 60 all'anno. Le funzioni AI usano un AI Pack prepagato.", "Base gratuita. Abbonamento annuale suggerito in base alle bottiglie: da USD 40 (fino a 100) a USD 500 (oltre 2'500); puoi scegliere un importo diverso."],
            ["Import ed export", "Legge l'export CSV «My Cellar» di CellarTracker: vino, produttore, annata, quantità, formato, tipo, regione, denominazione, vitigno principale, prezzo, valore, finestra di beva e punteggi, con ubicazioni e bin. Export completo in JSON.", "Export in CSV o testo dal sito desktop (non dall'app mobile)."],
            ["Ubicazioni", "Ubicazioni e bin con nome; lo stesso vino può stare in più posti con quantità diverse.", "Ubicazione, bin e nota privata per ogni bottiglia."],
            ["Finestre di beva", "Per ogni bottiglia, divise in fasi (da aspettare, ideale, da bere presto). Inserite da te, importate o stimate dall'AI.", "Personali, della community e dei critici. Le finestre avanzate e il report «Ready to Drink» richiedono l'abbonamento."],
            ["Valore", "Stima da una ricerca web dei prezzi attuali nelle enoteche del mercato che scegli, con il link a ogni fonte; storico del valore. Usa credito AI.", "Valutazione automatica con dati d'asta Wine Market Journal e media della community, solo per abbonati; altrimenti il tuo valore o il prezzo d'acquisto."],
            ["Community e recensioni", "Nessuna community: la cantina resta privata.", "Oltre 12 milioni di note di degustazione della community; canali di recensioni professionali con abbonamento alla singola testata."],
            ["Dove si usa", "Nel browser, su computer e telefono. Italiano e inglese.", "Sito web e app per iOS e Android."],
          ],
          note: "Fonti CellarTracker: support.cellartracker.com (valutazione automatica, abbonamento, report Ready to Drink, export, dati tracciabili, recensioni professionali) e mobileapp.cellartracker.com, consultati il 9 novembre 2026. I prezzi CellarTracker sono in dollari USA.",
        },
      },
      {
        heading: "Cosa importa Vinaris da un export di CellarTracker?",
        paragraphs: [
          "Vinaris importa il file CSV «My Cellar» di CellarTracker con l'identità di ogni vino, quantità, ubicazioni e bin, prezzi, valore, finestra di beva e punteggi.",
          "Prima di confermare vedi un'anteprima: quanti vini sono nuovi, quanti sembrano già presenti e, sul piano gratuito, quanti rientrano nelle 15 etichette attive. Poi scegli come procedere: saltare i possibili duplicati (consigliato), aggiornare i vini esistenti, aggiungere tutto o sostituire tutto. Ogni vino importato riceve il tag «CellarTracker», così lo ritrovi subito.",
        ],
        list: [
          "Importati: nome del vino, produttore, annata (NV compreso), quantità, formato, colore o tipo, paese, regione, sottoregione, denominazione, vigneto, vitigno principale.",
          "Importati: prezzo d'acquisto e valuta, valore indicato in CellarTracker (diventa il primo punto dello storico), inizio e fine della finestra di beva con la sua fonte.",
          "Importati: ubicazione e bin. Vinaris crea quelli che mancano e, se lo stesso vino sta in più posti, tiene le bottiglie divise fra le posizioni.",
          "Importati: punteggi dei critici presenti nell'export, il tuo punteggio personale e la tua nota privata; le bottiglie ancora in ordine finiscono nelle note.",
          "Non importati oggi: cronologia delle bottiglie bevute, note di degustazione della community, più vitigni per lo stesso vino.",
        ],
      },
      {
        heading: "Quanto costa ciascuna app per una cantina di 300 bottiglie?",
        paragraphs: [
          "Per 300 bottiglie, il contributo annuale suggerito da CellarTracker è di USD 80 (fascia fino a 500 bottiglie), mentre Vinaris Riserva costa CHF 60 all'anno, indipendentemente dal numero di bottiglie.",
          "Vinaris conta le etichette, non le bottiglie: sei bottiglie dello stesso vino e annata sono una sola etichetta. Se le tue 300 bottiglie sono, per esempio, 100 vini e annate diversi, hai 100 etichette: oltre le 15 del piano gratuito, quindi usi Riserva a CHF 6 al mese o CHF 60 all'anno. Le funzioni AI, come la stima del valore o della finestra di beva, si pagano a parte con un AI Pack prepagato, il cui prezzo vedi nell'app prima di pagare.",
          "Su CellarTracker l'importo è un suggerimento: puoi scegliere di pagare di più o di meno, e la base resta gratuita. Senza abbonamento, però, non hai la valutazione automatica né le finestre di beva avanzate.",
        ],
      },
      {
        heading: "Quando conviene restare su CellarTracker?",
        paragraphs: [
          "Conviene restare su CellarTracker se leggi ogni giorno le note degli altri utenti, se ti servono le recensioni professionali integrate o se valuti la cantina sui prezzi d'asta.",
          "Vale lo stesso per chi preferisce un'app nativa installata su iOS o Android: Vinaris funziona nel browser, anche sul telefono. E se la cronologia delle bottiglie bevute negli anni è la parte che consulti di più, tieni presente che oggi non viene importata.",
        ],
      },
      {
        heading: "Come si passa da CellarTracker a Vinaris?",
        paragraphs: [
          "Si esporta la vista «My Cellar» in CSV dal sito desktop di CellarTracker e la si carica in Vinaris dalla sezione «Porta la tua collezione in Vinaris»; in pochi minuti la cantina è pronta da controllare.",
        ],
        list: [
          "Su CellarTracker, dal sito desktop, apri «My Cellar» ed esporta in CSV.",
          "Crea il tuo account Vinaris gratuito e apri «Porta la tua collezione in Vinaris».",
          "Scegli il file, controlla l'anteprima e lascia «Salta i possibili duplicati».",
          "Controlla ubicazioni e bin importati; assegna le eventuali bottiglie rimaste senza posizione.",
          "Tieni CellarTracker finché non hai controllato la nuova cantina.",
        ],
      },
    ],
    faq: [
      { question: "Vinaris è gratuito come CellarTracker?", answer: "Vinaris è gratuito fino a 15 etichette attive, senza carta. Oltre, il piano Riserva costa CHF 6 al mese o CHF 60 all'anno. CellarTracker ha una base gratuita senza limite e un abbonamento facoltativo per funzioni come la valutazione automatica." },
      { question: "Perdo le mie note se lascio CellarTracker?", answer: "La tua nota privata e il tuo punteggio personale presenti nell'export «My Cellar» vengono importati. La cronologia delle bottiglie bevute e le note della community non sono nell'import di oggi: conservale esportandole anche da CellarTracker." },
      { question: "Vinaris importa ubicazioni e bin di CellarTracker?", answer: "Sì. Le colonne Location e Bin dell'export diventano ubicazioni e bin in Vinaris, creati se non esistono ancora. Se lo stesso vino sta in più posti, le bottiglie restano divise fra le posizioni, anche con un export che elenca una riga per bottiglia." },
      { question: "Da dove viene il valore stimato in Vinaris?", answer: "Da una ricerca web dei prezzi attuali nelle enoteche del mercato che scegli, con il link a ogni fonte usata. Se l'export di CellarTracker contiene un valore, diventa il primo punto dello storico." },
      { question: "Posso usare Vinaris e CellarTracker insieme?", answer: "Sì. Puoi importare la cantina, provarla per qualche settimana e tenere CellarTracker finché non sei sicuro. Un nuovo import con «Aggiorna esistenti» riallinea i vini già presenti." },
      { question: "Posso riportare i dati fuori da Vinaris?", answer: "Sì. Dall'app puoi esportare l'intera cantina in JSON in qualsiasi momento, e cancellare l'account quando vuoi." },
    ],
    disclaimer: "Il confronto si basa sulle pagine ufficiali di CellarTracker consultate il 9 novembre 2026; prezzi e funzioni possono cambiare. Scrivi a info@vinaris.app se trovi un dato non aggiornato.",
  },
  en: {
    slug: "cellartracker-alternative",
    title: "CellarTracker alternative: Vinaris compared",
    description: "Vinaris and CellarTracker compared: what Vinaris imports from your export, locations, drinking windows, value tracking and price. Reserve is CHF 60 a year.",
    lead: "CellarTracker is where many collectors started, and it is still the most complete source of community tasting notes. This page compares the two apps on what matters when you switch: what comes with you, how you find bottles, how you read drinking windows, how you follow value and what you pay.",
    sections: [
      {
        heading: "Why look for a CellarTracker alternative?",
        paragraphs: [
          "Collectors usually look for a CellarTracker alternative for three reasons: an interface that is simpler to use in the cellar, prices in Swiss francs rather than US dollars, and an app built around their own private collection rather than the community.",
          "CellarTracker started as a large shared database: millions of tasting notes, scores and drinking windows from other users and from critics. If that is what you use every day, you will struggle to find better. Vinaris starts from the other end: your cellar. Every bottle has its location, a drinking window split into stages, the price you paid and a value estimate with its sources linked, and the AI sommelier suggests what to open from bottles you actually own.",
          "This is not about better or worse in general. It is a choice between two ways of working, and the table below tries to show it plainly.",
        ],
      },
      {
        heading: "How do Vinaris and CellarTracker compare?",
        paragraphs: [
          "In short: CellarTracker wins on community, professional reviews and auction data; Vinaris focuses on a private cellar that is simpler to keep in order, with value and drinking windows explained bottle by bottle and prices in CHF.",
        ],
        table: {
          caption: "Comparison checked on 9 November 2026",
          columns: ["", "Vinaris", "CellarTracker"],
          rows: [
            ["Price", "Free up to 15 active labels. Reserve: CHF 6 a month or CHF 60 a year. AI features use a prepaid AI Pack.", "Free core. Suggested annual subscription by bottle count: from USD 40 (up to 100) to USD 500 (over 2,500); you can choose a different amount."],
            ["Import and export", "Reads CellarTracker's \"My Cellar\" CSV export: wine, producer, vintage, quantity, size, type, region, appellation, main grape, price, value, drinking window and scores, with locations and bins. Full export as JSON.", "Export as CSV or text from the desktop website (not the mobile app)."],
            ["Locations", "Named locations and bins; one wine can sit in several places with different quantities.", "Location, bin and private note for each bottle."],
            ["Drinking windows", "Per bottle, split into stages (wait, ideal, drink soon). Entered by you, imported or estimated by AI.", "Personal, community and professional. Enhanced windows and the Ready to Drink report need a subscription."],
            ["Value", "Estimate from a web search of current wine-shop prices in the market you choose, with a link to each source; value history. Uses AI credit.", "Automatic valuation with Wine Market Journal auction data and community averages, for subscribers only; otherwise your own value or the purchase price."],
            ["Community and reviews", "No community: the cellar stays private.", "Over 12 million community tasting notes; professional review channels with your own subscription to each publication."],
            ["Where you use it", "In the browser, on computer and phone. Italian and English.", "Website and apps for iOS and Android."],
          ],
          note: "CellarTracker sources: support.cellartracker.com (automatic valuation, subscription, Ready to Drink report, exporting data, what can be tracked, professional reviews) and mobileapp.cellartracker.com, checked on 9 November 2026. CellarTracker prices are in US dollars.",
        },
      },
      {
        heading: "What does Vinaris import from a CellarTracker export?",
        paragraphs: [
          "Vinaris imports CellarTracker's \"My Cellar\" CSV file with each wine's identity, quantity, locations and bins, prices, value, drinking window and scores.",
          "Before you confirm, you see a preview: how many wines are new, how many look like ones you already have and, on the free plan, how many fit within the 15 active labels. Then you choose how to proceed: skip likely duplicates (recommended), update existing wines, add everything or replace everything. Every imported wine gets the \"CellarTracker\" tag, so you can find it straight away.",
        ],
        list: [
          "Imported: wine name, producer, vintage (including NV), quantity, bottle size, colour or type, country, region, sub-region, appellation, vineyard, main grape.",
          "Imported: purchase price and currency, the value shown in CellarTracker (it becomes the first point of the value history), drinking window start and end with its source.",
          "Imported: location and bin. Vinaris creates the ones that are missing and, when one wine sits in several places, keeps the bottles split across them.",
          "Imported: critic scores included in the export, your personal score and your private note; bottles still on order are noted.",
          "Not imported today: the history of bottles you drank, community tasting notes, several grapes for one wine.",
        ],
      },
      {
        heading: "What does each app cost for a 300-bottle cellar?",
        paragraphs: [
          "For 300 bottles, CellarTracker's suggested annual payment is USD 80 (the up-to-500-bottles tier), while Vinaris Reserve costs CHF 60 a year whatever the number of bottles.",
          "Vinaris counts labels, not bottles: six bottles of the same wine and vintage are one label. If your 300 bottles are, say, 100 different wines and vintages, that is 100 labels: past the 15 of the free plan, so you use Reserve at CHF 6 a month or CHF 60 a year. AI features, such as value or drinking-window estimates, are paid separately with a prepaid AI Pack, whose price you see in the app before you pay.",
          "On CellarTracker the amount is a suggestion: you can pay more or less, and the core stays free. Without a subscription, though, you do not get automatic valuation or enhanced drinking windows.",
        ],
      },
      {
        heading: "When is it better to stay with CellarTracker?",
        paragraphs: [
          "Staying with CellarTracker makes sense if you read other users' notes every day, rely on its integrated professional reviews or value your cellar on auction prices.",
          "The same goes if you prefer a native app installed on iOS or Android: Vinaris runs in the browser, phone included. And if the history of bottles you drank over the years is the part you consult most, bear in mind that it is not imported today.",
        ],
      },
      {
        heading: "How do you move from CellarTracker to Vinaris?",
        paragraphs: [
          "You export the \"My Cellar\" view as CSV from the CellarTracker desktop website and upload it in Vinaris under \"Bring your collection to Vinaris\"; within minutes the cellar is ready to check.",
        ],
        list: [
          "On the CellarTracker desktop website, open My Cellar and export it as CSV.",
          "Create your free Vinaris account and open \"Bring your collection to Vinaris\".",
          "Choose the file, check the preview and keep \"Skip likely duplicates\".",
          "Check the imported locations and bins; assign any bottles left without a position.",
          "Keep CellarTracker until you have checked the new cellar.",
        ],
      },
    ],
    faq: [
      { question: "Is Vinaris free like CellarTracker?", answer: "Vinaris is free up to 15 active labels, with no card. Beyond that, the Reserve plan costs CHF 6 a month or CHF 60 a year. CellarTracker has a free core with no limit and an optional subscription for features such as automatic valuation." },
      { question: "Do I lose my notes if I leave CellarTracker?", answer: "Your private note and personal score in the My Cellar export are imported. The history of bottles you drank and community notes are not part of today's import: keep a copy by exporting them from CellarTracker too." },
      { question: "Does Vinaris import CellarTracker locations and bins?", answer: "Yes. The Location and Bin columns of the export become locations and bins in Vinaris, created when they do not exist yet. When one wine sits in several places, its bottles stay split across them, including with an export that lists one row per bottle." },
      { question: "Where does the value estimate in Vinaris come from?", answer: "From a web search of current wine-shop prices in the market you choose, with a link to each source used. If your CellarTracker export includes a value, it becomes the first point of the value history." },
      { question: "Can I use Vinaris and CellarTracker together?", answer: "Yes. You can import your cellar, try it for a few weeks and keep CellarTracker until you are sure. A new import with \"Update existing wines\" brings the wines you already have back in line." },
      { question: "Can I take my data out of Vinaris?", answer: "Yes. From the app you can export the whole cellar as JSON at any time, and delete your account whenever you want." },
    ],
    disclaimer: "This comparison is based on CellarTracker's official pages checked on 9 November 2026; prices and features may change. Write to info@vinaris.app if you spot something out of date.",
  },
};
