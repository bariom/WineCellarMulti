import { readFileSync } from "node:fs";

const root = new URL("../src/help/", import.meta.url);
const italian = readFileSync(new URL("articles.it.ts", root), "utf8");
const english = readFileSync(new URL("articles.en.ts", root), "utf8");
const required = [
  "onboarding", "dashboard", "cellar-filters", "label-recognition", "wine-detail", "consumption",
  "value-window", "wishlist", "pairing", "buying-advice", "compare", "roles-cellars", "sharing",
  "coownership", "notifications", "ai-pack", "billing", "import-export", "offline-pwa", "troubleshooting",
];

for (const id of required) {
  if (!italian.includes(`id: "${id}"`) || !english.includes(`"${id}"`)) {
    throw new Error(`Missing bilingual Help article: ${id}`);
  }
}

const italianIds = [...italian.matchAll(/id: "([^"]+)"/g)].map((match) => match[1]);
if (new Set(italianIds).size !== italianIds.length) throw new Error("Italian Help article ids must be unique");
if (new Set(required).size !== required.length) throw new Error("Help required article list must be unique");
console.log(`Help content validated: ${required.length} bilingual articles`);
