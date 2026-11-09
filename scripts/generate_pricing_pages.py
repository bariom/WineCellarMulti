"""Generate the static, crawlable pricing pages (EN /pricing/, IT /it/prezzi/).

Edit the copy below, then run: python scripts/generate_pricing_pages.py
Keep prices in sync with Stripe and with the landing copy (frontend/src/views/landing/content.ts).
"""
import html
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
public = root / "frontend" / "public"
PROOF = json.loads((root / "frontend" / "src" / "views" / "landing" / "proof.json").read_text(encoding="utf-8"))
e = html.escape

PAGES = {
    "en": {
        "path": "pricing/index.html",
        "url": "https://vinaris.app/pricing/",
        "alt_lang": "it", "alt_url": "https://vinaris.app/it/prezzi/", "alt_href": "/it/prezzi/", "alt_label": "IT",
        "title": "Vinaris pricing: free, or CHF 6 a month",
        "description": "Vinaris pricing in Swiss francs: Tasting is free for up to 15 active labels; Reserve is CHF 6 a month or CHF 60 a year for larger cellars and Premium features.",
        "brand_tag": "Digital cellar for collectors",
        "guides_href": "/en/guides/", "guides": "Guides",
        "home": "Vinaris", "crumb": "Pricing",
        "cta_header": "Create your free account",
        "eyebrow": "Pricing",
        "h1": "Start free. Pay when your cellar outgrows it.",
        "lead": "Two plans, prices in Swiss francs (CHF). Tasting is free for up to 15 active labels. Reserve opens the whole cellar and the Premium features.",
        "monthly": "Monthly", "annual": "Annual", "save": "Save 17%",
        "plans": [
            {
                "name": "Tasting", "label": "Free plan", "badge": "",
                "monthly": ("Free", ""), "annual": ("Free", ""),
                "note_monthly": "No card needed", "note_annual": "No card needed",
                "points": [
                    "Up to 15 active labels (labels, not bottles)",
                    "Drinking windows, locations, value and tasting notes",
                    "AI features with an AI Pack",
                    "Import from a CellarTracker CSV or a Vinaris backup",
                ],
                "cta": "Create your free account",
            },
            {
                "name": "Reserve", "label": "For collectors", "badge": "Recommended",
                "monthly": ("CHF 6", "/ month"), "annual": ("CHF 60", "/ year"),
                "note_monthly": "Or CHF 60 a year: save 17%", "note_annual": "CHF 5 a month, billed yearly: you save CHF 12",
                "anchor": "Each month, less than one glass of the Barolo in your cellar.",
                "points": [
                    "More than 15 active labels",
                    "Premium features, including photo memories",
                    "Shelf scanner in the wine shop",
                    "AI operations at a lower rate from your AI credit",
                ],
                "cta": "Start with Tasting, upgrade any time",
            },
        ],
        "safety": [
            "Payments handled by Stripe: Vinaris never sees or stores your card details.",
            "Manage or cancel your subscription from the billing portal in the app.",
            "Your cellar is visible only to you and the people you invite. Export your data or delete your account from the app at any time.",
        ],
        "ai_title": "AI Pack: prepaid AI credit",
        "ai_body": [
            "AI features (label recognition, receipt scanning, value estimates, the Sommelier) run on prepaid AI credit. You buy an AI Pack in the app, on any plan, and the cost of each AI operation is deducted from your balance. No external services to set up.",
            "The AI Pack price is shown in the app before you pay. An AI Pack does not replace the subscription needed for Premium features such as photo memories.",
        ],
        "compare_title": "Tasting and Reserve, side by side",
        "compare_head": ("", "Tasting", "Reserve"),
        "compare_rows": [
            ("Price", "Free", "CHF 6 / month or CHF 60 / year"),
            ("Active labels", "Up to 15", "More than 15"),
            ("Inventory, locations, drinking windows", "Included", "Included"),
            ("Value and price history", "Included", "Included"),
            ("Use your own OpenAI key", "Not included", "Included"),
            ("Photo memories", "Not included", "Included"),
            ("Shelf scanner", "Not included", "Included"),
            ("AI features", "With an AI Pack", "With an AI Pack, at a lower rate"),
        ],
        "faq_title": "Pricing questions",
        "faq": [
            ("What counts as an active label?", "A wine you still have bottles of. Six bottles of the same Barolo 2016 are one label, and wines you have finished drinking no longer count."),
            ("Why is the annual plan cheaper?", "CHF 60 a year instead of CHF 72 for twelve months: you save CHF 12, about 17%."),
            ("Can I cancel?", "Yes. Manage or cancel your subscription from the billing portal in the app. Payments go through Stripe."),
            ("Where do the value estimates come from?", "When you ask for an estimate, Vinaris searches the web for current prices at wine shops in the market you choose, for example Switzerland, and links each source."),
            ("Can I try it first?", "Yes. The demo opens a populated cellar without an account, and Tasting is free for up to 15 active labels."),
        ],
        "demo": "Explore the demo",
        "testimonials_title": "Collectors using it, in their own cellars",
        "updated": "updated",
        "privacy": "Privacy", "terms": "Terms", "pricing": "Pricing", "features": "Features", "features_href": "/features/", "about": "About", "about_href": "/about/", "contact": "Contact",
    },
    "it": {
        "path": "it/prezzi/index.html",
        "url": "https://vinaris.app/it/prezzi/",
        "alt_lang": "en", "alt_url": "https://vinaris.app/pricing/", "alt_href": "/pricing/", "alt_label": "EN",
        "title": "Prezzi Vinaris: gratis, o CHF 6 al mese",
        "description": "Prezzi di Vinaris in franchi svizzeri: Degustazione è gratis fino a 15 etichette attive; Riserva costa CHF 6 al mese o CHF 60 all’anno.",
        "brand_tag": "Cantina digitale per collezionisti",
        "guides_href": "/it/guide/", "guides": "Guide",
        "home": "Vinaris", "crumb": "Prezzi",
        "cta_header": "Crea il tuo account gratis",
        "eyebrow": "Prezzi",
        "h1": "Inizia gratis. Paghi quando la cantina cresce.",
        "lead": "Due piani, prezzi in franchi svizzeri (CHF). Degustazione è gratis fino a 15 etichette attive. Riserva apre tutta la cantina e le funzioni Premium.",
        "monthly": "Mensile", "annual": "Annuale", "save": "Risparmi il 17%",
        "plans": [
            {
                "name": "Degustazione", "label": "Piano gratuito", "badge": "",
                "monthly": ("Gratis", ""), "annual": ("Gratis", ""),
                "note_monthly": "Nessuna carta richiesta", "note_annual": "Nessuna carta richiesta",
                "points": [
                    "Fino a 15 etichette attive (etichette, non bottiglie)",
                    "Finestre di beva, posizioni, valore e note di degustazione",
                    "Funzioni AI con un AI Pack",
                    "Importazione da CSV di CellarTracker o da un backup Vinaris",
                ],
                "cta": "Crea il tuo account gratis",
            },
            {
                "name": "Riserva", "label": "Per collezionisti", "badge": "Consigliato",
                "monthly": ("CHF 6", "/ mese"), "annual": ("CHF 60", "/ anno"),
                "note_monthly": "Oppure CHF 60 all’anno: risparmi il 17%", "note_annual": "CHF 5 al mese, fatturati all’anno: risparmi CHF 12",
                "anchor": "Ogni mese, meno di un calice del Barolo che hai in cantina.",
                "points": [
                    "Oltre 15 etichette attive",
                    "Funzioni Premium, inclusi i ricordi fotografici",
                    "Scaffale AI in enoteca",
                    "Operazioni AI a tariffa ridotta dal tuo credito AI",
                ],
                "cta": "Parti da Degustazione, passa a Riserva quando vuoi",
            },
        ],
        "safety": [
            "Pagamenti con Stripe: Vinaris non vede né conserva i dati della tua carta.",
            "Gestisci o disdici l’abbonamento dal portale di fatturazione nell’app.",
            "La tua cantina è visibile solo a te e alle persone che inviti. Puoi esportare i dati o cancellare l’account dall’app in qualsiasi momento.",
        ],
        "ai_title": "AI Pack: credito AI prepagato",
        "ai_body": [
            "Le funzioni AI (riconoscimento etichette, scansione degli scontrini, stime di valore, il Sommelier) usano credito AI prepagato. Acquisti un AI Pack nell’app, con qualsiasi piano, e il costo di ogni operazione AI viene scalato dal saldo. Nessun servizio esterno da configurare.",
            "Il prezzo dell’AI Pack è indicato nell’app prima del pagamento. L’AI Pack non sostituisce l’abbonamento richiesto per le funzioni Premium, come i ricordi fotografici.",
        ],
        "compare_title": "Degustazione e Riserva, a confronto",
        "compare_head": ("", "Degustazione", "Riserva"),
        "compare_rows": [
            ("Prezzo", "Gratis", "CHF 6 / mese o CHF 60 / anno"),
            ("Etichette attive", "Fino a 15", "Oltre 15"),
            ("Inventario, posizioni, finestre di beva", "Incluso", "Incluso"),
            ("Valore e storico dei prezzi", "Incluso", "Incluso"),
            ("Usa la tua chiave OpenAI", "Non incluso", "Incluso"),
            ("Ricordi fotografici", "Non incluso", "Incluso"),
            ("Scaffale AI", "Non incluso", "Incluso"),
            ("Funzioni AI", "Con un AI Pack", "Con un AI Pack, a tariffa ridotta"),
        ],
        "faq_title": "Domande sui prezzi",
        "faq": [
            ("Che cos’è un’etichetta attiva?", "Un vino di cui hai ancora bottiglie. Sei bottiglie dello stesso Barolo 2016 sono un’etichetta sola, e i vini che hai finito di bere non contano più."),
            ("Perché il piano annuale costa meno?", "CHF 60 all’anno invece di CHF 72 per dodici mesi: risparmi CHF 12, circa il 17%."),
            ("Posso disdire?", "Sì. Gestisci o disdici l’abbonamento dal portale di fatturazione nell’app. I pagamenti passano da Stripe."),
            ("Da dove vengono le stime di valore?", "Quando chiedi una stima, Vinaris cerca sul web i prezzi attuali presso le enoteche del mercato che scegli, per esempio la Svizzera, e collega ogni fonte."),
            ("Posso provarlo prima?", "Sì. La demo apre una cantina già popolata senza account, e Degustazione è gratis fino a 15 etichette attive."),
        ],
        "demo": "Esplora la demo",
        "testimonials_title": "Chi lo usa, nella sua cantina",
        "updated": "aggiornato",
        "privacy": "Privacy", "terms": "Condizioni d’uso", "pricing": "Prezzi", "features": "Funzioni", "features_href": "/it/funzioni/", "about": "Chi siamo", "about_href": "/it/chi-siamo/", "contact": "Contatti",
    },
}



