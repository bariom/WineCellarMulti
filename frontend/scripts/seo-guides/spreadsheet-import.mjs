// Vinaris facts on this page come from the spreadsheet import itself:
// backend/app/services/spreadsheet_import/ (formats, sheet kinds, column
// dictionary, name split, verbal ratings, movement registers), the routes in
// backend/app/api/routes/spreadsheet_imports.py (5 MB limit, 15 free AI names
// per cellar, saved mappings keyed on sheet names and headers only) and
// docs/SPREADSHEET_IMPORT.md. Recheck them before changing any claim.
export default {
  id: "spreadsheet-import",
  published: "2026-11-10",
  it: {
    slug: "importare-cantina-da-excel",
    title: "Importare la cantina da Excel in Vinaris",
    description:
      "Come Vinaris legge il tuo Excel così com'è: fogli, colonne, nomi, voti, registro di acquisti e bevute. Anteprima prima di importare, gratis fino a 15 etichette.",
    lead: "Chi tiene la cantina su un foglio di calcolo non dovrebbe ricominciare da zero quando passa a un'app. Vinaris legge il file così come l'hai costruito negli anni, con i tuoi fogli, le tue colonne e le tue abitudini, e ti mostra cosa ha capito prima di scrivere qualunque cosa in cantina.",
    sections: [
      {
        heading: "Quali file posso importare?",
        paragraphs: [
          "Vinaris importa file Excel (.xlsx, .xlsm e il vecchio .xls), fogli di LibreOffice e OpenOffice (.ods) e file CSV, fino a 5 MB.",
          "Non serve preparare il file secondo un modello. Va bene un foglio con una riga per vino, un foglio per ogni regione o per ogni stanza della cantina, una tabella che parte dalla riga 4 sotto un titolo, oppure un file con cantina, wishlist e note di degustazione in fogli separati. L'import parte da Impostazioni → Dati → Importa la tua cantina, accanto a CellarTracker e al backup Vinaris.",
        ],
      },
      {
        heading: "Come riconosce fogli e colonne?",
        paragraphs: [
          "Per ogni foglio Vinaris trova la tabella, ne riconosce l'intestazione e propone cosa contiene: cantina, wishlist, degustazioni, registro dei movimenti oppure un riepilogo da non importare.",
          "I fogli con la stessa intestazione vengono uniti in un'unica tabella, e il nome del foglio non si perde: se hai un foglio per ogni scaffale, diventa la posizione delle bottiglie. Le colonne sono riconosciute dal titolo in italiano, inglese, francese e tedesco e dai valori che contengono. Per ognuna vedi il campo proposto e qualche valore d'esempio, e puoi cambiarlo. Quello che non ha un campo preciso finisce nelle note del vino, invece di andare perso.",
        ],
      },
      {
        heading: "E se produttore, vino e annata sono in una sola colonna?",
        paragraphs: [
          "Succede spesso: «Pieropan Soave Classico 2023» scritto tutto in una cella. Vinaris divide il nome in produttore, vino e annata con regole proprie e con l'elenco dei produttori che conosce, e ti mostra il risultato in una tabella da controllare e correggere.",
          "Per i nomi che le regole non riescono a dividere puoi chiedere aiuto all'AI. I primi 15 nomi per cantina sono gratuiti; oltre si usano i crediti AI, come per le altre funzioni. Le proposte dell'AI vengono accettate solo se produttore e vino si ritrovano davvero nel testo del file, e restano segnate perché tu le controlli.",
        ],
      },
      {
        heading: "Cosa succede a voti, valute e date?",
        paragraphs: [
          "Vinaris fa una domanda solo quando il file non basta a decidere, e la fa nell'anteprima con un esempio preso dalle tue righe.",
        ],
        list: [
          "Voti numerici in /10, /20 o /100: vengono convertiti nella scala di Vinaris.",
          "Giudizi a parole: discreto, buono, molto buono, ottimo ed eccellente diventano un voto, e lo stesso vale per gli equivalenti inglesi. Il testo originale resta nella nota.",
          "Un prezzo con «$»: ti chiede se sono dollari americani, canadesi, australiani o neozelandesi.",
          "Date scritte come testo, quando non si capisce se il giorno viene prima del mese.",
        ],
      },
      {
        heading: "Posso importare anche il registro di acquisti e bevute?",
        paragraphs: [
          "Sì. Un foglio con data, vino e bottiglie entrate o uscite diventa la storia di magazzino dei vini importati: acquisti, bevute, regali, bottiglie rotte o che sapevano di tappo.",
          "Ogni movimento viene collegato al vino del foglio cantina con lo stesso nome, anche se il registro non riporta l'annata. Le bevute con una data entrano anche nel diario delle degustazioni. Se il foglio cantina indica già una quantità, Vinaris ti chiede se tiene già conto delle uscite, con un esempio concreto: «nel foglio Cantina ne risultano 6; nel registro 11/05/2026 −2». La risposta decide se ne restano 6 oppure 4. Se invece la quantità è una formula che Excel non ha mai salvato, il saldo lo ricostruisce il registro.",
        ],
      },
      {
        heading: "Cosa vedo prima di importare?",
        paragraphs: [
          "Prima di scrivere qualunque cosa vedi un'anteprima con i vini nuovi, quelli già presenti in cantina, le bottiglie, la wishlist, le degustazioni e i movimenti, insieme agli avvisi sulle righe che non è stato possibile leggere.",
          "Per i vini che hai già scegli se saltarli, aggiornarli con i dati del file o importare comunque tutte le righe. Se reimporti lo stesso file, i vini già presenti vengono saltati e il registro non viene contato due volte. Il piano gratuito importa fino a 15 etichette, come per CellarTracker.",
        ],
      },
      {
        heading: "Cosa resta del mio file dopo l'import?",
        paragraphs: [
          "Il file serve solo per la lettura: Vinaris ricorda come hai sistemato fogli e colonne, non il contenuto delle celle.",
          "La volta dopo che importi un file con gli stessi fogli e le stesse intestazioni, ritrovi le tue scelte già impostate. Le bottiglie importate sono dati tuoi come gli altri: puoi esportarli in qualsiasi momento con il backup di Vinaris.",
        ],
      },
    ],
    faq: [
      {
        question: "Devo sistemare il foglio Excel prima di importarlo?",
        answer: "No. Vinaris è pensato per leggere i fogli così come sono. Conviene solo controllare che le quantità corrispondano alla cantina reale, perché l'import parte da quelle.",
      },
      {
        question: "L'import da Excel è gratuito?",
        answer: "Sì. L'import è disponibile anche nel piano gratuito, fino a 15 etichette. La divisione dei nomi con l'AI è gratuita per i primi 15 nomi di ogni cantina; oltre usa i crediti AI.",
      },
      {
        question: "Le degustazioni del foglio tolgono bottiglie dalla cantina?",
        answer: "No. Un foglio di note di degustazione finisce nel diario senza cambiare le quantità. Solo un registro dei movimenti, con le bottiglie uscite, modifica il saldo.",
      },
    ],
    disclaimer: "Controlla sempre l'anteprima prima di confermare: l'import propone, ma sei tu a decidere cosa entra in cantina.",
  },
  en: {
    slug: "import-wine-cellar-from-excel",
    title: "Import your wine cellar from a spreadsheet",
    description:
      "How Vinaris reads your cellar spreadsheet as it is: sheets, columns, names, scores, purchases and bottles drunk. A preview first, and free up to 15 labels.",
    lead: "If you keep your cellar in a spreadsheet, moving to an app should not mean starting again. Vinaris reads the file the way you built it over the years, with your sheets, your columns and your habits, and shows you what it understood before it writes anything to your cellar.",
    sections: [
      {
        heading: "Which files can I import?",
        paragraphs: [
          "Vinaris imports Excel files (.xlsx, .xlsm and the older .xls), LibreOffice and OpenOffice spreadsheets (.ods) and CSV files, up to 5 MB.",
          "There is no template to follow. One row per wine is fine, and so is one sheet per region or per room, a table that starts on row 4 under a title, or a file with the cellar, a wishlist and tasting notes on separate sheets. The import lives in Settings → Data → Import your cellar, next to CellarTracker and the Vinaris backup.",
        ],
      },
      {
        heading: "How does it recognise sheets and columns?",
        paragraphs: [
          "On every sheet Vinaris finds the table, recognises its header and suggests what it holds: cellar, wishlist, tastings, a movement register, or a summary that is not imported.",
          "Sheets with the same header are merged into one table, and the sheet name is kept: if you have one sheet per rack, it becomes the bottles' location. Columns are recognised from their titles in English, Italian, French and German and from the values they hold. For each one you see the suggested field and a few sample values, and you can change it. Anything without a precise field goes into the wine's notes rather than being lost.",
        ],
      },
      {
        heading: "What if producer, wine and vintage share one column?",
        paragraphs: [
          "It happens a lot: “Pieropan Soave Classico 2023” in a single cell. Vinaris splits the name into producer, wine and vintage with its own rules and the producers it already knows, and shows you the result in a table to check and correct.",
          "For names the rules cannot split you can ask the AI for help. The first 15 names per cellar are free; beyond that it uses AI credits, like the other AI features. AI suggestions are only accepted when the producer and wine really appear in the text of your file, and they stay marked for you to check.",
        ],
      },
      {
        heading: "What happens to scores, currencies and dates?",
        paragraphs: [
          "Vinaris only asks a question when the file is not enough to decide, and it asks in the preview with an example from your own rows.",
        ],
        list: [
          "Scores out of 10, 20 or 100 are converted to the Vinaris scale.",
          "Scores in words, such as good, very good and excellent, become a score, and so do their Italian equivalents. The original words stay in the note.",
          "A price with “$”: it asks whether that means US, Canadian, Australian or New Zealand dollars.",
          "Dates written as text, when it is not clear whether the day comes before the month.",
        ],
      },
      {
        heading: "Can I import my register of purchases and bottles drunk?",
        paragraphs: [
          "Yes. A sheet with dates, wines and bottles in or out becomes the stock history of the imported wines: purchases, bottles drunk, gifts, breakages and corked bottles.",
          "Each movement is linked to the wine with the same name on the cellar sheet, even when the register leaves out the vintage. Bottles drunk on a known date also go into the tasting diary. When the cellar sheet already states a count, Vinaris asks whether it already includes the outflows, with a concrete example: “the Cellar sheet says 6; the register has 11/05/2026 −2”. Your answer decides whether 6 or 4 are left. When the count is a formula Excel never saved, the register works out the balance instead.",
        ],
      },
      {
        heading: "What do I see before importing?",
        paragraphs: [
          "Before anything is written you get a preview with the new wines, the ones already in your cellar, the bottles, the wishlist, the tastings and the movements, along with warnings about any rows that could not be read.",
          "For wines you already have, you choose whether to skip them, update them with the file's data or import every row anyway. Import the same file again and the wines already there are skipped, and the register is not counted twice. The free plan imports up to 15 labels, as with CellarTracker.",
        ],
      },
      {
        heading: "What does Vinaris keep of my file?",
        paragraphs: [
          "The file is only read: Vinaris remembers how you set up the sheets and columns, not what the cells contain.",
          "Next time you import a file with the same sheets and headers, your choices are already in place. The imported bottles are your data like any other, and you can export them whenever you like with the Vinaris backup.",
        ],
      },
    ],
    faq: [
      {
        question: "Do I need to tidy my spreadsheet before importing it?",
        answer: "No. Vinaris is built to read spreadsheets as they are. It is only worth checking that the quantities match the real cellar, because the import starts from them.",
      },
      {
        question: "Is the spreadsheet import free?",
        answer: "Yes. The import is available on the free plan, up to 15 labels. Splitting names with the AI is free for the first 15 names in each cellar; beyond that it uses AI credits.",
      },
      {
        question: "Do the tastings in my spreadsheet take bottles out of the cellar?",
        answer: "No. A sheet of tasting notes goes into the diary without changing quantities. Only a movement register, with the bottles taken out, changes the balance.",
      },
    ],
    disclaimer: "Always check the preview before confirming: the import makes suggestions, but you decide what goes into your cellar.",
  },
};
