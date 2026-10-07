# Agente del profilo organolettico — prototipo

Il pannello amministrativo **Profili sensoriali dei vini** contiene la sezione
**Agente del profilo organolettico · Prototipo**. La ricerca viene avviata esplicitamente
e riguarda solo la cantina attiva: per impostazione iniziale 10 vini, massimo 20,
con un budget stimato di 1 USD modificabile tra 0,05 e 5 USD.

## Preparazione e utilizzo

Applicare la nuova migrazione con `alembic upgrade head` da `backend/`, nel normale
flusso di distribuzione. La revisione è `0114_sensory_agent` e non modifica i vini
o i profili esistenti. Pubblicare anche il frontend aggiornato.

Si usano la selezione del provider, le chiavi configurate e la contabilizzazione AI
già presenti in Vinaris, con `OPENAI_ECONOMY_MODEL` e `WINE_SENSORY_AI_ENABLED`.
Non occorre creare un agente nella dashboard OpenAI o configurare nuove chiavi.

1. Accedere come amministratore applicativo e selezionare la cantina del campione.
2. Aprire i profili sensoriali nelle impostazioni amministrative.
3. Lasciare inizialmente 10 vini e verificare il budget, poi avviare la ricerca.
4. Consultare il confronto con il profilo attuale, gli estratti e i link alle fonti.
5. Confrontare le proposte con le schede dei produttori. Usare **Usa questo profilo**
   solo per una proposta adeguata; la normale validazione del profilo resta separata.

## Comportamento e limiti

Il modello consulta strumenti web in autonomia, fino a tre chiamate per vino,
privilegiando schede tecniche e descrizioni del produttore. Un prompt versionato
e un contratto JSON richiedono identità, annata, nove dimensioni sensoriali e aromi.
La risposta viene validata; i collegamenti devono comparire nelle fonti restituite
dal provider. URL locali, privati e con credenziali sono esclusi. Le citazioni
del provider verificano la provenienza del collegamento, **non certificano da sole
l'esattezza dell'estratto o della sua interpretazione**: questo è il motivo della
revisione umana nel prototipo.

I valori 0–1 sono stime normalizzate. Ogni tratto distingue una descrizione esplicita
della fonte da un'interpretazione. La confidenza è un indicatore euristico derivato
dalla copertura documentata e dalla verifica dell'annata, non una probabilità calibrata.
Un risultato richiede almeno tre dimensioni, una descrizione documentata e l'annata
verificata per poter essere applicato. Evidenza insufficiente e annate non verificate
producono proposte incomplete, senza pulsante di applicazione.
L’annata della scheda vino viene inviata sia nel contesto sia come annata richiesta
esplicita. Se manca, il vino viene saltato senza chiamate AI o costi: il rapporto
invita a completare la scheda. Una fonte di un’altra annata non conferma quella richiesta.

Le proposte persistono separatamente dai profili, inclusi fonti, aromi e limiti.
L'applicazione aggiorna le dimensioni condivise dell'identità vino e mantiene il
profilo da validare. Gli aromi e le prove sono conservati nel rapporto della ricerca.
Non vengono sovrascritti profili manuali o validati, identità cambiate o dimensioni
modificate dopo la ricerca. Le proposte applicate non si possono applicare di nuovo.

La selezione deduplica le identità e considera profili mancanti o con confidenza
inferiore a 0,65. I dati privati delle altre cantine non entrano nella ricerca.
È consentita una sola ricerca attiva per cantina. Prima di ciascun vino si
ricontrollano sessione, appartenenza e ruolo dell'amministratore.

Prima di ogni chiamata si confronta il budget residuo con una stima conservativa
basata su prezzi correnti, 32.768 token di contesto web, prompt, massimo 3.000 token
di risposta e tre chiamate web. La spesa effettiva viene registrata anche quando
il risultato non è utilizzabile. Il contesto web e gli eventuali fallback sono
controllati dal provider: la soglia è una protezione applicativa stimata, non un
limite rigido di fatturazione OpenAI. Nessuna chiamata successiva parte una volta
esaurita la soglia. Un errore interrompe la ricerca e conserva le proposte completate.

Il prototipo usa `BackgroundTasks` del processo API. Si può lasciare la pagina e
ritrovare l'ultima ricerca, ma i task non sono una coda durevole: un riavvio può
interromperli. Le ricerche senza aggiornamenti per un'ora vengono segnate interrotte
alla successiva lettura o avvio. Non ci sono retry automatici o ricerche programmate.
Prima dell'attivazione automatica sui nuovi vini, valutare il campione e introdurre
un worker durevole con politiche di ripresa e deduplicazione dei costi.

## API e verifiche

Gli endpoint `/api/v1/taste-profile/admin/research-runs` richiedono `CurrentContext`
di un amministratore applicativo:

- `POST`: avvia una ricerca (`max_wines`, `budget_usd`), risposta `202`.
- `GET`: restituisce gli ultimi cinque rapporti della cantina attiva.
- `GET /{run_id}`: consulta avanzamento e proposte.
- `POST /{run_id}/wines/{wine_id}/apply`: applica esplicitamente una proposta pronta.

Verifiche mirate:

```powershell
cd backend
.venv/Scripts/python.exe -m pytest tests/test_sensory_agent.py tests/test_sensory_agent_migration.py tests/test_taste_profiles.py
cd ../frontend
npx.cmd playwright test e2e/sensory-agent.spec.ts e2e/sensory-profiles.spec.ts
npm.cmd run build
```

I test usano risposte deterministiche e non consumano API OpenAI. La valutazione
qualitativa su 10–20 vini reali va eseguita dal pannello dopo la distribuzione.

Riferimenti: [ricerca web OpenAI](https://developers.openai.com/api/docs/guides/tools-web-search),
[risposte strutturate](https://developers.openai.com/api/docs/guides/structured-outputs).
