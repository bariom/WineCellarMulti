import { useEffect, useState } from "react";
import { LayersControl, TileLayer } from "react-leaflet";
import { loadMapConfig, type MapConfig } from "../services/mapConfig";
import type { Locale } from "../types";
import NearbyWinePlacesLayer from "./NearbyWinePlacesLayer";

const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ARCGIS_IMAGERY_URL = "https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

export default function MapBaseLayers({ locale }: { locale: Locale }) {
  const [mapConfig, setMapConfig] = useState<MapConfig | null>(null);

  useEffect(() => {
    let active = true;
    void loadMapConfig().then((config) => {
      if (active) setMapConfig(config);
    });
    return () => {
      active = false;
    };
  }, []);

  const osmLayer = (
    <TileLayer
      attribution={'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}
      url={OSM_TILE_URL}
    />
  );
  const satelliteUrl = mapConfig?.satellite_enabled && mapConfig.arcgis_api_key
    ? `${ARCGIS_IMAGERY_URL}?token=${encodeURIComponent(mapConfig.arcgis_api_key)}`
    : "";
  return (
    <LayersControl position="topright">
      <LayersControl.BaseLayer checked name={locale === "it" ? "Mappa" : "Map"}>
        {osmLayer}
      </LayersControl.BaseLayer>
      {satelliteUrl ? (
        <LayersControl.BaseLayer name="Satellite">
          <TileLayer
            attribution={'Tiles &copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics, and the GIS User Community'}
            url={satelliteUrl}
          />
        </LayersControl.BaseLayer>
      ) : null}
      <LayersControl.Overlay name={locale === "it" ? "Cantine e luoghi (zoom ≥ 12)" : "Wineries and places (zoom ≥ 12)"}>
        <NearbyWinePlacesLayer />
      </LayersControl.Overlay>
    </LayersControl>
  );
}
