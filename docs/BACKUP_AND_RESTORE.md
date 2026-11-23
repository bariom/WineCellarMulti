# Backup e ripristino

Vinaris conserva dati in PostgreSQL e fotografie nel percorso host configurato
da `WINE_PHOTO_BACKUP_PATH`. Un volume Docker o la directory delle foto non
costituiscono da soli un backup.

La politica di produzione è:

- bundle notturno con database e fotografie;
- checksum SHA-256 di ogni file;
- verifica del catalogo PostgreSQL prima e dopo la creazione;
- conservazione locale predefinita di 14 giorni;
- copia remota predefinita di 30 giorni;
- prova di restore in un database temporaneo;
- prova periodica completa su un ambiente non di produzione.

## Configurazione

Nel `.env` della root:

```env
WINE_PHOTO_BACKUP_PATH=./backend/data/wine-photos
PURCHASE_DOCUMENT_BACKUP_PATH=./backend/data/purchase-documents
BACKUP_REMOTE_PATH=pcloud:VinarisBackups/vinaris
LOCAL_BACKUP_RETENTION_DAYS=14
REMOTE_BACKUP_RETENTION_DAYS=30
```

`WINE_PHOTO_BACKUP_PATH` è un percorso host, assoluto oppure relativo alla root
del repository. Docker Compose lo monta nel backend come `/data/wine-photos`,
quindi backend e backup usano necessariamente la stessa directory. Per
installazioni precedenti che usano il volume Docker `wine-photo-data`, eseguire
prima `bash scripts/migrate-photo-storage.sh` e solo dopo ricreare il backend.
Lo script trova anche il volume se il vecchio container non esiste più; se il
progetto Docker ha un nome non standard, indicarlo con
`LEGACY_PHOTO_VOLUME=nome-volume bash scripts/migrate-photo-storage.sh`.
Questa migrazione riguarda solo lo stack Docker completo avviato con il profilo
`container-app`; il deploy systemd usa direttamente `backend/data/wine-photos`.
Il backup confronta i record fotografici del database con i file
`thumbnail.png` e `detail.png` e fallisce se lo storage risulta incompleto.

Per cifrare i backup remoti è raccomandato configurare un remote `rclone crypt`
sopra il provider scelto e usare quel remote in `BACKUP_REMOTE_PATH`.

## Creazione manuale

I bundle in formato 2 includono anche `purchase-documents/`, con gli originali
privati di fatture e scontrini. Il percorso host è configurato con
`PURCHASE_DOCUMENT_BACKUP_PATH` e viene montato in Docker in `/data/purchase-documents`.
Il backup controlla che il numero di originali copra i riferimenti presenti nel DB.
Usare gli script aggiornati per ripristinare i bundle in formato 2: gli originali
vengono ripristinati insieme al database, conservando la directory precedente
con suffisso `.pre-restore.<timestamp>`. I vecchi bundle in formato 1 rimangono
supportati e non modificano la directory dei documenti. I backup JSON esportati
dall'app non includono gli allegati originali. Eliminare un allegato dall'app
non elimina le copie nei backup già creati: seguono la normale conservazione.

```bash
bash scripts/backup-db.sh
```

Il risultato è:

```text
backups/vinaris/vinaris_YYYYMMDDTHHMMSSZ.tar.gz
```

Il bundle contiene:

```text
backup.meta
manifest.sha256
database.dump
wine-photos/
purchase-documents/
```

Il file definitivo viene pubblicato soltanto dopo la verifica dei checksum e
del catalogo del dump. I file temporanei vengono rimossi anche in caso di
errore.

## Copia remota pCloud

Installare e configurare `rclone`, preferibilmente con un remote cifrato:

```bash
sudo apt-get update
sudo apt-get install -y rclone
rclone config
rclone mkdir pcloud:VinarisBackups/vinaris
```

Il comando di backup usa `rclone copyto --checksum`; non usa `sync`, quindi
un'eliminazione locale accidentale non viene propagata come eliminazione
remota. La scadenza remota è gestita separatamente.

## Timer notturno

```bash
sudo cp deploy/systemd/winecellarmulti-backup.service /etc/systemd/system/
sudo cp deploy/systemd/winecellarmulti-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now winecellarmulti-backup.timer
```

Verifica:

```bash
systemctl list-timers winecellarmulti-backup.timer
sudo systemctl start winecellarmulti-backup.service
sudo journalctl -u winecellarmulti-backup.service --since "24 hours ago" --no-pager
```

## Prova di restore non distruttiva

Il comando seguente estrae e verifica il bundle, crea un database temporaneo
con nome `vinaris_restore_verify_*`, ripristina il dump, legge la versione
Alembic e alcuni conteggi, quindi elimina sempre il database temporaneo:

