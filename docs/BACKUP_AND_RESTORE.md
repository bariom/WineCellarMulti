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
Il backup confronta i record fotografici del database con i file
`thumbnail.png` e `detail.png` e fallisce se lo storage risulta incompleto.

Per cifrare i backup remoti è raccomandato configurare un remote `rclone crypt`
sopra il provider scelto e usare quel remote in `BACKUP_REMOTE_PATH`.

## Creazione manuale

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
