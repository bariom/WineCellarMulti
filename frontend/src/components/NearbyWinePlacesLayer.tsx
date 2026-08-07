import { useEffect, useState } from "react";
import { CircleMarker, LayerGroup, Tooltip, useMap, useMapEvents } from "react-leaflet";

import { api } from "../services/api";
import type { Locale } from "../types";

type MapPlace = {
  name: string;
  latitude: number;
  longitude: number;
  kind: "winery" | "tasting" | "wine_shop";
};

type Viewport = {
  south: number;
  west: number;
  north: number;
  east: number;
  zoom: number;
};

function readViewport(map: ReturnType<typeof useMap>): Viewport {
  const bounds = map.getBounds();
  return {
    south: bounds.getSouth(),
    west: bounds.getWest(),
    north: bounds.getNorth(),
    east: bounds.getEast(),
    zoom: map.getZoom(),
  };
}

function NearbyWinePlaceMarkers({ enabled, locale }: { enabled: boolean; locale: Locale }) {
  const map = useMap();
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [places, setPlaces] = useState<MapPlace[]>([]);

  useMapEvents({
    moveend: () => {
      if (enabled) setViewport(readViewport(map));
    },
    zoomend: () => {
      if (enabled) setViewport(readViewport(map));
    },
  });

  useEffect(() => {
    if (!enabled) {
      setPlaces([]);
      return;
    }
    setViewport(readViewport(map));
  }, [enabled, map]);

  useEffect(() => {
    if (!viewport || viewport.zoom < 12) {
      setPlaces([]);
      return;
    }
    let active = true;
    const search = new URLSearchParams({
      south: viewport.south.toFixed(5),
      west: viewport.west.toFixed(5),
      north: viewport.north.toFixed(5),
      east: viewport.east.toFixed(5),
    });
    void api<MapPlace[]>(`/api/v1/map/places?${search.toString()}`)
      .then((result) => {
        if (active) setPlaces(result);
      })
      .catch(() => {
        if (active) setPlaces([]);
      });
    return () => {
      active = false;
    };
  }, [viewport]);

  const kindLabel = (kind: MapPlace["kind"]) => {
    if (locale === "it") return kind === "winery" ? "Cantina" : kind === "tasting" ? "Degustazione" : "Enoteca";
    return kind === "winery" ? "Winery" : kind === "tasting" ? "Wine tasting" : "Wine shop";
  };

  return (
    <>
      {places.map((place) => (
        <CircleMarker
          key={`${place.name}:${place.latitude}:${place.longitude}`}
          center={[place.latitude, place.longitude]}
          radius={6}
          pathOptions={{ color: "#fffaf0", weight: 2, fillColor: place.kind === "winery" ? "#8f6230" : "#496f61", fillOpacity: 0.94 }}
        >
          <Tooltip direction="top" offset={[0, -7]}>
            <strong>{place.name}</strong><br />
            {kindLabel(place.kind)}
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  );
}

export default function NearbyWinePlacesLayer({ locale }: { locale: Locale }) {
  const [enabled, setEnabled] = useState(false);
  return (
    <LayerGroup eventHandlers={{ add: () => setEnabled(true), remove: () => setEnabled(false) }}>
      <NearbyWinePlaceMarkers enabled={enabled} locale={locale} />
    </LayerGroup>
  );
}
