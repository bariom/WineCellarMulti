# Backup and restore

WineCellarMulti stores production data in PostgreSQL, running through Docker Compose with the `postgres-data` volume. The volume is not a backup. The production policy is:

- nightly local PostgreSQL dump
- local retention: 14 days
- remote retention: 30 days
- optional remote copy to pCloud via rclone
- restore procedure documented and periodically tested

The remote copy uses `rclone copyto`, not `rclone sync`, so an accidental local deletion is not propagated as a remote deletion. Remote retention is handled separately with `rclone delete --min-age`.

## Configure pCloud

Install rclone on the server:

```bash
sudo apt-get update
sudo apt-get install -y rclone
```

Create a pCloud remote. The rclone pCloud backend uses browser authorization; `rclone config` walks through the token setup.

```bash
rclone config
```

Recommended remote name:

```text
pcloud
```

For an EU pCloud account, rclone documents the pCloud hostname as `eapi.pcloud.com`; for the original/US region it is `api.pcloud.com`.

Create and test the backup folder:

```bash
rclone mkdir pcloud:VinarisBackups/postgres
rclone lsd pcloud:
```

Then add the remote backup path to the repository root `.env` on the server:

```bash
BACKUP_REMOTE_PATH=pcloud:VinarisBackups/postgres
LOCAL_BACKUP_RETENTION_DAYS=14
REMOTE_BACKUP_RETENTION_DAYS=30
```

## Manual backup

From the repository root:

```bash
chmod +x scripts/backup-db.sh scripts/restore-db.sh
./scripts/backup-db.sh
```

Local backups are written to:

```text
backups/postgres/
```

The script creates a compressed PostgreSQL custom-format dump and verifies the dump catalog before marking it complete.

## Install the nightly timer

From the repository root on the production server:

```bash
sudo cp deploy/systemd/winecellarmulti-backup.service /etc/systemd/system/
sudo cp deploy/systemd/winecellarmulti-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now winecellarmulti-backup.timer
```

Check timer status:

```bash
systemctl list-timers winecellarmulti-backup.timer
sudo systemctl status winecellarmulti-backup.timer --no-pager
```

Run a backup immediately:

```bash
sudo systemctl start winecellarmulti-backup.service
```

Read backup logs:

```bash
sudo journalctl -u winecellarmulti-backup.service --since "24 hours ago" --no-pager
```

## Restore

Stop the application services first so users do not write during restore:

```bash
sudo systemctl stop winecellarmulti-backend winecellarmulti-frontend
```

Restore a local backup:

```bash
./scripts/restore-db.sh backups/postgres/winecellarmulti_YYYYMMDDTHHMMSSZ.dump.gz
```

If the backup is only on pCloud, download it first:

```bash
rclone copyto pcloud:VinarisBackups/postgres/winecellarmulti_YYYYMMDDTHHMMSSZ.dump.gz backups/postgres/winecellarmulti_YYYYMMDDTHHMMSSZ.dump.gz
./scripts/restore-db.sh backups/postgres/winecellarmulti_YYYYMMDDTHHMMSSZ.dump.gz
```

Restart the app:

```bash
sudo systemctl start winecellarmulti-backend winecellarmulti-frontend
```

## Periodic restore test

At least once per month:

1. run `./scripts/backup-db.sh`
2. download/list the newest pCloud backup with `rclone lsf pcloud:VinarisBackups/postgres`
3. restore on a non-production machine or maintenance window
4. confirm login, cellar list, wishlist, and tasting history load correctly

## References

- rclone pCloud backend: https://rclone.org/pcloud/
- rclone copy command: https://rclone.org/commands/rclone_copy/
- rclone delete command: https://rclone.org/commands/rclone_delete/
