# Comunicazioni globali agli utenti

## Uso

Disponibile in **Impostazioni → Comunicazioni**, solo agli amministratori
dell'app (non agli owner/admin di una singola cantina), fuori da demo e offline.

1. Scrivere titolo e messaggio oppure usare **Prepara annuncio nuova grafica**.
   Il pulsante prepara solo testo modificabile: non invia nulla.
2. Scegliere un collegamento facoltativo a Home, Cantina o Wine Pulse.
3. Aprire **Anteprima invio**, controllare testo e numero attuale di destinatari.
4. Se si desidera pubblicare, premere **Conferma e invia a tutti**.

Una notifica viene salvata per ogni utente approvato, non bloccato e membro di
almeno una cantina non demo, inclusi utenti gratuiti, lettori e amministratori.
Più cantine non generano duplicati. Non sono inclusi utenti registrati dopo
l'invio. Il conteggio effettivo può variare rispetto all'anteprima se gli account
cambiano nel frattempo.

L'annuncio compare nel centro notifiche, categoria Sistema, al successivo
aggiornamento delle notifiche. Può essere letto, archiviato o eliminato
individualmente senza influire sugli altri destinatari. Non è una notifica push
del browser/dispositivo e non invia email. Il testo è semplice, senza HTML,
nella lingua scelta da chi scrive; nessuna traduzione automatica.

Lo storico conserva gli ultimi 50 invii visibili, con data e destinatari;
il database conserva anche l'autore. Non sono implementati programmazione,
ritiro o modifica di annunci già inviati.

## Distribuzione

Prima di usare la funzione, applicare la nuova migrazione sul database
dell'ambiente di destinazione:

```powershell
cd backend
.\.venv\Scripts\alembic.exe upgrade head
```

Migrazione: `0109_admin_announcements` (successiva a `0108_personal_dashboard`).
Aggiunge solo la tabella di audit; le notifiche usano la struttura esistente.
Il downgrade rimuove lo storico, non le notifiche già consegnate.
Nessuna migrazione su database live e nessun invio reale sono stati eseguiti
durante l'implementazione.

## API e garanzie

- `GET /api/v1/admin/announcements/audience`: conteggio, senza dati personali.
- `GET /api/v1/admin/announcements`: ultimi 50 invii.
- `POST /api/v1/admin/announcements`: `id` UUID generato dal client,
  `title` (1–180 caratteri), `message` (1–4000), `action_url`
  (null, /home, /cellar, /pulse), `confirm: true`.

Tutti gli endpoint richiedono CurrentContext e privilegi di amministratore app.
Il target globale è intenzionale; nessun contenuto delle cantine è consultato.
Storico e copie utente sono scritti in una sola transazione: nessun invio parziale.
L'UUID rende idempotenti i retry, anche dopo lettura/eliminazione delle copie;
il riuso dello stesso UUID con contenuto o autore diverso produce 409.
Il client conserva lo stesso UUID dopo errori di rete e blocca doppi clic.
Le notifiche restano protette dal controllo dell'utente destinatario esistente.

## Test mirati

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_announcements.py tests/test_announcements_migration.py -q
cd ../frontend
npx playwright test e2e/wine-detail.spec.ts -g "admin announcements"
npm run build
```
