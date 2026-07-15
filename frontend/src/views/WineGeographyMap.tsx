import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./WineGeographyMap.css";

import type { TranslationKey } from "../i18n";
import type { Wine } from "../types";

type WineRegionLocation = { latitude: number; longitude: number };

const wineRegionLocations: Record<string, WineRegionLocation> = {
  bordeaux: { latitude: 44.84, longitude: -0.58 }, medoc: { latitude: 45.22, longitude: -0.78 }, margaux: { latitude: 45.04, longitude: -0.67 }, pauillac: { latitude: 45.2, longitude: -0.75 }, "saint-estephe": { latitude: 45.19, longitude: -0.77 }, "saint-estèphe": { latitude: 45.19, longitude: -0.77 }, "saint-emilion": { latitude: 44.89, longitude: -0.16 }, "saint-émilion": { latitude: 44.89, longitude: -0.16 }, pomerol: { latitude: 44.93, longitude: -0.2 }, graves: { latitude: 44.68, longitude: -0.5 }, sauternes: { latitude: 44.53, longitude: -0.34 },
  burgundy: { latitude: 47.05, longitude: 4.84 }, bourgogne: { latitude: 47.05, longitude: 4.84 }, chablis: { latitude: 47.81, longitude: 3.8 }, "cote d'or": { latitude: 47.18, longitude: 4.95 }, "côte d'or": { latitude: 47.18, longitude: 4.95 }, champagne: { latitude: 49.05, longitude: 3.96 }, rhone: { latitude: 44.5, longitude: 4.87 }, "rhône": { latitude: 44.5, longitude: 4.87 }, loire: { latitude: 47.39, longitude: 0.69 }, alsace: { latitude: 48.17, longitude: 7.3 }, provence: { latitude: 43.53, longitude: 6.3 }, languedoc: { latitude: 43.61, longitude: 3.88 }, roussillon: { latitude: 42.7, longitude: 2.9 }, jura: { latitude: 46.74, longitude: 5.91 },
  piemonte: { latitude: 44.7, longitude: 7.85 }, piedmont: { latitude: 44.7, longitude: 7.85 }, barolo: { latitude: 44.61, longitude: 7.94 }, barbaresco: { latitude: 44.72, longitude: 8.08 }, toscana: { latitude: 43.47, longitude: 11.26 }, tuscany: { latitude: 43.47, longitude: 11.26 }, chianti: { latitude: 43.58, longitude: 11.32 }, montalcino: { latitude: 43.06, longitude: 11.49 }, bolgheri: { latitude: 43.24, longitude: 10.6 }, veneto: { latitude: 45.44, longitude: 11.0 }, valpolicella: { latitude: 45.52, longitude: 10.95 }, friuli: { latitude: 46.12, longitude: 13.2 }, sicilia: { latitude: 37.6, longitude: 14.02 }, sicily: { latitude: 37.6, longitude: 14.02 }, sardegna: { latitude: 40.12, longitude: 9.01 }, puglia: { latitude: 40.79, longitude: 17.1 }, campania: { latitude: 40.84, longitude: 14.25 }, abruzzo: { latitude: 42.35, longitude: 13.4 }, trentino: { latitude: 46.07, longitude: 11.12 }, lombardia: { latitude: 45.47, longitude: 9.19 }, franciacorta: { latitude: 45.64, longitude: 10.05 },
  ticino: { latitude: 46.0, longitude: 8.95 }, vallese: { latitude: 46.23, longitude: 7.36 }, valais: { latitude: 46.23, longitude: 7.36 }, vaud: { latitude: 46.62, longitude: 6.53 }, ginevra: { latitude: 46.2, longitude: 6.15 }, geneva: { latitude: 46.2, longitude: 6.15 }, grigioni: { latitude: 46.8, longitude: 9.84 }, graubunden: { latitude: 46.8, longitude: 9.84 }, graubünden: { latitude: 46.8, longitude: 9.84 },
  rioja: { latitude: 42.46, longitude: -2.45 }, "ribera del duero": { latitude: 41.68, longitude: -3.69 }, priorat: { latitude: 41.16, longitude: 0.93 }, penedes: { latitude: 41.35, longitude: 1.7 }, penedès: { latitude: 41.35, longitude: 1.7 }, catalunya: { latitude: 41.65, longitude: 1.52 }, catalonia: { latitude: 41.65, longitude: 1.52 }, galicia: { latitude: 42.8, longitude: -8.0 }, "rias baixas": { latitude: 42.49, longitude: -8.7 }, "rías baixas": { latitude: 42.49, longitude: -8.7 }, jerez: { latitude: 36.68, longitude: -6.14 },
  douro: { latitude: 41.16, longitude: -7.73 }, porto: { latitude: 41.16, longitude: -7.73 }, alentejo: { latitude: 38.57, longitude: -7.91 }, dao: { latitude: 40.52, longitude: -7.87 }, dão: { latitude: 40.52, longitude: -7.87 }, mosel: { latitude: 49.92, longitude: 6.96 }, pfalz: { latitude: 49.32, longitude: 8.12 }, rheingau: { latitude: 50.02, longitude: 8.04 }, baden: { latitude: 48.1, longitude: 7.85 }, burgenland: { latitude: 47.49, longitude: 16.57 }, wachau: { latitude: 48.36, longitude: 15.46 }, styria: { latitude: 47.15, longitude: 15.33 },
  "napa valley": { latitude: 38.5, longitude: -122.27 }, napa: { latitude: 38.5, longitude: -122.27 }, sonoma: { latitude: 38.29, longitude: -122.46 }, oregon: { latitude: 45.52, longitude: -123.08 }, washington: { latitude: 46.28, longitude: -119.29 }, mendocino: { latitude: 39.31, longitude: -123.41 }, california: { latitude: 36.78, longitude: -119.42 }, mendoza: { latitude: -33.04, longitude: -68.88 }, maipo: { latitude: -33.58, longitude: -70.62 }, colchagua: { latitude: -34.5, longitude: -71.28 },
  barossa: { latitude: -34.53, longitude: 138.96 }, "margaret river": { latitude: -33.95, longitude: 115.07 }, "yarra valley": { latitude: -37.67, longitude: 145.43 }, marlborough: { latitude: -41.51, longitude: 173.96 }, stellenbosch: { latitude: -33.93, longitude: 18.86 },
};

