// Generates the static, crawlable public pages: the cellar guides (IT/EN), the
// guide indexes, the about pages, the 404 page and sitemap.xml. Guide text
// lives in scripts/seo-guides/<id>.mjs. Run `npm run generate:seo-guides`
// after editing any of them, then commit the generated files.
//
// Sitemap lastmod values are honest: the last commit that touched each page's
// source, or today when that source has uncommitted changes.
import { execFileSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import drinkNext from "./seo-guides/drink-next.mjs";
import drinkingWindows from "./seo-guides/drinking-windows.mjs";
import cellarOrganisation from "./seo-guides/cellar-organisation.mjs";
import spreadsheetVsApp from "./seo-guides/spreadsheet-vs-app.mjs";

const publicRoot = new URL("../public/", import.meta.url);
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const siteUrl = "https://vinaris.app";
const contactEmail = "info@vinaris.app";
const author = { "@type": "Person", name: "Omar Bariffi", url: "https://www.linkedin.com/in/omarbariffi/" };
const organization = {
  "@type": "Organization",
  "@id": `${siteUrl}/#organization`,
  name: "Vinaris",
  url: `${siteUrl}/`,
  logo: { "@type": "ImageObject", url: `${siteUrl}/icons/icon-512.png` },
  email: contactEmail,
};
// The guides first went live on this date (git: "Add consent mode and SEO guides").
const guidesPublished = "2026-09-02";

const guides = [drinkNext, drinkingWindows, cellarOrganisation, spreadsheetVsApp];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function lastModified(paths) {
  try {
    const dirty = execFileSync("git", ["status", "--porcelain", "--", ...paths], { cwd: repoRoot, encoding: "utf8" }).trim();
    if (dirty) return today();
    const date = execFileSync("git", ["log", "-1", "--format=%cs", "--", ...paths], { cwd: repoRoot, encoding: "utf8" }).trim();
    return date || today();
  } catch {
    return today();
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}

function withFinalNewline(value) {
  return value.endsWith("\n") ? value : `${value}\n`;
}

// Rendered titles must be 30-60 characters. Add the brand only when it fits.
function pageTitle(title) {
  const branded = `${title} | Vinaris`;
  if (branded.length <= 60) return branded;
  if (title.length >= 30 && title.length <= 60) return title;
  throw new Error(`Title outside 30-60 characters: "${title}" (${title.length})`);
}

function checkDescription(description, where) {
  if (description.length < 110 || description.length > 160) {
    throw new Error(`Meta description for ${where} is ${description.length} characters; keep it within 110-160.`);
  }
  return description;
}

const guidesPath = (locale) => (locale === "it" ? "/it/guide/" : "/en/guides/");
const pricingPath = (locale) => (locale === "it" ? "/it/prezzi/" : "/pricing/");
const aboutPath = (locale) => (locale === "it" ? "/it/chi-siamo/" : "/about/");

function pathFor(locale, guide) {
  return `${guidesPath(locale)}${guide[locale].slug}/`;
}

const chrome = {
  it: { tagline: "Cantina digitale per collezionisti", guides: "Guide", pricing: "Prezzi", about: "Chi siamo", contact: "Contatti", privacy: "Privacy", terms: "Condizioni", cta: "Crea la tua cantina", ogLocale: "it_IT" },
  en: { tagline: "Digital cellar for collectors", guides: "Guides", pricing: "Pricing", about: "About", contact: "Contact", privacy: "Privacy", terms: "Terms", cta: "Build your cellar", ogLocale: "en_GB" },
};

function head({ locale, title, description, path, alternatePath, ogType, image, structuredData }) {
  const otherLocale = locale === "it" ? "en" : "it";
  const fullTitle = pageTitle(title);
  const imageUrl = `${siteUrl}${image}`;
  return `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="robots" content="index,follow"><title>${escapeHtml(fullTitle)}</title><meta name="description" content="${escapeHtml(checkDescription(description, path))}"><link rel="canonical" href="${siteUrl}${path}"><link rel="alternate" hreflang="${locale}" href="${siteUrl}${path}"><link rel="alternate" hreflang="${otherLocale}" href="${siteUrl}${alternatePath}"><link rel="alternate" hreflang="x-default" href="${siteUrl}/"><meta property="og:type" content="${ogType}"><meta property="og:site_name" content="Vinaris"><meta property="og:locale" content="${chrome[locale].ogLocale}"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${siteUrl}${path}"><meta property="og:image" content="${imageUrl}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}"><meta name="twitter:image" content="${imageUrl}"><link rel="icon" href="/icons/icon-192.png" type="image/png"><link rel="stylesheet" href="/guides.css">${structuredData ? `<script type="application/ld+json">${JSON.stringify(structuredData)}</script>` : ""}</head>`;
}

function header(locale, alternatePath) {
  const copy = chrome[locale];
  const otherLocale = locale === "it" ? "en" : "it";
  return `<header><a class="brand" href="/?lang=${locale}">Vinaris <span>· ${copy.tagline}</span></a><nav><a href="${guidesPath(locale)}">${copy.guides}</a><a href="${pricingPath(locale)}">${copy.pricing}</a><a href="${alternatePath}" lang="${otherLocale}">${otherLocale.toUpperCase()}</a><a class="header-cta" href="/?signup=1&amp;lang=${locale}">${copy.cta}</a></nav></header>`;
}

function footer(locale) {
  const copy = chrome[locale];
  return `<footer><a href="${guidesPath(locale)}">${copy.guides}</a><a href="${pricingPath(locale)}">${copy.pricing}</a><a href="${aboutPath(locale)}">${copy.about}</a><a href="mailto:${contactEmail}">${copy.contact}</a><a href="/privacy?lang=${locale}">${copy.privacy}</a><a href="/terms?lang=${locale}">${copy.terms}</a><span>© ${new Date().getFullYear()} Vinaris · Omar Bariffi</span></footer>`;
}

function sectionHtml(section) {
  const paragraphs = section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");
  const list = section.list?.length ? `<ul>${section.list.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "";
  return `<section><h2>${escapeHtml(section.heading)}</h2>${paragraphs}${list}</section>`;
}

function guidePage(locale, guide) {
  const content = guide[locale];
  const otherLocale = locale === "it" ? "en" : "it";
  const currentPath = pathFor(locale, guide);
  const alternatePath = pathFor(otherLocale, guide);
  const image = `/og/guide-${content.slug}.jpg`;
  const copy = locale === "it"
    ? { eyebrow: "Guida per la cantina", byline: "Di", published: "Pubblicata il", updated: "aggiornata il", ctaTitle: "Trasforma la cantina in decisioni più semplici.", ctaBody: "Organizza bottiglie, posizioni, finestre di beva e memoria degustativa in un unico spazio privato.", disclaimer: "Le indicazioni sulla maturità sono supporto gestionale: conservazione e condizioni della singola bottiglia restano determinanti.", more: "Altre guide", all: "Tutte le guide" }
    : { eyebrow: "Cellar guide", byline: "By", published: "Published", updated: "updated", ctaTitle: "Turn your cellar into simpler decisions.", ctaBody: "Organise bottles, locations, drinking windows, and tasting memory in one private place.", disclaimer: "Maturity guidance supports cellar management: storage and the condition of each bottle remain decisive.", more: "More guides", all: "All guides" };
  const dateModified = guide.dateModified;
  const formatDate = (value) => new Intl.DateTimeFormat(locale === "it" ? "it-CH" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
  const related = guides.filter((item) => item.id !== guide.id).map((item) => `<a href="${pathFor(locale, item)}">${escapeHtml(item[locale].title)}</a>`).join("");
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: content.title,
    description: content.description,
    image: [`${siteUrl}${image}`],
    datePublished: guidesPublished,
    dateModified,
    author,
    publisher: organization,
    inLanguage: locale,
    mainEntityOfPage: `${siteUrl}${currentPath}`,
  };
  return `<!doctype html>
<html lang="${locale}">${head({ locale, title: content.title, description: content.description, path: currentPath, alternatePath, ogType: "article", image, structuredData })}
<body>${header(locale, alternatePath)}<main><nav class="crumb" aria-label="Breadcrumb"><a href="/?lang=${locale}">Vinaris</a><span>/</span><a href="${guidesPath(locale)}">${chrome[locale].guides}</a></nav><article><p class="eyebrow">${copy.eyebrow}</p><h1>${escapeHtml(content.title)}</h1><p class="byline">${copy.byline} <a href="${aboutPath(locale)}">Omar Bariffi</a> · ${copy.published} <time datetime="${guidesPublished}">${formatDate(guidesPublished)}</time>${dateModified !== guidesPublished ? `, ${copy.updated} <time datetime="${dateModified}">${formatDate(dateModified)}</time>` : ""}</p><p class="lead">${escapeHtml(content.lead)}</p>${content.sections.map(sectionHtml).join("")}<aside class="disclaimer">${copy.disclaimer}</aside></article><section class="cta"><p class="eyebrow">Vinaris</p><h2>${copy.ctaTitle}</h2><p>${copy.ctaBody}</p><a href="/?signup=1&amp;lang=${locale}">${chrome[locale].cta}</a></section><section class="related"><p class="eyebrow">${copy.more}</p><div>${related}</div><p class="related-all"><a href="${guidesPath(locale)}">${copy.all} →</a></p></section></main>${footer(locale)}</body></html>`;
}

function guideIndex(locale) {
  const copy = locale === "it"
    ? { title: "Guide per organizzare e vivere meglio la cantina", h1: "Guide per organizzare e vivere meglio la cantina", description: "Quattro guide pratiche per collezionisti: quale bottiglia aprire oggi, come leggere le finestre di beva, come organizzare la cantina, Excel o app.", eyebrow: "Guide Vinaris", lead: "Strumenti pratici per trasformare bottiglie, annate e memoria degustativa in decisioni più semplici.", read: "Leggi la guida" }
    : { title: "Wine cellar guides for collectors", h1: "Guides for organising and enjoying your wine cellar", description: "Four practical guides for collectors: which bottle to open today, how drinking windows work, how to organise a cellar, and spreadsheet or app.", eyebrow: "Vinaris guides", lead: "Practical tools for turning bottles, vintages, and tasting memory into simpler decisions.", read: "Read the guide" };
  const categories = locale === "it"
    ? { "drink-next": "Bere bene oggi", "drinking-windows": "Finestre di beva", "cellar-organisation": "Gestione della cantina", "spreadsheet-vs-app": "Scegli il tuo sistema" }
    : { "drink-next": "Drink well today", "drinking-windows": "Drinking windows", "cellar-organisation": "Cellar management", "spreadsheet-vs-app": "Choose your system" };
  const cards = guides.map((guide) => `<article><p class="eyebrow">${categories[guide.id]}</p><h2>${escapeHtml(guide[locale].title)}</h2><p>${escapeHtml(guide[locale].description)}</p><a href="${pathFor(locale, guide)}">${copy.read} <span aria-hidden="true">→</span></a></article>`).join("");
  const otherLocale = locale === "it" ? "en" : "it";
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: copy.title,
    description: copy.description,
    inLanguage: locale,
    url: `${siteUrl}${guidesPath(locale)}`,
    publisher: organization,
    hasPart: guides.map((guide) => ({ "@type": "BlogPosting", headline: guide[locale].title, url: `${siteUrl}${pathFor(locale, guide)}` })),
  };
  return `<!doctype html><html lang="${locale}">${head({ locale, title: copy.title, description: copy.description, path: guidesPath(locale), alternatePath: guidesPath(otherLocale), ogType: "website", image: `/og/guides-${locale}.jpg`, structuredData })}<body>${header(locale, guidesPath(otherLocale))}<main><section class="guide-index-hero"><p class="eyebrow">${copy.eyebrow}</p><h1>${copy.h1}</h1><p class="lead">${copy.lead}</p></section><section class="guide-grid">${cards}</section></main>${footer(locale)}</body></html>`;
}

function aboutPage(locale) {
  const otherLocale = locale === "it" ? "en" : "it";
  const copy = locale === "it"
    ? {
        title: "Chi siamo: chi costruisce Vinaris e dove",
        description: "Chi costruisce Vinaris, la cantina digitale per collezionisti di vino: Omar Bariffi, collezionista in Ticino. Dove siamo e come scriverci.",
        eyebrow: "Chi siamo",
        h1: "Chi costruisce Vinaris",
        lead: "Vinaris è una cantina digitale privata per collezionisti di vino, costruita in Ticino, in Svizzera, da Omar Bariffi.",
        sections: [
          { heading: "Chi c’è dietro Vinaris?", paragraphs: ["Vinaris è costruito da Omar Bariffi, collezionista di vino in Ticino e fondatore di Vinaris. Il lavoro sull’app è iniziato nel 2026."] },
          { heading: "Dove ha sede Vinaris?", paragraphs: ["Vinaris ha sede in Ticino, in Svizzera. I prezzi sono in franchi svizzeri e l’app è disponibile in italiano e in inglese."] },
          { heading: "Cosa fa Vinaris?", paragraphs: ["Vinaris tiene in ordine la cantina che possiedi: cosa hai e dove si trova, quando aprire ogni bottiglia e quanto vale oggi."], list: ["Bottiglie, posizioni, quantità e prezzo d’acquisto", "Finestre di beva per ogni bottiglia, divise in fasi", "Stime di valore dai prezzi delle enoteche, con le fonti linkate", "Un sommelier AI che suggerisce cosa aprire dalla tua cantina", "Gratis fino a 15 etichette attive; Riserva a CHF 6 al mese"] },
          { heading: "Come posso contattare Vinaris?", paragraphs: ["Scrivi a info@vinaris.app. Se hai già un account, puoi usare anche il modulo di contatto dentro l’app."] },
        ],
        write: "Scrivi a info@vinaris.app",
        profile: "Omar Bariffi su LinkedIn",
      }
    : {
        title: "About Vinaris: who builds it and where",
        description: "Who builds Vinaris, the digital wine cellar for collectors: Omar Bariffi, a wine collector in Ticino, Switzerland. Where we are and how to write to us.",
        eyebrow: "About",
        h1: "Who builds Vinaris",
        lead: "Vinaris is a private digital wine cellar for collectors, built in Ticino, Switzerland, by Omar Bariffi.",
        sections: [
          { heading: "Who is behind Vinaris?", paragraphs: ["Vinaris is built by Omar Bariffi, a wine collector in Ticino and the founder of Vinaris. Work on the app started in 2026."] },
          { heading: "Where is Vinaris based?", paragraphs: ["Vinaris is based in Ticino, Switzerland. Prices are in Swiss francs and the app is available in Italian and English."] },
          { heading: "What does Vinaris do?", paragraphs: ["Vinaris keeps track of the cellar you own: what you have and where it is, when to open each bottle and what it is worth today."], list: ["Bottles, storage locations, quantities and purchase price", "A drinking window for every bottle, split into stages", "Value estimates from wine-shop prices, with the sources linked", "An AI sommelier that suggests what to open from your own cellar", "Free up to 15 active labels; Reserve at CHF 6 a month"] },
          { heading: "How can I contact Vinaris?", paragraphs: ["Write to info@vinaris.app. If you already have an account, you can also use the contact form inside the app."] },
        ],
        write: "Write to info@vinaris.app",
        profile: "Omar Bariffi on LinkedIn",
      };
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: copy.title,
    url: `${siteUrl}${aboutPath(locale)}`,
    inLanguage: locale,
    mainEntity: {
      ...organization,
      founder: author,
      address: { "@type": "PostalAddress", addressRegion: "Ticino", addressCountry: "CH" },
      contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: contactEmail, availableLanguage: ["it", "en"] },
    },
  };
  return `<!doctype html><html lang="${locale}">${head({ locale, title: copy.title, description: copy.description, path: aboutPath(locale), alternatePath: aboutPath(otherLocale), ogType: "website", image: `/og/about-${locale}.jpg`, structuredData })}<body>${header(locale, aboutPath(otherLocale))}<main><article><p class="eyebrow">${copy.eyebrow}</p><h1>${copy.h1}</h1><p class="lead">${copy.lead}</p>${copy.sections.map(sectionHtml).join("")}<p class="about-actions"><a class="header-cta" href="mailto:${contactEmail}">${copy.write}</a><a href="${author.url}" rel="me noopener" target="_blank">${copy.profile}</a></p></article></main>${footer(locale)}</body></html>`;
}

function notFoundPage() {
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="robots" content="noindex"><title>Pagina non trovata | Vinaris</title><link rel="icon" href="/icons/icon-192.png" type="image/png"><link rel="stylesheet" href="/guides.css"></head><body><header><a class="brand" href="/">Vinaris <span>· ${chrome.it.tagline}</span></a></header><main><article class="not-found"><p class="eyebrow">404</p><h1>Pagina non trovata</h1><p class="lead">Questo indirizzo non esiste. <span lang="en">This page does not exist.</span></p><ul><li><a href="/">Vinaris</a></li><li><a href="/it/guide/">Guide</a> · <a href="/en/guides/" lang="en">Guides</a></li><li><a href="/it/prezzi/">Prezzi</a> · <a href="/pricing/" lang="en">Pricing</a></li><li><a href="mailto:${contactEmail}">${contactEmail}</a></li></ul></article></main></body></html>`;
}

const css = `:root{color:#171713;background:#f7f4ec;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 92% 0,rgba(173,131,57,.14),transparent 25rem),#f7f4ec}header,main,footer{width:min(1120px,calc(100% - 40px));margin:auto}header{display:flex;align-items:center;justify-content:space-between;gap:24px;min-height:84px;border-bottom:1px solid #d5c9aa}.brand{color:#171713;font-family:Georgia,"Times New Roman",serif;font-size:1.35rem;font-weight:700;text-decoration:none}.brand span{color:#586159;font-family:Inter,ui-sans-serif,system-ui;font-size:.62rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}nav{display:flex;align-items:center;gap:18px}nav a,footer a{color:#4e574f;font-size:.82rem;font-weight:750;text-decoration:none}.header-cta,.cta a{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 16px;border-radius:999px;color:#fffaf1;background:#661d35;box-shadow:0 8px 20px rgba(102,29,53,.18);font-weight:850;text-decoration:none}.crumb{display:flex;gap:9px;margin:42px 0 20px;color:#586159}.crumb a{color:#586159;font-size:.8rem;text-decoration:none}.crumb span{color:#ad8339}article>h1,.guide-index-hero h1{max-width:14ch;margin:0;color:#280f18;font-family:Georgia,"Times New Roman",serif;font-size:clamp(2.65rem,6vw,5.4rem);font-weight:500;letter-spacing:-.055em;line-height:.96;text-wrap:balance}.eyebrow{margin:0 0 14px;color:#ad8339;font-size:.72rem;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.byline{margin:22px 0 0;color:#586159;font-size:.85rem}.byline a{color:#661d35;font-weight:750}.lead{max-width:680px;margin:26px 0 56px;color:#475148;font-size:clamp(1.1rem,2vw,1.35rem);line-height:1.65}article>section{max-width:720px;margin:0 0 42px}article>section h2,.cta h2,.guide-grid h2{margin:0 0 12px;color:#280f18;font-family:Georgia,"Times New Roman",serif;font-size:clamp(1.75rem,3vw,2.35rem);font-weight:500;letter-spacing:-.035em;line-height:1.05}article>section p,.cta p,.guide-grid p{margin:0;color:#4e574f;font-size:1.05rem;line-height:1.75}article>section p+p{margin-top:14px}article>section ul,.not-found ul{margin:16px 0 0;padding-left:1.2em;color:#4e574f;font-size:1.02rem;line-height:1.7}article>section li+li{margin-top:6px}.disclaimer{max-width:720px;margin:58px 0;padding:18px 20px;border-left:3px solid #ad8339;background:#eee8dc;color:#4e574f;font-size:.9rem;line-height:1.6}.cta{margin:72px 0 38px;padding:clamp(28px,6vw,58px);border-radius:26px;background:#280f18;color:#fffaf1}.cta h2{max-width:13ch;color:#fffaf1}.cta p{max-width:610px;margin:16px 0 24px;color:#e6dfd2}.cta a{background:#f5e7c6;color:#421021;box-shadow:none}.related{margin:0 0 78px}.related>div{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.related a{min-height:94px;padding:16px;border:1px solid #d5c9aa;border-radius:14px;color:#315f4c;font-family:Georgia,"Times New Roman",serif;font-size:1.05rem;line-height:1.2;text-decoration:none}.related .related-all{margin:16px 0 0}.related .related-all a{min-height:0;padding:0;border:0;color:#661d35;font-family:inherit;font-size:.86rem;font-weight:850}.guide-index-hero{padding:82px 0 58px}.guide-index-hero h1{max-width:12ch}.guide-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin-bottom:78px}.guide-grid article{display:flex;flex-direction:column;align-items:flex-start;min-height:285px;padding:28px;border:1px solid #d5c9aa;border-radius:20px;background:rgba(255,255,255,.45)}.guide-grid article h2{font-size:clamp(1.7rem,3vw,2.25rem)}.guide-grid article a{margin-top:auto;padding-top:24px;color:#661d35;font-size:.86rem;font-weight:850;text-decoration:none}main>article:not(.not-found){padding-top:42px}.about-actions{display:flex;flex-wrap:wrap;align-items:center;gap:18px;margin:8px 0 78px}.about-actions a:not(.header-cta){color:#661d35;font-weight:750}.not-found{padding:72px 0}.not-found a{color:#661d35;font-weight:750}footer{display:flex;flex-wrap:wrap;gap:12px 18px;align-items:center;min-height:90px;padding:18px 0;border-top:1px solid #d5c9aa}footer span{margin-left:auto;color:#586159;font-size:.75rem}@media(max-width:700px){header,main,footer{width:min(100% - 28px,1120px)}header{align-items:flex-start;flex-direction:column;padding:18px 0}header nav{width:100%;justify-content:space-between;gap:10px}.brand span{display:block;margin-top:4px}.related>div,.guide-grid{grid-template-columns:1fr}.guide-index-hero{padding:52px 0 38px}.guide-grid article{min-height:0}.lead{margin-bottom:42px}footer a{min-height:44px;display:inline-flex;align-items:center}footer span{width:100%;margin-left:0}}`;

for (const guide of guides) {
  guide.dateModified = lastModified([`frontend/scripts/seo-guides/${guide.id}.mjs`]);
}

const sitemapUrls = [
  { path: "/", priority: "1.0", changefreq: "weekly", lastmod: lastModified(["frontend/index.html", "frontend/src/views/PublicLanding.tsx", "frontend/src/views/landing"]) },
  ...["en", "it"].map((locale) => ({ path: pricingPath(locale), priority: "0.9", changefreq: "monthly", lastmod: lastModified(["scripts/generate_pricing_pages.py", "frontend/src/views/landing/proof.json"]) })),
  ...["en", "it"].map((locale) => ({ path: aboutPath(locale), priority: "0.6", changefreq: "yearly", lastmod: lastModified(["frontend/scripts/generate-seo-guides.mjs"]) })),
  ...["it", "en"].map((locale) => ({ path: guidesPath(locale), priority: "0.8", changefreq: "weekly", lastmod: guides.map((guide) => guide.dateModified).sort().at(-1) })),
  ...guides.flatMap((guide) => ["it", "en"].map((locale) => ({ path: pathFor(locale, guide), priority: "0.7", changefreq: "monthly", lastmod: guide.dateModified }))),
];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls.map(({ path, priority, changefreq, lastmod }) => `  <url>\n    <loc>${siteUrl}${path}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`).join("\n")}\n</urlset>\n`;

await rm(new URL("it/guide/", publicRoot), { recursive: true, force: true });
await rm(new URL("en/guides/", publicRoot), { recursive: true, force: true });
for (const directory of ["it/guide/", "en/guides/", "about/", "it/chi-siamo/"]) await mkdir(new URL(directory, publicRoot), { recursive: true });
await writeFile(new URL("guides.css", publicRoot), withFinalNewline(css), "utf8");
await writeFile(new URL("sitemap.xml", publicRoot), sitemap, "utf8");
await writeFile(new URL("404.html", publicRoot), withFinalNewline(notFoundPage()), "utf8");
for (const locale of ["it", "en"]) {
  await writeFile(new URL(`${guidesPath(locale).slice(1)}index.html`, publicRoot), withFinalNewline(guideIndex(locale)), "utf8");
  await writeFile(new URL(`${aboutPath(locale).slice(1)}index.html`, publicRoot), withFinalNewline(aboutPage(locale)), "utf8");
}

for (const guide of guides) {
  for (const locale of ["it", "en"]) {
    const directory = new URL(pathFor(locale, guide).slice(1), publicRoot);
    await mkdir(directory, { recursive: true });
    await writeFile(new URL("index.html", directory), withFinalNewline(guidePage(locale, guide)), "utf8");
  }
}

console.log(`Generated ${guides.length * 2 + 5} public pages and sitemap.xml in ${fileURLToPath(publicRoot)}`);
