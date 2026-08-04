import type { CSSProperties } from "react";
import type { Locale } from "../types";
import "./PublicLanding.css";

type PublicLandingProps = {
  locale: Locale;
  onRegister: () => void;
  onLogin: () => void;
  onDemo: () => void;
  demoLoading?: boolean;
};

const content = {
  it: {
    eyebrow: "Private Cellar Intelligence",
    title: "La tua cantina, trasformata in decisioni.",
    lead: "Vinaris riunisce bottiglie, valore, maturità, consegne e memoria degustativa in uno spazio privato progettato per chi colleziona vino con metodo.",
    description: "Non un semplice inventario: una lettura viva della collezione per capire cosa bere, cosa aspettare, cosa acquistare e quali posizioni richiedono attenzione.",
    register: "Crea il tuo account",
    login: "Accedi",
    demo: "Esplora la cantina demo",
    signal: "Pensato per cantine da 20 a oltre 1.000 bottiglie",
    editorialEyebrow: "Una collezione, non un elenco",
    editorialTitle: "Ogni bottiglia ha un momento, un valore e una storia.",
    editorialBody: "Vinaris mette in relazione dati che normalmente restano dispersi tra memoria, fogli di calcolo, fatture e applicazioni diverse. Il risultato è una cantina leggibile, operativa e pronta a sostenere decisioni reali.",
    maturityEyebrow: "Maturità e capitale",
    maturityTitle: "Bere al momento giusto protegge anche il valore della cantina.",
    maturityBody: "Le finestre di beva diventano una mappa temporale. Vedi quali vini sono giovani, al picco o oltre finestra e ottieni uno scenario finanziario del valore potenzialmente esposto al deterioramento.",
    platformEyebrow: "Il sistema Vinaris",
    platformTitle: "Tutto ciò che serve al collezionista, nello stesso linguaggio visivo.",
    aiEyebrow: "Intelligenza discreta",
    aiTitle: "L’AI lavora dietro le quinte. Tu mantieni il controllo.",
    aiBody: "Attiva solo le funzioni che ti servono: stime di mercato, finestre di beva, uvaggi, confronti, strategia wishlist e abbinamenti. Usa una tua chiave OpenAI oppure un AI Pack Vinaris, con costi e modelli sempre visibili.",
    closingEyebrow: "Collector edition",
    closingTitle: "Una cantina importante merita uno strumento all’altezza.",
    closingBody: "Inizia a costruire un archivio privato capace di accompagnare acquisti, attese, degustazioni e valore nel tempo.",
    monthly: "CHF 6 / mese",
    annual: "CHF 60 / anno",
    annualNote: "Due mesi risparmiati con il piano annuale",
  },
  en: {
    eyebrow: "Private Cellar Intelligence",
    title: "Turn your cellar into better decisions.",
    lead: "Vinaris brings bottles, value, maturity, deliveries, and tasting memory into one private space designed for serious wine collectors.",
    description: "More than an inventory: a living view of the collection that clarifies what to drink, what to hold, what to buy, and which positions need attention.",
    register: "Create your account",
    login: "Log in",
    demo: "Explore the demo cellar",
    signal: "Designed for cellars from 20 to more than 1,000 bottles",
    editorialEyebrow: "A collection, not a list",
    editorialTitle: "Every bottle has a moment, a value, and a story.",
    editorialBody: "Vinaris connects information normally scattered across memory, spreadsheets, invoices, and separate applications. The result is a readable, operational cellar built around real decisions.",
    maturityEyebrow: "Maturity and capital",
    maturityTitle: "Drinking at the right time also protects cellar value.",
    maturityBody: "Drinking windows become a temporal map. See which wines are young, at peak, or past window, and understand the financial value potentially exposed to deterioration.",
    platformEyebrow: "The Vinaris system",
    platformTitle: "Everything a collector needs, expressed in one visual language.",
    aiEyebrow: "Quiet intelligence",
    aiTitle: "AI works behind the scenes. You remain in control.",
    aiBody: "Activate only what you need: market estimates, drinking windows, grapes, comparisons, wishlist strategy, and pairings. Use your own OpenAI key or a Vinaris AI Pack, with models and estimated costs always visible.",
    closingEyebrow: "Collector edition",
    closingTitle: "A serious cellar deserves a tool to match.",
    closingBody: "Build a private archive that supports purchases, patience, tastings, and value over time.",
    monthly: "CHF 6 / month",
    annual: "CHF 60 / year",
    annualNote: "Save two months with the annual plan",
  },
} as const;

