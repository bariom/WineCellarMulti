export type TasteDimensionStrength = "strong" | "medium" | "weak";

export const TASTE_DIMENSIONS = ["body", "acidity", "tannin", "sweetness", "aromatic_intensity", "fruit", "wood", "spice", "minerality"];

/**
 * How much a dimension really says about the user's taste: a clear preference
 * (far from the neutral 50) backed by reliable evidence. A value near 50 or
 * resting on few, uncertain experiences is weak, whatever its number.
 */
export function dimensionStrength(preference: number, confidence: number): TasteDimensionStrength {
  const clarity = Math.min(1, Math.abs(preference - 0.5) * 2);
  const strength = clarity * Math.max(0, Math.min(1, confidence));
  return strength >= 0.35 ? "strong" : strength >= 0.18 ? "medium" : "weak";
}
