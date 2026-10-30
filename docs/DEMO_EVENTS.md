# Eventi con QR (demo per ospiti)

Un QR code al tavolo di un locale o a una degustazione porta gli ospiti dentro
Vinaris senza registrazione: provano le funzioni AI scelte per l'evento con il
credito di Vinaris e possono tenere quello che hanno fatto come account proprio.
L'obiettivo è acquisire clienti, non locali: il locale è solo il contesto.

## Come funziona

- **Admin → Impostazioni → Operatività → Eventi con QR.** Ogni evento ha nome
  e luogo (in testata: *Vinaris at The Market · Lugano*), lingua, funzioni AI
  offerte, credito per ospite, tetto di spesa, ospiti al giorno, durata della
  visita e, facoltativi, inizio e fine validità.
- L'ospite atterra sulla **pagina di benvenuto dell'evento** ("Stasera"), nella
  lingua dell'evento: presenta solo le funzioni offerte, come funziona in tre
  passi e "Tieni questa serata". Nell'abbinamento al ristorante vede solo i
  percorsi previsti (carta fotografata e/o proposta dal piatto), mai "A casa".
- Il QR (SVG scaricabile) codifica `https://<dominio>/e/<slug>`. Lo slug è
  casuale e si può rigenerare ("Nuovo indirizzo") se il QR finisce in giro.
  È vestito Vinaris (`services/event_qr.py`): correzione d'errore H, puntini
  verde scuro, occhi color vino, calice al centro, cornice oro e didascalia
  "Vinaris at <evento> · <luogo>". I moduli sotto il calice sono omessi, non
  coperti: il codice resta leggibile anche stampato piccolo.
- **Metti in pausa** ferma i nuovi ingressi per un po'; **Elimina**
  (`DELETE /api/v1/admin/events/{id}`, con conferma) è definitivo: il QR smette
  di funzionare, gli ospiti ancora in visita vengono eliminati con la loro
  cantina, gli account già tenuti restano senza l'evento come provenienza.
- All'apertura, `POST /api/v1/events/{slug}/enter` crea un utente effimero
  (`event-…@visitor.vinaris.app`) con una cantina vuota tutta sua, il credito
  dell'evento nel wallet standard e una sessione che dura quanto la visita.
  L'accettazione di privacy e termini è registrata alla creazione: la pagina
  dell'evento lo dichiara.
- Ogni chiamata AI passa da `create_ai_response`, che per un ospite rifiuta i
  `task_type` non coperti dalle funzioni dell'evento
  (`services/demo_events.py:EVENT_FEATURES`); le route della carta vini e
  dell'abbinamento controllano anche la funzione in sé.
- **Tieni questa serata**: `POST /api/v1/events/claim` trasforma l'utente
  effimero in un account vero (e-mail, password, nome della cantina, consensi).
  Segue la stessa verifica e-mail della registrazione; il credito di benvenuto
  è quello di `signup_ai_credit_usd`. L'evento resta come provenienza
  (`users.event_id`), la scadenza della visita viene azzerata.
- **Foto delle bottiglie** (`bottle_photo`): la funzione copre lettura delle
  etichette e "Completa con AI" (`wine_full_enrichment`). L'import scrive nella cantina
  effimera dell'ospite. La pagina Stasera le elenca ("Le bottiglie di stasera",
  con rimozione) e avverte che spariscono con la purga a fine visita; tenendo
  la serata restano nella cantina dell'account.
- **Wine Pulse** (`wine_pulse`): la pagina delle notizie, già scritte dal job
  editoriale; l'ospite legge soltanto, nessuna chiamata AI né credito speso.
- **Esplora la demo**: la demo è una sessione a parte (sola lettura). Se la
  apre un ospite, `user_sessions.resume_user_id` ricorda l'ospite e la sessione
  espone `event_return`; **Torna alla serata** chiama
  `POST /api/v1/events/return` (esente dal blocco scritture della demo), che
  riapre lo stesso account senza un nuovo ingresso né nuovo credito. Dopo un
  reload l'ospite resta sulla pagina dell'evento: la sessione porta l'evento.
- Gli ospiti scaduti che non hanno tenuto l'account vengono eliminati, con la
  loro cantina, al successivo ingresso nello stesso evento o all'apertura della
  lista eventi in admin.

## Protezioni

Rate limit per IP sull'ingresso, massimo ospiti al giorno, tetto in USD per
evento, validità temporale, interruttore "Metti in pausa", slug rigenerabile.
Nessun prompt viene registrato: le statistiche sono solo contatori (ospiti, in
visita ora, account tenuti, credito concesso, spesa AI).

## Verifica

```powershell
# backend
pytest tests/test_demo_events.py
# frontend
npx playwright test e2e/event-guest.spec.ts
```