```bash
./scripts/verify-backup.sh backups/vinaris/vinaris_YYYYMMDDTHHMMSSZ.tar.gz
```

Non modifica il database Vinaris né lo storage fotografico attivo. Va eseguito
almeno una volta al mese e dopo ogni modifica a backup, PostgreSQL o storage.

## Ripristino completo

Usare una finestra di manutenzione: tutte le scritture successive al backup
scelto andranno perse.

1. Scaricare il bundle, se necessario:

   ```bash
   rclone copyto \
     pcloud:VinarisBackups/vinaris/vinaris_YYYYMMDDTHHMMSSZ.tar.gz \
     backups/vinaris/vinaris_YYYYMMDDTHHMMSSZ.tar.gz
   ```

2. Verificarlo senza modificare la produzione:

   ```bash
   ./scripts/verify-backup.sh backups/vinaris/vinaris_YYYYMMDDTHHMMSSZ.tar.gz
   ```

3. Fermare il backend lasciando PostgreSQL attivo:

   ```bash
   sudo systemctl stop winecellarmulti-backend
   ```

4. Eseguire il restore:

   ```bash
   ./scripts/restore-db.sh backups/vinaris/vinaris_YYYYMMDDTHHMMSSZ.tar.gz
   ```

5. Confermare digitando esattamente:

   ```text
   RESTORE winecellarmulti WITH PHOTOS
   ```

6. Riavviare e controllare:

   ```bash
   sudo systemctl start winecellarmulti-backend
   sudo systemctl status winecellarmulti-backend --no-pager
   curl --fail https://vinaris.app/health
   ```

7. Verificare login, vini, wishlist, degustazioni e fotografie in lista e
   dettaglio.

Il restore conserva la precedente directory fotografica accanto a quella
ripristinata con suffisso `.pre-restore.<timestamp>`. Rimuoverla soltanto dopo
la verifica applicativa.

## Backup storici

`restore-db.sh` riconosce ancora i vecchi file `*.dump.gz`. Questi possono
ripristinare soltanto PostgreSQL e non modificano le fotografie. Il comando
richiede la conferma separata `RESTORE LEGACY winecellarmulti`.

## Prova completa periodica

Almeno una volta al trimestre, su una macchina non di produzione:

1. ripristinare database e fotografie;
2. avviare backend e frontend;
3. verificare autenticazione e isolamento tra cantine;
4. aprire fotografie normali e di libreria;
5. verificare export, wishlist e storico degustazioni;
6. documentare data, bundle verificato, durata e risultato.

## Backup completo di una cantina (per l'utente)

I backup notturni proteggono il server. Ogni utente con ruolo owner o admin può
anche scaricare da Impostazioni → Dati un backup completo della propria cantina,
da conservare per conto proprio e da ripristinare anche su un account nuovo.

Il file è uno ZIP in formato `vinaris.backup.v3`:

- `manifest.json`: data di esportazione, revisione Alembic, impostazioni della
  cantina, conteggi per tabella ed elenco dei file;
- `data.json`: tutte le righe delle tabelle elencate in `BACKUP_TABLES`
  (`backend/app/services/backup_registry.py`), con tutte le colonne;
- `files/wine-photos/<wine_id>/{thumbnail,detail}.png`: le foto delle bottiglie;
- `files/purchase-documents/<purchase_import_id>`: i documenti d'acquisto originali;
- `files/binary/<tabella>/<colonna>/<id>`: le foto ricordo delle bevute.

Contiene vini, lotti e movimenti di magazzino, vendite, luoghi e scomparti,
obiettivi in cantina, bevute (con tratti percepiti, foto ricordo e commenti del
sommelier), bevute di vini non in cantina, lista dei desideri, commercianti,
acquisti importati con i documenti, comproprietà, impostazioni della cantina e,
dell'utente che esporta, tag, voti personali e profilo gustativo.

Non contiene, per scelta: account, membri e inviti, sessioni e passkey,
abbonamento e crediti AI, la chiave OpenAI personale, notifiche e registri
tecnici. L'elenco completo con il motivo di ogni esclusione è
`EXCLUDED_TABLES` nello stesso file. Nei partecipanti di una comproprietà i
token d'invito vengono azzerati: i link inviati prima del backup smettono di
funzionare.

Il ripristino (`POST /api/v1/backup/restore`, con anteprima in
`POST /api/v1/backup/preview`) richiede una cantina vuota: crea nuovi ID,
ricollega ogni riferimento e riscrive foto e documenti. I vecchi backup JSON
(`winecellarmulti.export.v2`) restano importabili come prima.

Il test `backend/tests/test_full_backup.py` fallisce quando una nuova tabella
con dati di una cantina o di un utente non è né in `BACKUP_TABLES` né in
`EXCLUDED_TABLES`: ogni nuova funzione deve dichiarare se i suoi dati vanno nel
backup.
