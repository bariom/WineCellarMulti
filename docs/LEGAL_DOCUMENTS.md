# Documenti legali e consenso

Vinaris pubblica:

- `/privacy` — Informativa privacy in italiano e inglese;
- `/terms` — Condizioni d'uso in italiano e inglese.

La versione corrente è definita in:

- `backend/app/core/legal.py`;
- `frontend/src/legal/legalDocuments.ts`.

Le due costanti devono sempre avere lo stesso valore.

## Dati obbligatori del titolare

Configurare nel `backend/.env` di produzione:

```env
LEGAL_OPERATOR_NAME=
LEGAL_OPERATOR_ADDRESS=
LEGAL_CONTACT_EMAIL=
```

Questi valori sono pubblici e vengono restituiti da
`GET /api/v1/auth/legal-config`. Se uno dei valori manca, le pagine mostrano un
avviso esplicito e non devono essere considerate pronte per la pubblicazione.

## Registrazione

La registrazione richiede tre consensi distinti:

1. Informativa privacy;
2. Condizioni d'uso;
3. licenza e responsabilità per le fotografie delle bottiglie.

Il frontend invia la versione visualizzata e il backend rifiuta una versione
diversa da quella corrente. Il database conserva separatamente data, versione
e lingua di privacy e condizioni.

## Utenti esistenti e nuove versioni

I record precedenti alla migrazione `0071_legal_acceptance` non vengono
considerati come consensi. Al primo accesso successivo:

- la sessione restituisce `requires_legal_acceptance=true`;
- le API applicative rispondono `428` finché il consenso non è registrato;
- il frontend mostra privacy e condizioni e permette comunque il logout.

Per pubblicare una modifica sostanziale:

1. aggiornare i testi IT/EN;
2. impostare una nuova versione in backend e frontend;
3. aggiungere o aggiornare i test;
4. eseguire build e test completi;
5. distribuire frontend, backend e migrazione insieme.

La nuova versione richiederà automaticamente una nuova accettazione a tutti
gli utenti.

## Revisione

I testi nel repository descrivono il funzionamento tecnico corrente di Vinaris
e costituiscono una base operativa. Prima della pubblicazione devono essere
verificati da un professionista competente rispetto al titolare effettivo,
alle offerte Stripe, ai fornitori configurati, ai trasferimenti internazionali
e ai mercati in cui il servizio viene offerto.
