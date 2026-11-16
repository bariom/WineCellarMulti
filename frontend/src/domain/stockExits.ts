import type { Locale, StockMovementType } from "../types";

/** Ways a bottle leaves the cellar other than being drunk or sold. */
export type OtherExitType = "complimentary" | "breakage" | "defective" | "co_owner_withdrawal" | "returned" | "adjustment_out";

export const OTHER_EXIT_TYPES: OtherExitType[] = ["complimentary", "breakage", "defective", "co_owner_withdrawal", "returned", "adjustment_out"];

/** Exits that destroy value: they are counted as losses. */
export const LOSS_EXIT_TYPES: OtherExitType[] = ["breakage", "defective"];

const LABELS: Record<OtherExitType, { it: string; en: string; hintIt: string; hintEn: string }> = {
  complimentary: { it: "Regalata", en: "Given away", hintIt: "A chi l'hai regalata, per quale occasione.", hintEn: "Who you gave it to, for which occasion." },
  breakage: { it: "Rotta", en: "Broken", hintIt: "Come si è rotta.", hintEn: "How it broke." },
  defective: { it: "Difettosa", en: "Faulty", hintIt: "Tappo, ossidata, rifermentata…", hintEn: "Corked, oxidised, refermented…" },
  co_owner_withdrawal: { it: "Ritirata dal comproprietario", en: "Taken by a co-owner", hintIt: "Le bottiglie escono dalla sua quota; le quote si ricalcolano.", hintEn: "The bottles come out of their share; shares are recalculated." },
  returned: { it: "Restituita al venditore", en: "Returned to the seller", hintIt: "Motivo del reso, rimborso previsto.", hintEn: "Why it went back, the expected refund." },
  adjustment_out: { it: "Correzione inventario", en: "Inventory correction", hintIt: "Ad esempio una bottiglia non trovata al conteggio.", hintEn: "For example a bottle missing at a count." },
};

export function otherExitLabel(type: OtherExitType, locale: Locale) {
  return LABELS[type][locale === "it" ? "it" : "en"];
}

export function otherExitHint(type: OtherExitType, locale: Locale) {
  return LABELS[type][locale === "it" ? "hintIt" : "hintEn"];
}

export function isOtherExit(type: StockMovementType | string): type is OtherExitType {
  return (OTHER_EXIT_TYPES as string[]).includes(type);
}

/** Vinaris records a bottle received as a gift with a purchase price of 0.01. */
export const GIFT_PURCHASE_PRICE = 0.01;

export function isGiftPrice(price: number | string | null | undefined) {
  const value = Number(price);
  return Number.isFinite(value) && value > 0 && value <= GIFT_PURCHASE_PRICE;
}
