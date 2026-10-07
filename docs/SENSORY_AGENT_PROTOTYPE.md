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

## Fasi del percorso v7

Il prompt versionato `wine.sensory_research` e un contratto JSON rigoroso richiedono
identificazione, prove per annata, confronto, ricerca mirata delle lacune e fino a
cinque riferimenti documentati. Il primo passaggio dispone di sei consultazioni
web. Se il profilo non è completo, il prompt `wine.sensory_completion` v2 riceve
gli esiti reali della verifica server, dispone di altre quattro consultazioni per
cercare alternative e produce tutte le nove intensità attese. Le conversioni
numeriche restano stime su scala 0-1. Il secondo passaggio non viene eseguito
quando il primo ha già prodotto una proposta completa applicabile.

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
non invia credenziali e consulta al massimo 12 fonti per vino, condividendo una
cache fra i due passaggi per non rileggere le stesse pagine. Legge HTML fino a 2 MB e
PDF fino a 10 MB, anche da endpoint senza estensione .pdf. La nuova dipendenza
`pypdf` richiede l'aggiornamento delle dipendenze backend o la ricostruzione
dell'immagine di distribuzione. Il percorso dei punteggi critici conserva il
precedente limite HTML di 750 KB.

I PDF vengono estratti in un processo separato: massimo 100 pagine, 500.000
caratteri, 10 secondi e monitoraggio della memoria con arresto oltre 384 MB.
Documenti cifrati, malformati, fuori limite o privi di testo (scansioni senza OCR)
non vengono considerati prove. Il rapporto distingue errori di lettura, stato
HTTP e citazioni che non corrispondono a una fonte leggibile; non mostra questi
casi indistintamente come mancanza di informazioni sul vino. Le risposte con
`cf-mitigated: challenge` e le pagine intermedie Cloudflare riconoscibili sono
segnalate come verifica anti-bot richiesta, anche con HTTP 200; il loro testo non
viene mai usato come prova degustativa. Un normale 403 resta un errore di accesso
generico e non viene attribuito automaticamente a Cloudflare. Il report segnala
gli scarti: non si
sostituisce la verifica con una dichiarazione del modello.

Una dimensione corroborata richiede annata esatta, almeno due host ed editori
distinti, estratti differenti e indipendenza dichiarata dal modello. Testi copiati
non valgono come corroborazione. L'indipendenza editoriale e la corretta
interpretazione delle fonti richiedono ancora revisione umana. Una discordanza
blocca la dimensione documentata e non viene coperta da una media o da riferimenti
simili. Il completamento può proporre un valore inferito, conservando la
discordanza e le prove come limiti espliciti.

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
adeguati il tratto rimane privo di intensità documentata.

Il secondo passaggio completa queste lacune con **inferenze del modello**:
conoscenza enologica, indizi qualitativi verificati e stile ragionevolmente noto.
Metadati della scheda, ricordi del modello e descrizioni non verificabili non
diventano fatti confermati. Ogni inferenza deve avere motivazione, ipotesi e
intervallo plausibile contenente il valore. Il server impone un'ampiezza prudente
almeno fino a ±0,15, troncata a 0–1; l'intervallo può essere più largo e non è
statisticamente calibrato. Un profilo descrive lo stile atteso all'uscita, senza
inventare lo stato attuale di una bottiglia vecchia o caratteristiche di annata.
Non sono inventati vini di riferimento, citazioni o prove per giustificare stime.

### 4. Completezza e provenienza

Il report mostra sempre le nove dimensioni e, per ciascuna, distingue riscontri
indipendenti, fonte singola, stima di stile, stima da vini simili, inferenza del
modello e non determinabile. Motivazioni e intervalli sono visibili nel dettaglio.
Mostra separatamente tratti dell'annata, stime e lacune. Il confronto precedente /
agente / scarto serve alla valutazione, senza trattare il precedente come verita.

