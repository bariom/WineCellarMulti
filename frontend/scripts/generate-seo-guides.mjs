import { mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const projectRoot = new URL("../", import.meta.url);
const publicRoot = new URL("../public/", import.meta.url);
const siteUrl = "https://vinaris.app";

const guides = [
  {
    id: "drink-next",
    it: {
      slug: "quale-vino-bere-oggi", title: "Quale vino bere oggi dalla tua cantina?", description: "Un metodo pratico per scegliere la bottiglia giusta dalla propria cantina: finestra di beva, occasione, quantità e memoria delle degustazioni.",
      lead: "La domanda non è solo quale vino starebbe bene con la cena. È quale bottiglia della tua cantina è pronta, adatta all'occasione e merita di essere aperta adesso.",
      sections: [["Parti dalle bottiglie che richiedono attenzione", "Una cantina utile non è una lista immobile. Guarda prima i vini nella finestra ideale, quelli da bere presto e le bottiglie che non controlli da tempo. Questo restringe la scelta senza trasformare l'apertura di una bottiglia in un esercizio complicato."], ["Poi abbina l'occasione", "Un vino pronto non è necessariamente il vino giusto per questa sera. Considera piatto, numero di persone, tempo a disposizione, temperatura e desiderio di una bottiglia semplice o memorabile. Una buona scelta tiene insieme maturità e momento."], ["Lascia una traccia per la prossima scelta", "Dopo l'apertura, annota impressioni, abbinamento e stato evolutivo. La memoria degustativa rende i consigli successivi più personali: non solo cosa è pronto in teoria, ma cosa hai apprezzato davvero."]],
    },
    en: {
      slug: "which-wine-to-drink-today", title: "Which wine should you drink from your cellar today?", description: "A practical way to choose the right bottle from your cellar using drinking windows, occasion, quantity, and tasting memory.",
      lead: "The question is not only which wine suits dinner. It is which bottle in your cellar is ready, fits the occasion, and deserves to be opened now.",
      sections: [["Start with bottles that need attention", "A useful cellar is not a static list. Look first at wines in their ideal window, bottles marked to drink soon, and wines you have not reviewed for a while. This narrows the choice without making opening a bottle complicated."], ["Then match the occasion", "A ready wine is not automatically the right wine for tonight. Consider the dish, number of guests, time available, serving temperature, and whether you want something easy or memorable. A good choice brings maturity and occasion together."], ["Leave a useful note for next time", "After opening, record your impression, pairing, and the wine's stage of evolution. Tasting memory makes future recommendations more personal: not just what should be ready in theory, but what you genuinely enjoyed."]],
    },
  },
  {
    id: "drinking-windows",
    it: {
      slug: "finestre-di-beva-vino", title: "Finestre di beva: come capire quando aprire un vino", description: "Cosa significa finestra di beva e come usarla per decidere quando aspettare, aprire o controllare una bottiglia della propria cantina.",
      lead: "Una finestra di beva non è una promessa assoluta. È una guida per organizzare l'attenzione: sapere cosa aspettare, cosa controllare e cosa non lasciare in fondo alla cantina.",
      sections: [["Leggi la finestra come un intervallo, non come una scadenza", "Annata, produttore, stile, formato e conservazione influenzano la maturità. Due bottiglie dello stesso vino possono evolvere in modo diverso. Per questo una finestra indica una fase probabile, non il giorno esatto in cui il vino cambia."], ["Usa le fasi per creare priorità", "Un vino molto giovane può attendere. Un vino nella fase ideale può entrare nelle opzioni per una cena importante. Un vino da bere presto merita una decisione concreta. Organizzare le bottiglie per stato è più utile che ricordare singole date."], ["Verifica con l'esperienza della tua cantina", "Temperatura, umidità, trasporti e condizioni del tappo contano. Le note di degustazione e le bottiglie aperte in passato aiutano a calibrare le indicazioni. Vinaris presenta le finestre come supporto gestionale, non come certificazione di qualità della singola bottiglia."]],
    },
    en: {
      slug: "wine-drinking-windows", title: "Wine drinking windows: how to know when to open a bottle", description: "What a drinking window means and how to use it to decide when to wait, open, or review a bottle in your cellar.",
      lead: "A drinking window is not an absolute promise. It is a way to organise attention: what to hold, what to check, and what not to leave forgotten at the back of the cellar.",
      sections: [["Read the window as a range, not a deadline", "Vintage, producer, style, format, and storage all affect maturity. Two bottles of the same wine can evolve differently. A window therefore signals a likely phase, not the exact day a wine changes."], ["Use stages to set priorities", "A very young wine can wait. A wine in its ideal phase can become an option for an important dinner. A wine to drink soon deserves a concrete decision. Organising bottles by stage is more useful than remembering isolated dates."], ["Calibrate with your own cellar experience", "Temperature, humidity, transport, and cork condition matter. Tasting notes and previously opened bottles help refine guidance. Vinaris presents drinking windows as cellar-management support, not a guarantee of the condition of an individual bottle."]],
    },
  },
  {
    id: "cellar-organisation",
    it: {
      slug: "come-organizzare-cantina-vino", title: "Come organizzare una cantina di vino privata", description: "Una guida essenziale per organizzare bottiglie, posizione, annate, quantità, valore e priorità in una cantina di vino privata.",
      lead: "Una cantina ben organizzata deve rispondere velocemente a poche domande: cosa possiedo, dove si trova, cosa è pronto e cosa mi manca.",
      sections: [["Definisci una posizione fisica per ogni bottiglia", "Scaffale, colonna, cassetta o frigorifero: il sistema può essere semplice, purché sia coerente. La posizione fisica associata al record digitale evita acquisti doppi e la ricerca infinita della bottiglia giusta."], ["Registra i dati che cambiano le decisioni", "Produttore, vino, annata, formato, quantità, prezzo d'acquisto e stato sono una base più utile di una descrizione lunghissima. Aggiungi foto e note quando servono a riconoscere o ricordare davvero una bottiglia."], ["Rivedi la cantina con una cadenza", "Una breve revisione mensile può far emergere vini pronti, quantità basse, consegne in arrivo e informazioni mancanti. La costanza è più preziosa di una catalogazione perfetta fatta una sola volta."]],
    },
    en: {
      slug: "how-to-organise-a-wine-cellar", title: "How to organise a private wine cellar", description: "A practical guide to organising bottles, storage locations, vintages, quantities, value, and priorities in a private wine cellar.",
      lead: "A well-organised cellar should answer a few questions quickly: what do I own, where is it, what is ready, and what is missing?",
      sections: [["Give every bottle a physical location", "Shelf, column, case, or wine fridge: the system can be simple as long as it is consistent. Connecting a physical location to a digital record prevents duplicate purchases and endless searching for the right bottle."], ["Record the information that changes decisions", "Producer, wine, vintage, format, quantity, purchase price, and status are a more useful foundation than a very long description. Add photos and notes when they genuinely help identify or remember a bottle."], ["Review the cellar on a rhythm", "A short monthly review can surface ready wines, low quantities, incoming deliveries, and missing information. Consistency is more valuable than perfect cataloguing done only once."]],
    },
  },
  {
    id: "spreadsheet-vs-app",
    it: {
      slug: "excel-o-app-per-cantina-vino", title: "Excel o app per gestire la cantina di vino?", description: "Quando un foglio Excel è sufficiente e quando un'app per la cantina rende più semplice trovare, seguire e godersi le proprie bottiglie.",
      lead: "Un foglio di calcolo è un ottimo punto di partenza. Il limite arriva quando trovare una bottiglia, seguire la maturità e ricordare le degustazioni richiede più energia che piacere.",
      sections: [["Quando Excel funziona bene", "Per una collezione piccola e dati essenziali, un foglio è flessibile, economico e facile da esportare. È sufficiente se aggiorni tutto con costanza e sai sempre dove cercare ogni informazione."], ["Dove una app riduce l'attrito", "Foto, ricerca, filtri, posizione, quantità, finestre di beva e note degustative diventano più immediate quando sono collegate alla singola bottiglia. L'obiettivo non è sostituire il tuo giudizio: è renderlo disponibile quando scegli cosa aprire o comprare."], ["Scegli un sistema che resti tuo", "Verifica sempre export, privacy, controllo dei dati e semplicità dell'inserimento. Il miglior sistema è quello che continui a usare dopo il primo entusiasmo, perché una cantina aggiornata è più utile di un archivio perfetto ma abbandonato."]],
    },
    en: {
      slug: "wine-cellar-spreadsheet-vs-app", title: "Wine cellar spreadsheet or app?", description: "When a spreadsheet is enough and when a wine cellar app makes it easier to find, track, and enjoy your bottles.",
      lead: "A spreadsheet is an excellent starting point. The limit comes when finding a bottle, following maturity, and remembering tastings takes more energy than pleasure.",
      sections: [["When a spreadsheet works well", "For a small collection and essential data, a spreadsheet is flexible, inexpensive, and easy to export. It is enough if you update it consistently and always know where to find each piece of information."], ["Where an app removes friction", "Photos, search, filters, storage location, quantity, drinking windows, and tasting notes become easier when they are connected to the individual bottle. The goal is not to replace your judgment, but to make it available when deciding what to open or buy."], ["Choose a system that stays yours", "Always check export options, privacy, data control, and ease of entry. The best system is the one you keep using after the first burst of enthusiasm, because an updated cellar is more useful than a perfect archive that is abandoned."]],
    },
  },
];

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}

