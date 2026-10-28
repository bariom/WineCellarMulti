# Email con le novità (campagne)

Composizione assistita dall'AI e invio di email con le novità di Vinaris a
utenti scelti a mano. Solo per gli amministratori dell'app, fuori dalla demo.

## Uso

**Impostazioni → Comunicazioni → Email con le novità**

1. Descrivere in poche righe cosa raccontare e scegliere la lingua.
2. **Componi con l'AI**: l'AI propone oggetto, anteprima e il testo a blocchi
   (titoli, paragrafi, immagini, pulsanti), scegliendo le schermate dalla
   libreria quando corrispondono al testo.
3. Correggere a mano oggetto e blocchi; aggiungere, togliere o spostare
   immagini dalla libreria o da quelle caricate.
4. Controllare l'**anteprima** così come arriverà (con il nome di chi scrive).
5. **Invia una prova a me**: arriva solo all'indirizzo dell'amministratore, con
   l'oggetto preceduto da "[Prova]".
6. Scegliere i destinatari dall'elenco (ricerca per nome o email) e
   confermare l'invio.

## Consenso e disiscrizione

Decisione del 28 ottobre 2026: le novità vanno a tutti gli account, salvo chi
si disiscrive (modello opt-out per comunicazioni sul servizio già in uso).

- Ogni email contiene un link personale "Disiscriviti" e le intestazioni
  `List-Unsubscribe` e `List-Unsubscribe-Post` (disiscrizione con un clic,
  RFC 8058, richiesta da Gmail e Outlook per gli invii in massa).
- Il link è firmato (HMAC della chiave segreta dell'app sull'id utente): non
  serve login e non può essere falsificato per altri utenti.
- L'utente può riattivare o disattivare le novità da **Impostazioni → Profilo**.
- Al momento dell'invio chi si è disiscritto viene saltato anche se selezionato.

Verificare che l'informativa privacy citi le comunicazioni sulle novità del
servizio e la possibilità di disiscriversi.

## Immagini

- **Libreria**: schermate dell'app generate con dati di prova, mai dati reali,
  in `frontend/public/email-library/<slug>-<it|en>.jpg`. Si rigenerano con:

  ```powershell
  cd frontend
  npm run email:library
  ```

  L'elenco delle schermate e le loro descrizioni per l'AI stanno in
  `backend/app/services/email_campaigns.py` (`LIBRARY`): aggiornare entrambi.
- **Caricate**: PNG o JPEG fino a 6 MB, ricodificate dal server (lato lungo
  massimo 1600 px, metadati come il GPS rimossi) e salvate in
  `EMAIL_ASSET_STORAGE_DIR` (default `data/email-assets`). Sono servite
  pubblicamente da `/api/v1/email/assets/<uuid>.jpg|png` perché i programmi di
  posta devono poterle scaricare; i nomi sono UUID casuali.

Includere la cartella delle immagini caricate nei backup.

## Sicurezza dei contenuti

L'AI restituisce solo blocchi strutturati validati contro uno schema JSON.
L'HTML è costruito dal server con un modello fisso: ogni testo è escapato,
le immagini possono venire solo dalla libreria o dai caricamenti, i pulsanti
solo verso percorsi dell'app ammessi (`/`, `/?open=cellar|wishlist|history|
pulse|sommelier`, `/help`). Il prompt è `email_campaign_compose` v1 in
`backend/app/prompts/email_campaign.py`.

Il segnaposto `{first_name}` nel testo viene sostituito con il nome di ogni
destinatario; senza nome la formula diventa "Ciao,".

## Invio e ripresa

L'invio è sincrono, un destinatario alla volta, con una riga di consegna per
utente (`sent`, `failed`, `skipped`). L'identificativo della campagna è
generato dal client: ripetere l'invio dopo un errore riprende da dove si era
fermato senza doppioni. Lo stesso identificativo con contenuto diverso
restituisce 409.

## Distribuzione

Migrazione `0128_email_campaigns` (dopo `0127_retire_themes`): colonna
`users.news_email_opt_out`, tabelle `email_campaigns`,
`email_campaign_deliveries`, `email_assets`. `./update.sh` la applica.

## Test

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_email_campaigns.py tests/test_email_campaigns_migration.py -q
cd ../frontend
npm run test:e2e:email-campaigns
```