export default function PublicLanding({ locale, onRegister, onLogin, onDemo, demoLoading = false }: PublicLandingProps) {
  const copy = content[locale];
  const isItalian = locale === "it";
  return (
    <main className="marketing-landing">
      <section className="marketing-hero" aria-labelledby="marketing-title">
        <div className="marketing-hero-copy">
          <p className="marketing-kicker">{copy.eyebrow}</p>
          <h1 id="marketing-title">{copy.title}</h1>
          <p className="marketing-lead">{copy.lead}</p>
          <p className="marketing-description">{copy.description}</p>
          <div className="marketing-actions">
            <button type="button" onClick={onDemo} disabled={demoLoading}>{demoLoading ? (isItalian ? "Apertura…" : "Opening…") : copy.demo}</button>
            <button type="button" className="secondary" onClick={onRegister}>{copy.register}</button>
            <button type="button" className="secondary" onClick={onLogin}>{copy.login}</button>
          </div>
          <div className="marketing-trust-line"><span />{copy.signal}</div>
        </div>

        <div className="marketing-dashboard" aria-label={isItalian ? "Anteprima dashboard Vinaris" : "Vinaris dashboard preview"}>
          <div className="marketing-dashboard-top">
            <div className="marketing-focus-title"><small>Dashboard</small><strong>Collector<br />focus</strong></div>
            <div className="marketing-kpi"><span>{isItalian ? "Le mie bottiglie" : "My bottles"}</span><strong>171</strong><small>CHF 7’872</small></div>
            <div className="marketing-kpi"><span>{isItalian ? "Condivise" : "Shared"}</span><strong>26</strong><small>CHF 1’440</small></div>
            <div className="marketing-kpi marketing-kpi-value"><span>{isItalian ? "Valore totale" : "Total value"}</span><strong>CHF 9’312</strong><i /></div>
          </div>
          <div className="marketing-dashboard-grid">
            <article className="marketing-key-position">
              <header><span>{isItalian ? "Posizioni chiave · le mie bottiglie" : "Key positions · my bottles"}</span></header>
              <div className="marketing-key-wine">
                <div className="marketing-bottle" aria-hidden="true"><i /><b /></div>
                <div><small>{isItalian ? "Maggior incremento di valore" : "Largest price increase"}</small><h2>Ferrari Perlé</h2><p>Ferrari · Trento · 2018</p></div>
                <em>2018</em>
              </div>
              <div className="marketing-key-metrics">
                <div><span>{isItalian ? "Valore totale" : "Total value"}</span><strong>CHF 37</strong></div>
                <div><span>{isItalian ? "Bottiglie" : "Bottles"}</span><strong>1</strong></div>
                <div className="positive"><span>{isItalian ? "Evoluzione valore" : "Value evolution"}</span><strong>+131.3%</strong><i /></div>
              </div>
              <div className="marketing-maturity-line"><span>{isItalian ? "Mappa maturità" : "Maturity map"}</span><div><i /><b /></div><small>2018</small><small>2026</small><small>2031</small></div>
            </article>
            <article className="marketing-priority-card">
              <header><span>{isItalian ? "Azioni prioritarie" : "Priority actions"}</span><strong>{isItalian ? "Da bere ora" : "Drink now"}</strong><b>88</b></header>
              <div className="marketing-priority-stats"><span><small>{isItalian ? "Valore" : "Value"}</small>CHF 3’383</span><span><small>{isItalian ? "Finestra" : "Window"}</small>2026</span><span><small>{isItalian ? "In attesa" : "Awaiting"}</small>16</span></div>
              <div className="marketing-wine-row"><div className="marketing-mini-bottle" /><span><strong>Carla</strong><small>Azienda Agricola Cadenazzi · 2023</small></span><b>2025–2027</b></div>
              <footer><span>Krug Grande Cuvée</span><b>2027–2038</b></footer>
            </article>
            <article className="marketing-recent-card">
              <header><span>{isItalian ? "Nuovi ingressi" : "New entries"}</span><strong>{isItalian ? "Vini aggiunti di recente" : "Recently added wines"}</strong><b>5</b></header>
              {["Prosecco", "Blanc De Blancs", "Ronco delle noci", "Insoglio del Cinghiale"].map((name, index) => <div className="marketing-recent-row" key={name}><i className={`bottle-${index + 1}`} /><span><strong>{name}</strong><small>{["Nino Ardevi · NV", "Vini Rovio · 2021", "Tenuta Agricola Luigina", "Tenuta di Biserno · 2022"][index]}</small></span></div>)}
            </article>
          </div>
          <div className="marketing-dashboard-bottom">
            <div><span>{isItalian ? "Oltre finestra" : "Past window"}</span><strong>3</strong><small>{isItalian ? "Posizioni a rischio" : "Positions at risk"}</small></div>
            <div><span>{isItalian ? "Consegne future" : "Future deliveries"}</span><strong>4</strong><small>{isItalian ? "Capitale già impegnato" : "Committed capital"}</small></div>
            <div><span>{isItalian ? "Da ritirare" : "To collect"}</span><strong>6</strong><small>{isItalian ? "Bottiglie in attesa" : "Bottles awaiting"}</small></div>
            <div><span>{isItalian ? "Qualità dati" : "Data quality"}</span><strong>16</strong><small>{isItalian ? "Informazioni da completare" : "Fields to complete"}</small></div>
          </div>
        </div>
      </section>

      <section className="marketing-editorial-section">
        <div className="marketing-section-intro"><p className="marketing-kicker">{copy.editorialEyebrow}</p><h2>{copy.editorialTitle}</h2><p>{copy.editorialBody}</p></div>
        <div className="marketing-pillars">
          {[
            ["01", isItalian ? "Inventario privato" : "Private inventory", isItalian ? "Bottiglie, formati, quote e fotografie in un archivio coerente." : "Bottles, formats, shares, and photographs in one coherent archive."],
            ["02", isItalian ? "Decisioni di beva" : "Drinking decisions", isItalian ? "Finestre ideali, urgenze e suggerimenti per scegliere cosa aprire." : "Ideal windows, urgency, and recommendations for what to open."],
            ["03", isItalian ? "Valore e mercato" : "Value and market", isItalian ? "Prezzo pagato, valore attuale, storico e concentrazione patrimoniale." : "Purchase price, current value, history, and portfolio concentration."],
            ["04", isItalian ? "Memoria lunga" : "Long-term memory", isItalian ? "Degustazioni, occasioni e abbinamenti restano legati alla bottiglia." : "Tastings, occasions, and pairings remain connected to each bottle."],
          ].map(([number, title, body]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{body}</p></article>)}
        </div>
      </section>

      <section className="marketing-maturity-section">
        <div className="marketing-maturity-copy"><p className="marketing-kicker">{copy.maturityEyebrow}</p><h2>{copy.maturityTitle}</h2><p>{copy.maturityBody}</p><ul><li>{isItalian ? "Finestra giovane, ideale e massima per ogni vino" : "Young, ideal, and maximum window for every wine"}</li><li>{isItalian ? "Proiezione annuale per tipologia" : "Annual projection by wine style"}</li><li>{isItalian ? "Valore esposto e perdita probabilistica stimata" : "Exposed value and probability-weighted estimated loss"}</li></ul></div>
        <div className="marketing-maturity-visual">
          <div className="marketing-risk-summary"><div><span>{isItalian ? "Valore oltre finestra" : "Value past window"}</span><strong>CHF 1’280</strong></div><div><span>{isItalian ? "Perdita stimata" : "Estimated loss"}</span><strong>CHF 314</strong></div><div><span>{isItalian ? "Rischio medio" : "Average risk"}</span><strong>24.5%</strong></div></div>
          <div className="marketing-heatmap"><div className="years"><span />{[2026, 2027, 2028, 2029, 2030, 2031].map((year) => <b key={year}>{year}</b>)}</div>{[["Rosso", 36, 46, 60, 54, 41, 36], ["Bianco", 35, 35, 31, 6, 4, 4], ["Spumante", 16, 11, 6, 3, 3, 1], ["Rosé", 5, 3, 0, 0, 0, 0]].map(([tone, ...values], row) => <div className="heat-row" key={String(tone)}><strong><i className={`tone-${row}`} />{tone}</strong>{values.map((value, index) => <span style={{ "--cell-strength": `${Math.max(Number(value), 4)}%` } as CSSProperties} key={index}>{Number(value) || ""}</span>)}</div>)}<div className="risk-row"><strong>{isItalian ? "Perdita stimata" : "Estimated loss"}</strong>{[0, 90, 188, 314, 507, 742].map((value) => <span key={value}>{value ? `${value}` : "—"}</span>)}</div></div>
          <small>{isItalian ? "Scenario gestionale: il rischio cresce dopo la finestra massima e dipende dalla qualità della conservazione." : "Management scenario: risk increases after the maximum window and depends on storage quality."}</small>
        </div>
      </section>

      <section className="marketing-platform-section">
        <div className="marketing-section-intro"><p className="marketing-kicker">{copy.platformEyebrow}</p><h2>{copy.platformTitle}</h2></div>
        <div className="marketing-capability-grid">
          {[
            [isItalian ? "Mappa delle origini" : "Origin map", isItalian ? "Esplora la collezione per regione e apri la cantina già filtrata dal punto geografico." : "Explore the collection by region and open the cellar already filtered from the map."],
            [isItalian ? "Wishlist disciplinata" : "Disciplined wishlist", isItalian ? "Liste, prezzi obiettivo, offerte, priorità e strategia prima di trasformare un desiderio in acquisto." : "Lists, target prices, offers, priorities, and strategy before turning interest into a purchase."],
            [isItalian ? "Futures e consegne" : "Futures and deliveries", isItalian ? "Ordini, en primeur, ritiri e capitale impegnato organizzati lungo una timeline." : "Orders, en primeur, collections, and committed capital organized on a timeline."],
            [isItalian ? "Cantine condivise" : "Shared cellars", isItalian ? "Più cantine, inviti, quote di proprietà, accordi e pagamenti tra collezionisti." : "Multiple cellars, invitations, ownership shares, agreements, and payments between collectors."],
            [isItalian ? "Storico degustativo" : "Tasting archive", isItalian ? "Quando una bottiglia finisce, note, voto, occasione e abbinamento rimangono nella memoria della cantina." : "When a bottle is gone, notes, rating, occasion, and pairing remain in cellar memory."],
            [isItalian ? "Qualità dei dati" : "Data quality", isItalian ? "Valori, finestre, uvaggi e punteggi mancanti diventano azioni chiare da completare." : "Missing values, windows, grapes, and scores become clear actions to complete."],
          ].map(([title, body], index) => <article key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{body}</p></article>)}
        </div>
      </section>

      <section className="marketing-ai-section">
        <div className="marketing-ai-copy"><p className="marketing-kicker">{copy.aiEyebrow}</p><h2>{copy.aiTitle}</h2><p>{copy.aiBody}</p><div className="marketing-ai-tags"><span>{isItalian ? "Valore mercato" : "Market value"}</span><span>{isItalian ? "Finestra di beva" : "Drinking window"}</span><span>{isItalian ? "Sommelier" : "Sommelier"}</span><span>{isItalian ? "Confronto vini" : "Wine comparison"}</span><span>{isItalian ? "Strategia acquisti" : "Buying strategy"}</span></div></div>
        <div className="marketing-ai-console"><div className="marketing-ai-orbit"><i>AI</i><span>Luna</span><span>Terra</span><span>Sol</span></div><div className="marketing-ai-result"><small>{isItalian ? "Suggerimento per questa sera" : "Tonight’s recommendation"}</small><strong>Krug Grande Cuvée 170ème</strong><p>{isItalian ? "Nel pieno della finestra ideale, pronta da bere e coerente con le tue preferenze." : "Inside its ideal window, ready to drink, and aligned with your preferences."}</p><footer><span>{isItalian ? "Ragionamento" : "Reasoning"}: medium</span><b>CHF 178</b></footer></div></div>
      </section>

      <section className="marketing-closing-section">
        <div><p className="marketing-kicker">{copy.closingEyebrow}</p><h2>{copy.closingTitle}</h2><p>{copy.closingBody}</p><div className="marketing-actions"><button type="button" onClick={onDemo} disabled={demoLoading}>{demoLoading ? (isItalian ? "Apertura…" : "Opening…") : copy.demo}</button><button type="button" className="secondary" onClick={onRegister}>{copy.register}</button><button type="button" className="secondary" onClick={onLogin}>{copy.login}</button></div></div>
        <aside><span>{isItalian ? "Accesso flessibile" : "Flexible access"}</span><strong>{copy.monthly}</strong><i /> <span>{isItalian ? "Scelta collezionista" : "Collector choice"}</span><strong>{copy.annual}</strong><small>{copy.annualNote}</small><div><b>AI</b>{isItalian ? "Credito iniziale incluso per provare le funzioni avanzate." : "Starter credit included to try advanced features."}</div></aside>
      </section>
    </main>
  );
}
