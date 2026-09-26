# Frontend E2E checks

The frontend uses Playwright with Chromium. The extracted application suites use safe,
deterministic browser fixtures and do not require real credentials, tokens,
production data, or a backend process.

From `frontend/`:

```powershell
npm ci
npx playwright install chromium
npm run test:e2e:wine-detail
```

Install dependencies/browsers only when needed, not after every source change.
On this Windows workstation add `C:\Program Files\nodejs` to PATH if necessary
(older setups may use `C:\ERI\node`). Use `npm.cmd` / `npx.cmd` if PowerShell
blocks the `.ps1` launchers.

`PLAYWRIGHT_BASE_URL` can point to an already running Vite frontend. Without
it, Playwright starts `npm run dev` automatically. The normal Vite API proxy
remains available for future suites that use a test backend. The default port
is 5173; set `PLAYWRIGHT_PORT` to choose another local server port. An explicit
`PLAYWRIGHT_BASE_URL` takes precedence and requires you to manage that server.

## Feature commands

The former `wine-detail.spec.ts` monolith is split without dropping coverage.
Shared deterministic data and helpers live in `e2e/fixtures/app.ts`.

| Scope | Command from `frontend/` |
| --- | --- |
| Wine Detail, sensory signature, detail geometry and baseline | `npm run test:e2e:wine-detail` |
| Collector composition, summaries, insights and scrolling | `npm run test:e2e:collector` |
| Personal dashboard widgets, editor and drill-downs | `npm run test:e2e:personal-dashboard` |
| Shared navigation, compact headers and Home photographs | `npm run test:e2e:app-navigation` |
| Recording tastings and tasting history | `npm run test:e2e:record-tasting` |
| Intelligence plans, feedback and goals | `npm run test:e2e:intelligence` |
| Notifications and administrator announcements | `npm run test:e2e:notifications` |
| Other Home editions, themes and contextual indicators | `npm run test:e2e:home-dashboard` |
| Cellar editors, merchants and management flows | `npm run test:e2e:cellar-management` |
| Taste-profile layout within the application | `npm run test:e2e:taste-profile-layout` |
| All suites extracted from the former monolith | `npm run test:e2e:app` |
| Every E2E spec, including existing independent feature suites | `npm run test:e2e` |

Other existing specs (for example `taste-profile.spec.ts`, sensory profiles,
buying advice and wishlist flows) remain independently selectable through
`npx playwright test e2e/<feature>.spec.ts`. The taste-profile layout suite does
not replace the separate taste-profile functional suite.

Forward a narrower selection or inspect it before execution:

```powershell
npm run test:e2e:personal-dashboard -- --grep "matching insight" --list
npm run test:e2e:personal-dashboard -- --grep "matching insight"
```

## Parallel execution and agent coordination

Prefer one runner: tests are fully parallel and use two workers by default
locally and in CI. Pass `-- --workers=1` to an npm feature command for a
resource-constrained machine or serial diagnosis. Increasing process/agent
counts without regard to CPU and memory can make tests slower or unstable.

When parallel agents are requested, first assign disjoint features or checks.
Each agent reports its exact command, scope, server/port, output directory,
pass/fail counts and reproducible failures to the coordinator. Share findings
instead of repeating the same suite. Independent backend checks and a frontend
build may run alongside E2E only when relevant and resources permit; agents
must not edit the same files or rebuild a preview being tested.

If two E2E processes are genuinely needed, use one worker each and separate
servers and artifact directories. In separate PowerShell sessions:

```powershell
# Agent A, frontend/
$env:PLAYWRIGHT_PORT = "5181"
npm.cmd run test:e2e:wine-detail -- --workers=1 --output=test-results/agent-wine
```

```powershell
# Agent B, frontend/
$env:PLAYWRIGHT_PORT = "5182"
npm.cmd run test:e2e:personal-dashboard -- --workers=1 --output=test-results/agent-dashboard
```

Ensure `PLAYWRIGHT_BASE_URL` is unset for those independently managed servers.
Alternatively agree on one externally managed, read-only frontend server and
set the same `PLAYWRIGHT_BASE_URL` in both sessions; retain separate outputs.
Every concurrent process must use its own output directory: do not run another
process with the default parent `test-results/`, which can clear child outputs.
Only the coordinator owns shared-server lifecycle and any baseline acceptance.
Never update baselines concurrently. Keep temporary reports/traces under the
ignored `test-results/` directory, and do not suppress failures with retries.

