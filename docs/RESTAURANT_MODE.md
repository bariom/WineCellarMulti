# Modalità ristorante

La modalità ristorante si configura sulla singola cantina da **Impostazioni > Struttura > Tipo di gestione**. Uno stesso account può quindi gestire cantine private e cantine di ristorante senza cambiare profilo utente.

## Flusso operativo

1. Impostare la cantina come `Ristorante`.
2. Censire per ogni vino il prezzo d’acquisto e il prezzo di vendita abituale.
3. Dal dettaglio del vino usare **Venduta 1**, modificando quantità, data e prezzo effettivo quando necessario.
4. Consultare la home per ricavi, costo delle bottiglie, margine lordo, andamento, vini più redditizi e registro vendite.

Ogni vendita salva una fotografia del costo d’acquisto e del prezzo praticato. Modificare successivamente il vino non altera quindi i margini storici. Una vendita errata può essere annullata dal registro: le bottiglie tornano in giacenza e l’operazione resta tracciata.

Le valute sono rendicontate separatamente e non vengono sommate. Il **margine lordo** è `ricavi - costo d’acquisto delle bottiglie`: non comprende IVA, personale, affitto, scarti o altri costi e non sostituisce la contabilità del ristorante.

Le vendite sono incluse nei backup PostgreSQL completi. L’export JSON della cantina include il tipo di gestione e il prezzo di vendita dei vini, ma il registro transazionale va protetto tramite la procedura di backup descritta in `BACKUP_AND_RESTORE.md`.

## Vendite da una cantina privata

Anche una cantina privata può registrare una vendita. Nel dettaglio del vino restano disponibili entrambe le azioni: **Bevuta 1** per la degustazione e **Venduta 1** per la cessione. La vendita richiede data, prezzo unitario e quantità; quest’ultima parte da `1` e non può superare le bottiglie disponibili.

La sezione **Storico > Vendite** mostra capitale recuperato, costo storico, plusvalenza o minusvalenza realizzata, bottiglie cedute, andamento per periodo, migliori vendite e registro annullabile. La home del collezionista resta invariata; la dashboard commerciale principale è riservata alla modalità ristorante.
