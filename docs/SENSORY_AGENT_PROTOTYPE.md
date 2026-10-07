# Agente del profilo organolettico

La ricerca del pannello amministrativo costruisce il profilo atteso del vino e
annata selezionati, confrontando produttore e fonti esterne. Include anche i
profili manuali e validati per il confronto, senza sovrascriverli. I vecchi valori
non vengono inviati al modello e non costituiscono riferimenti per il completamento.

## Distribuzione e utilizzo

Da backend eseguire `alembic upgrade head` nel normale flusso di distribuzione.
La revisione `0115_sensory_provenance`, successiva a `0114_sensory_agent`, aggiunge
la provenienza delle dimensioni ai profili condivisi senza modificare i valori
esistenti. Distribuire anche il frontend aggiornato. Restano valide le impostazioni
`OPENAI_ECONOMY_MODEL` e `WINE_SENSORY_AI_ENABLED`: nessuna nuova chiave necessaria.

1. Aprire **Profili sensoriali dei vini** come amministratore applicativo.
2. Scegliere il campione automatico oppure selezionare i vini della cantina attiva.
   Sono ammessi fino a 20 vini e un budget tra 0,05 e 5 USD, predefinito 1 USD.
   Completare prima le annate mancanti: questi vini vengono saltati senza costo AI.
3. Avviare la ricerca e consultare completezza, confronto con i valori precedenti,
   provenienza di ciascun tratto, estratti e riferimenti.
4. Revisionare una proposta completa prima di usare **Usa questo profilo**.
   Il salvataggio non equivale alla validazione umana.

## Fasi del percorso v5

Il prompt versionato `wine.sensory_research` e un contratto JSON rigoroso richiedono
identificazione, prove per annata, confronto, ricerca mirata delle lacune e fino a
cinque riferimenti documentati. Il modello dispone di dieci consultazioni web per
vino. Le conversioni numeriche restano stime su scala 0-1.

### 1. Identificazione e interpretazione

Nome, produttore e annata devono corrispondere alla richiesta. Le prove distinguono
annata esatta, stile generale, altre annate e versioni NV storiche. Una nota NV
senza data o pubblicata oltre tre anni prima non conferma il prodotto attuale.
Un selettore di annata non rende specifica una descrizione generica.

Il prompt e controlli server respingono confusioni note: tannini morbidi non
indicano intensita bassa; acidita equilibrata non indica intensita alta;
complessita o liste di aromi non misurano intensita aromatica; acciaio o assenza
di affinamento in legno non dimostrano zero aromi di legno. I controlli lessicali
riconoscono anche descrittori svedesi, francesi e tedeschi, conservando gli estratti
nella lingua originale. Non convertono freschezza di un aroma fruttato in acidita
del vino. Sono conservativi, non sostituiscono una valutazione sensoriale.

### 2. Verifica e confronto delle prove

Gli URL devono comparire nelle fonti effettivamente citate dal provider. Il server
confronta gli estratti normalizzati con il testo pubblico delle pagine, gestendo
anche omissioni con puntini. La lettura controlla DNS, IP pubblici e redirect,
non invia credenziali e consulta al massimo 12 fonti. Legge HTML fino a 2 MB e
PDF fino a 10 MB, anche da endpoint senza estensione .pdf. La nuova dipendenza
`pypdf` richiede l'aggiornamento delle dipendenze backend o la ricostruzione
dell'immagine di distribuzione. Il percorso dei punteggi critici conserva il
precedente limite HTML di 750 KB.

I PDF vengono estratti in un processo separato: massimo 100 pagine, 500.000
caratteri, 10 secondi e monitoraggio della memoria con arresto oltre 384 MB.
Documenti cifrati, malformati, fuori limite o privi di testo (scansioni senza OCR)
non vengono considerati prove. Il rapporto distingue errori di lettura, stato
HTTP e citazioni che non corrispondono a una fonte leggibile; non mostra questi
casi indistintamente come mancanza di informazioni sul vino. Il report segnala
gli scarti: non si
sostituisce la verifica con una dichiarazione del modello.

Una dimensione corroborata richiede annata esatta, almeno due host ed editori
distinti, estratti differenti e indipendenza dichiarata dal modello. Testi copiati
non valgono come corroborazione. L'indipendenza editoriale e la corretta
interpretazione delle fonti richiedono ancora revisione umana. Una discordanza
blocca la dimensione e non viene coperta da una media o da riferimenti simili.

### 3. Completamento documentato

Le osservazioni dirette vengono conservate. Per le sole lacune si usano prima
riferimenti dello stesso vino: descrizioni dello stile oppure annate distanti
al massimo tre anni. Questi valori rimangono stime, non prove sull'annata richiesta.

