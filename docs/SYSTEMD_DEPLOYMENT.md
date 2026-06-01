# WineCellarMulti systemd services

These services start the backend API and PWA frontend after reboot.

Assumptions:

- Repository path: `/home/administrator/progetti/WineCellarMulti`
- Linux user: `administrator`
- Backend virtualenv: `/home/administrator/progetti/WineCellarMulti/backend/.venv`
- Backend port: `127.0.0.1:8000`
- Frontend preview port: `127.0.0.1:4174`
- PostgreSQL runs via Docker Compose.

## Install or update services

From the repository root:

```bash
cd /home/administrator/progetti/WineCellarMulti
sudo cp deploy/systemd/winecellarmulti-backend.service /etc/systemd/system/
sudo cp deploy/systemd/winecellarmulti-frontend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable winecellarmulti-backend
sudo systemctl enable winecellarmulti-frontend
```

## Make PostgreSQL restart automatically

The compose file sets `restart: unless-stopped` for PostgreSQL.
Apply it once:

```bash
cd /home/administrator/progetti/WineCellarMulti
docker compose up -d postgres
```

## Start now

Use the recovery/start script from the repository root:

```bash
cd /home/administrator/progetti/WineCellarMulti
chmod +x start.sh
./start.sh --install-services --build
```

For later restarts after a reboot or outage:

```bash
cd /home/administrator/progetti/WineCellarMulti
./start.sh
```

The script starts PostgreSQL, waits for it to be ready, runs Alembic migrations, builds the frontend when needed, and restarts the API and frontend systemd services.

Manual equivalent:

```bash
cd /home/administrator/progetti/WineCellarMulti
./update.sh
sudo systemctl restart winecellarmulti-backend
sudo systemctl restart winecellarmulti-frontend
```

## Check status

```bash
sudo systemctl status winecellarmulti-backend --no-pager
sudo systemctl status winecellarmulti-frontend --no-pager
```

## Logs

```bash
sudo journalctl -u winecellarmulti-backend -f
sudo journalctl -u winecellarmulti-frontend -f
```

## Reboot test

```bash
sudo reboot
```

After reconnecting:

```bash
systemctl is-active winecellarmulti-backend
systemctl is-active winecellarmulti-frontend
docker ps --filter name=winecellarmulti-postgres
```

Then open:

```text
https://vinaris.duckdns.org
```
