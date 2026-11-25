/**
 * Wine terms that dictation in Italian or English mishears, put back as the user
 * said them. "En primeur" is French: the browser's recogniser, listening in another
 * language, writes "Primer", "Un Prime" or "Marvel" instead.
 */

// "en" and "primeur" as the recogniser tends to write them.
const EN = "(?:en|an|un|on|in|am|em|a)";
const PRIMEUR = "(?:primeurs?|primers?|primor|primeu|primar|primair|primmer|premieur)";
// Words that come right before "en primeur" when speaking of wines bought that way.
const WINE_WORD = "(?:vin[oi]|wines?|bottigli[ae]|bottles?|acquist\\w*|comprat\\w*|ordinat\\w*|pres[oiae]|bought|ordered|miei|my|quelli|quelle)";

const RULES: Array<[RegExp, string]> = [
  // "an primer", "on primeur", "in primor"…
  [new RegExp(`(?<![\\p{L}])${EN}\\s+${PRIMEUR}(?![\\p{L}])`, "giu"), "en primeur"],
  // "un prime": only after these, which make no sense before "prime" otherwise.
  [/(?<![\p{L}])(?:en|an|un)\s+prime(?![\p{L}])/giu, "en primeur"],
  // One word: "amprimer", "enprimeur", "onprimer".
  [/(?<![\p{L}])[aeo][mn]prime(?:u)?rs?(?![\p{L}])/giu, "en primeur"],
  // "Primer" or "primeur" on its own.
  [/(?<![\p{L}])prime(?:u)?rs?(?![\p{L}])/giu, "en primeur"],
  // "Marvel" is only taken for it right after a word about wines, with or without "en".
  [new RegExp(`(?<![\\p{L}])(${WINE_WORD})\\s+(?:${EN}\\s+)?marvel(?![\\p{L}])`, "giu"), "$1 en primeur"],
];

export function correctDictation(text: string) {
  let corrected = text;
  for (const [pattern, replacement] of RULES) corrected = corrected.replace(pattern, replacement);
  // The first rules may leave "en en primeur" when "en" was heard right.
  return corrected.replace(/(?<![\p{L}])en\s+en primeur/giu, "en primeur");
}

/**
 * The best of the recogniser's alternatives for one phrase: the first, unless a
 * later one heard "en primeur" as said.
 */
export function bestDictation(alternatives: string[]) {
  const heard = alternatives.find((alternative) => /(?<![\p{L}])en\s+primeurs?(?![\p{L}])/iu.test(alternative));
  return correctDictation(heard ?? alternatives[0] ?? "");
}
