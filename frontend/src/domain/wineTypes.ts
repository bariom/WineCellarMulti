export const canonicalWineTypes = ["Red", "White", "Rose", "Sparkling", "Sweet", "Fortified", "Other"] as const;

export function normalizeWineType(value: string | null | undefined) {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";

  const normalized = trimmed
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (["red", "rosso"].includes(normalized) || normalized.includes("vino rosso")) return "Red";
  if (["white", "bianco"].includes(normalized) || normalized.includes("vino bianco")) return "White";
  if (["rose", "rosato"].includes(normalized)) return "Rose";
  if (["sparkling", "spumante", "champagne"].includes(normalized)) return "Sparkling";
  if (["sweet", "dolce"].includes(normalized)) return "Sweet";
  if (["fortified", "fortificato"].includes(normalized)) return "Fortified";
  if (["other", "altro"].includes(normalized)) return "Other";

  const canonical = canonicalWineTypes.find((type) => type.toLowerCase() === normalized);
  return canonical || trimmed;
}
