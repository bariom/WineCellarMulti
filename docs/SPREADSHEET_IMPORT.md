# Import da Excel: piano

Stato: **piano approvato**, implementazione in corso. Scritto il 9.11.2026 dopo
l'analisi di dieci file Excel di esempio (sei in italiano, quattro in inglese) che
rappresentano i modi in cui le persone tengono oggi la cantina in un foglio di
calcolo.

## Il problema

Oggi Vinaris importa due formati fissi: il CSV di CellarTracker e il backup JSON di
Vinaris. Chi tiene la cantina in Excel ha invece un file suo, con colonne, fogli e
convenzioni propri. Un import con colonne fisse non funziona per nessuno di loro.

L'obiettivo è un solo import che **legge il file così com'è, propone un'interpretazione
e la fa confermare** all'utente in un'anteprima, senza chiedergli di riformattare
niente prima.

## Cosa hanno mostrato i dieci file

| # | File | Forma | Casi nuovi |
|---|---|---|---|
| 1 | cantina personale | inventario | titolo sopra l'intestazione (riga 4), vino e produttore nella stessa cella, valuta nell'intestazione |
| 2 | collezionista | inventario + riepilogo | 18 colonne, "Stato" = maturità (non lo stato Vinaris), bottiglie bevute senza data, riepilogo con totali da usare come controllo |
| 3 | lista di casa | inventario + wishlist | intestazione alla riga 1, produttore **prima** del nome, "Per quando" = occasione (non una data) |
| 4 | cantina per scaffale | 3 fogli uguali | fogli da unire, **ubicazione e tipo nel nome del foglio**, euro nel formato della cella, date Excel |
| 5 | registro acquisti | movimenti + saldo | il saldo è una formula sui movimenti, annata e posizione solo nel foglio saldo |
| 6 | occasioni e bevuti | inventario + diario | **annata dentro il nome**, intestazioni a righe diverse per foglio, il diario non tocca il saldo |
| 7 | EN cupboard | inventario + wishlist | intestazioni inglesi, sterline, "When to open" = occasione, vini di marca |
| 8 | EN basement | inventario + wishlist | **produttore in colonna separata**, denominazione al posto del nome per gli château, tabella Excel, dollaro solo nel formato, "Rack A / 01" |
| 9 | EN tasting diary | diario + inventario | il primo foglio non è l'inventario, punteggio /10, abbinamento separato dall'occasione, degustazioni di vini non in cantina |
| 10 | EN shared stash | inventario + uscite | **proprietari**, quantità = casse × bottiglie + sciolte (formula), non si sa se le uscite sono già scalate, date americane |

Dai dieci file emergono sei problemi, che tornano ovunque con varianti:

1. **Trovare la tabella**: riga d'intestazione da 1 a 4, titoli su celle unite,
   totali sotto o di lato, una tabella Excel, i riquadri bloccati.
2. **Capire cos'è ogni foglio**: inventario, wishlist, diario delle degustazioni,
   registro dei movimenti, riepilogo, oppure niente.
3. **Riconoscere le colonne** da nome **e** valori. Tre colonne ("Stato",
   "Per quando", "When to open") hanno un nome che porta al campo sbagliato.
4. **Separare nome, produttore e annata**, che stanno nella stessa cella in almeno
   cinque modi diversi. Le regole da sole ne risolvono dal 25% all'80% a seconda del
   file.
5. **Valuta e numeri**: CHF, €, £ e $ nella colonna, nell'intestazione o solo nel
   formato della cella; date Excel, date in testo ISO, date americane.
6. **Ubicazione**: in una colonna con separatore (" - ", " / "), nel nome del foglio,
   oppure assente.

## Fasi

### Fase 1: inventario, wishlist e diario delle degustazioni

Copre i file 1-4, 6, 7, 8 e 9 per intero, e il foglio principale dei file 5 e 10.

- Upload di `.xlsx`, `.xlsm`, `.xls`, `.ods` e `.csv`.
- Ricerca della tabella e del tipo di ogni foglio, con unione dei fogli uguali.
- Mappatura delle colonne con dizionario IT/EN/FR/DE più analisi dei valori.
- Separazione di nome, produttore e annata con regole e catalogo; AI facoltativa per
  le righe non risolte.
