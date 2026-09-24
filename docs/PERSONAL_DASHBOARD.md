# Dashboard personale

Da Home scegliere **La mia dashboard**, quindi **Personalizza**. Il catalogo
permette di aggiungere o rimuovere 22 widget. Il campo **Cerca widget** filtra
nomi e descrizioni senza modificare le selezioni.

| Gruppo | Widget |
| --- | --- |
| Riepilogo | La cantina in numeri, Valore della collezione, Disponibilità, Maturità e composizione |
| Collezione e valore | Bottiglie in primo piano, Le 5 bottiglie più preziose, Valore per tipologia, Valore per regione, Valore per produttore |
| Da bere | Pronti da bere, Cosa apro stasera?, Finestre di beva superate, Mappa maturità |
| Distribuzione | Mappa delle regioni, Equilibrio regionale, Equilibrio per stile |
| Gestione | Ultimi arrivi, Consegne in arrivo, Vini da ritirare, Qualità dei dati |
| Preferenze e notizie | Il mio gusto, Wine Pulse |

I widget riutilizzano dati, calcoli e azioni delle dashboard predefinite.
Le bottiglie in primo piano aprono la spiegazione della selezione; la qualità
dei dati consente anche di aprire la gestione delle valutazioni da aggiornare.
I tre riepiloghi separati permettono di scegliere valore, disponibilità e
composizione senza includere l'intera panoramica.

La maniglia accanto al titolo permette di trascinare i widget con mouse o touch.
Il bordo evidenzia la destinazione; vicino ai margini la pagina scorre durante
il trascinamento. Esc o l'interruzione del gesto annullano lo spostamento.
Restano disponibili i pulsanti Su/Giù e le frecce della tastiera sulla maniglia.
Ogni widget può occupare mezza riga o
una riga intera su desktop; su telefono i widget sono in una sola colonna.
**Salva dashboard** conserva la composizione nell'account, anche su altri
dispositivi. **Annulla** scarta la modifica in corso. È possibile salvare anche
una dashboard vuota. **Usa come iniziale** la imposta come Home predefinita.

La composizione è unica per utente. Cambiando cantina si mantiene la stessa
composizione, con i dati della cantina attiva. La demo è in sola lettura e la
modifica delle preferenze richiede una connessione attiva.

## Distribuzione e contratto

Prima di avviare il backend aggiornato, eseguire da `backend/`:

```sh
alembic upgrade head
```

La revisione `0108_personal_dashboard` aggiunge una colonna JSON nullable a
`users`. Non modifica i dati delle cantine. `null` usa la composizione iniziale;
`[]` rappresenta una composizione volutamente vuota.

`PATCH /api/v1/auth/preferences` accetta `personal_dashboard_widgets`, una lista
di oggetti `{ "id": "ready", "width": "half" }`, e `dashboard_focus: "personal"`.
Gli ID sono enumerati, unici e limitati a 22; le larghezze sono `half` e `full`.
La sessione restituisce la composizione. L'endpoint usa l'utente autenticato,
senza accettare identificativi di altri utenti o cantine.

## Verifica mirata

```sh
# backend/
python -m pytest tests/test_personal_dashboard_migration.py tests/test_auth_and_wines.py -k "personal_dashboard or admin_publishes_sanitized_read_only_demo"

# frontend/
npx playwright test e2e/wine-detail.spec.ts -g "personal dashboard"
npm run build
```

I test coprono isolamento tra utenti, persistenza, input invalidi, demo,
migrazione reversibile, salvataggio e recupero errori, ordine, larghezza,
annullamento, dashboard vuota, catalogo completo, cantina vuota in inglese,
azioni sui vini e layout mobile/desktop anche a mezza larghezza.
