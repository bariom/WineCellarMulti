# Ricerca dei punteggi

La ricerca AI non deve stimare punteggi. Il prompt `wine.critic_scores` v2
richiede critico, valore, URL consultato, corrispondenza esatta di vino e annata
e un breve estratto testuale della pubblicazione.

Prima del salvataggio, il backend controlla che l'URL sia tra le fonti della
ricerca e legge la pagina pubblica. L'estratto deve essere presente nella pagina
e contenere vino, produttore, annata, critico e valore. Un URL da solo non basta.
Le pagine inaccessibili, protette da login, troppo grandi o prive di questi
elementi non producono punteggi salvati. Non si aggirano paywall.

Le letture esterne hanno un limite di dimensione, timeout e redirect; indirizzi
privati sono bloccati e le connessioni sono fissate all'IP pubblico controllato.
Le ricerche non inviano credenziali della cantina alle fonti.

Un risultato vuoto non imposta più automaticamente `scores_not_applicable`:
non trovare una recensione oggi non significa che non potrà esistere in futuro.
Il frontend comunica quando non vengono aggiunti nuovi punteggi. Il costo della
chiamata AI continua a seguire il normale conteggio dei consumi; questa modifica
non introduce rimborsi o una garanzia di risultati per ogni ricerca.

I dati storici con indicazioni esplicite di stima, ipotesi, `n/d` o verifica
mancante vengono marcati nella risposta API come `verification_status=unverified`.
Restano nel database e nel dettaglio, in una sezione chiusa di revisione, ma non
compaiono nei badge dei punteggi. Non vengono cancellati o corretti automaticamente.
Questo rilevamento non certifica i vecchi record privi di tali indicazioni:
una nota apparentemente precisa non prova da sola l'esistenza della recensione.

I nuovi punteggi condivisi richiedono `verification_method=page_evidence_v1`.
La presenza dei termini nell'estratto è una verifica testuale conservativa,
non una garanzia dell'autorevolezza di ogni sito o dell'assenza di errori nella fonte.

Il riepilogo degli obiettivi cantina viene inoltre incluso nelle risposte di
dettaglio e modifica del vino, come già nella lista, per evitare falsi avvisi
dopo l'apertura del dettaglio o una ricerca AI.