function withFinalNewline(value) {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function pathFor(locale, guide) {
  return locale === "it" ? `/it/guide/${guide.it.slug}/` : `/en/guides/${guide.en.slug}/`;
}

function guidePage(locale, guide) {
  const content = guide[locale];
  const otherLocale = locale === "it" ? "en" : "it";
  const alternate = guide[otherLocale];
  const currentPath = pathFor(locale, guide);
  const alternatePath = pathFor(otherLocale, guide);
  const copy = locale === "it"
    ? { guides: "Guide", home: "Vinaris", eyebrow: "Guida per la cantina", ctaTitle: "Trasforma la cantina in decisioni più semplici.", cta: "Crea la tua cantina", disclaimer: "Le indicazioni sulla maturità sono supporto gestionale: conservazione e condizioni della singola bottiglia restano determinanti.", more: "Altre guide" }
    : { guides: "Guides", home: "Vinaris", eyebrow: "Cellar guide", ctaTitle: "Turn your cellar into simpler decisions.", cta: "Build your cellar", disclaimer: "Maturity guidance supports cellar management: storage and the condition of each bottle remain decisive.", more: "More guides" };
  const related = guides.filter((item) => item.id !== guide.id).map((item) => `<a href="${pathFor(locale, item)}">${escapeHtml(item[locale].title)}</a>`).join("");
  const articleBody = content.sections.map(([heading, body]) => `<section><h2>${escapeHtml(heading)}</h2><p>${escapeHtml(body)}</p></section>`).join("");
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: content.title,
    description: content.description,
    inLanguage: locale,
    mainEntityOfPage: `${siteUrl}${currentPath}`,
    publisher: { "@type": "Organization", name: "Vinaris", url: `${siteUrl}/` },
  };
  return `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="robots" content="index,follow"><title>${escapeHtml(content.title)} | Vinaris</title><meta name="description" content="${escapeHtml(content.description)}"><link rel="canonical" href="${siteUrl}${currentPath}"><link rel="alternate" hreflang="${locale}" href="${siteUrl}${currentPath}"><link rel="alternate" hreflang="${otherLocale}" href="${siteUrl}${alternatePath}"><link rel="alternate" hreflang="x-default" href="${siteUrl}/"><meta property="og:type" content="article"><meta property="og:site_name" content="Vinaris"><meta property="og:title" content="${escapeHtml(content.title)}"><meta property="og:description" content="${escapeHtml(content.description)}"><meta property="og:url" content="${siteUrl}${currentPath}"><link rel="stylesheet" href="/guides.css"><script type="application/ld+json">${JSON.stringify(structuredData)}</script></head>
<body><header><a class="brand" href="/">Vinaris <span>· Private Cellar Intelligence</span></a><nav><a href="${locale === "it" ? "/it/guide/" : "/en/guides/"}">${copy.guides}</a><a href="${alternatePath}" lang="${otherLocale}">${otherLocale.toUpperCase()}</a><a class="header-cta" href="/#access">${copy.cta}</a></nav></header><main><nav class="crumb" aria-label="Breadcrumb"><a href="/">${copy.home}</a><span>/</span><a href="${locale === "it" ? "/it/guide/" : "/en/guides/"}">${copy.guides}</a></nav><article><p class="eyebrow">${copy.eyebrow}</p><h1>${escapeHtml(content.title)}</h1><p class="lead">${escapeHtml(content.lead)}</p>${articleBody}<aside class="disclaimer">${copy.disclaimer}</aside></article><section class="cta"><p class="eyebrow">Vinaris</p><h2>${copy.ctaTitle}</h2><p>${locale === "it" ? "Organizza bottiglie, posizioni, finestre di beva e memoria degustativa in un unico spazio privato." : "Organise bottles, locations, drinking windows, and tasting memory in one private place."}</p><a href="/#access">${copy.cta}</a></section><section class="related"><p class="eyebrow">${copy.more}</p><div>${related}</div></section></main><footer><a href="/privacy?lang=${locale}">${locale === "it" ? "Privacy" : "Privacy"}</a><a href="/terms?lang=${locale}">${locale === "it" ? "Condizioni" : "Terms"}</a><span>© ${new Date().getFullYear()} Vinaris</span></footer></body></html>`;
}