# HeyCatch analytics, the same snippet as the guide pages (generate-seo-guides.mjs).
HEYCATCH_SCRIPT = '<script type="module">import{analytics}from"https://esm.sh/@heycatch/sdk@0.8.5";let consent=null;try{consent=JSON.parse(localStorage.getItem("vinaris.cookie-consent")||"null")}catch{}const allowed=consent?.analytics===true;analytics.init({projectKey:"hck_pk_ReYnCnP_IDBPiL4ph4SBuNBMEk6Drc9y",install:{framework:"web",agent:"claude-code"},requestBatching:false,optOutCapturingByDefault:!allowed});if(allowed)analytics.optInCapturing();</script>'

def page(lang: str, c: dict) -> str:
    signup = f"/?signup=1&amp;lang={lang}"
    structured = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "Product",
                "name": "Vinaris",
                "description": c["description"],
                "url": c["url"],
                "brand": {"@type": "Organization", "name": "Vinaris", "url": "https://vinaris.app/"},
                "offers": [
                    {"@type": "Offer", "name": c["plans"][0]["name"], "price": "0", "priceCurrency": "CHF", "url": c["url"]},
                    {"@type": "Offer", "name": f'{c["plans"][1]["name"]} ({c["monthly"]})', "price": "6", "priceCurrency": "CHF", "url": c["url"]},
                    {"@type": "Offer", "name": f'{c["plans"][1]["name"]} ({c["annual"]})', "price": "60", "priceCurrency": "CHF", "url": c["url"]},
                ],
            },
            {
                "@type": "FAQPage",
                "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in c["faq"]],
            },
        ],
    }
    plans_html = []
    for plan in c["plans"]:
        badge = f'<span class="badge">{e(plan["badge"])}</span>' if plan["badge"] else ""
        cls = "plan is-recommended" if plan["badge"] else "plan"
        def price(kind: str) -> str:
            amount, period = plan[kind]
            period_html = f" <span>{e(period)}</span>" if period else ""
            return (f'<div class="price-{kind}"><p class="price"><strong>{e(amount)}</strong>{period_html}</p>'
                    f'<p class="price-note">{e(plan["note_" + kind])}</p></div>')
        points = "".join(f"<li>{e(point)}</li>" for point in plan["points"])
        anchor = f'<p class="price-anchor">{e(plan["anchor"])}</p>' if plan.get("anchor") else ""
        plans_html.append(
            f'<article class="{cls}" aria-labelledby="plan-{e(plan["name"].lower())}">{badge}'
            f'<p class="eyebrow">{e(plan["label"])}</p><h2 id="plan-{e(plan["name"].lower())}">{e(plan["name"])}</h2>'
            f'{price("monthly")}{price("annual")}{anchor}<ul>{points}</ul>'
            f'<a class="plan-cta" href="{signup}">{e(plan["cta"])}</a></article>'
        )
    head_cells = "".join(f'<th scope="col">{e(cell)}</th>' for cell in c["compare_head"])
    rows = "".join(
        f'<tr><th scope="row">{e(label)}</th><td data-plan="{e(c["compare_head"][1])}">{e(a)}</td><td data-plan="{e(c["compare_head"][2])}">{e(b)}</td></tr>'
        for label, a, b in c["compare_rows"]
    )
    faq = "".join(f"<details><summary>{e(q)}</summary><p>{e(a)}</p></details>" for q, a in c["faq"])
    safety = "".join(f"<li>{e(line)}</li>" for line in c["safety"])
    ai_body = "".join(f"<p>{e(line)}</p>" for line in c["ai_body"])
    # Real proof only, shared with the homepage (frontend/src/views/landing/proof.json).
    testimonials = ""
    if PROOF["testimonials"]:
        quotes = "".join(
            f'<figure><blockquote>“{e(item["quote"][lang])}”</blockquote><figcaption>'
            + (f'<img src="{e(item["photo"])}" alt="" width="44" height="44" loading="lazy">' if item.get("photo") else "")
            + f'<span><strong>{e(item["firstName"])}</strong><small>{e(item["cellar"][lang])}</small></span></figcaption></figure>'
            for item in PROOF["testimonials"]
        )
        testimonials = f'<section class="testimonials" aria-labelledby="testimonials-title"><h2 id="testimonials-title">{e(c["testimonials_title"])}</h2><div>{quotes}</div></section>'
    signals = []
    if PROOF["usage"]:
        usage = PROOF["usage"]
        signals.append(f'<span>{e(usage["line"][lang])} <small>· {e(c["updated"])} <time datetime="{e(usage["updated"])}">{e(usage["updated"])}</time></small></span>')
    if PROOF["press"]:
        item = PROOF["press"][0]
        signals.append(f'<span><a href="{e(item["url"])}" rel="noopener">{e(item["source"])}</a> <small>· <time datetime="{e(item["date"])}">{e(item["date"])}</time></small></span>')
    credibility = f'<p class="credibility">{"".join(signals)}</p>' if signals else ""
    return f"""<!doctype html>
<html lang="{lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="robots" content="index,follow"><title>{e(c["title"])}</title><meta name="description" content="{e(c["description"])}"><link rel="canonical" href="{c["url"]}"><link rel="alternate" hreflang="{lang}" href="{c["url"]}"><link rel="alternate" hreflang="{c["alt_lang"]}" href="{c["alt_url"]}"><link rel="alternate" hreflang="x-default" href="https://vinaris.app/pricing/"><meta property="og:type" content="website"><meta property="og:site_name" content="Vinaris"><meta property="og:title" content="{e(c["title"])}"><meta property="og:description" content="{e(c["description"])}"><meta property="og:url" content="{c["url"]}"><meta property="og:image" content="https://vinaris.app/og/pricing-{lang}.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{e(c["title"])}"><meta name="twitter:description" content="{e(c["description"])}"><meta name="twitter:image" content="https://vinaris.app/og/pricing-{lang}.jpg"><link rel="icon" href="/icons/icon-192.png" type="image/png"><link rel="stylesheet" href="/guides.css"><link rel="stylesheet" href="/pricing.css">{HEYCATCH_SCRIPT}<script type="application/ld+json">{json.dumps(structured, ensure_ascii=False)}</script></head>
<body><header><a class="brand" href="/?lang={lang}">Vinaris <span>· {e(c["brand_tag"])}</span></a><nav><a href="{c["guides_href"]}">{e(c["guides"])}</a><a href="{c["alt_href"]}" lang="{c["alt_lang"]}">{c["alt_label"]}</a><a class="header-cta" href="{signup}">{e(c["cta_header"])}</a></nav></header>
<main><nav class="crumb" aria-label="Breadcrumb"><a href="/?lang={lang}">{e(c["home"])}</a><span>/</span><span>{e(c["crumb"])}</span></nav>
<section class="pricing-hero"><p class="eyebrow">{e(c["eyebrow"])}</p><h1>{e(c["h1"])}</h1><p class="lead">{e(c["lead"])}</p></section>
<section aria-label="{e(c["eyebrow"])}">
<input type="radio" name="billing" id="billing-monthly" checked><input type="radio" name="billing" id="billing-annual">
<div class="billing-toggle"><label for="billing-monthly">{e(c["monthly"])}</label><label for="billing-annual">{e(c["annual"])} <small>{e(c["save"])}</small></label></div>
<div class="plans">{"".join(plans_html)}</div>
<ul class="safety">{safety}</ul>
{credibility}
</section>
{testimonials}
<section class="ai-pack" aria-labelledby="ai-pack-title"><h2 id="ai-pack-title">{e(c["ai_title"])}</h2>{ai_body}</section>
<section class="compare" aria-labelledby="compare-title"><h2 id="compare-title">{e(c["compare_title"])}</h2><div class="compare-wrap"><table><thead><tr>{head_cells}</tr></thead><tbody>{rows}</tbody></table></div></section>
<section class="pricing-faq" aria-labelledby="faq-title"><h2 id="faq-title">{e(c["faq_title"])}</h2>{faq}</section>
<section class="cta"><p class="eyebrow">Vinaris</p><h2>{e(c["h1"])}</h2><p>{e(c["lead"])}</p><a href="{signup}">{e(c["cta_header"])}</a> <a href="/?lang={lang}">{e(c["demo"])}</a></section>
</main><footer><a href="{c["features_href"]}">{e(c["features"])}</a><a href="{c["guides_href"]}">{e(c["guides"])}</a><a href="{c["url"]}">{e(c["pricing"])}</a><a href="{c["about_href"]}">{e(c["about"])}</a><a href="mailto:info@vinaris.app">{e(c["contact"])}</a><a href="/privacy?lang={lang}">{e(c["privacy"])}</a><a href="/terms?lang={lang}">{e(c["terms"])}</a><span>© 2026 Vinaris · Omar Bariffi</span></footer></body></html>
"""


for lang, content in PAGES.items():
    target = public / content["path"]
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(page(lang, content), encoding="utf-8")
    print("wrote", target)
