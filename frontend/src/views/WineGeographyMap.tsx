import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./WineGeographyMap.css";

import type { TranslationKey } from "../i18n";
import type { Locale, Wine } from "../types";
import MapBaseLayers from "../components/MapBaseLayers";

type WineRegionLocation = { latitude: number; longitude: number };
type WineMapPoint = { label: string; region: string; location: WineRegionLocation; wines: number; bottles: number };

const DENSITY_RADIUS_KM = 1800;

function distanceKm(first: WineRegionLocation, second: WineRegionLocation) {
  const latitudeDelta = (second.latitude - first.latitude) * Math.PI / 180;
  const longitudeDelta = (second.longitude - first.longitude) * Math.PI / 180;
  const firstLatitude = first.latitude * Math.PI / 180;
  const secondLatitude = second.latitude * Math.PI / 180;
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function densestGeographicArea(points: WineMapPoint[]) {
  if (points.length <= 1) return points;
  return points.reduce<WineMapPoint[]>((bestCluster, anchor) => {
    const cluster = points.filter((point) => distanceKm(anchor.location, point.location) <= DENSITY_RADIUS_KM);
    const clusterWeight = cluster.reduce((total, point) => total + Math.max(point.bottles, 1), 0);
    const bestWeight = bestCluster.reduce((total, point) => total + Math.max(point.bottles, 1), 0);
    if (clusterWeight !== bestWeight) return clusterWeight > bestWeight ? cluster : bestCluster;
    return cluster.length > bestCluster.length ? cluster : bestCluster;
  }, []);
}

function DensityViewport({ points }: { points: WineMapPoint[] }) {
  const map = useMap();

  useEffect(() => {
    const focusPoints = densestGeographicArea(points);
    if (!focusPoints.length) return;
    map.invalidateSize({ pan: false });
    if (focusPoints.length === 1) {
      const { latitude, longitude } = focusPoints[0].location;
      map.setView([latitude, longitude], 6, { animate: false });
      return;
    }
    map.fitBounds(
      focusPoints.map((point) => [point.location.latitude, point.location.longitude] as [number, number]),
      { padding: [28, 28], maxZoom: 6, animate: false },
    );
  }, [map, points]);

  return null;
}

const wineRegionLocations: Record<string, WineRegionLocation> = {
  bordeaux: { latitude: 44.84, longitude: -0.58 }, medoc: { latitude: 45.22, longitude: -0.78 }, margaux: { latitude: 45.04, longitude: -0.67 }, pauillac: { latitude: 45.2, longitude: -0.75 }, "saint-estephe": { latitude: 45.19, longitude: -0.77 }, "saint-estèphe": { latitude: 45.19, longitude: -0.77 }, "saint-emilion": { latitude: 44.89, longitude: -0.16 }, "saint-émilion": { latitude: 44.89, longitude: -0.16 }, pomerol: { latitude: 44.93, longitude: -0.2 }, graves: { latitude: 44.68, longitude: -0.5 }, sauternes: { latitude: 44.53, longitude: -0.34 },
  burgundy: { latitude: 47.05, longitude: 4.84 }, bourgogne: { latitude: 47.05, longitude: 4.84 }, chablis: { latitude: 47.81, longitude: 3.8 }, "cote d'or": { latitude: 47.18, longitude: 4.95 }, "côte d'or": { latitude: 47.18, longitude: 4.95 }, champagne: { latitude: 49.05, longitude: 3.96 }, rhone: { latitude: 44.5, longitude: 4.87 }, "rhône": { latitude: 44.5, longitude: 4.87 }, loire: { latitude: 47.39, longitude: 0.69 }, alsace: { latitude: 48.17, longitude: 7.3 }, provence: { latitude: 43.53, longitude: 6.3 }, languedoc: { latitude: 43.61, longitude: 3.88 }, roussillon: { latitude: 42.7, longitude: 2.9 }, jura: { latitude: 46.74, longitude: 5.91 },
  piemonte: { latitude: 44.7, longitude: 7.85 }, piedmont: { latitude: 44.7, longitude: 7.85 }, barolo: { latitude: 44.61, longitude: 7.94 }, barbaresco: { latitude: 44.72, longitude: 8.08 }, toscana: { latitude: 43.47, longitude: 11.26 }, tuscany: { latitude: 43.47, longitude: 11.26 }, chianti: { latitude: 43.58, longitude: 11.32 }, montalcino: { latitude: 43.06, longitude: 11.49 }, bolgheri: { latitude: 43.24, longitude: 10.6 }, veneto: { latitude: 45.44, longitude: 11.0 }, valpolicella: { latitude: 45.52, longitude: 10.95 }, friuli: { latitude: 46.12, longitude: 13.2 }, sicilia: { latitude: 37.6, longitude: 14.02 }, sicily: { latitude: 37.6, longitude: 14.02 }, sardegna: { latitude: 40.12, longitude: 9.01 }, puglia: { latitude: 40.79, longitude: 17.1 }, campania: { latitude: 40.84, longitude: 14.25 }, abruzzo: { latitude: 42.35, longitude: 13.4 }, trentino: { latitude: 46.07, longitude: 11.12 }, lombardia: { latitude: 45.47, longitude: 9.19 }, franciacorta: { latitude: 45.64, longitude: 10.05 },
  ticino: { latitude: 46.0, longitude: 8.95 }, vallese: { latitude: 46.23, longitude: 7.36 }, valais: { latitude: 46.23, longitude: 7.36 }, vaud: { latitude: 46.62, longitude: 6.53 }, ginevra: { latitude: 46.2, longitude: 6.15 }, geneva: { latitude: 46.2, longitude: 6.15 }, grigioni: { latitude: 46.8, longitude: 9.84 }, graubunden: { latitude: 46.8, longitude: 9.84 }, graubünden: { latitude: 46.8, longitude: 9.84 },
  rioja: { latitude: 42.46, longitude: -2.45 }, "ribera del duero": { latitude: 41.68, longitude: -3.69 }, priorat: { latitude: 41.16, longitude: 0.93 }, penedes: { latitude: 41.35, longitude: 1.7 }, penedès: { latitude: 41.35, longitude: 1.7 }, catalunya: { latitude: 41.65, longitude: 1.52 }, catalonia: { latitude: 41.65, longitude: 1.52 }, galicia: { latitude: 42.8, longitude: -8.0 }, "rias baixas": { latitude: 42.49, longitude: -8.7 }, "rías baixas": { latitude: 42.49, longitude: -8.7 }, jerez: { latitude: 36.68, longitude: -6.14 },
  douro: { latitude: 41.16, longitude: -7.73 }, porto: { latitude: 41.16, longitude: -7.73 }, alentejo: { latitude: 38.57, longitude: -7.91 }, dao: { latitude: 40.52, longitude: -7.87 }, dão: { latitude: 40.52, longitude: -7.87 }, mosel: { latitude: 49.92, longitude: 6.96 }, pfalz: { latitude: 49.32, longitude: 8.12 }, rheingau: { latitude: 50.02, longitude: 8.04 }, baden: { latitude: 48.1, longitude: 7.85 }, burgenland: { latitude: 47.49, longitude: 16.57 }, wachau: { latitude: 48.36, longitude: 15.46 }, styria: { latitude: 47.15, longitude: 15.33 },
  "napa valley": { latitude: 38.5, longitude: -122.27 }, napa: { latitude: 38.5, longitude: -122.27 }, sonoma: { latitude: 38.29, longitude: -122.46 }, oregon: { latitude: 45.52, longitude: -123.08 }, washington: { latitude: 46.28, longitude: -119.29 }, mendocino: { latitude: 39.31, longitude: -123.41 }, california: { latitude: 36.78, longitude: -119.42 }, mendoza: { latitude: -33.04, longitude: -68.88 }, maipo: { latitude: -33.58, longitude: -70.62 }, colchagua: { latitude: -34.5, longitude: -71.28 },
  barossa: { latitude: -34.53, longitude: 138.96 }, "margaret river": { latitude: -33.95, longitude: 115.07 }, "yarra valley": { latitude: -37.67, longitude: 145.43 }, marlborough: { latitude: -41.51, longitude: 173.96 },
  "south africa": { latitude: -30.56, longitude: 22.94 }, "western cape": { latitude: -33.23, longitude: 19.43 }, stellenbosch: { latitude: -33.93, longitude: 18.86 }, franschhoek: { latitude: -33.91, longitude: 19.12 }, paarl: { latitude: -33.73, longitude: 18.96 }, constantia: { latitude: -34.03, longitude: 18.44 },
  swartland: { latitude: -33.32, longitude: 18.98 }, "hemel-en-aarde": { latitude: -34.42, longitude: 19.25 }, "walker bay": { latitude: -34.42, longitude: 19.25 }, elgin: { latitude: -34.16, longitude: 19.03 }, robertson: { latitude: -33.8, longitude: 19.89 }, breedekloof: { latitude: -33.65, longitude: 19.31 },
  "alto adige": { latitude: 46.5, longitude: 11.35 }, sudtirol: { latitude: 46.5, longitude: 11.35 }, "südtirol": { latitude: 46.5, longitude: 11.35 }, "emilia-romagna": { latitude: 44.5, longitude: 11.3 }, marche: { latitude: 43.5, longitude: 13.5 }, umbria: { latitude: 42.95, longitude: 12.65 }, lazio: { latitude: 41.8, longitude: 12.7 }, calabria: { latitude: 39.0, longitude: 16.5 }, basilicata: { latitude: 40.5, longitude: 15.8 },
  beaujolais: { latitude: 46.15, longitude: 4.65 }, savoie: { latitude: 45.55, longitude: 6.1 }, savoy: { latitude: 45.55, longitude: 6.1 }, corsica: { latitude: 42.15, longitude: 9.1 }, corse: { latitude: 42.15, longitude: 9.1 }, cahors: { latitude: 44.45, longitude: 1.44 }, madiran: { latitude: 43.52, longitude: -0.06 },
  rueda: { latitude: 41.41, longitude: -4.96 }, toro: { latitude: 41.52, longitude: -5.39 }, bierzo: { latitude: 42.55, longitude: -6.59 }, jumilla: { latitude: 38.48, longitude: -1.32 }, alicante: { latitude: 38.35, longitude: -0.48 }, cava: { latitude: 41.35, longitude: 1.7 },
  "vinho verde": { latitude: 41.63, longitude: -8.35 }, bairrada: { latitude: 40.38, longitude: -8.47 }, tejo: { latitude: 39.23, longitude: -8.68 }, setubal: { latitude: 38.52, longitude: -8.9 }, "setúbal": { latitude: 38.52, longitude: -8.9 }, madeira: { latitude: 32.72, longitude: -16.97 }, azores: { latitude: 38.5, longitude: -28.5 }, açores: { latitude: 38.5, longitude: -28.5 },
  nahe: { latitude: 49.83, longitude: 7.9 }, ahr: { latitude: 50.55, longitude: 7.1 }, franken: { latitude: 49.8, longitude: 10.2 }, wurttemberg: { latitude: 48.8, longitude: 9.3 }, "württemberg": { latitude: 48.8, longitude: 9.3 }, kamptal: { latitude: 48.48, longitude: 15.69 }, kremstal: { latitude: 48.37, longitude: 15.6 },
  tokaj: { latitude: 48.12, longitude: 21.41 }, santorini: { latitude: 36.4, longitude: 25.46 }, nemea: { latitude: 37.81, longitude: 22.66 }, slovenia: { latitude: 46.15, longitude: 14.99 }, croatia: { latitude: 45.1, longitude: 15.2 }, hrvatska: { latitude: 45.1, longitude: 15.2 }, georgia: { latitude: 42.32, longitude: 43.36 }, kakheti: { latitude: 41.65, longitude: 45.8 },
  "finger lakes": { latitude: 42.68, longitude: -76.95 }, "willamette valley": { latitude: 45.25, longitude: -123.1 }, "central coast": { latitude: 35.45, longitude: -120.7 }, "paso robles": { latitude: 35.63, longitude: -120.69 }, okanagan: { latitude: 49.7, longitude: -119.65 }, niagara: { latitude: 43.15, longitude: -79.25 }, "uco valley": { latitude: -33.0, longitude: -69.2 }, salta: { latitude: -25.0, longitude: -65.5 }, patagonia: { latitude: -39.0, longitude: -67.5 }, casablanca: { latitude: -33.32, longitude: -71.41 }, aconcagua: { latitude: -32.82, longitude: -70.6 }, limari: { latitude: -30.6, longitude: -71.2 }, "itata valley": { latitude: -36.75, longitude: -72.6 }, uruguay: { latitude: -32.52, longitude: -55.77 }, brazil: { latitude: -14.24, longitude: -51.93 }, brasil: { latitude: -14.24, longitude: -51.93 },
  coonawarra: { latitude: -37.29, longitude: 140.84 }, "mclaren vale": { latitude: -35.22, longitude: 138.54 }, "clare valley": { latitude: -33.88, longitude: 138.61 }, "eden valley": { latitude: -34.64, longitude: 139.08 }, "hunter valley": { latitude: -32.76, longitude: 151.35 }, tasmania: { latitude: -42.0, longitude: 146.6 }, "central otago": { latitude: -45.03, longitude: 169.2 }, "hawke's bay": { latitude: -39.5, longitude: 176.9 }, "hawkes bay": { latitude: -39.5, longitude: 176.9 },
  italy: { latitude: 42.5, longitude: 12.5 }, italia: { latitude: 42.5, longitude: 12.5 }, france: { latitude: 46.23, longitude: 2.21 }, germania: { latitude: 51.17, longitude: 10.45 }, germany: { latitude: 51.17, longitude: 10.45 }, austria: { latitude: 47.52, longitude: 14.55 }, spain: { latitude: 40.46, longitude: -3.75 }, españa: { latitude: 40.46, longitude: -3.75 }, espana: { latitude: 40.46, longitude: -3.75 }, portugal: { latitude: 39.4, longitude: -8.22 }, switzerland: { latitude: 46.82, longitude: 8.23 }, svizzera: { latitude: 46.82, longitude: 8.23 }, argentina: { latitude: -38.42, longitude: -63.62 }, chile: { latitude: -35.68, longitude: -71.54 }, "united states": { latitude: 39.83, longitude: -98.58 }, usa: { latitude: 39.83, longitude: -98.58 }, australia: { latitude: -25.27, longitude: 133.78 }, "new zealand": { latitude: -40.9, longitude: 174.89 }, "nuova zelanda": { latitude: -40.9, longitude: 174.89 }, canada: { latitude: 56.13, longitude: -106.35 }, hungary: { latitude: 47.16, longitude: 19.5 }, ungheria: { latitude: 47.16, longitude: 19.5 }, greece: { latitude: 39.07, longitude: 21.82 }, grecia: { latitude: 39.07, longitude: 21.82 },
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

function vineyardMapZoom(wine: Wine) {
  if (wine.vineyard_precision === "manual") return 15;
  if (wine.vineyard_precision === "vineyard") return 14;
  if (wine.vineyard_precision === "estate") return 12;
  if (wine.vineyard_precision === "locality") return 11;
  return 10;
}

function VineyardMapViewport({ position, zoom }: { position: [number, number]; zoom: number }) {
  const map = useMap();
  const [latitude, longitude] = position;

  useEffect(() => {
    map.invalidateSize({ pan: false });
    map.setView([latitude, longitude], zoom, { animate: false });
  }, [latitude, longitude, map, zoom]);

  return null;
}

function VineyardLocationMap({ wine, className, locale, fullscreen = false }: { wine: Wine; className: string; locale: Locale; fullscreen?: boolean }) {
  const position: [number, number] = [wine.vineyard_latitude as number, wine.vineyard_longitude as number];
  const zoom = vineyardMapZoom(wine);
  return (
    <MapContainer
      center={position}
      zoom={zoom}
      scrollWheelZoom={fullscreen}
      className={className}
    >
      <MapBaseLayers key={wine.id} locale={locale} />
      <VineyardMapViewport position={position} zoom={zoom} />
      <CircleMarker center={position} radius={fullscreen ? 11 : 9} pathOptions={{ color: "#fffaf0", weight: 3, fillColor: "#76233d", fillOpacity: 0.95 }}>
        <Tooltip permanent direction="top" offset={[0, -8]}>{wine.vineyard_name || wine.name}</Tooltip>
      </CircleMarker>
    </MapContainer>
  );
}

export function VineyardMap({ wine, locale }: { wine: Wine; locale: Locale }) {
  const [fullscreen, setFullscreen] = useState(false);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const precisionLabels = locale === "it"
    ? { vineyard: "Vigneto", estate: "Tenuta", locality: "Zona approssimativa", appellation: "Centro della denominazione", manual: "Punto impostato manualmente" }
    : { vineyard: "Vineyard", estate: "Estate", locality: "Approximate area", appellation: "Appellation centre", manual: "Manually positioned" };
  const precision = wine.vineyard_precision ? precisionLabels[wine.vineyard_precision] : "";
  const place = [wine.vineyard_locality, wine.vineyard_country].filter(Boolean).join(", ");

  useEffect(() => {
    if (!fullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      lastTriggerRef.current?.focus();
    };
  }, [fullscreen]);

  if (wine.vineyard_latitude === null || wine.vineyard_longitude === null) return null;

  const sourceLink = wine.vineyard_source_url ? (
    <a href={wine.vineyard_source_url} target="_blank" rel="noreferrer">
      {wine.vineyard_precision === "locality" || wine.vineyard_precision === "appellation" || wine.vineyard_precision === "manual"
        ? (locale === "it" ? "Fonte dell'origine" : "Origin source")
        : (locale === "it" ? "Fonte verificata" : "Verified source")}
      {wine.vineyard_source_title ? `: ${wine.vineyard_source_title}` : ""}
    </a>
  ) : null;

  return (
    <>
      <section className="detail-vineyard-block">
        <div className="section-heading">
          <div>
            <button type="button" className="vineyard-origin-trigger" onClick={(event) => { lastTriggerRef.current = event.currentTarget; setFullscreen(true); }}>
              <span>{locale === "it" ? "ORIGINE" : "ORIGIN"}</span>
              <strong>{place || wine.vineyard_name || wine.appellation || wine.region}</strong>
              <i aria-hidden="true">›</i>
            </button>
            <h3>{locale === "it" ? "Il luogo del vino" : "Where the wine comes from"}</h3>
          </div>
          <div className="vineyard-map-heading-actions">
            {precision ? <small>{precision}</small> : null}
            <button type="button" className="secondary compact vineyard-map-expand" onClick={(event) => { lastTriggerRef.current = event.currentTarget; setFullscreen(true); }}>
              <span aria-hidden="true">⛶</span>
              {locale === "it" ? "Apri mappa" : "Open map"}
            </button>
          </div>
        </div>
        <div className="vineyard-map-copy">
          <strong>{wine.vineyard_name || wine.appellation || wine.region}</strong>
          {place ? <span>{place}</span> : null}
          {wine.vineyard_notes ? <p>{wine.vineyard_notes}</p> : null}
        </div>
        <VineyardLocationMap wine={wine} className="vineyard-detail-map" locale={locale} />
        {sourceLink ? <small className="vineyard-map-source">{sourceLink}</small> : null}
      </section>
      {fullscreen ? createPortal(
        <section className="vineyard-fullscreen-view" aria-label={locale === "it" ? `Mappa di provenienza di ${wine.name}` : `Origin map for ${wine.name}`}>
          <header className="vineyard-fullscreen-header">
            <button ref={closeButtonRef} type="button" className="vineyard-fullscreen-back" onClick={() => setFullscreen(false)}>
              <span aria-hidden="true">←</span>
              <span>{locale === "it" ? "Torna al vino" : "Back to wine"}</span>
            </button>
            <div>
              <strong>{wine.vineyard_name || wine.appellation || wine.region}</strong>
              <span>{[place, precision].filter(Boolean).join(" · ")}</span>
            </div>
          </header>
          <VineyardLocationMap wine={wine} className="vineyard-fullscreen-map" locale={locale} fullscreen />
          <footer className="vineyard-fullscreen-card">
            <div>
              <span>{locale === "it" ? "PROVENIENZA" : "ORIGIN"}</span>
              <strong>{wine.name}{wine.vintage ? ` · ${wine.vintage}` : ""}</strong>
            </div>
            {wine.vineyard_notes ? <p>{wine.vineyard_notes}</p> : null}
            {sourceLink ? <small className="vineyard-map-source">{sourceLink}</small> : null}
          </footer>
        </section>,
        document.body,
      ) : null}
    </>
  );
}

export default function WineGeographyMap({ wines, t, onSelectRegion }: { wines: Wine[]; t: (key: TranslationKey) => string; onSelectRegion: (region: string) => void }) {
  const markers = new Map<string, WineMapPoint>();
  wines.forEach((wine) => {
    const location = wineRegionLocation(wine);
    const region = wine.region.trim();
    const label = region || wine.appellation.trim();
    if (!location || !label) return;
    const key = `${label}:${location.latitude}:${location.longitude}`;
    const current = markers.get(key) || { label, region, location, wines: 0, bottles: 0 };
    current.wines += 1;
    current.bottles += Math.max(Number(wine.quantity || 0), 0);
    markers.set(key, current);
  });
  const points = [...markers.values()].sort((first, second) => second.bottles - first.bottles);
  if (!points.length) return <p className="empty-state">{t("geographicMapEmpty")}</p>;

  return (
    <div className="wine-geography-map" aria-label={t("geographicMap")}>
      <MapContainer center={[24, 8]} zoom={2} minZoom={2} maxZoom={12} scrollWheelZoom className="wine-geography-leaflet">
        <DensityViewport points={points} />
        <TileLayer attribution={'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'} url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {points.map((point) => (
          <CircleMarker key={`${point.label}:${point.location.latitude}:${point.location.longitude}`} center={[point.location.latitude, point.location.longitude]} radius={Math.min(22, 7 + Math.sqrt(Math.max(point.bottles, 1)) * 2.25)} pathOptions={{ color: "#fff7ef", weight: 2, fillColor: "#9b3123", fillOpacity: 0.84 }} eventHandlers={point.region ? { click: () => onSelectRegion(point.region) } : undefined}>
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