function wineRegionLocation(wine: Wine) {
  const candidates = [wine.region, wine.appellation]
    .map((value) => value.trim().toLocaleLowerCase().replace(/\s+/g, " "))
    .filter(Boolean);
  return candidates.map((candidate) => {
    if (wineRegionLocations[candidate]) return wineRegionLocations[candidate];
    const matchingKey = Object.keys(wineRegionLocations)
      .sort((first, second) => second.length - first.length)
      .find((key) => candidate.includes(key));
    return matchingKey ? wineRegionLocations[matchingKey] : null;
  }).find(Boolean) || null;
}

export default function WineGeographyMap({ wines, t }: { wines: Wine[]; t: (key: TranslationKey) => string }) {
  const markers = new Map<string, { label: string; location: WineRegionLocation; wines: number; bottles: number }>();
  wines.forEach((wine) => {
    const location = wineRegionLocation(wine);
    const label = wine.region.trim() || wine.appellation.trim();
    if (!location || !label) return;
    const key = `${label}:${location.latitude}:${location.longitude}`;
    const current = markers.get(key) || { label, location, wines: 0, bottles: 0 };
    current.wines += 1;
    current.bottles += Math.max(Number(wine.quantity || 0), 0);
    markers.set(key, current);
  });
  const points = [...markers.values()].sort((first, second) => second.bottles - first.bottles);
  if (!points.length) return <p className="empty-state">{t("geographicMapEmpty")}</p>;

  return (
    <div className="wine-geography-map" aria-label={t("geographicMap")}>
      <MapContainer center={[24, 8]} zoom={2} minZoom={2} maxZoom={12} scrollWheelZoom className="wine-geography-leaflet">
        <TileLayer attribution={'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'} url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {points.map((point) => (
          <CircleMarker key={`${point.label}:${point.location.latitude}:${point.location.longitude}`} center={[point.location.latitude, point.location.longitude]} radius={Math.min(22, 7 + Math.sqrt(Math.max(point.bottles, 1)) * 2.25)} pathOptions={{ color: "#fff7ef", weight: 2, fillColor: "#9b3123", fillOpacity: 0.84 }}>
            <Tooltip direction="top" offset={[0, -8]} opacity={0.96}>
              <strong>{point.label}</strong><br />
              {point.wines} {t("wines").toLowerCase()} · {point.bottles} {t("bottles").toLowerCase()}
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
      <p>{t("geographicMapHelp")}</p>
    </div>
  );
}
