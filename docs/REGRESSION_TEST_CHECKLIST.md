# Checklist di regressione

Questa checklist raccoglie i flussi che non devono degradare. Va eseguita prima
di un commit che modifica le aree interessate; i casi **P0** sono obbligatori
prima di un push su `main` quando si tocca la relativa funzionalità.

## Convenzioni

- **P0**: flusso essenziale o rischio di perdita/blocco dell'utente.
- **P1**: funzione importante da verificare quando l'area viene modificata.
- Per i casi mobile usare una viewport di circa 390 × 844 px oppure un telefono
  reale. Per desktop usare una viewport di almeno 1280 px.

## Cantina e dettaglio vino

### P0 · Mobile · dettaglio vino modale

1. Aprire la vista **Cantina** su viewport smartphone.
2. Aprire un gruppo colore e selezionare un vino dalla lista.
3. Verificare che il dettaglio si apra come pannello modale a schermo intero,
   sopra la lista.
4. Verificare che la lista non si espanda e non sia interagibile dietro al
   pannello.
5. Chiudere con `×` e con il pulsante Indietro del browser.

Risultato atteso: in entrambi i casi si torna alla lista, mantenendo gruppo e
posizione di scorrimento.

### P0 · Desktop · dettaglio vino

1. Aprire un vino dalla cantina su viewport desktop.
2. Verificare leggibilità di nome, foto, valore e strumenti AI.
3. Chiudere il dettaglio e verificare che la lista resti utilizzabile.

### P1 · Lista estesa e filtri

1. Aprire un gruppo con più di 40 vini.
2. Usare **Mostra altri vini** e verificare che i vini aggiuntivi compaiano.
3. Applicare e cancellare ricerca, filtro colore e ordinamento.

Risultato atteso: conteggi corretti, nessun duplicato e selezione del vino
ancora raggiungibile.

## Dati e AI

### P0 · Analisi AI singola e completa

1. Dal dettaglio vino eseguire una funzione AI singola.
2. Eseguire **tutte le analisi AI** su un vino idoneo.
3. Verificare overlay/progresso, aggiornamento dei dati e assenza di blocchi
   dell'interfaccia.

### P0 · Batch AI con risultati mancanti

1. Avviare un batch contenente almeno un vino senza risultato utile.
2. Verificare che il batch continui sugli altri vini.
3. Verificare il riepilogo finale: risultati utili, nessun risultato ed errori.
4. Verificare che i vini senza risultato siano esclusi dalla ricerca AI
   pertinente quando previsto.

### P1 · Flag di esclusione AI

1. Nel dettaglio vino attivare e disattivare le esclusioni per valore, uve e
   punteggi.
2. Verificare che il rispettivo comando AI sia coerentemente disabilitato o
   riabilitato.

## Dashboard e visualizzazioni

### P1 · Dashboard valore desktop

1. Aprire **Valore** su desktop.
2. Verificare grafico valore totale, costellazione per tipologia e card delle
   cinque bottiglie più preziose.
3. Verificare che una bottiglia senza foto mostri il calice illustrato.
4. Aprire una bottiglia dalla card e verificare il dettaglio.

### P1 · Dashboard valore mobile

1. Aprire **Valore** su smartphone.
2. Verificare che la lista compatta sostituisca la card editoriale delle cinque
   bottiglie e che non vi siano overflow orizzontali.

### P1 · Storico valore portafoglio

1. Verificare che gli aggiornamenti AI massivi della stessa giornata producano
   un solo punto giornaliero.
2. Verificare che l'intervallo mostri fino a 365 giorni disponibili, non solo
   gli ultimi 30 eventi tecnici.

## Amministrazione e operatività

### P1 · Metriche operative

1. Aprire **Impostazioni → Operatività** come app-admin.
2. Verificare gli intervalli 1h, 6h, 24h e 7 giorni.
3. Verificare che la reattività indichi il P95 delle API interattive nella
   finestra recente e che AI/import/foto siano conteggiati separatamente.

## Controlli tecnici minimi

Eseguire quando applicabile:

```text
frontend: npm run build
backend: pytest -q
```

Se l'ambiente locale non dispone delle dipendenze backend, annotare il limite
nel passaggio di consegne e affidare la verifica completa alla CI.