## Wine Detail and visual baselines

The Wine Detail suite covers compact/mobile rendering at 360x800, 390x844,
and 430x932, a desktop smoke path, semantic Wine Detail content, the two quick
actions exactly once, visual hierarchy using bounding boxes, collapsed
secondary sections, and the explicit `document.documentElement` overflow
invariant. Maps and API data are fixture-backed so remote tiles and credentials
cannot make the test nondeterministic.

Reviewed baselines live beside their owning spec in
`e2e/<feature>.spec.ts-snapshots/`. The split moves accepted images without
regenerating or changing them. Wine Detail retains its original baseline folder;
existing independent suites retain their own baseline locations.
After functional/geometry checks and actual visual review, update only the
intended feature/test, for example:

```powershell
npm run test:e2e:wine-detail -- --grep "matches the compact visual baseline" --update-snapshots
```

Do not update snapshots as a way to hide an unexpected UI regression.

## Scope-aware test selection

`AGENTS.md` is the authoritative Codex guide. Codex must inspect `git diff`
and classify changes before selecting checks. Frontend-only changes use the
smallest relevant frontend test, `npm run test:e2e:wine-detail` when applicable,
and `npm run build`; they do not require the full backend pytest suite. Backend
or cross-stack changes add their targeted backend/contract checks, and the full
repository suite is reserved for changes whose scope justifies it.

Shared fixture/configuration changes can justify `test:e2e:app` or the complete
frontend suite; an isolated Wine Detail change does not. A changed feature must
still pass its relevant geometry, responsive and visual checks plus the build.

## Indicatori di scorrimento delle dashboard

Le gallerie mobili del collezionista e `DashboardCarousel` condividono
`HorizontalScroll`: frecce con contatore, suggerimento iniziale e rilevamento
dello spazio effettivamente scorrevole. I controlli scompaiono quando tutto il
contenuto entra nel contenitore; il suggerimento scompare dopo l'interazione.
Il componente osserva ridimensionamenti e cambiamenti dei figli e rispetta
la preferenza di movimento ridotto.

Verifica mirata: `npm run test:e2e:collector -- -g "scroll cues|collector responsive layout|collector empty"`.
I test coprono touch nativo, tastiera, estremi del carosello, assenza di overflow
della pagina e viewport 360, 390, 430 e 1440 px.

## Sintesi della collezione

La panoramica collezionista mostra bottiglie, vini e valori separati per valuta,
barre di disponibilità e maturità e solo le attenzioni non vuote. Le categorie
di maturità sono esclusive e riguardano le bottiglie presenti; finestre mancanti
o invertite restano nella categoria senza finestra. Il report testuale dei dettagli
è sostituito da «Come sta cambiando la tua cantina»: valutazioni (ricostruite sulle
quantità attuali, non rendimento), movimenti registrati negli ultimi 12 mesi e
istogramma delle bottiglie per fine finestra. Gli anni sono selezionabili.
Il servizio movimenti restituisce al massimo 500 righe: al raggiungimento del
limite la vista segnala dati parziali. Saldi iniziali e rettifiche in entrata non
sono acquisti; le vendite sono al netto degli annullamenti. Storici assenti o
non caricati non producono andamenti fittizi. L’orizzonte indica l’ultimo anno
incluso nella finestra stimata; dall’anno successivo è superata. I richiami per
valori e finestre mancanti restano nella dashboard di completezza dei dati.

`npm run test:e2e:collector` verifica conteggi, aperture dei vini, stati vuoti,
geometria e assenza di overflow a 360, 390, 430 e 1440 px. La baseline
`collector-glance-compact.png` protegge la sintesi a 390 px; nella sola cattura
della sezione si nascondono le barre fisse globali per evitare che coprano il
contenuto durante lo screenshot dell'intero elemento.
`collector-evolution-compact.png` protegge i grafici popolati con dati deterministici.
I test attendono la comparsa del grafico nel viewport prima della cattura,
rispettando l'animazione di ingresso esistente.

## Home mobile editoriale

