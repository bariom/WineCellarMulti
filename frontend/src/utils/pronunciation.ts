/**
 * French wine names respelled the way an Italian voice should read them, so
 * "Château Pontet-Canet" is heard as "Sciatò Pontè-Canè" instead of letter by
 * letter. Only the text sent to the voice changes; the screen keeps the names.
 */

// Words met on French labels, as an Italian would say them.
const FRENCH_WORDS: Record<string, string> = {
  chateau: "sciatò", chateaux: "sciatò", domaine: "domèn", domaines: "domèn", clos: "clò",
  cote: "còt", cotes: "còt", coteaux: "cotò", cru: "crù", crus: "crù", grand: "gran", grands: "gran",
  premier: "premiè", premiers: "premiè", premiere: "premièr", saint: "sèn", sainte: "sènt",
  haut: "ò", hauts: "ò", vieilles: "vièi", vignes: "vign", cuvee: "cuvé", reserve: "resèrv",
  blanc: "blan", blancs: "blan", noir: "nuàr", noirs: "nuàr", brut: "brùt", rose: "rosé",
  et: "è", les: "lè", des: "dè", aux: "ò", du: "du", de: "de", la: "la", le: "le",
  bordeaux: "bordò", bourgogne: "burgògn", champagne: "sciampàgn", chablis: "sciablì",
  pauillac: "poiàc", margaux: "margò", pomerol: "pomeròl", medoc: "medòc", graves: "grav",
  pessac: "pessàc", leognan: "leognàn", emilion: "emiliòn", estephe: "estèf", julien: "giuliàn",
  sauternes: "sotèrn", barsac: "barsàc", sancerre: "sansèrr", pouilly: "puiì", fume: "fumé",
  vouvray: "vuvrè", meursault: "mersò", montrachet: "monrascè", beaune: "bòn", nuits: "nuì",
  chambertin: "sciambertèn", romanee: "romané", gevrey: "gevré", vosne: "vòn", chassagne: "sciassàgn",
  puligny: "pulignì", corton: "cortòn", pommard: "pommàr", volnay: "volnè", musigny: "musignì",
  hermitage: "ermitàg", chateauneuf: "sciatonèf", pape: "pap", rhone: "ròn", loire: "luàr",
  alsace: "alzàs", cabernet: "cabernè", merlot: "merlò", sauvignon: "sovignòn", pinot: "pinò",
  gamay: "gamè", grenache: "grenàsc", syrah: "sirà", mourvedre: "murvèdr", chardonnay: "sciardonè",
  chenin: "scenèn", viognier: "viognè", semillon: "semiiòn", lafite: "lafìt", rothschild: "rotsciìld",
  latour: "latùr", mouton: "mutòn", brion: "briòn", pichon: "pisciòn", longueville: "longhevìl",
  cheval: "sceval", ausone: "osòn", petrus: "petrùs", yquem: "icuèm", lynch: "lansc", bages: "bàg",
  estournel: "esturnèl", pontet: "pontè", canet: "canè", phelan: "felàn", segur: "segùr",
  montrose: "montròs", palmer: "palmèr", angelus: "ansgelùs", figeac: "figeàc", talbot: "talbò",
  leoville: "leovìl", barton: "bartòn", poyferre: "puaferè", ducru: "ducrù", beaucaillou: "bocaiù",
  gruaud: "gruò", larose: "laròs", giscours: "giscùr", lagrange: "lagrànsg", petit: "petì",
  cos: "coss", moet: "moèt", vieux: "vié", veuve: "vev", clicquot: "clicò",
};

// Regions that make a wine French when its country is not filled in.
const FRENCH_REGIONS = /\b(bordeaux|bourgogne|burgundy|champagne|loire|rh[oô]ne|alsace|languedoc|roussillon|provence|jura|savoie|beaujolais|sud[- ]ouest|cahors|corse|m[ée]doc|chablis)\b/i;

const plain = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function isFrenchWine(wine: { vineyard_country?: string; region?: string; appellation?: string }) {
  return /\b(france|francia|frankreich)\b/i.test(wine.vineyard_country || "") || FRENCH_REGIONS.test(`${wine.region || ""} ${wine.appellation || ""}`);
}

/** One French word as an Italian voice should read it: dictionary first, then French spelling rules. */
export function frenchWordForItalian(word: string) {
  const known = FRENCH_WORDS[plain(word)];
  if (known) return known;
  // A soft c before e and i, read before the other rules turn letters into others.
  let spoken = word.toLowerCase().replace(/c(?=[eiyéèê])/g, "s").replace(/ph/g, "f");
  // Endings first, while the written letters are still there.
  spoken = spoken
    .replace(/ées?$/, "é")
    .replace(/(rt|rd)$/, "r")
    .replace(/(eaux|eau|aux|aud|aut|ault)$/, "ò")
    .replace(/(et|er|ez|ais|ait)$/, "è")
    .replace(/(ot|ots)$/, "ò")
    .replace(/(ain|ein|in)$/, "èn")
    .replace(/(an|en|ant|ent|and)$/, "àn")
    .replace(/(on|ons)$/, "òn")
    .replace(/oux?$/, "ù")
    .replace(/([aeiouyé])(s|t|d|x|z)$/, "$1")
    .replace(/([^aeiouyé])e$/, "$1");
  spoken = spoken
    .replace(/eau|au/g, "ò")
    .replace(/oi/g, "uà")
    .replace(/ou/g, "u")
    .replace(/ch(?=[aou])/g, "sci")
    .replace(/ch/g, "sc")
    .replace(/qu(?=[ei])/g, "ch")
    .replace(/qu/g, "c")
    .replace(/ç/g, "s")
    .replace(/[éèê]/g, "è")
    .replace(/(ai|ei)/g, "è")
    .replace(/eu/g, "e")
    .replace(/^h/, "")
    .replace(/y/g, "i")
    .replace(/w/g, "v")
    .replace(/[âà]/g, "a")
    .replace(/ô/g, "ò")
    .replace(/[îï]/g, "i")
    .replace(/[ûü]/g, "u");
  return spoken;
}

/** A French name, word by word, keeping its spaces, hyphens and apostrophes. */
export function frenchNameForItalian(name: string) {
  return name.replace(/\s*&\s*/g, " e ").replace(/[\p{L}]+/gu, (word) => {
    const spoken = frenchWordForItalian(word);
    return word[0] === word[0].toUpperCase() ? spoken.charAt(0).toUpperCase() + spoken.slice(1) : spoken;
  });
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The text an Italian voice should read: the French names of the cellar, and the
 * typical words of French labels, respelled; everything else untouched.
 */
export function pronounceForItalianVoice(text: string, frenchNames: string[]) {
  let spoken = text;
  const names = [...new Set(frenchNames.map((name) => name.trim()).filter((name) => name.length > 2))]
    .sort((first, second) => second.length - first.length);
  for (const name of names) {
    spoken = spoken.replace(new RegExp(`(?<![\\p{L}])${escape(name)}(?![\\p{L}])`, "giu"), (found) => frenchNameForItalian(found));
  }
  // Label words that are French on their own, when written with a capital (Château, Domaine…).
  return spoken.replace(/(?<![\p{L}])(Ch[aâ]teau(x)?|Domaine|Clos|C[oô]tes?|Grand Cru|Premier Cru|Saint-[\p{L}-]+|Haut-[\p{L}-]+|Cuv[ée]e)(?![\p{L}])/gu, (found) => frenchNameForItalian(found));
}
