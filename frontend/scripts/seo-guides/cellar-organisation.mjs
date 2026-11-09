export default {
  id: "cellar-organisation",
  it: {
    slug: "come-organizzare-cantina-vino",
    title: "Come organizzare una cantina di vino privata",
    description: "Come organizzare una cantina privata: codici di posizione, ordine per regione o finestra di beva, conservazione, dati da registrare e revisione mensile.",
    lead: "Una cantina ben organizzata deve rispondere velocemente a poche domande: cosa possiedo, dove si trova, cosa è pronto e cosa mi manca. Questa guida tratta la parte fisica, i dati da registrare e l'abitudine che tiene affidabili quelle risposte quando le bottiglie diventano qualche centinaio.",
    sections: [
      {
        heading: "Come disporre le bottiglie in una cantina?",
        paragraphs: [
          "Dai a ogni bottiglia una posizione fissa e codificata, per esempio scaffale, ripiano e colonna, e annota quel codice accanto al vino.",
          "Un sistema semplice funziona meglio di uno elegante. Assegna una lettera a ogni scaffale o armadio, un numero a ogni ripiano partendo dall'alto e un numero a ogni colonna da sinistra: A3-2 significa scaffale A, terzo ripiano, seconda colonna. Se usi un frigorifero per il vino, trattalo come un altro scaffale (per esempio F1-4). Per le casse di legno chiuse basta un codice per cassa, come C-07, scritto anche sul legno con un'etichetta.",
          "Tieni insieme le bottiglie dello stesso vino e della stessa annata: sei bottiglie sparse in tre punti diversi sono il modo più rapido per perderne una. Lascia qualche posto libero in ogni zona, così un nuovo arrivo non ti costringe a spostare mezza parete. Quando sposti una bottiglia, aggiorna subito il codice: una posizione sbagliata è peggio di una posizione mancante, perché ti fa cercare nel posto sbagliato con fiducia.",
        ],
        list: [
          "Una lettera per scaffale, armadio o frigorifero.",
          "Un numero per ripiano, sempre contato nello stesso verso.",
          "Un numero per colonna o per posto nella fila.",
          "Un codice unico per ogni cassa chiusa.",
        ],
      },
      {
        heading: "Meglio ordinare i vini per regione o per finestra di beva?",
        paragraphs: [
          "Per una cantina di qualche centinaio di bottiglie conviene di solito un ordine per regione, affiancato da una zona separata per le bottiglie da bere presto.",
          "L'ordine per regione o per produttore è intuitivo: sai dove cercare un Barolo o uno Champagne senza consultare nulla, e il sistema resta stabile negli anni. Il limite è che non ti dice cosa è pronto. Un Nebbiolo da aspettare e uno al culmine stanno uno accanto all'altro, e le bottiglie mature finiscono facilmente dietro quelle giovani.",
          "L'ordine per finestra di beva mette davanti ciò che va aperto e in fondo ciò che deve riposare. È comodo per decidere, ma ti obbliga a spostare le bottiglie man mano che maturano, e ogni spostamento è un'occasione per sbagliare il codice di posizione. Il compromesso più pratico è un ripiano o un frigorifero dedicato ai vini da bere nei prossimi mesi, mentre il resto rimane per regione. Se il registro digitale conosce le finestre di beva, la priorità puoi leggerla lì e lasciare ferme le bottiglie.",
        ],
      },
      {
        heading: "Quali sono le condizioni giuste per conservare il vino in casa?",
        paragraphs: [
          "Le indicazioni più diffuse sono una temperatura stabile intorno ai 10-15 °C, umidità più o meno tra il 60 e il 75%, buio, poche vibrazioni e bottiglie con tappo di sughero coricate.",
          "Sono intervalli di riferimento, non regole assolute. Conta soprattutto la stabilità: una cantina che resta a 16 °C tutto l'anno è in genere preferibile a una che oscilla tra 8 e 20 °C con le stagioni. Un'umidità troppo bassa nel lungo periodo può seccare i tappi; una troppo alta rovina etichette e cartoni, cosa che pesa se un giorno vorrai vendere. Le bottiglie con tappo a vite o sintetico possono stare in piedi senza problemi.",
          "Un termometro con registrazione della minima e della massima costa poco e ti dice più di qualsiasi impressione. Tienilo all'altezza delle bottiglie, non vicino alla porta, e controllalo in piena estate e in pieno inverno: sono i mesi che rivelano se la cantina è davvero stabile.",
        ],
      },
      {
        heading: "Quali informazioni registrare per ogni bottiglia?",
        paragraphs: [
          "Registra i dati che cambiano una decisione: produttore, vino, annata, formato, quantità, posizione, prezzo d'acquisto e finestra di beva.",
          "Tutto il resto è utile solo se lo userai davvero. Una foto dell'etichetta aiuta a riconoscere annate e cuvée simili; una nota su dove e quando hai comprato serve se cerchi di ricomprare o di ricostruire la provenienza. Le note di degustazione valgono più di quasi tutto il resto, perché ti dicono come si comportano quel vino e quella annata nella tua cantina.",
          "In Vinaris ogni bottiglia può avere posizione, quantità, prezzo d'acquisto, note di degustazione e foto, con la finestra di beva mostrata per fasi; chi parte da CellarTracker o da un file JSON può importare la collezione invece di riscriverla.",
        ],
        list: [
          "Produttore, nome del vino, annata e formato (0,75 l, magnum).",
          "Quantità attuale e codice di posizione.",
          "Prezzo d'acquisto, data e fornitore.",
          "Finestra di beva stimata.",
          "Foto dell'etichetta e note di degustazione.",
        ],
      },
      {
        heading: "Come gestire casse, en primeur e consegne in arrivo?",
        paragraphs: [
          "Registra subito ogni acquisto, anche se le bottiglie non sono ancora arrivate, e segnalo come in arrivo finché non le hai in mano.",
          "Gli acquisti en primeur possono arrivare uno o due anni dopo il pagamento, ed è facile dimenticarli o comprarli di nuovo. Annota prezzo, fornitore e data prevista di consegna; quando le bottiglie arrivano, controlla numero e annata contro la fattura e solo allora assegna la posizione.",
          "Per le casse originali di legno decidi se tenerle chiuse o aprirle. Una cassa chiusa protegge le bottiglie e può avere un valore maggiore in caso di rivendita, ma ti costringe a ricordare cosa contiene: registrala con un solo codice di posizione e la quantità completa. Se la apri, sistema le bottiglie come le altre e aggiorna i codici.",
        ],
      },
      {
        heading: "Ogni quanto rivedere la cantina?",
        paragraphs: [
          "Una revisione breve una volta al mese basta per tenere la cantina affidabile, e richiede in genere meno di mezz'ora.",
          "Non serve un inventario completo ogni volta: basta confrontare il registro con ciò che è cambiato. Una volta l'anno conta fisicamente le bottiglie di una zona alla volta, così l'inventario completo non diventa un fine settimana perso. Vinaris aiuta in questa routine con un sommelier AI che suggerisce cosa aprire dalla tua cantina e con stime di valore basate su prezzi di enoteche trovati sul web, con le fonti collegate.",
        ],
        list: [
          "Scarica le bottiglie aperte, regalate o vendute nell'ultimo mese.",
          "Controlla i vini entrati nella fase da bere presto e spostali avanti o pianifica quando aprirli.",
          "Verifica le consegne attese e registra quelle arrivate con la loro posizione.",
          "Completa i dati mancanti: annata, formato, prezzo, posizione.",
          "Leggi minima e massima del termometro e annota eventuali sbalzi.",
          "Rivedi la lista dei desideri prima di nuovi acquisti.",
        ],
      },
    ],
  },
  en: {
    slug: "how-to-organise-a-wine-cellar",
    title: "How to organise a private wine cellar",
    description: "How to organise a private wine cellar: location codes for each bottle, region or drinking-window layouts, storage conditions, what to record, monthly review.",
    lead: "A well-organised cellar should answer a few questions quickly: what do I own, where is it, what is ready, and what is missing? This guide covers the physical layout, the records and the routine that keep those answers reliable once you have a few hundred bottles.",
    sections: [
      {
        heading: "How should I arrange bottles in a wine cellar?",
        paragraphs: [
          "Give every bottle a fixed, coded location, such as rack, row and column, and record that code next to the wine.",
          "A simple scheme works better than a clever one. Give each rack or cabinet a letter, number the rows from the top and the columns from the left: A3-2 means rack A, third row, second slot. If you have a wine fridge, treat it as another rack (F1-4, for example). Unopened wooden cases only need one code each, such as C-07, written on the case itself as well.",
          "Keep bottles of the same wine and vintage together: six bottles spread across three places is the quickest way to lose one. Leave a few empty slots in each area so a new delivery does not force you to reshuffle a whole wall. When you move a bottle, update its code straight away. A wrong location is worse than a missing one, because it sends you to the wrong place with confidence.",
        ],
        list: [
          "One letter per rack, cabinet or wine fridge.",
          "One number per row, always counted in the same direction.",
          "One number per column or slot along the row.",
          "A single code for each unopened case.",
        ],
      },
      {
        heading: "Should I organise wine by region or by drinking window?",
        paragraphs: [
          "For a cellar of a few hundred bottles, arranging by region usually works best, with a separate area for bottles that need drinking soon.",
          "Arranging by region or producer is intuitive: you know where to find a Barolo or a Champagne without looking anything up, and the layout stays stable for years. The drawback is that it tells you nothing about readiness. A Nebbiolo that needs another decade sits beside one at its peak, and mature bottles easily end up hidden behind young ones.",
          "Arranging by drinking window puts what should be opened at the front and what needs rest at the back. It makes choosing easy, but you have to move bottles as they mature, and every move is a chance to get a location code wrong. The most practical compromise is one shelf or fridge reserved for wines to drink in the coming months, with everything else kept by region. If your records already hold drinking windows, you can read the priorities there and leave the bottles where they are.",
        ],
      },
      {
        heading: "What are the right storage conditions for wine at home?",
        paragraphs: [
          "The commonly recommended conditions are a steady temperature of roughly 10-15 °C, humidity of about 60-75%, darkness, little vibration, and cork-sealed bottles lying on their side.",
          "These are guideline ranges, not hard rules. Stability matters most: a cellar that sits at 16 °C all year round is generally better than one that swings between 8 and 20 °C with the seasons. Very low humidity over many years can dry out corks; very high humidity damages labels and cardboard, which matters if you might sell bottles one day. Screw caps and synthetic closures can be stored upright without problems.",
          "A min/max thermometer costs little and tells you more than any impression. Keep it at bottle height rather than by the door, and check it in high summer and mid-winter, the months that show whether the space is genuinely stable.",
        ],
      },
      {
        heading: "What should I record for each bottle?",
        paragraphs: [
          "Record the details that change a decision: producer, wine, vintage, format, quantity, location, purchase price and drinking window.",
          "Anything beyond that is only worth it if you will actually use it. A label photo helps you tell apart similar vintages and cuvées; a note of where and when you bought a wine is useful when you want to buy it again or trace its provenance. Tasting notes are worth more than almost anything else, because they tell you how that wine and vintage are behaving in your own cellar.",
          "In Vinaris each bottle can carry its location, quantity, purchase price, tasting notes and photos, with the drinking window shown in stages; if you are starting from CellarTracker or a JSON file, you can import the collection rather than retyping it.",
        ],
        list: [
          "Producer, wine name, vintage and format (75 cl, magnum).",
          "Current quantity and location code.",
          "Purchase price, date and merchant.",
          "Estimated drinking window.",
          "Label photo and tasting notes.",
        ],
      },
      {
        heading: "How do I handle cases, en primeur and incoming deliveries?",
        paragraphs: [
          "Record every purchase as soon as you make it, even before the bottles arrive, and mark it as incoming until it is physically in your cellar.",
          "En primeur wines can arrive a year or two after you pay for them, and it is easy to forget them or buy the same wine twice. Note the price, merchant and expected delivery date; when the bottles arrive, check the count and vintage against the invoice and only then assign locations.",
          "With original wooden cases, decide whether to keep them sealed or open them. A sealed case protects the bottles and may be worth more if you sell, but you have to remember what is inside: record it under a single location code with the full quantity. If you open it, rack the bottles like any others and update their codes.",
        ],
      },
      {
        heading: "How often should I review my wine cellar?",
        paragraphs: [
          "A short review once a month is enough to keep a cellar reliable, and it usually takes less than half an hour.",
          "You do not need a full stocktake each time, only a check of what has changed against your records. Once a year, physically count one area at a time so the full inventory does not swallow a whole weekend. Vinaris supports this routine with an AI sommelier that suggests what to open from your own cellar, and with value estimates based on wine-shop prices found on the web, with the sources linked.",
        ],
        list: [
          "Remove bottles opened, given away or sold in the past month.",
          "Check which wines have moved into the drink-soon stage and bring them forward or plan when to open them.",
          "Review expected deliveries and log those that have arrived, with their locations.",
          "Fill in missing details: vintage, format, price, location.",
          "Read the thermometer's minimum and maximum and note any swings.",
          "Look over your wishlist before buying anything new.",
        ],
      },
    ],
  },
};
