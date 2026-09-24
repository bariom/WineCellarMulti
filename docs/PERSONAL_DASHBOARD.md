# Dashboard personale

Da Home scegliere **La mia dashboard**, quindi **Personalizza**. Il catalogo
contiene 31 widget sintetici: una visualizzazione dominante, pochi indicatori,
fino a tre bottiglie per selezione e un collegamento **Approfondisci**.
Le dashboard predefinite conservano le analisi complete.

Nel catalogo, una pausa del mouse di 400 ms apre l'anteprima del widget reale
con i dati della cantina, senza modificarne la selezione. Il pulsante **Anteprima**
funziona anche con tastiera e touch. Il pannello rimane aperto mentre lo si
consulta; si chiude con **Chiudi anteprima**, Esc o un clic esterno.
**Aggiungi widget** modifica solo la bozza: occorre ancora **Salva dashboard**.
Sul telefono l'anteprima compare in basso, entro i limiti dello schermo.
Le anteprime sono in sola lettura e caricate all'apertura, condividendo la cache
dati della dashboard. Non richiedono nuove librerie; usano il
[Popover API del browser](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API).
I controlli di consultazione e **Riprova** funzionano anche nell'anteprima;
aprire vini o collegamenti non fa uscire dall'editor. Gli errori di caricamento
mostrano un messaggio e il codice HTTP, senza esporre dettagli interni del server.
Un errore di caricamento non significa che la cantina non contenga dati.

| Gruppo | Widget |
| --- | --- |
| Valore | Evoluzione del valore, Valore e costo d’acquisto, Bottiglie chiave, Le più preziose, Variazioni di valore, Distribuzione del valore |
| Collezione | Ultimi vini aggiunti, La cantina in numeri, Mappa delle regioni, Colori della cantina, Le annate della collezione, Vitigni protagonisti, Produttori protagonisti, Formati della collezione |
| Tempo | Panorama di maturità, Da bere adesso, Da tenere d’occhio, Le prossime al picco, Una bottiglia per stasera |
| Gusto e diario | Mappa del gusto, Geografia del gusto, Le degustazioni più apprezzate, Ultime degustazioni, Il ritmo delle degustazioni |
| Gestione | Bottiglie in viaggio, Da ritirare, Dove sono le mie bottiglie, Wishlist in primo piano, Obiettivi della collezione, Cantina da completare |
| Notizie | Wine Pulse essenziale |

## Personalizzazione e compatibilità

Cerca widget, aggiungili o rimuovili, scegli mezza riga o intera riga su desktop.
Su telefono ciascun widget occupa una riga. Trascina dalla maniglia con mouse o
touch, oppure usa Su/Giù e le frecce della tastiera. Esc annulla il trascinamento.
**Salva dashboard** conserva ordine, larghezza e raggruppamento iniziale del
widget Distribuzione del valore. Il selettore dentro il widget permette un
confronto temporaneo; il raggruppamento da conservare si sceglie nell’editor.
**Annulla** conserva la composizione precedente. Anche una dashboard vuota è valida.

La composizione è unica per utente e segue l’account nelle diverse cantine;
i dati appartengono sempre alla cantina attiva. La demo è in sola lettura.

Le composizioni precedenti vengono normalizzate senza scritture automatiche:
- valore per regione/produttore/tipologia → Distribuzione del valore;
- equilibrio regionale → Mappa delle regioni;
- equilibrio per stile → Colori della cantina;
- maturità e composizione → Panorama di maturità;
- disponibilità → La cantina in numeri.

In caso di duplicati si mantiene la prima posizione con la sua larghezza.
I vecchi identificativi restano accettati dall’API. Il successivo salvataggio
conserva la composizione normalizzata; non serve una nuova migrazione SQL.
La revisione iniziale `0108_personal_dashboard` deve essere già applicata.

## Dati e significato dei grafici

- Importi in valute diverse rimangono separati: il selettore non esegue conversioni.
- Lo storico usa `GET /api/v1/wines/value-history/portfolio?currency=CHF`.
  Il parametro opzionale filtra posizioni e rilevazioni per valuta; i vecchi
  chiamanti senza parametro mantengono il contratto precedente.
  È una ricostruzione delle valutazioni sulle quantità attuali, non il patrimonio
  storico effettivo né un rendimento. Con meno di due punti non si disegna un trend.
- Il confronto con l’acquisto include solo bottiglie con entrambi i valori.
- Le variazioni individuali confrontano prima e ultima rilevazione nella stessa
  valuta, mostrando le date; non si inventano serie per vini senza storico.
- Il radar usa le affinità del profilo attivo: 50 è neutro, non l’intensità ideale.
  Mostra numerosità e affidabilità; un profilo emergente resta dichiarato tale.
- Diario e ritmo usano l’archivio degli ultimi 12 mesi, paginato fino al totale,
  includendo esperienze esterne. I voti sono normalizzati su scala 100; un semplice
  apprezzamento non viene trasformato in un voto numerico.
- I vitigni contano le bottiglie che li contengono: gli assemblaggi possono apparire
  in più gruppi. Le finalità possono sovrapporsi se non hanno quantità ripartite.
- Lo stoccaggio comprende solo bottiglie fisicamente disponibili, incluse quelle
  non collocate. La wishlist usa prezzi obiettivo e non dispone di foto proprie:
  viene rappresentata come una piccola lista visiva numerata.
- Nessun widget genera contenuti AI o avvia ricalcoli a pagamento al caricamento.

Le richieste di profilo, archivio, notizie e storico sono condivise nella singola
istanza della dashboard. Alla sua chiusura vengono interrotte; la chiave account/
cantina ricrea il provider per evitare riuso di dati di un’altra cantina.
Gli errori sono visibili e consentono di riprovare.

## Librerie e accessibilità

Valutate le capacità di [uPlot](https://github.com/leeoniya/uPlot),
[Leaflet](https://leafletjs.com/) e [Chart.js](https://www.chartjs.org/docs/latest/charts/radar.html).
Non sono state aggiunte dipendenze: uPlot e Leaflet sono già disponibili.
Radar, anelli, barre e mosaici compatti usano SVG/CSS con etichette testuali.
I grafici temporali mantengono cursore e navigazione da tastiera, con segmenti
lineari e margini adatti ai widget. Le viste estese mantengono il comportamento
precedente. Le immagini delle bottiglie provengono dai dati reali dell’app.

## Verifica mirata

```sh
# backend/
python -m pytest tests/test_auth_and_wines.py -k personal_dashboard

# frontend/
npx playwright test e2e/wine-detail.spec.ts -g "personal dashboard|local entry reload"
npm run build
```

Copertura: preferenze e isolamento, filtro valuta e storico, compatibilità dei
vecchi layout, raggruppamento persistente, richieste condivise, errori/riprova,
selezione completa, azioni sui vini, drag & drop, viewport 360/390/430/768/1100/1440,
geometria e controllo visivo dei nuovi widget. Le baseline vengono aggiornate
solo dopo l’ispezione delle immagini effettivamente renderizzate.
