# Collector operativo Vinaris

Il collector salva un campione host ogni minuto anche quando nessun amministratore ha aperto la sezione **Operatività**. Raccoglie solo conteggi aggregati: CPU, RAM, disco, socket TCP, conntrack e file descriptor.

1. Nel file `backend/.env` configura un token casuale e il solo URL locale del backend:

```env
OPERATIONS_COLLECTOR_TOKEN=<token-lungo-e-casuale>
OPERATIONS_COLLECTOR_URL=http://127.0.0.1:8000/api/v1/admin/operations/collect
```

2. Crea `/etc/systemd/system/vinaris-operations-collector.service`:

```ini
[Unit]
Description=Vinaris operational metrics collector
After=network-online.target

[Service]
Type=oneshot
User=administrator
WorkingDirectory=/home/administrator/progetti/WineCellarMulti/backend
ExecStart=/home/administrator/progetti/WineCellarMulti/backend/.venv/bin/python scripts/collect_operations.py
```

3. Crea `/etc/systemd/system/vinaris-operations-collector.timer`:

```ini
[Unit]
Description=Collect Vinaris host metrics every minute

[Timer]
OnBootSec=2min
OnUnitActiveSec=60s
Persistent=true

[Install]
WantedBy=timers.target
```

4. Attiva e verifica:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now vinaris-operations-collector.timer
sudo systemctl start vinaris-operations-collector.service
systemctl list-timers vinaris-operations-collector.timer
journalctl -u vinaris-operations-collector.service -n 20 --no-pager
```

Il servizio non apre porte e il token non viene mai inviato al browser. Se il backend gira in Docker, sostituisci `OPERATIONS_COLLECTOR_URL` con l'URL privato raggiungibile dall'host; non usare un URL pubblico.
