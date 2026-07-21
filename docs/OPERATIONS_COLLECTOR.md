# Collector operativo Vinaris

Il collector salva un campione host ogni cinque minuti anche quando nessun amministratore ha aperto la sezione **Operatività**. Raccoglie solo conteggi aggregati: CPU, RAM, disco, socket TCP, conntrack e file descriptor.

1. Nel file `backend/.env` configura un token casuale e il solo URL locale del backend:

```env
OPERATIONS_COLLECTOR_TOKEN=<token-lungo-e-casuale>
OPERATIONS_COLLECTOR_URL=http://127.0.0.1:8000/api/v1/admin/operations/collect
```

2. Installa le unità distribuite dal repository:

```bash
sudo cp deploy/systemd/vinaris-operations-collector.service /etc/systemd/system/
sudo cp deploy/systemd/vinaris-operations-collector.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now vinaris-operations-collector.timer
sudo systemctl start vinaris-operations-collector.service
systemctl list-timers vinaris-operations-collector.timer
journalctl -u vinaris-operations-collector.service -n 20 --no-pager
```

Il servizio non apre porte e il token non viene mai inviato al browser. Se il backend gira in Docker, sostituisci `OPERATIONS_COLLECTOR_URL` con l'URL privato raggiungibile dall'host; non usare un URL pubblico.