function guideIndex(locale) {
  const copy = locale === "it"
    ? { title: "Guide per organizzare e vivere meglio la cantina", description: "Guide pratiche per scegliere cosa bere, usare le finestre di beva e gestire una cantina di vino privata.", eyebrow: "Guide Vinaris", lead: "Strumenti pratici per trasformare bottiglie, annate e memoria degustativa in decisioni più semplici.", read: "Leggi la guida", cta: "Crea la tua cantina" }
    : { title: "Guides for organising and enjoying your wine cellar", description: "Practical guides for choosing what to drink, using drinking windows, and managing a private wine cellar.", eyebrow: "Vinaris guides", lead: "Practical tools for turning bottles, vintages, and tasting memory into simpler decisions.", read: "Read the guide", cta: "Build your cellar" };
  const categories = locale === "it"
    ? {
        "drink-next": "Bere bene oggi",
        "drinking-windows": "Finestre di beva",
        "cellar-organisation": "Gestione della cantina",
        "spreadsheet-vs-app": "Scegli il tuo sistema",
      }
    : {
        "drink-next": "Drink well today",
        "drinking-windows": "Drinking windows",
        "cellar-organisation": "Cellar management",
        "spreadsheet-vs-app": "Choose your system",
      };
  const cards = guides.map((guide) => `<article><p class="eyebrow">${categories[guide.id]}</p><h2>${escapeHtml(guide[locale].title)}</h2><p>${escapeHtml(guide[locale].description)}</p><a href="${pathFor(locale, guide)}">${copy.read} <span aria-hidden="true">→</span></a></article>`).join("");
  const otherLocale = locale === "it" ? "en" : "it";
  const currentPath = locale === "it" ? "/it/guide/" : "/en/guides/";
  const otherPath = otherLocale === "it" ? "/it/guide/" : "/en/guides/";
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="robots" content="index,follow"><title>${copy.title} | Vinaris</title><meta name="description" content="${copy.description}"><link rel="canonical" href="${siteUrl}${currentPath}"><link rel="alternate" hreflang="${locale}" href="${siteUrl}${currentPath}"><link rel="alternate" hreflang="${otherLocale}" href="${siteUrl}${otherPath}"><link rel="alternate" hreflang="x-default" href="${siteUrl}/"><meta property="og:type" content="website"><meta property="og:site_name" content="Vinaris"><meta property="og:title" content="${copy.title}"><meta property="og:description" content="${copy.description}"><link rel="stylesheet" href="/guides.css"></head><body><header><a class="brand" href="/">Vinaris <span>· Private Cellar Intelligence</span></a><nav><a href="${otherPath}" lang="${otherLocale}">${otherLocale.toUpperCase()}</a><a class="header-cta" href="/#access">${copy.cta}</a></nav></header><main><section class="guide-index-hero"><p class="eyebrow">${copy.eyebrow}</p><h1>${copy.title}</h1><p class="lead">${copy.lead}</p></section><section class="guide-grid">${cards}</section></main><footer><a href="/privacy?lang=${locale}">Privacy</a><a href="/terms?lang=${locale}">${locale === "it" ? "Condizioni" : "Terms"}</a><span>© ${new Date().getFullYear()} Vinaris</span></footer></body></html>`;
}

const css = `:root{color:#171713;background:#f7f4ec;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 92% 0,rgba(173,131,57,.14),transparent 25rem),#f7f4ec}header,main,footer{width:min(1120px,calc(100% - 40px));margin:auto}header{display:flex;align-items:center;justify-content:space-between;gap:24px;min-height:84px;border-bottom:1px solid #d5c9aa}.brand{color:#171713;font-family:Georgia,"Times New Roman",serif;font-size:1.35rem;font-weight:700;text-decoration:none}.brand span{color:#586159;font-family:Inter,ui-sans-serif,system-ui;font-size:.62rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}nav{display:flex;align-items:center;gap:18px}nav a,footer a{color:#4e574f;font-size:.82rem;font-weight:750;text-decoration:none}.header-cta,.cta a{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 16px;border-radius:999px;color:#fffaf1;background:#661d35;box-shadow:0 8px 20px rgba(102,29,53,.18);font-weight:850;text-decoration:none}.crumb{display:flex;gap:9px;margin:42px 0 20px;color:#586159}.crumb a{color:#586159;font-size:.8rem;text-decoration:none}.crumb span{color:#ad8339}article>h1,.guide-index-hero h1{max-width:14ch;margin:0;color:#280f18;font-family:Georgia,"Times New Roman",serif;font-size:clamp(2.65rem,6vw,5.4rem);font-weight:500;letter-spacing:-.055em;line-height:.96;text-wrap:balance}.eyebrow{margin:0 0 14px;color:#ad8339;font-size:.72rem;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.lead{max-width:680px;margin:26px 0 56px;color:#475148;font-size:clamp(1.1rem,2vw,1.35rem);line-height:1.65}article>section{max-width:720px;margin:0 0 42px}article>section h2,.cta h2,.guide-grid h2{margin:0 0 12px;color:#280f18;font-family:Georgia,"Times New Roman",serif;font-size:clamp(1.75rem,3vw,2.35rem);font-weight:500;letter-spacing:-.035em;line-height:1.05}article>section p,.cta p,.guide-grid p{margin:0;color:#4e574f;font-size:1.05rem;line-height:1.75}.disclaimer{max-width:720px;margin:58px 0;padding:18px 20px;border-left:3px solid #ad8339;background:#eee8dc;color:#4e574f;font-size:.9rem;line-height:1.6}.cta{margin:72px 0 38px;padding:clamp(28px,6vw,58px);border-radius:26px;background:#280f18;color:#fffaf1}.cta h2{max-width:13ch;color:#fffaf1}.cta p{max-width:610px;margin:16px 0 24px;color:#e6dfd2}.cta a{background:#f5e7c6;color:#421021;box-shadow:none}.related{margin:0 0 78px}.related>div{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.related a{min-height:94px;padding:16px;border:1px solid #d5c9aa;border-radius:14px;color:#315f4c;font-family:Georgia,"Times New Roman",serif;font-size:1.05rem;line-height:1.2;text-decoration:none}.guide-index-hero{padding:82px 0 58px}.guide-index-hero h1{max-width:12ch}.guide-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin-bottom:78px}.guide-grid article{display:flex;flex-direction:column;align-items:flex-start;min-height:285px;padding:28px;border:1px solid #d5c9aa;border-radius:20px;background:rgba(255,255,255,.45)}.guide-grid article h2{font-size:clamp(1.7rem,3vw,2.25rem)}.guide-grid article a{margin-top:auto;padding-top:24px;color:#661d35;font-size:.86rem;font-weight:850;text-decoration:none}footer{display:flex;gap:18px;align-items:center;min-height:90px;border-top:1px solid #d5c9aa}footer span{margin-left:auto;color:#586159;font-size:.75rem}@media(max-width:700px){header,main,footer{width:min(100% - 28px,1120px)}header{align-items:flex-start;flex-direction:column;padding:18px 0}header nav{width:100%;justify-content:space-between;gap:10px}.brand span{display:block;margin-top:4px}.related>div,.guide-grid{grid-template-columns:1fr}.guide-index-hero{padding:52px 0 38px}.guide-grid article{min-height:0}.lead{margin-bottom:42px}footer{flex-wrap:wrap;padding:18px 0}footer span{width:100%;margin-left:0}}`;

const sitemapUrls = [
  { path: "/", priority: "1.0", changefreq: "weekly" },
  { path: "/it/guide/", priority: "0.8", changefreq: "weekly" },
  { path: "/en/guides/", priority: "0.8", changefreq: "weekly" },
  ...guides.flatMap((guide) => [
    { path: pathFor("it", guide), priority: "0.7", changefreq: "monthly" },
    { path: pathFor("en", guide), priority: "0.7", changefreq: "monthly" },
  ]),
  { path: "/help", priority: "0.5", changefreq: "monthly" },
];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls.map(({ path, priority, changefreq }) => `  <url>\n    <loc>${siteUrl}${path}</loc>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`).join("\n")}\n</urlset>\n`;

await rm(new URL("it/guide/", publicRoot), { recursive: true, force: true });
await rm(new URL("en/guides/", publicRoot), { recursive: true, force: true });
await mkdir(new URL("it/guide/", publicRoot), { recursive: true });
await mkdir(new URL("en/guides/", publicRoot), { recursive: true });
await writeFile(new URL("guides.css", publicRoot), withFinalNewline(css), "utf8");
await writeFile(new URL("sitemap.xml", publicRoot), sitemap, "utf8");
await writeFile(new URL("it/guide/index.html", publicRoot), withFinalNewline(guideIndex("it")), "utf8");
await writeFile(new URL("en/guides/index.html", publicRoot), withFinalNewline(guideIndex("en")), "utf8");

for (const guide of guides) {
  for (const locale of ["it", "en"]) {
    const directory = new URL(`${locale === "it" ? "it/guide" : "en/guides"}/${guide[locale].slug}/`, publicRoot);
    await mkdir(directory, { recursive: true });
    await writeFile(new URL("index.html", directory), withFinalNewline(guidePage(locale, guide)), "utf8");
  }
}

console.log(`Generated ${guides.length * 2 + 2} SEO guide pages in ${fileURLToPath(publicRoot)}`);
