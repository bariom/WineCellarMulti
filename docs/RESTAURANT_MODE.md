# Modalità ristorante

La disponibilità generale è controllata da `RESTAURANT_MODE_ENABLED`. Con il valore
`false` la modalità resta nascosta agli utenti normali, ma è sempre disponibile agli
amministratori dell'applicazione per test e collaudo. Impostando `true`, anche i
responsabili delle singole cantine possono selezionarla in **Impostazioni > Struttura**.

La modalità ristorante si configura sulla singola cantina da **Impostazioni > Struttura > Tipo di gestione**. Uno stesso account può quindi gestire cantine private e cantine di ristorante senza cambiare profilo utente.

## Flusso operativo

1. Impostare la cantina come `Ristorante`.
2. Censire per ogni vino il prezzo d’acquisto e il prezzo di vendita abituale.
3. Dalla dashboard usare **Movimenti e lotti** per registrare acquisti, rettifiche, rotture e omaggi.
4. Dal dettaglio del vino usare **Venduta 1**, modificando quantità, data e prezzo effettivo quando necessario.
5. Consultare la home per ricavi, costo delle bottiglie, margine lordo, andamento, vini più redditizi e registro vendite.

La home ristorante comprende anche una panoramica editoriale della carta vini: referenze e bottiglie disponibili, scorte basse, prezzi mancanti, capitale a costo e valore potenziale separati per valuta, bottiglie di punta, distribuzione per tipologia e regioni principali. Le statistiche del periodo dettagliano inoltre quantità, ricavi e margine per tipologia e regione, i vini più venduti e le referenze invendute o meno vendute ancora presenti in giacenza.

Ogni carico crea un lotto con data, fornitore, riferimento e costo unitario. Le uscite consumano i lotti in ordine FIFO; una vendita conserva sia il prezzo praticato sia il costo totale esatto dei lotti utilizzati. Modificare successivamente il vino non altera quindi i margini storici. Una vendita errata può essere annullata dal registro: le bottiglie tornano nei lotti originari e l’operazione resta tracciata.

Al primo aggiornamento, la migrazione crea automaticamente un lotto di saldo iniziale per ogni vino già in giacenza. Anche una modifica diretta della quantità dalla scheda vino genera una rettifica nel libro mastro, così il saldo aggregato e i movimenti restano coerenti.

Le valute sono rendicontate separatamente e non vengono sommate. Il **margine lordo** è `ricavi - costo d’acquisto delle bottiglie`: non comprende IVA, personale, affitto, scarti o altri costi e non sostituisce la contabilità del ristorante.

Le vendite sono incluse nei backup PostgreSQL completi. L’export JSON della cantina include il tipo di gestione e il prezzo di vendita dei vini, ma il registro transazionale va protetto tramite la procedura di backup descritta in `BACKUP_AND_RESTORE.md`.

## Vendite da una cantina privata

Anche una cantina privata può registrare una vendita. Nel dettaglio del vino restano disponibili entrambe le azioni: **Bevuta 1** per la degustazione e **Venduta 1** per la cessione. La vendita richiede data, prezzo unitario e quantità; quest’ultima parte da `1` e non può superare le bottiglie disponibili.

La sezione **Storico > Vendite** mostra capitale recuperato, costo storico, plusvalenza o minusvalenza realizzata, bottiglie cedute, andamento per periodo, migliori vendite e registro annullabile. La home del collezionista resta invariata; la dashboard commerciale principale è riservata alla modalità ristorante.
