import type { MapConfig, MapSourceConfig } from "./map-types";

const osmAttribution =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
export const defaultMapSources: Readonly<{
  osm: Readonly<MapSourceConfig>;
  satellite: Readonly<MapSourceConfig>;
}> = {
  osm: {
    urlTemplate: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: osmAttribution,
  },
  satellite: {
    urlTemplate:
      "https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/512/{z}/{x}/{y}?access_token={accessToken}",
    attribution:
      '<a href="https://www.mapbox.com/about/maps/">&copy; Mapbox</a> | ' +
      osmAttribution +
      ' | <a href="https://www.maxar.com/">&copy; Maxar</a> | <a href="https://www.mapbox.com/map-feedback/">Improve this map</a>',
  },
};

function isMapSource(value: unknown): value is MapSourceConfig {
  if (
    !value ||
    typeof value !== "object" ||
    !("urlTemplate" in value) ||
    !("attribution" in value) ||
    typeof value.urlTemplate !== "string" ||
    typeof value.attribution !== "string" ||
    !value.attribution.trim()
  )
    return false;
  const urlTemplate = value.urlTemplate;
  if (!["{z}", "{x}", "{y}"].every((part) => urlTemplate.includes(part)))
    return false;
  try {
    return ["http:", "https:"].includes(
      new URL(urlTemplate, "https://pawtrace.invalid").protocol,
    );
  } catch {
    return false;
  }
}

/** Validate the public runtime DTO before handing its source templates to Leaflet. */
export function parseMapConfig(value: unknown): MapConfig | undefined {
  if (
    !value ||
    typeof value !== "object" ||
    !("mapboxToken" in value) ||
    typeof value.mapboxToken !== "string"
  )
    return undefined;
  if ("osm" in value && !isMapSource(value.osm)) return undefined;
  if ("satellite" in value && !isMapSource(value.satellite)) return undefined;
  return {
    mapboxToken: value.mapboxToken,
    ...("osm" in value && isMapSource(value.osm)
      ? { osm: { ...value.osm } }
      : {}),
    ...("satellite" in value && isMapSource(value.satellite)
      ? { satellite: { ...value.satellite } }
      : {}),
  };
}
