/**
 * French wine names respelled the way an Italian voice should read them, so
 * "Château Pontet-Canet" is heard as "Sciatò Pontè-Canè" instead of letter by
 * letter. Only the text sent to the voice changes; the screen keeps the names.
 */

// Words met on French labels, and the names of its regions, estates, houses and grapes,
// as an Italian would say them.
const FRENCH_WORDS: Record<string, string> = {
  chateau: "sciatò", chateaux: "sciatò", domaine: "domèn", domaines: "domèn", clos: "clò", cote: "còt", cotes: "còt",
  coteaux: "cotò", cru: "crù", crus: "crù", grand: "gran", grands: "gran", grande: "grand", premier: "premiè",
  premiers: "premiè", premiere: "premièr", saint: "sèn", sainte: "sènt", haut: "ò", hauts: "ò", vieilles: "viei",
  vieux: "vié", vignes: "vign", vigne: "vign", cuvee: "cuvé", reserve: "resèrv", blanc: "blan", blancs: "blan",
  noir: "nuàr", noirs: "nuàr", rouge: "rùg", brut: "brùt", rose: "rosé", sec: "sèc", demi: "demì", nature: "natùr",
  millesime: "millesìm", extra: "extra", et: "è", les: "lè", des: "dè", aux: "ò", du: "du", de: "de", la: "la",
  le: "le", d: "d", l: "l", vin: "vèn", vins: "vèn", terroir: "teruàr", climat: "climà", lieu: "lié", dit: "dì",
  village: "villàg", villages: "villàg", monopole: "monopòl", superieur: "superièr", appellation: "appellasiòn",
  controlee: "controlé", origine: "origìn", proprietaire: "proprietèr", comte: "cònt", comtes: "cònt", comtesse: "contèss",
  baron: "baròn", baronne: "baròn", marquis: "marchì", chevalier: "scevaliè", dame: "dam", dames: "dam",
  pavillon: "paviiòn", carruades: "caruàd", petit: "petì", petite: "petìt", second: "segòn", seconde: "segònd",
  prestige: "prestìg", speciale: "spesiàl", tour: "tur", tours: "tur", mont: "mòn", beau: "bò", belle: "bèl",
  pierre: "pièr", roche: "rosc", roches: "rosc", fontaine: "fontèn", moulin: "mulèn", jardin: "giardèn",
  chene: "scèn", chenes: "scèn", ange: "àng", anges: "àng", etoile: "etuàl", argent: "argiàn", fils: "fis",
  pere: "pèr", freres: "frèr", frere: "frèr", veuve: "vev", mis: "mì", bouteille: "butèi", selection: "seleksiòn",
  grains: "grèn", nobles: "nòbl", vendanges: "vandàng", tardives: "tardìv", cremant: "cremàn", bordeaux: "bordò",
  bourgogne: "burgògn", champagne: "sciampàgn", chablis: "sciablì", pauillac: "poiàc", margaux: "margò",
  pomerol: "pomeròl", medoc: "medòc", graves: "grav", pessac: "pessàc", leognan: "leognàn", emilion: "emiliòn",
  estephe: "estèf", julien: "giuliàn", sauternes: "sotèrn", barsac: "barsàc", sancerre: "sansèrr", pouilly: "puiì",
  fume: "fumé", fuisse: "fuissé", vouvray: "vuvrè", meursault: "mersò", montrachet: "monrascè", beaune: "bòn",
  nuits: "nuì", chambertin: "sciambertèn", romanee: "romané", gevrey: "gevré", vosne: "vòn", chassagne: "sciassàgn",
  puligny: "pulignì", corton: "cortòn", pommard: "pomàr", volnay: "volnè", musigny: "musignì", hermitage: "ermitàg",
  chateauneuf: "sciatonèf", pape: "pap", rhone: "ròn", loire: "luàr", alsace: "alzàs", listrac: "listràc",
  moulis: "mulì", fronsac: "fronsàc", entre: "àntr", mers: "mèr", blaye: "blai", bourg: "bur", echezeaux: "escesò",
  vougeot: "vugiò", bonnes: "bon", mares: "mar", chambolle: "sciambòl", morey: "morè", denis: "denì", tart: "tar",
  lambrays: "lambrè", beze: "bèz", mazis: "mazì", latricieres: "latrisièr", charmes: "sciarm", griotte: "griòt",
  ruchottes: "ruscòt", chapelle: "sciapèl", georges: "giòrg", aloxe: "alòs", charlemagne: "sciarlemàgn",
  savigny: "savignì", batard: "batàr", criots: "criò", bienvenues: "bienvenù", perrieres: "perièr", genevrieres: "genevrièr",
  santenay: "santenè", mercurey: "mercurè", rully: "rulì", givry: "givrì", montagny: "montagnì", macon: "macòn",
  veran: "veràn", valmur: "valmùr", vaudesir: "vodesìr", grenouilles: "grenùi", blanchot: "blansciò", bougros: "bugrò",
  preuses: "prèz", tonnerre: "tonèrr", fourchaume: "furscòm", montmains: "monmèn", vaillons: "vaiòn", beaujolais: "bogiolè",
  morgon: "morgòn", fleurie: "flerì", vent: "van", brouilly: "bruiì", julienas: "giulienà", chenas: "scenà",
  regnie: "regnié", "cote-rotie": "còt-rotì", rotie: "rotì", condrieu: "condriè", cornas: "cornà", crozes: "cròs",
  gigondas: "gigondà", vacqueyras: "vacheràs", tavel: "tavèl", savennieres: "savenièr", coulee: "culé", serrant: "seràn",
  chinon: "scinòn", bourgueil: "burghèi", saumur: "somùr", champigny: "sciampignì", muscadet: "muscadè",
  anjou: "angiù", touraine: "turèn", languedoc: "langhedòc", roussillon: "russiiòn", provence: "provàns",
  jura: "giurà", savoie: "savuà", cahors: "caòr", madiran: "madiràn", jurancon: "giuransòn", bandol: "bandòl",
  cassis: "cassìs", lafite: "lafìt", rothschild: "rotsciìld", latour: "latùr", mouton: "mutòn", brion: "briòn",
  pichon: "pisciòn", longueville: "longhevìl", lalande: "lalànd", cheval: "sceval", ausone: "osòn", petrus: "petrùs",
  yquem: "icuèm", lynch: "lansc", bages: "bàg", estournel: "esturnèl", cos: "coss", pontet: "pontè", canet: "canè",
  phelan: "felàn", segur: "segùr", montrose: "montròs", palmer: "palmèr", angelus: "angelùs", figeac: "figeàc",
  talbot: "talbò", leoville: "leovìl", barton: "bartòn", poyferre: "puaferè", ducru: "ducrù", beaucaillou: "bocaiù",
  gruaud: "gruò", larose: "laròs", giscours: "giscùr", lagrange: "lagrànsg", rauzan: "rosàn", segla: "seglà",
  gassies: "gassì", durfort: "durfòr", vivens: "vivàns", lascombes: "lascòmb", brane: "bran", cantenac: "cantenàc",
  kirwan: "chirvàn", issan: "issàn", boyd: "boid", malescot: "malescò", desmirail: "desmirài", ferriere: "ferièr",
  alesme: "alèm", terme: "tèrm", becker: "becchèr", pouget: "pugè", carnet: "carnè", lagune: "lagùn", dauzac: "dosàc",
  duhart: "duàr", milon: "milòn", pedesclaux: "pedesclò", clerc: "clèr", armailhac: "armaiàc", batailley: "bataiè",
  croizet: "cruasè", moussas: "mussàs", puy: "pui", ducasse: "ducàs", lacoste: "lacòst", labory: "laborì",
  calon: "calòn", lafon: "lafòn", rochet: "roscè", branaire: "branèr", beychevelle: "bescevèl", gloria: "glorià",
  langoa: "langoà", sociando: "sossiandò", mallet: "malè", chasse: "sciass", spleen: "splìn", poujeaux: "pugiò",
  fourcas: "furcà", potensac: "potansàc", siran: "siràn", meyney: "menè", marbuzet: "marbusè", pavie: "pavì",
  canon: "canòn", belair: "belèr", troplong: "troplòn", mondot: "mondò", valandraud: "valandrò", fourtet: "furtè",
  beausejour: "bosegiùr", mondotte: "mondòt", tertre: "tèrtr", roteboeuf: "rotbèf", lafleur: "laflèr", fleur: "flèr",
  evangile: "evangìl", eglise: "eglìs", clinet: "clinè", conseillante: "conseiànt", trotanoy: "trotanuà",
  certan: "sertàn", gazin: "gasèn", nenin: "nenèn", pin: "pèn", clement: "clemàn", mission: "missiòn", carbonnieux: "carbonié",
  bouscaut: "buscò", malartic: "malartìc", lagraviere: "lagravièr", fieuzal: "fiesàl", olivier: "oliviè",
  martillac: "martiiàc", climens: "climàns", coutet: "cutè", suduiraut: "suduirò", rieussec: "riessèc", guiraud: "ghirò",
  filhot: "filiò", doisy: "duasì", lafaurie: "laforì", peyraguey: "perraghè", raymond: "remòn", sigalas: "sigalà",
  rabaud: "rabò", nairac: "neràc", fargues: "farg", smith: "smit", conti: "contì", tache: "tasc", richebourg: "riscebùr",
  leroy: "leruà", rousseau: "russò", armand: "armàn", dujac: "dugiàc", roumier: "rumiè", mugnier: "muniè",
  vogue: "voghé", coche: "cosc", dury: "durì", raveneau: "ravenò", dauvissat: "dovissà", bouchard: "busciàr",
  drouhin: "druèn", jadot: "giadò", faiveley: "fevelè", louis: "luì", chanson: "sciansòn", joseph: "giosèf",
  meo: "meò", camuzet: "camusè", grivot: "grivò", gros: "grò", jayer: "giaié", rouget: "rugè", liger: "ligè",
  arnoux: "arnù", lachaux: "lasciò", mortet: "mortè", fourrier: "furiè", trapet: "trapè", bachelet: "bascelè",
  ramonet: "ramonè", niellon: "nielòn", sauzet: "sosè", roulot: "rulò", lafarge: "lafàrg", angerville: "angervìl",
  pousse: "pus", hudelot: "udelò", noellat: "noelà", clair: "clèr", bruno: "brunò", bertheau: "bertò", barthod: "bartò",
  ghislaine: "ghislèn", cecile: "sesìl", tremblay: "tramblè", leflaive: "leflèv", lamy: "lamì", colin: "colèn",
  boillot: "buaiò", girardin: "girardèn", moet: "moèt", chandon: "sciandòn", clicquot: "clicò", krug: "crug",
  bollinger: "bolangé", pol: "pol", roger: "rogé", taittinger: "tetengé", ruinart: "ruinàr", salon: "salòn",
  delamotte: "delamòt", billecart: "biiecàr", salmon: "salmòn", laurent: "loràn", perrier: "periè", jouet: "giuè",
  lanson: "lansòn", deutz: "dez", gosset: "gossè", henriot: "anriò", jacquesson: "giacsòn", selosse: "selòs",
  jacques: "giàc", egly: "eglì", ouriet: "uriè", agrapart: "agrapàr", philipponnat: "filiponà", drappier: "drapiè",
  duval: "duvàl", mumm: "mum", heidsieck: "edsìc", piper: "pipèr", charles: "sciàrl", pommery: "pomerì",
  nicolas: "nicolà", feuillatte: "feiàt", canard: "canàr", duchene: "duscèn", peters: "petèrs", cristal: "cristàl",
  dom: "dom", perignon: "perignòn", larmandier: "larmandiè", bernier: "berniè", prevost: "prevò", chartogne: "sciartògn",
  guigal: "ghigàl", chapoutier: "sciaputiè", jaboulet: "giabulè", aine: "ené", chave: "sciav", rayas: "raià",
  beaucastel: "bocastèl", telegraphe: "telegràf", pegau: "pegò", landonne: "landòn", mouline: "mulìn", turque: "turc",
  grillet: "griiè", clape: "clap", allemand: "almàn", jamet: "giamè", cuilleron: "cuieròn", didier: "didiè",
  dagueneau: "daghenò", huet: "uè", rougeard: "rugiàr", cotat: "cotà", vatan: "vatàn", foucault: "fucò",
  baumard: "bomàr", trimbach: "trimbac", hugel: "ughèl", humbrecht: "umbrècht", weinbach: "vainbac", gewurztraminer: "gevurztraminer",
  cabernet: "cabernè", franc: "fran", merlot: "merlò", sauvignon: "sovignòn", pinot: "pinò", gamay: "gamè",
  grenache: "grenàsc", syrah: "sirà", mourvedre: "murvèdr", chardonnay: "sciardonè", chenin: "scenèn", viognier: "viognè",
  semillon: "semiiòn", verdot: "verdò", malbec: "malbèc", cinsault: "sensò", carignan: "carignàn", marsanne: "marsàn",
  roussanne: "russàn", aligote: "aligoté", melon: "melòn", meunier: "meniè", chasselas: "sciaslà", muscat: "muscà",
  // Names often met in producers' names, and a few that the rules get wrong.
  jean: "giàn", francois: "fransuà", michel: "miscèl", philippe: "filìp", henri: "anrì", etienne: "etièn",
  andre: "andrè", rene: "renè", claude: "clod", yves: "iv", guy: "ghì", alain: "alèn", bernard: "bernàr",
  gerard: "geràr", thierry: "tierì", vincent: "vensàn", eric: "erìc", anne: "ann", marie: "marì",
  christophe: "cristòf", dominique: "dominìc", frederic: "federìc", marcel: "marsèl", paul: "pòl",
  las: "las", cases: "cas", lafitte: "lafìt", silex: "silèx", lapierre: "lapièr", winston: "uinston",
  churchill: "ciorcil", sir: "ser", hune: "ün", hugues: "ügh", sylvain: "silvèn", arnaud: "arnò",
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
    .replace(/ierre$/, "ièr")
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
    .replace(/([aeiouè])ill/g, "$1i")
    .replace(/eau|au/g, "ò")
    .replace(/oy/g, "uai")
    .replace(/oi/g, "uà")
    .replace(/ou/g, "u")
    .replace(/ch(?=[aou])/g, "sci")
    .replace(/ch/g, "sc")
    .replace(/gu(?=[eièé])/g, "gh")
    .replace(/j(?=[aou])/g, "gi")
    .replace(/j/g, "g")
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
    .replace(/[ûü]/g, "u")
    .replace(/[œ]/g, "e");
  // French stresses the last syllable: mark it when it ends the word unmarked (Conti, Bruno).
  if (!/[àèéìòù]/.test(spoken) && /[aiou]$/.test(spoken) && (spoken.match(/[aeiou]+/g) || []).length > 1) {
    spoken = spoken.slice(0, -1) + ({ a: "à", i: "ì", o: "ò", u: "ù" } as Record<string, string>)[spoken.slice(-1)];
  }
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
