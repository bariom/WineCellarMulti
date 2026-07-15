# WineCellarMulti production services

The backend API runs as a systemd service. Nginx serves the built PWA files
directly, so no persistent frontend Node process is required.

Assumptions:

- Repository path: `/home/administrator/progetti/WineCellarMulti`
- Linux user: `administrator`
- Backend virtualenv: `/home/administrator/progetti/WineCellarMulti/backend/.venv`
- Backend port: `127.0.0.1:8000`
- Frontend build: `/home/administrator/progetti/WineCellarMulti/frontend/dist`
- PostgreSQL runs via Docker Compose.

## Install or update services

From the repository root:

```bash
cd /home/administrator/progetti/WineCellarMulti
sudo cp deploy/systemd/winecellarmulti-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable winecellarmulti-backend
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

The script starts PostgreSQL, waits for it to be ready, runs Alembic migrations,
builds the frontend when needed, restarts the API, and reloads nginx.

Manual equivalent:

```bash
cd /home/administrator/progetti/WineCellarMulti
./update.sh
sudo systemctl restart winecellarmulti-backend
sudo nginx -t && sudo systemctl reload nginx
```

## Check status

```bash
sudo systemctl status winecellarmulti-backend --no-pager
sudo systemctl status nginx --no-pager
```

## Logs

```bash
sudo journalctl -u winecellarmulti-backend -f
sudo journalctl -u nginx -f
```

## Reboot test

```bash
sudo reboot
```

After reconnecting:

```bash
systemctl is-active winecellarmulti-backend
systemctl is-active nginx
docker ps --filter name=winecellarmulti-postgres
```

Then open:

```text
https://vinaris.app
```
