import type { PersonalDashboardWidget, PersonalDashboardWidgetId } from "../types";

export const personalDashboardCatalogue: Array<{ id: PersonalDashboardWidgetId; it: [string, string]; en: [string, string] }> = [
  {"id": "collection_value", "it": ["Evoluzione del valore", "Andamento delle valutazioni e valore attuale."], "en": ["Value evolution", "Valuation trend and current value."]},
  {"id": "purchase_value", "it": ["Valore e costo d’acquisto", "Confronto sulle bottiglie con entrambi i valori."], "en": ["Value and purchase cost", "Compare bottles with both values available."]},
  {"id": "featured", "it": ["Bottiglie chiave", "Tre posizioni significative, fotografate e motivate."], "en": ["Key bottles", "Three significant positions with photos and reasons."]},
  {"id": "top_value", "it": ["Le più preziose", "Il podio per valore unitario."], "en": ["Most valuable bottles", "The top three by unit value."]},
  {"id": "value_changes", "it": ["Variazioni di valore", "Le variazioni registrate più significative."], "en": ["Value changes", "The most significant recorded changes."]},
  {"id": "value_distribution", "it": ["Distribuzione del valore", "Mosaico per regione, produttore o tipologia."], "en": ["Value distribution", "A mosaic by region, producer or style."]},
  {"id": "recent", "it": ["Ultimi vini aggiunti", "Una vetrina degli ultimi arrivi."], "en": ["Latest additions", "A gallery of recent arrivals."]},
  {"id": "overview", "it": ["La cantina in numeri", "Bottiglie, etichette e produttori."], "en": ["Cellar in numbers", "Bottles, labels and producers."]},
  {"id": "regions", "it": ["Mappa delle regioni", "La geografia delle bottiglie possedute."], "en": ["Region map", "The geography of your collection."]},
  {"id": "styles", "it": ["Colori della cantina", "La distribuzione per tipologia."], "en": ["Cellar colours", "Your collection by wine style."]},
  {"id": "vintages", "it": ["Le annate della collezione", "Bottiglie distribuite per annata."], "en": ["Collection vintages", "Bottles grouped by vintage."]},
  {"id": "grapes", "it": ["Vitigni protagonisti", "Le uve più presenti, anche negli assemblaggi."], "en": ["Leading grapes", "The most represented grapes, including blends."]},
  {"id": "producers", "it": ["Produttori protagonisti", "I cinque produttori più rappresentati."], "en": ["Leading producers", "The five most represented producers."]},
  {"id": "formats", "it": ["Formati della collezione", "Standard, magnum e altri formati."], "en": ["Bottle formats", "Standard, magnum and other formats."]},
  {"id": "maturity", "it": ["Panorama di maturità", "Le finestre di beva nei prossimi anni."], "en": ["Maturity panorama", "Drinking windows over the coming years."]},
  {"id": "ready", "it": ["Da bere adesso", "Tre bottiglie nella finestra di beva."], "en": ["Drink now", "Three bottles in their drinking window."]},
  {"id": "past_window", "it": ["Da tenere d’occhio", "Finestre in chiusura o superate."], "en": ["Keep an eye on", "Closing or elapsed drinking windows."]},
  {"id": "next_peak", "it": ["Le prossime al picco", "Le prossime finestre ideali, lungo una linea del tempo."], "en": ["Next at peak", "Upcoming ideal windows on a timeline."]},
  {"id": "tonight", "it": ["Una bottiglia per stasera", "Una proposta pronta da bere e il suo abbinamento."], "en": ["A bottle for tonight", "One ready-to-drink choice and its pairing."]},
  {"id": "taste", "it": ["Mappa del gusto", "Un radar delle affinità personali."], "en": ["Taste map", "A radar of your personal affinities."]},
  {"id": "taste_origins", "it": ["Geografia del gusto", "Le origini associate ai vini apprezzati."], "en": ["Taste geography", "Origins associated with wines you enjoyed."]},
  {"id": "best_tastings", "it": ["Le degustazioni più apprezzate", "I migliori giudizi registrati negli ultimi 12 mesi."], "en": ["Favourite tastings", "Your best recorded ratings over the last 12 months."]},
  {"id": "recent_tastings", "it": ["Ultime degustazioni", "Tre esperienze dal diario."], "en": ["Latest tastings", "Three experiences from your journal."]},
  {"id": "tasting_rhythm", "it": ["Il ritmo delle degustazioni", "Le esperienze registrate mese per mese."], "en": ["Tasting rhythm", "Recorded experiences by month."]},
  {"id": "deliveries", "it": ["Bottiglie in viaggio", "Una linea del tempo delle consegne previste."], "en": ["Bottles on their way", "A timeline of expected deliveries."]},
  {"id": "to_collect", "it": ["Da ritirare", "Le bottiglie che aspettano di entrare in cantina."], "en": ["Awaiting collection", "Bottles waiting to join your cellar."]},
  {"id": "storage", "it": ["Dove sono le mie bottiglie", "Distribuzione per posizione di stoccaggio."], "en": ["Where my bottles are", "Distribution by storage location."]},
  {"id": "wishlist", "it": ["Wishlist in primo piano", "Tre desideri prioritari."], "en": ["Wishlist highlights", "Three priority wishes."]},
  {"id": "purposes", "it": ["Obiettivi della collezione", "Le finalità assegnate alle bottiglie."], "en": ["Collection purposes", "The purposes assigned to your bottles."]},
  {"id": "data_quality", "it": ["Cantina da completare", "Completezza dei dati e due priorità."], "en": ["Complete your cellar", "Data completeness and two priorities."]},
  {"id": "news", "it": ["Wine Pulse essenziale", "Una notizia dal mondo del vino."], "en": ["Wine Pulse essential", "One story from the wine world."]},
];

// Preserve saved order and widths while merging retired, overlapping panels.
export function normalizeDashboardLayout(widgets: PersonalDashboardWidget[]): PersonalDashboardWidget[] {
  const result: PersonalDashboardWidget[] = [];
  for (const widget of widgets) {
    let next = { ...widget };
    if (["value_type", "value_region", "value_producer"].includes(widget.id)) next = { ...widget, id: "value_distribution", group_by: widget.id.slice(6) as "type" | "region" | "producer" };
    const aliases: Partial<Record<PersonalDashboardWidgetId, PersonalDashboardWidgetId>> = { balance: "regions", style_balance: "styles", composition: "maturity", availability: "overview" };
    next.id = aliases[next.id] ?? next.id;
    if (personalDashboardCatalogue.some(item => item.id === next.id) && !result.some(item => item.id === next.id)) result.push(next);
  }
  return result;
}