Il sostegno euristico per tratto e 0,80 per riscontri indipendenti, 0,55 per fonte
singola dell'annata, 0,35-0,40 per stile e 0,35 per vini simili; il punteggio totale
include lacune e inferenze non verificate a zero. Non sono probabilita calibrate
di correttezza: zero prove numeriche non significa zero plausibilità del profilo.
Nei percorsi v6 e v7 una proposta con nove valori è applicabile anche senza annata
verificata: è una stima da revisionare e resta non validata. Un'identità realmente
ambigua produce un profilo completo provvisorio ma blocca l'applicazione.
Un profilo totalmente inferito ha copertura delle prove zero: i nove valori sono
visibili e revisionabili, ma non danno peso ai punteggi di compatibilità che
richiedono confidenza positiva finché non vengono validati. Il salvataggio non
aumenta automaticamente questo sostegno delle prove.
I valori verificati del primo passaggio sono conservati; nuove prove possono
rafforzarli, mentre le discordanze già riscontrate non vengono cancellate.
Gli aromi restano descrizioni qualitative, con citazioni verificate.

### 5. Salvataggio e protezione

L'applicazione esplicita salva tutte le nove dimensioni insieme alla provenienza,
alle prove e ai riferimenti. Il profilo resta non validato. Le vecchie routine da
metadati non possono sovrascrivere un profilo con provenienza dell'agente,
nemmeno con rigenerazione forzata. Validare senza modificare i valori conserva
le prove; una modifica manuale delle dimensioni le rimuove per non attribuire
ai nuovi valori prove riferite ai precedenti. Il rapporto originale resta conservato.

Profili manuali o validati, identita cambiate e valori modificati dopo la ricerca
restano protetti. I rapporti v1-v3 rimangono leggibili e mantengono le precedenti
regole di applicazione: non ricevono retroattivamente prove o completezza nuova.
Anche i rapporti v4-v5 mantengono le regole originali: annata verificata e nessuna
dimensione irrisolta.

## Limiti operativi e valutazione

Ogni query privata resta limitata alla cantina attiva e usa CurrentContext.
Il numero richiesto e un massimo: l'avanzamento usa i vini realmente selezionati.
Prima di ciascun vino si controllano ruolo e sessione. Prima di spendere per la
ricerca si verifica che il budget copra anche il completamento: due richieste,
massimo 12.000 token di risposta ciascuna, contesto web e dieci chiamate web totali.
Il completamento ha un margine iniziale di 65.536 token di ingresso e viene
ricontrollato sul feedback effettivo prima della chiamata. La spesa di entrambi
i passaggi viene registrata anche per risultati inutilizzabili. Se il secondo
fallisce, la prima ricerca e il suo costo restano nel rapporto, senza interrompere
gli altri vini. Le anomalie non avviano retry illimitati.
La soglia e una stima applicativa, non un limite rigido di fatturazione.

La ricerca rimane esplicita e usa BackgroundTasks del processo API. Non e una
coda durevole; un riavvio puo interromperla. Le ricerche ferme per un'ora vengono
segnate interrotte. È previsto un solo passaggio di completamento con feedback;
nessun salvataggio autonomo dei profili.
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


## Coerenza del rapporto e basi delle inferenze (v7)

La sintesi principale è generata dal server dai controlli eseguiti, separando
identità, annata, intensità sostenute dalle fonti e descrizioni qualitative
verificate. La prosa libera del modello resta consultabile in una sezione
esplicitamente non verificata; anche i rapporti v6 già salvati mostrano quella
prosa separatamente. Una fonte bloccata non conferma annata o dati analitici.

Ogni stima del completamento richiede un elenco strutturato di citazioni per
le premesse fattuali, oppure un elenco vuoto per ipotesi generali. Il server
applica la stessa verifica URL/estratti alle premesse e distingue descrizioni
verificate, informazioni non verificate, basi miste e conoscenza del modello.
Le citazioni qualitative rimangono conservate anche quando non sostengono
l'intensità: una citazione sul legno non verifica il valore numerico stimato.
Le inferenze mantengono sostegno numerico zero e intervalli plausibili non
calibrati. Un conflitto richiede almeno due citazioni distinte verificabili;
confronti bloccati non generano automaticamente «fonti discordanti».

Questi campi sono additivi nei risultati e nella provenienza JSON: non richiedono
una nuova migrazione. Il budget e il massimo di dieci consultazioni web restano
invariati. Le citazioni non misurano l'accuratezza sensoriale: per stimarla serve
un campione di profili valutati indipendentemente.