In mancanza di riferimenti dello stesso vino, servono almeno tre vini distinti,
con almeno due editori delle fonti, stesso tipo e denominazione, vitigni noti con
sovrapposizione Jaccard almeno 0,75, annate entro tre anni e stile produttivo
compatibile documentato. Identita ed estratti devono essere verificabili. Per vini diversi sono richiesti
due estratti verificati sulla produzione: uno del vino richiesto e uno del
riferimento; il rapporto conserva e mostra anche queste prove.
Il valore viene calcolato dal server come mediana, senza usare i profili interni.
Una dispersione superiore a 0,20 lascia il tratto sconosciuto. Senza riferimenti
adeguati il sistema si astiene: non forza nove numeri plausibili.

### 4. Completezza e provenienza

Il report mostra sempre le nove dimensioni e, per ciascuna, distingue riscontri
indipendenti, fonte singola, stima di stile, stima da vini simili e non determinabile.
Mostra separatamente tratti dell'annata, stime e lacune. Il confronto precedente /
agente / scarto serve alla valutazione, senza trattare il precedente come verita.

Il sostegno euristico per tratto e 0,80 per riscontri indipendenti, 0,55 per fonte
singola dell'annata, 0,35-0,40 per stile e 0,35 per vini simili; il punteggio totale
include le lacune a zero. Non sono probabilita calibrate di correttezza.
Un risultato e applicabile solo con nove valori, annata confermata e nessun tratto
irrisolto. Un profilo completo puo comunque contenere molte stime e richiede
revisione. Gli aromi restano descrizioni qualitative, con citazioni verificate.

### 5. Salvataggio e protezione

L'applicazione esplicita salva tutte le nove dimensioni insieme alla provenienza,
alle prove e ai riferimenti. Il profilo resta non validato. Le vecchie routine da
metadati non possono sovrascrivere un profilo con provenienza dell'agente,
nemmeno con rigenerazione forzata. Validare senza modificare i valori conserva
le prove; una modifica manuale delle dimensioni le rimuove per non attribuire
ai nuovi valori prove riferite ai precedenti. Il rapporto originale resta conservato.

Profili manuali o validati, identita cambiate e valori modificati dopo la ricerca
restano protetti. I rapporti v1-v3 rimangono leggibili e mantengono le precedenti
regole di applicazione: non ricevono retroattivamente prove o completezza nuova. I rapporti v4 restano compatibili, senza diagnosi
di lettura aggiunte retroattivamente.

## Limiti operativi e valutazione

Ogni query privata resta limitata alla cantina attiva e usa CurrentContext.
Il numero richiesto e un massimo: l'avanzamento usa i vini realmente selezionati.
Prima di ogni chiamata si ricontrollano ruolo, sessione e budget stimato, includendo
32.768 token di contesto web, prompt/schema, massimo 12.000 token di risposta e
dieci chiamate web. La spesa viene registrata anche per risultati inutilizzabili.
La soglia e una stima applicativa, non un limite rigido di fatturazione.

La ricerca rimane esplicita e usa BackgroundTasks del processo API. Non e una
coda durevole; un riavvio puo interromperla. Le ricerche ferme per un'ora vengono
segnate interrotte. Nessun retry automatico o salvataggio autonomo dei profili.
Le routine storiche restano disponibili per i profili privi di provenienza:
la loro sostituzione totale e il worker durevole sono interventi distinti.

Le verifiche automatiche coprono schema, fonti assenti o non verificabili,
interpretazioni ambigue, annate/NV, conflitti, riferimenti deboli, dispersione,
completamento, persistenza, protezione dalla rigenerazione, modifica manuale e
migrazione. Il frontend verifica i rapporti vecchi e nuovi, le origini, i conflitti,
l'applicazione esplicita e la geometria a 360, 390, 430 e 1440 pixel.

```powershell
cd backend
.venv/Scripts/python.exe -m pytest tests/test_sensory_agent.py tests/test_sensory_sources.py tests/test_critic_scores.py
cd ../frontend
npx.cmd playwright test e2e/sensory-agent.spec.ts e2e/sensory-profiles.spec.ts
npm.cmd run build
```

Questi test deterministici non consumano API e non misurano accuratezza reale.
Per validarla serve un campione revisionato da esperti con riferimento esterno:
identita/annata, fedelta delle citazioni, indipendenza, origine di ogni valore,
scarti numerici rispetto al riferimento e corrette astensioni. Completezza e
copertura da sole non certificano affidabilita e non giustificano salvataggi autonomi.

## API

Gli endpoint `/api/v1/taste-profile/admin/research-runs` richiedono amministratore
applicativo e CurrentContext: POST avvia (`max_wines`, `budget_usd`, `wine_ids`
opzionali); GET elenca gli ultimi cinque rapporti; GET /candidates elenca i vini;
GET /{run_id} legge un rapporto; POST /{run_id}/wines/{wine_id}/apply applica una
proposta. Le selezioni fuori cantina, duplicate o oltre limite vengono rifiutate.