- Anteprima con avvisi, domande esplicite e controllo dei totali.
- Import in cantina (vini, quantità, ubicazioni e bin, proprietari), wishlist e
  degustazioni. Le degustazioni **non** cambiano le quantità.
- Salvataggio della mappatura per il prossimo import dello stesso file.

### Fase 2: registro dei movimenti

Copre il file 5 e il secondo foglio del file 10.

- Un registro (data, vino, entrata/uscita, tipo) che **determina** il saldo.
- Collegamento tra fogli per nome del vino (annata e posizione da un foglio, storia
  dall'altro).
- Uscite non bevute ("regalo") distinte dalle bevute.
- La domanda obbligatoria: "le quantità della cantina tengono già conto delle
  uscite?", con un esempio concreto preso dal file.
- Arricchimento dopo l'import (regione, vitigni, finestra di beva) con il costo in
  crediti AI indicato prima.

### Fuori ambito per ora

- Ricalcolo delle formule: si legge il valore salvato da Excel. Se manca (file mai
  aperto in Excel) la colonna viene segnalata e l'utente sceglie un'alternativa.

## Flusso per l'utente

1. **Carica il file** dal pannello di import, accanto a CellarTracker e al backup
   JSON.
2. **Fogli**: per ognuno Vinaris propone il tipo (Cantina, Wishlist, Degustazioni,
   Riepilogo, Ignora). I fogli con la stessa intestazione sono già raggruppati
   ("3 fogli uniti, 19 vini"); il nome del foglio diventa una colonna in più.
3. **Colonne**: per ognuna il campo proposto, tre valori d'esempio e un menu per
   cambiarlo. Le colonne incerte sono evidenziate e per default vanno nelle note.
4. **Nomi**: una tabella "Nel file → Produttore / Vino / Annata" con le righe non
   risolte in evidenza e, se ce ne sono, il pulsante facoltativo "Risolvi N nomi con
   l'AI" con il costo stimato.
5. **Domande**, solo quando servono: valuta ambigua ("$ = USD?"), ordine delle date
   in testo, come trasformare "Com'era" e "Score /10" in voto, come dividere
   l'ubicazione.
6. **Anteprima finale**: vini nuovi, esistenti, ignorati; avvisi; se c'è un
   riepilogo nel file, il confronto "il tuo file dice 85 bottiglie, abbiamo letto
   85".
7. **Importa**, con le stesse modalità di CellarTracker (solo nuovi o aggiorna
   esistenti) e lo stesso limite di 15 etichette del piano gratuito.

Su telefono il flusso resta a un passo per schermata. Le tabelle diventano schede,
come nella pagina di confronto con CellarTracker.

## Architettura

### Backend

Nuovo pacchetto `backend/app/services/spreadsheet_import/`:

| Modulo | Compito |
|---|---|
| `reader.py` | Porta ogni formato nello stesso modello di cartella (fogli, celle con valore, formula sì/no, formato numerico, celle unite, tabelle, riquadri bloccati, convalide). `.xlsx`/`.xlsm` con `openpyxl`, aperto due volte: `data_only=True` per i valori salvati e senza per sapere quali celle sono formule. `.xls` con `xlrd` (valori, formati e celle unite; niente tabelle). `.ods` con `odfpy` (valori e celle unite). `.csv` come un foglio senza formati, con rilevamento di separatore e codifica. |
| `tables.py` | Trova la tabella in ogni foglio: tabella Excel, poi riquadri bloccati, poi un punteggio per riga (celle testuali, celle piene, tipi coerenti sotto). Scarta titoli, righe vuote e totali. Raggruppa i fogli con intestazioni equivalenti. |
| `sheet_kind.py` | Propone il tipo di foglio dalle colonne riconosciute: data in testa con punteggio o note di degustazione = diario; budget o prezzo obiettivo = wishlist; formule su altri fogli e poche righe = riepilogo; entrata/uscita = registro (fase 2). |
| `columns.py` | Dizionario dei sinonimi IT/EN/FR/DE per campo, più un profilo dei valori per colonna (anni plausibili, numeri, date, valute, tipi di vino, valori ripetuti, testo libero). Il punteggio finale combina nome e valori; un nome che porta a un campo smentito dai valori perde. |
| `names.py` | Separa produttore, nome e annata (vedi sotto). |
| `values.py` | Normalizza numeri (`1'250.–`, `1.250,00`, `24.9`), date (Excel, ISO, `dd.mm.yyyy`, `dd/mm/yy`, americane), valute, tipi (rosso/red/rouge/rot, bollicine/sparkling/Champagne, rosé), formati (750, 0.75, 75cl, magnum), quantità a parole ("3 bottles"), ubicazioni e bin. |
| `plan.py` | Trasforma file + mappatura confermata in un piano d'import tipizzato: vini con allocazioni, voci di wishlist, degustazioni, avvisi, totali. |
| `persist.py` | Scrive il piano riusando quello che c'è già, vedi sotto. |

Rotte in `backend/app/api/routes/imports.py`, sotto `/api/v1/imports/spreadsheet`:

| Rotta | Input | Output |
|---|---|---|
| `POST /analyze` | file | fogli, tabelle, tipo proposto, mappatura proposta con confidenza ed esempi, gruppi di fogli, valuta, domande, eventuale mappatura salvata riconosciuta |
| `POST /names` | file + mappatura + righe non risolte | proposte AI per produttore/nome/annata (solo se l'utente lo chiede, con addebito) |
| `POST /preview` | file + mappatura + risposte | conteggi, duplicati, avvisi, controllo dei totali, capacità del piano gratuito |
| `POST /` | file + mappatura + risposte + modalità | risultato dell'import |

**Nessun file viene conservato sul server.** Il client tiene il file e lo rimanda a
ogni passo insieme alla mappatura. Così non servono storage temporaneo, pulizia né
una nuova categoria di dati personali da gestire nella privacy policy.

Limiti: 5 MB per file, 20 fogli, 5'000 righe di dati, 60 colonne. Oltre, l'analisi
risponde con un errore chiaro. `openpyxl` non esegue le formule né le macro; i file
`.xlsm` si leggono come `.xlsx` ignorando le macro. Nuove dipendenze: `xlrd` (`.xls`), `odfpy` (`.ods`) e `defusedxml`, che
`openpyxl` usa da solo se installato, contro gli XML malevoli.

**Tenancy**: ogni ricerca di duplicati, ubicazioni, bin, proprietari e mappature
salvate filtra per `context.household.id`, come l'import CellarTracker.

### Riuso dell'import esistente

L'import CellarTracker contiene già la parte difficile della scrittura:
`wine_duplicate_key`, `existing_wine_keys`, raggruppamento delle righe dello stesso
vino, `import_storage_destination`, `add_to_storage`, `sync_storage_to_wine_quantity`,
tag, catalogo (`propose_wine_catalog_entry`) e limite del piano gratuito
(`cellartracker_free_tier_capacity`).

Il primo passo è **estrarre questa parte in una funzione comune**
(`persist_imported_wines`) usata sia da CellarTracker sia dal nuovo import, con i test
CellarTracker esistenti a garanzia che niente cambi.

Destinazioni dei dati:

| Dato | Dove va |
|---|---|
| vino in cantina | `Wine`, con `merchant`, `order_date`, `owners`, `current_value`, `drink_from`/`drink_to` |
| ubicazione e bin | `CellarLocation`, `CellarBin`, `WineStorageAllocation` |
| wishlist | `WishlistItem`, con `target_price`, `currency`, `priority`, `notes` |
| degustazione di un vino in cantina | `WineTastingEntry`: `consumed_at`, `note`, `score_value` + `score_scale` (la scala originale resta), `rating`, `occasion`, `pairing`, `companions`, `source="spreadsheet"`, `source_text` con la riga originale |
| degustazione di un vino non in cantina | `ExternalWineTasting` (ha `rating` ma non `score_value`/`score_scale`: il punteggio originale va nella nota) |
| colonne senza campo | `notes` del vino, con l'intestazione come prefisso ("Stato: Pronto") |

Nuova tabella (migrazione `0132_spreadsheet_import_maps.py`):
`spreadsheet_import_maps` con `household_id`, `fingerprint` (hash delle intestazioni
normalizzate e dei nomi dei fogli), `mapping` (JSON), `answers` (JSON),
`created_at`, `last_used_at`. Unicità su (`household_id`, `fingerprint`).

### Nome, produttore e annata

In quest'ordine, fermandosi al primo risultato certo:

1. **Colonne separate**: se esiste una colonna produttore, si usa (file 8).
2. **Annata nel nome**: un anno tra 1900 e l'anno prossimo in fondo, o tra
   parentesi, diventa l'annata se la colonna annata manca o è vuota (file 6). "NV",
   "s.a.", "sans année" = senza annata.
3. **Separatore**: " - ", " – ", " | " dividono vino e produttore. Il lato che
   corrisponde a un produttore noto è il produttore; se nessuno dei due è noto,
   l'ordine più frequente nel file decide ("vino - produttore" nei file 1, 2, 3).
4. **Produttore noto all'inizio o alla fine**: si provano i prefissi e i suffissi
   del nome contro i produttori del catalogo (`WineCatalogEntry.producer`, alias
   inclusi) e quelli già presenti nella cantina dell'utente ("Masi Campofiorin",
   "Tignanello Antinori").
5. **Château, Domaine, Tenuta, Weingut, Bodega…** all'inizio: il nome è anche il
   produttore (file 2, 8).
6. **Denominazione al posto del nome**: se la colonna "vino" contiene una
   denominazione nota e il produttore è uno château, il nome diventa lo château e il
   valore va in `appellation` (file 8).
7. **Catalogo**: `matching_catalog_entries` su nome intero, poi sulle divisioni
   candidate.
8. **Non risolto**: produttore vuoto, nome intero, riga evidenziata in anteprima.
   Le marche ("19 Crimes", "Bread & Butter") restano come produttore solo se
   l'utente lo conferma.

L'AI, se l'utente la chiede, riceve **solo le stringhe non risolte** (mai il file,
mai prezzi o note), risponde in JSON con produttore, nome, annata e confidenza, e
le sue proposte compaiono nell'anteprima da confermare come le altre. Il prompt è
un builder versionato in `backend/app/prompts/spreadsheet_import.py`
(`spreadsheet_import.name_split`, versione 1); il modello segue
`docs/OPENAI_MODELS.md`; l'addebito passa da `services/ai_credits.py` come le altre
funzioni AI.

### Regole dai casi visti

| Caso | Regola |
|---|---|
| "Stato", "Per quando", "When to open" (file 2, 3, 6, 7) | Una colonna proposta come data o finestra di beva deve contenere anni o date in almeno l'80% delle celle piene, altrimenti va nei tag (valori brevi e ripetuti) o nelle note. |
| Valori con barra, "aperitivo / festa" (file 6) | In una colonna di tag si divide su "/" e ",". |
| Totale da formula, casse × bottiglie + sciolte (file 10) | Se una colonna si chiama totale o è una formula sulle altre quantità della stessa riga, si usa quella. |
| Saldo con formula ma senza valore salvato (file 5) | La colonna viene segnalata; l'utente sceglie un'altra colonna o inserisce la quantità. |
| Fogli con la stessa intestazione (file 4) | Si uniscono; il nome del foglio diventa la colonna "Foglio", mappabile su ubicazione, tipo o entrambi ("Scaffale A - rossi" → ubicazione "Scaffale A", tipo rosso). |
| Riepilogo (file 2) | Foglio non importato; se contiene totali di bottiglie o valore, l'anteprima li confronta con quanto letto. |
| Valuta | In quest'ordine: colonna valuta, simbolo o codice nell'intestazione, formato della cella, valuta della cantina. "$" va sempre confermato. |
| Date in testo | L'ordine giorno/mese si deduce dalla colonna intera (un valore oltre 12 lo chiarisce); se resta ambiguo, si chiede. |
| Punteggio (file 9) | La scala si legge dall'intestazione (/5, /10, /20, /100) o dal massimo della colonna; si salva in `score_value`/`score_scale` e si converte in `rating` sulla scala 0-6. |
| Giudizi a parole (file 6) | Proposta di conversione (discreto 3, buono 4, molto buono 5, ottimo 5.5, eccellente 6, vedi le decisioni) da confermare; il testo resta nella nota. |
| "Lo ricompro?", "Buy again?" (file 6, 9) | Per i vini non più in cantina, i "sì" sono proposti come voci di wishlist, deselezionabili. |
| Bottiglie bevute senza data (file 2) | Vanno nelle note; nessuna degustazione inventata. |
| Proprietari (file 10) | Proposti come `owners` del vino; in alternativa tag. |
| Ubicazione con separatore (file 2, 8) | "A1 - ripiano 2" e "Rack A / 01" si dividono in ubicazione e bin, ma solo se lo stesso schema vale per la maggior parte della colonna. |
| Celle vuote in fondo alla riga, colonne sempre vuote (file 3, 6) | Ignorate senza avvisi. |

## Frontend

- Nuovo componente `SpreadsheetImportWizard`, caricato in modo lazy come le altre
  funzioni pesanti, aperto dal pannello di import dove oggi si trovano CellarTracker
  e il backup JSON.
- Passi: file → fogli → colonne → nomi → domande → anteprima → risultato. Si torna
  indietro senza perdere le scelte.
- Tutto il testo in italiano e inglese in `i18n.ts`.
- Nuovi tipi in `types.ts` per analisi, mappatura, anteprima e risultato.
- Controlli a 390×844, 360×800 e 430×932: nessuna sovrapposizione né scorrimento
  orizzontale, tabelle trasformate in schede.

## Test

- **Backend**: un generatore di fixture in `backend/tests/spreadsheet_fixtures.py`
  ricrea con `openpyxl` le dieci forme di file con dati inventati della stessa
  struttura (stesse intestazioni, titoli, celle unite, formule, formati, fogli). I
  file originali non entrano nel repository. Per ognuno un test controlla analisi,
  anteprima e import, più test unitari su `names.py` e `values.py` con tutti gli
  esempi di nomi visti.
- **Regressione**: i test CellarTracker esistenti devono passare invariati dopo
  l'estrazione di `persist_imported_wines`.
- **E2E**: `e2e/spreadsheet-import.spec.ts` con API simulate, sul percorso completo e
  sulle viste a 390 px.

## Ordine di lavoro

1. Estrarre `persist_imported_wines` dall'import CellarTracker, a comportamento
   invariato.
2. `reader.py`, `tables.py`, `values.py` con le fixture dei dieci file.
3. `columns.py` e `sheet_kind.py`; rotta `analyze`.
4. `names.py` con catalogo; rotte `preview` e import; migrazione delle mappature
   salvate.
5. Frontend del wizard.
6. Divisione dei nomi con l'AI (rotta `names`).
7. Fase 2.

## Decisioni aperte

## Decisioni prese (9.11.2026)

1. **Divisione nomi con l'AI**: i primi 15 nomi per cantina sono gratis, contati una
   volta sola e non a ogni import (come le 15 etichette del piano gratuito); oltre,
   si pagano con i crediti AI come le altre funzioni.
2. **Piano gratuito**: l'import Excel è disponibile a tutti, con il limite di 15
   etichette come CellarTracker.
3. **Giudizi a parole → voto (scala 0-6)**: discreto 3, buono 4, molto buono 5,
   ottimo 5.5, eccellente 6. Gli equivalenti inglesi (fair, good, very good,
   excellent/great, outstanding) seguono la stessa scala; l'utente può cambiarla
   nell'anteprima.
4. **`.xls` e `.ods`** supportati da subito.
5. **Offerta "lo importiamo noi"**: rimandata, non fa parte del codice.
