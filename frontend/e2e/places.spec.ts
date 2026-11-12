import { expect, test } from "@playwright/test";
import { countryCode, localizeCountry, localizeRegion, placeSearchText, regionKey } from "../src/domain/places";

test("countries written in any common language are shown in the reader's language", () => {
  for (const name of ["Italia", "Italy", "italie", "Italien", "IT"]) {
    expect(countryCode(name)).toBe("IT");
    expect(localizeCountry(name, "it")).toBe("Italia");
    expect(localizeCountry(name, "en")).toBe("Italy");
  }
  expect(localizeCountry("Svizzera", "en")).toBe("Switzerland");
  expect(localizeCountry("Schweiz", "it")).toBe("Svizzera");
  expect(localizeCountry("France", "it")).toBe("Francia");
  expect(localizeCountry("Spagna", "en")).toBe("Spain");
  expect(localizeCountry("USA", "it")).toBe("Stati Uniti");
  expect(localizeCountry("Südafrika", "en")).toBe("South Africa");
  // Unknown names are shown as written.
  expect(localizeCountry("Atlantide", "en")).toBe("Atlantide");
  expect(localizeCountry("", "en")).toBe("");
});

test("wine regions with different Italian and English names follow the reader's language", () => {
  expect(localizeRegion("Toscana", "en")).toBe("Tuscany");
  expect(localizeRegion("Tuscany", "it")).toBe("Toscana");
  expect(localizeRegion("Bourgogne", "it")).toBe("Borgogna");
  expect(localizeRegion("Burgundy", "en")).toBe("Burgundy");
  expect(localizeRegion("Piedmont", "it")).toBe("Piemonte");
  expect(localizeRegion("Rhone", "en")).toBe("Rhône Valley");
  expect(localizeRegion("Pfalz", "it")).toBe("Palatinato");
  expect(localizeRegion("Wallis", "it")).toBe("Vallese");
  expect(localizeRegion("Valle d’Aosta", "en")).toBe("Aosta Valley");
  // Same everywhere, or a proper name: unchanged.
  for (const name of ["Bordeaux", "Champagne", "Veneto", "Rioja", "Napa Valley", "Ticino"]) {
    expect(localizeRegion(name, "it")).toBe(name);
    expect(localizeRegion(name, "en")).toBe(name);
  }
  // A country in the region field is translated as a country.
  expect(localizeRegion("Portugal", "it")).toBe("Portogallo");
});

test("a region written in two languages groups as one", () => {
  expect(regionKey("Toscana")).toBe(regionKey("Tuscany"));
  expect(regionKey("Borgogna")).toBe(regionKey("Bourgogne"));
  expect(regionKey("Italia")).toBe(regionKey("Italy"));
  expect(regionKey("Bordeaux")).toBe(regionKey(" bordeaux "));
  expect(regionKey("Toscana")).not.toBe(regionKey("Piemonte"));
});

test("a search in either language finds the place", () => {
  expect(placeSearchText("Toscana").toLowerCase()).toContain("tuscany");
  expect(placeSearchText("Tuscany").toLowerCase()).toContain("toscana");
  expect(placeSearchText("Italia").toLowerCase()).toContain("italy");
  expect(placeSearchText("Bordeaux")).toBe("Bordeaux");
});
