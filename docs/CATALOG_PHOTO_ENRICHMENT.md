# Arricchire il catalogo da foto: piano

Stato: **piano approvato** l'11.11.2026. Fase 1 (lettura e confronto) e Fase 2 (schede
complete e foto) implementate.

## Lo scopo

Gli admin dell'app (`User.is_app_admin`, non gli admin di una cantina) devono poter
arricchire il catalogo centrale dei vini fotografando uno scaffale in enoteca o una
singola bottiglia. Vinaris legge le etichette, riconosce i vini già in catalogo e
cerca con l'AI i dati di base di quelli nuovi, così che la scheda sia il più completa
possibile spendendo poco. Il valore di mercato è escluso.

Se la foto è abbastanza buona, la bottiglia scontornata entra anche nell'archivio
condiviso delle foto, da cui le cantine la ricevono quando aggiungono quel vino.

## Decisioni

| Tema | Scelta | Perché |
|---|---|---|
| Chi paga | La chiave dell'app (`app_granted=True`) | È lavoro sul catalogo, non su una cantina; vale anche se l'admin non ha un abbonamento |
| Stato delle schede salvate | Subito approvate (`is_active=True`) | L'admin le ha già riviste nella stessa schermata |
| Dati per vino | Descrizione e fonti sulla scheda del catalogo (migrazione) | Non dipendono dall'annata |
| Dati per annata | Finestra di beva e note nei `SharedWineFact` esistenti | Cambiano con l'annata; le cantine li riusano già a costo zero |
| Dove | "Arricchisci da foto" nel pannello Catalogo (Impostazioni → Operazioni) | Il catalogo si gestisce già lì; la schermata va pensata per il telefono |
| Valore di mercato | Mai cercato | Richiesta esplicita; costa ricerche web e scade dopo 14 giorni |

## Il flusso

1. **Foto.** Da 1 a 3 foto e una modalità:
   - *Scaffale*: la foto è divisa in sezioni lette in parallelo, come lo Scaffale AI;
   - *Bottiglie da vicino*: la foto intera in una sola lettura (una bottiglia o poche).
2. **Lettura** (Fase 1). Modello economico, nessuna ricerca web. Per ogni etichetta:
   produttore, vino, annata, tipo, regione, denominazione, paese, sicurezza della
   lettura, riquadro dell'etichetta e altezza della bottiglia nella foto.
3. **Confronto col catalogo prima dell'AI** (Fase 1). Ogni etichetta è cercata in tutte
   le schede, anche quelle in attesa. Esito: *già in catalogo* (con i campi che mancano),
   *in attesa di approvazione*, *nuovo*, oppure *da controllare* se più schede si
   somigliano.
4. **Ricerca dei dati** (Fase 2), solo per i vini scelti dall'admin. Più vini nella
   stessa chiamata (fino a 5), con ricerca web e poche chiamate allo strumento. Si cercano
   produttore, denominazione, regione, paese, tipo, vitigni, una breve descrizione,
   finestra di beva per l'annata letta e le fonti. Un campo è accettato solo se coerente
   con produttore e annata letti sull'etichetta e se la fonte è tra quelle restituite
   davvero dalla ricerca.
5. **Foto della bottiglia** (Fase 2), senza AI. La bottiglia è ritagliata dall'originale a
   piena risoluzione e controllata: dimensione minima, nitidezza, esposizione, etichetta
   letta con sicurezza alta e bottiglia non tagliata dal bordo. Se passa, è scontornata
   con lo stesso procedimento delle foto delle bottiglie (`process_bottle_photo`) e
   salvata nell'archivio condiviso (`WinePhotoLibraryEntry`). Una foto già presente per
   quel vino non viene sostituita, salvo scelta esplicita.
6. **Revisione e salvataggio** (Fase 2). L'admin corregge i campi e salva: la scheda
   nuova nasce approvata, quella esistente riceve solo i campi vuoti (o quelli che l'admin
   ha cambiato), i dati per annata vanno nei `SharedWineFact`, la foto nell'archivio.

## Costi

