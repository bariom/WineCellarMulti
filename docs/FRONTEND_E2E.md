# Frontend E2E checks

The frontend uses Playwright with Chromium. The Wine Detail suite uses safe,
deterministic browser fixtures and does not require real credentials, tokens,
production data, or a backend process.

From `frontend/`:

```powershell
npm ci
npx playwright install chromium
npm run test:e2e
npm run test:e2e:wine-detail
```

`PLAYWRIGHT_BASE_URL` can point to an already running Vite frontend. Without
it, Playwright starts `npm run dev` automatically. The normal Vite API proxy
remains available for future suites that use a test backend.

The Wine Detail suite covers compact/mobile rendering at 360x800, 390x844,
and 430x932, a desktop smoke path, semantic Wine Detail content, the two quick
actions exactly once, visual hierarchy using bounding boxes, collapsed
secondary sections, and the explicit `document.documentElement` overflow
invariant. Maps and API data are fixture-backed so remote tiles and credentials
cannot make the test nondeterministic.

The reviewed visual baseline is stored in
`e2e/wine-detail.spec.ts-snapshots/`. Update it only intentionally:

```powershell
npm run test:e2e:update
```

Do not update snapshots as a way to hide an unexpected UI regression.

## Scope-aware test selection

`AGENTS.md` is the authoritative Codex guide. Codex must inspect `git diff`
and classify changes before selecting checks. Frontend-only changes use the
smallest relevant frontend test, `npm run test:e2e:wine-detail` when applicable,
and `npm run build`; they do not require the full backend pytest suite. Backend
or cross-stack changes add their targeted backend/contract checks, and the full
repository suite is reserved for changes whose scope justifies it.
## Indicatori di scorrimento delle dashboard

Le gallerie mobili del collezionista e `DashboardCarousel` condividono
`HorizontalScroll`: frecce con contatore, suggerimento iniziale e rilevamento
dello spazio effettivamente scorrevole. I controlli scompaiono quando tutto il
contenuto entra nel contenitore; il suggerimento scompare dopo l'interazione.
Il componente osserva ridimensionamenti e cambiamenti dei figli e rispetta
la preferenza di movimento ridotto.

Verifica mirata: `npx playwright test e2e/wine-detail.spec.ts -g "scroll cues|collector responsive layout|collector empty"`.
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
