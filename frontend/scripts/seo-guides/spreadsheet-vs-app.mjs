export default {
  id: "spreadsheet-vs-app",
  it: {
    slug: "excel-o-app-per-cantina-vino",
    title: "Excel o app per gestire la cantina di vino?",
    description:
      "Quali colonne servono in un foglio Excel per la cantina, dove smette di funzionare, quando passare a un'app e come trasferire i dati senza perderli.",
    lead: "Un foglio di calcolo è un ottimo punto di partenza per tenere traccia delle proprie bottiglie. Il limite arriva quando trovare una bottiglia, seguire la maturità e ricordare le degustazioni richiede più energia che piacere. Questa guida aiuta a capire da che parte stai e, se serve, come cambiare sistema senza perdere nulla.",
    sections: [
      {
        heading: "Un foglio Excel basta per gestire una cantina di vino?",
        paragraphs: [
          "Sì, per una cantina piccola, gestita da una sola persona e aggiornata con regolarità, un foglio Excel basta e avanza.",
          "Il foglio di calcolo è flessibile, non costa nulla, si apre ovunque e si esporta in un attimo. Puoi aggiungere le colonne che ti servono, ordinare per annata o per produttore e filtrare in pochi clic. Se compri qualche cassa all'anno, sai a memoria dove sono le bottiglie e annoti con costanza ogni acquisto e ogni stappatura, non hai bisogno d'altro.",
          "Il punto debole non è lo strumento, ma la disciplina che richiede. Un foglio funziona solo finché è aggiornato: basta qualche bottiglia aperta e non segnata, o una consegna inserita con settimane di ritardo, perché le quantità smettano di corrispondere alla realtà. Da quel momento si tende a fidarsi meno del file, a consultarlo meno e ad aggiornarlo ancora meno.",
        ],
      },
      {
        heading: "Quali colonne deve avere un foglio Excel per la cantina?",
        paragraphs: [
          "Un buon foglio per la cantina ha una riga per ogni vino e annata, con poche colonne che servono davvero a decidere cosa bere, cosa tenere e cosa ricomprare.",
          "Meglio poche colonne compilate sempre che tante colonne lasciate vuote a metà. Un insieme di partenza ragionevole è questo:",
        ],
        list: [
          "Produttore, scritto sempre allo stesso modo, così filtri e ordinamenti funzionano.",
          "Vino o cuvée, con denominazione e, se utile, il vigneto.",
          "Annata, in una colonna a parte e come numero, non dentro il nome del vino.",
          "Formato: 0,375, 0,75, magnum e così via.",
          "Quantità attualmente in cantina.",
          "Posizione fisica: scaffale, colonna, cassa o cantinetta.",
          "Data e prezzo d'acquisto, insieme al fornitore se ti interessa ricordarlo.",
          "Bere da e bere entro: gli anni di inizio e fine della finestra di beva.",
          "Note: impressioni di degustazione, abbinamenti riusciti, dettagli sull'acquisto.",
        ],
      },
      {
        heading: "Dove un foglio di calcolo comincia a non bastare più?",
        paragraphs: [
          "Un foglio di calcolo comincia a non bastare più quando la stessa riga deve descrivere situazioni diverse: bottiglie in più posti, una storia di consumi, più persone che aggiornano e l'uso dal telefono in cantina.",
          "Sono problemi pratici, che si presentano quasi sempre nello stesso ordine:",
        ],
        list: [
          "Sei bottiglie dello stesso vino divise tra la cantina di casa e una cantinetta in taverna: o duplichi la riga, o scrivi la posizione nelle note, e in entrambi i casi i conti si complicano.",
          "Lo storico dei consumi: se apri due bottiglie su sei e sovrascrivi la quantità, perdi quando le hai bevute e com'erano. Tenere un foglio separato per le bevute funziona, ma va collegato a mano.",
          "La cantina condivisa: quando in due aggiornate lo stesso file, prima o poi qualcuno lavora su una copia vecchia, oppure una bottiglia viene scaricata due volte.",
          "Il telefono in cantina: davanti allo scaffale, con poca luce e le mani occupate, un foglio largo con molte colonne è scomodo da leggere e ancora di più da modificare.",
          "Le foto: un'etichetta fotografata aiuta a riconoscere la bottiglia e a ricordare l'acquisto, ma in un foglio di calcolo le immagini sono difficili da gestire.",
        ],
      },
      {
        heading: "Quando conviene passare da Excel a un'app per la cantina?",
        paragraphs: [
          "Conviene passare a un'app quando il foglio richiede più manutenzione di quanta tu sia disposto a dargli, il che accade spesso oltre il centinaio di bottiglie o quando a gestire la cantina siete in più di uno.",
          "Non è una soglia rigida. C'è chi tiene in ordine trecento bottiglie su un foglio senza fatica e chi si perde già con cinquanta. Un segnale più affidabile del numero è il comportamento: se scendi in cantina per controllare invece di guardare il file, se compri un vino che avevi già o se scopri una bottiglia ormai oltre la sua finestra di beva, il foglio non sta più facendo il suo lavoro.",
          "Un'app utile collega tutto alla singola bottiglia invece di distribuirlo tra colonne e file diversi. In Vinaris, per esempio, ogni bottiglia mostra la sua finestra di beva divisa in fasi, accanto a posizione, quantità e prezzo d'acquisto, e le note di degustazione e le foto restano attaccate al vino a cui si riferiscono. Un sommelier AI suggerisce cosa aprire partendo dalle bottiglie che hai davvero, e le stime di valore si basano su ricerche dei prezzi nelle enoteche online, con le fonti collegate.",
        ],
      },
      {
        heading: "Come si trasferisce un foglio Excel in un'app senza perdere dati?",
        paragraphs: [
          "Per trasferire un foglio in un'app senza perdere dati bisogna prima ripulire il file, poi spostare i vini a blocchi e infine confrontare i totali con il foglio originale.",
          "Un passaggio ordinato richiede meno tempo di quanto sembri, soprattutto se procedi per gradi:",
        ],
        list: [
          "Salva una copia del foglio così com'è e non toccarla: è la tua rete di sicurezza.",
          "Uniforma i nomi dei produttori, separa l'annata dal nome del vino e controlla che le quantità siano numeri.",
          "Fai un giro in cantina e allinea il foglio alla realtà prima di trasferirlo, non dopo.",
          "Verifica quali formati di importazione accetta l'app. Vinaris legge direttamente il tuo foglio Excel, .ods o CSV così com'è, oltre all'export di CellarTracker e al proprio backup, e ti mostra un'anteprima prima di importare.",
          "Trasferisci uno scaffale o una zona alla volta e, alla fine di ogni blocco, confronta numero di etichette e di bottiglie con il foglio.",
          "Tieni il vecchio file in sola lettura per qualche mese: torna utile per prezzi e date d'acquisto che non hai ancora riportato.",
        ],
      },
      {
        heading: "Cosa chiedere a un'app prima di affidarle la propria cantina?",
        paragraphs: [
          "Prima di affidare la tua cantina a un'app, chiedi soprattutto se puoi esportare tutti i tuoi dati in un formato leggibile e portarli via quando vuoi.",
          "Un foglio di calcolo ha un vantaggio che spesso si dà per scontato: il file è tuo. Un'app deve offrire qualcosa di equivalente, altrimenti anni di note e acquisti restano chiusi dentro un servizio. Le domande da fare sono semplici:",
        ],
        list: [
          "Posso esportare tutto, comprese note, quantità e storico, e non solo l'elenco dei vini?",
          "Chi può vedere i miei dati, e posso condividere la cantina solo con le persone che scelgo?",
          "Quanto costa oggi, cosa resta gratuito e cosa succede ai miei dati se smetto di pagare?",
          "Inserire una bottiglia nuova è abbastanza rapido da farlo davvero, anche dal telefono?",
          "Vinaris, ad esempio, esporta i tuoi dati in JSON, è gratuito fino a 15 etichette attive e il piano Reserve costa CHF 6 al mese.",
        ],
      },
    ],
  },
  en: {
    slug: "wine-cellar-spreadsheet-vs-app",
    title: "Wine cellar spreadsheet or app?",
    description:
      "Which columns a wine cellar spreadsheet needs, where it breaks down, when to switch to an app, and how to move your bottles across without losing data.",
    lead: "A spreadsheet is an excellent starting point for keeping track of your bottles. The limit comes when finding a bottle, following maturity and remembering tastings takes more energy than pleasure. This guide helps you work out which side of that line you are on and, if needed, how to change systems without losing anything.",
    sections: [
      {
        heading: "Is a spreadsheet enough to manage a wine cellar?",
        paragraphs: [
          "Yes, for a small cellar run by one person and updated regularly, a spreadsheet is perfectly adequate.",
          "A spreadsheet is flexible, costs nothing, opens anywhere and exports in seconds. You can add whatever columns you need, sort by vintage or producer and filter in a couple of clicks. If you buy a few cases a year, know roughly where everything is and faithfully record each purchase and each bottle you open, you do not need anything more.",
          "The weak point is not the tool but the discipline it demands. A spreadsheet only works while it is up to date: a few bottles opened and not logged, or a delivery entered weeks late, and the quantities stop matching what is actually on the racks. From then on you trust the file less, check it less and update it even less.",
        ],
      },
      {
        heading: "Which columns should a wine cellar spreadsheet have?",
        paragraphs: [
          "A good cellar spreadsheet has one row per wine and vintage, with a handful of columns that genuinely help you decide what to drink, what to keep and what to buy again.",
          "A few columns that are always filled in beat many columns left half empty. A sensible starting set is:",
        ],
        list: [
          "Producer, spelt the same way every time so filters and sorting work.",
          "Wine or cuvée, with the appellation and, where useful, the vineyard.",
          "Vintage, in its own column and as a number, not buried in the wine name.",
          "Format: half bottle, 75 cl, magnum and so on.",
          "Quantity currently in the cellar.",
          "Physical location: rack, column, case or wine fridge.",
          "Purchase date and price, plus the merchant if you want to remember it.",
          "Drink from and drink to: the opening and closing years of the drinking window.",
          "Notes: tasting impressions, pairings that worked, details about the purchase.",
        ],
      },
      {
        heading: "Where does a spreadsheet start to fall short?",
        paragraphs: [
          "A spreadsheet starts to fall short when one row has to describe several situations at once: bottles in different places, a history of what you drank, more than one person editing, and use on a phone in the cellar.",
          "These are practical problems, and they tend to turn up in roughly this order:",
        ],
        list: [
          "Six bottles of the same wine split between the main cellar and a wine fridge in the kitchen: either you duplicate the row or you put the location in the notes, and both make the totals harder to keep straight.",
          "Consumption history: if you open two of six and simply overwrite the quantity, you lose when you drank them and how they were. A separate tab for bottles opened works, but you have to link it up by hand.",
          "Shared cellars: when two people update the same file, sooner or later someone works on an old copy, or the same bottle gets taken off twice.",
          "Your phone in the cellar: standing at the rack, in poor light with your hands full, a wide sheet with many columns is awkward to read and even more awkward to edit.",
          "Photos: a picture of the label helps you recognise a bottle and remember where it came from, but images are clumsy to manage in a spreadsheet.",
        ],
      },
      {
        heading: "When is it worth switching from a spreadsheet to a wine cellar app?",
        paragraphs: [
          "It is worth switching when the spreadsheet needs more upkeep than you are willing to give it, which often happens somewhere beyond a hundred or so bottles, or as soon as more than one person is updating the cellar.",
          "That is not a hard threshold. Some collectors keep three hundred bottles in perfect order on a sheet, while others lose track at fifty. Behaviour is a better signal than the bottle count: if you go down to the cellar to check rather than looking at the file, buy a wine you already had, or find a bottle that has slipped past its drinking window, the spreadsheet is no longer doing its job.",
          "A useful app ties everything to the individual bottle instead of scattering it across columns and tabs. In Vinaris, for instance, each bottle shows its drinking window broken into stages, alongside its storage location, quantity and purchase price, while tasting notes and photos stay attached to the wine they belong to. An AI sommelier suggests what to open from the bottles you actually own, and value estimates come from web searches of wine-shop prices, with the sources linked.",
        ],
      },
      {
        heading: "How do you move a spreadsheet into an app without losing data?",
        paragraphs: [
          "To move a spreadsheet into an app without losing data, tidy the file first, transfer the wines in batches and then check the totals against the original sheet.",
          "A careful move takes less time than you might expect, especially if you take it in stages:",
        ],
        list: [
          "Save a copy of the spreadsheet exactly as it is and leave it alone: that is your safety net.",
          "Standardise producer names, split the vintage out of the wine name and make sure quantities are numbers.",
          "Walk round the cellar and bring the sheet in line with reality before you transfer it, not afterwards.",
          "Check which import formats the app accepts. Vinaris reads your Excel, .ods or CSV spreadsheet as it is, as well as a CellarTracker export and its own backup, and shows you a preview before importing.",
          "Move one rack or one area at a time and, at the end of each batch, compare the number of labels and bottles with the sheet.",
          "Keep the old file read-only for a few months: it is handy for purchase prices and dates you have not yet carried across.",
        ],
      },
      {
        heading: "What should you ask an app before trusting it with your cellar?",
        paragraphs: [
          "Before trusting an app with your cellar, ask above all whether you can export all of your data in a readable format and take it with you whenever you like.",
          "A spreadsheet has an advantage that is easy to take for granted: the file is yours. An app should offer something equivalent, otherwise years of notes and purchases end up locked inside a service. The questions to ask are simple:",
        ],
        list: [
          "Can I export everything, including notes, quantities and history, not just the list of wines?",
          "Who can see my data, and can I share the cellar only with the people I choose?",
          "What does it cost today, what stays free, and what happens to my data if I stop paying?",
          "Is adding a new bottle quick enough that I will actually do it, including from my phone?",
          "Vinaris, for example, exports your data as JSON, is free for up to 15 active labels, and the Reserve plan costs CHF 6 a month.",
        ],
      },
    ],
  },
};