- La lettura costa come lo Scaffale AI: un'immagine per sezione con il modello economico.
- Il confronto col catalogo e i controlli sulla foto non costano niente.
- La ricerca dei dati è la parte che pesa, soprattutto per le ricerche web ($0.01 l'una):
  raggruppare i vini e limitare le chiamate allo strumento è ciò che tiene basso il costo.
- Ogni chiamata è registrata nel registro AI come le altre, con il costo reale.

## Fasi

### Fase 1: lettura e confronto

- Backend: `services/catalog_photo_scan.py` (lavoro in background come lo Scaffale AI,
  foto tenute in memoria solo per la durata del lavoro), prompt
  `catalog_photo_recognition_prompt`, rotte app-admin `POST /api/v1/catalog-photos/scans`
  e `GET /api/v1/catalog-photos/scans/{id}`.
- Frontend: sezione "Arricchisci da foto" nel pannello Catalogo con modalità, foto,
  avanzamento e l'elenco delle etichette lette con il loro esito.
- Test: pytest della lettura, dell'unione delle sezioni, del confronto e dei permessi;
  E2E della schermata a 390, 360 e 430 px.

### Fase 2: schede complete e foto

- Migrazione `0134_catalog_entry_details`: `description`, `sources` e `enriched_at` su
  `wine_catalog_entries`.
- Backend: `services/catalog_photo_details.py` e prompt `catalog_photo_details_prompt`.
  - `POST /api/v1/catalog-photos/scans/{id}/details` cerca fino a 10 vini, 5 per chiamata,
    al massimo 4 ricerche web per chiamata. Un vino senza una fonte restituita davvero
    dalla ricerca, o con un produttore o un nome diversi da quelli letti, risulta "non
    trovato".
  - `POST /api/v1/catalog-photos/scans/{id}/bottles/{n}` salva la scheda. Le fonti
    arrivano dal server, mai dal client. I dati per annata (finestra di beva, note,
    vitigni) vanno nei `SharedWineFact`, solo se mancano.
  - La foto è controllata alla fine della lettura, senza AI: lettura sicura, bottiglia
    intera, almeno 400 px di altezza e 80 px di etichetta, etichetta non troppo scura,
    non bruciata, nitida (varianza del laplaciano ≥ 40). Le soglie vanno tarate su foto
    vere.
  - Lo scontorno delle foto del catalogo (`process_bottle_photo(...,
    catalog_label_share=...)`) non usa la sagoma della fotocamera dell'app: la bottiglia
    di uno scaffale non è né centrata né dritta, e ha vicine che la toccano.
    - Il ritaglio, centrato sull'etichetta, lascia l'8% di margine sopra e il 12% sotto.
    - SAM (Segment Anything, modello aperto, `WINE_PHOTO_CATALOG_SAM_MODEL=sam`) sceglie la
      bottiglia indicata da tre punti (etichetta, collo, base) e da un riquadro: le vicine
      che la toccano restano fuori. Le righe che SAM lascia vuote prendono la larghezza del
      corpo; il contorno preciso viene dal modello di sfondo (`birefnet-general-lite`)
      dentro quella zona (`sam_bottle_region`). Senza SAM (non installabile, o vuoto nelle
      impostazioni) valgono le regole sulla sagoma qui sotto. SAM e BiRefNet girano sulla
      CPU del server: 30–45 s per bottiglia sul PC di sviluppo. Al primo uso il server
      scarica il modello SAM (circa 400 MB); per evitarlo in anteprima:
      `cd backend && .venv/bin/python -c "import rembg; rembg.new_session('sam')"`.
    - Senza SAM, della maschera si tiene la sagoma della bottiglia, riga per riga lungo il suo asse
      (`bottle_silhouette`). Il corpo è largo tra 0,22 e 0,6 della larghezza del ritaglio
      (costruito sull'altezza della bottiglia); l'etichetta letta dall'AI restringe
      l'intervallo solo se è coerente, perché la sua larghezza è una stima che cambia da
      una lettura all'altra. La bottiglia è simmetrica; salendo la sagoma si stringe, a
      parte il bordo della capsula; ogni riga deve sovrapporsi alla precedente. Quello che
      sporge (bottiglie vicine, macchine, scaffali) viene tolto.
    - `GET /api/v1/catalog-photos/scans/{id}/bottles/{n}/cutout` mostra lo scontorno in
      "Rivedi e salva" prima del salvataggio; il lavoro lo tiene in memoria e il
      salvataggio archivia esattamente quell'immagine. Se lo scontorno fallisce, la casella
      della foto si disattiva.
    - Provato con SAM sul codice vero su sei bottiglie di due foto (bancone e scaffale):
      tutte intere, dritte e senza vicine. Limite noto: una bottiglia con un'altra uguale
      subito dietro, sfalsata di poco, può uscire con due capsule.
    - La bottiglia viene raddrizzata fino a 20° e scartata se tocca il bordo della foto o
      del ritaglio, o se non ha proporzioni da bottiglia.
    - Provato sul modello vero (`birefnet-general-lite`) con una foto di bancone con
      bottiglie che si toccano: Sherazade, Hebo, 5 Stelle e Pinot Noir escono intere e
      pulite.
  - Il lavoro resta disponibile 90 minuti dall'ultima richiesta dell'admin.
- Frontend: scelta dei vini da cercare, esito della ricerca e della foto per ogni vino,
  modulo "Rivedi e salva" (`AdminCatalogPhotoEditor.tsx`).
- Test: `tests/test_catalog_photo_details.py` e `e2e/admin-catalog-photo.spec.ts`.

## Fuori da questo piano

- Valore di mercato e prezzi.
- Alcol: richiede una colonna per annata; si aggiunge se servirà.
- Arricchimento dal catalogo per gli utenti non admin: restano le funzioni esistenti.