Il focus collezionista usa `CellarHomeHero` / `CellarHomeStats`, `FeaturedWineCard`
e `RiservaBanner` fino a 900 px. La testata seleziona una fotografia locale per
sessione; `premium-cellar-empty.jpg` resta il fallback. Tutti i focus della Home privata condividono testata,
ricerca, selettore cantina circolare, card e navigazione mobile. Ogni focus conserva
i propri indicatori, grafici e azioni; la dashboard personale resta modificabile.
Le viste ristorante non cambiano. La scelta della dashboard resta in alto,
subito sotto la testata in tutti i focus, prima del riepilogo del Collezionista e
prima delle gallerie; le schede Vini / Priorità / Collezione restano dopo le gallerie.

Il riepilogo usa le giacenze correnti, separa le valute e dichiara la copertura
dei valori (valutazione corrente, oppure prezzo di acquisto disponibile).
I pronti da bere riusano l'intera selezione esistente, prima del limite del carosello;
da monitorare indica i vini presenti con finestra valida in chiusura nell'anno
corrente o già superata. Non rappresenta una previsione di rendimento.
Le spiegazioni della card riusano quelle dell'approfondimento esistente.
Il banner apre il profilo con gli abbonamenti, senza avviare acquisti, e non viene
mostrato agli utenti con entitlement attivo, amministratori, demo o in offline.

`npm run test:e2e:collector -- -g "collector premium"` verifica
360, 390, 412, 430, 480 e 768 px: geometria, foto prominenti, ordine delle sezioni,
controlli da 44 px, metriche reali, più valute, dati assenti, inglese, permessi,
ricerca e abbonamenti. `npm run test:e2e:collector` include temi, navigazione,
insight, fallback fotografici e desktop fino a 1920 px. Le baseline Home a 390 px
sono `collector-compact.png` (Riserva attiva) e `collector-riserva-home-compact.png`
(piano gratuito). Prima di aggiornarle verificare anche gli screenshot dei test
e l'assenza di overflow. Le catture delle sole sezioni di analisi nascondono
temporaneamente i controlli globali; i test Home verificano la navigazione reale.

`npx playwright test e2e/home-dashboard.spec.ts e2e/personal-dashboard.spec.ts -g "editorial dashboard|personal dashboard"`
verifica le altre viste a 360, 390, 430 e 1440 px, separazione delle etichette e dei
valori, ordine dei contenuti, assenza di overflow e personalizzazione dei widget.
La baseline `balanced-home-compact.png` protegge lo stile condiviso a 390 px.

## Home desktop editoriale

Il progetto e i breakpoint sono descritti in `DESKTOP_HOME_DESIGN.md`.
`npx playwright test e2e/collector.spec.ts e2e/app-navigation.spec.ts -g "desktop cellar|collector editorial instrument|collector responsive photos"`
verifica la nuova composizione tra 1024 e 1920 px: sintesi nel primo viewport,
navigazione orizzontale, grande fotografia, valori e maturità affiancati, griglia
arrivi, selezione da bere, Riserva, temi e immagini 1x/2x con fallback.
Le baseline mobile devono continuare a passare senza aggiornamenti automatici.

## Fotografie della testata

Le sezioni private interne usano `CellarCompactHeader.css`: stessa identita
tipografica della Home, badge rame, ricerca discreta e comandi circolari, senza
hero fotografico. Sidebar, contenuti e intestazione ristorante restano invariati.
`npm run test:e2e:app-navigation -- -g "compact section header"`
verifica geometria a 360, 390, 430, 1024 e 1440 px, sei temi desktop,
selettore cantina, ricerca, notifiche e passaggio a Wishlist/Impostazioni.
Le baseline `compact-section-header-390.png` e `compact-section-header-1440.png`
proteggono la sola testata dopo verifica visiva.

`npm run test:e2e:app-navigation -- -g "Home backdrop"` verifica i sei
temi a 390 e 1440 px, il caricamento delle sei scene, la scelta casuale e la
persistenza durante la navigazione, cambio immagine con reload normale e senza
cache (Ctrl+F5), reset al logout e fallback per storage
o immagini non disponibili. La fixture generale fissa la scena vigneto per
rendere deterministiche le baseline; i test della scelta casuale non la fissano.
Asset e prompt di generazione sono documentati in `HOME_BACKDROPS.md`.
