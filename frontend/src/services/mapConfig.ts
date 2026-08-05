import { api } from "./api";

export type MapConfig = {
  satellite_enabled: boolean;
  arcgis_api_key: string;
};

const FALLBACK_MAP_CONFIG: MapConfig = {
  satellite_enabled: false,
  arcgis_api_key: "",
};

let mapConfigRequest: Promise<MapConfig> | null = null;

export function loadMapConfig() {
  if (!mapConfigRequest) {
    mapConfigRequest = api<MapConfig>("/api/v1/map-config").catch(() => FALLBACK_MAP_CONFIG);
  }
  return mapConfigRequest;
}
