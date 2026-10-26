import { Controller, Get, Header } from "@nestjs/common";

interface MapSourceDto {
  urlTemplate: string;
  attribution: string;
}

function sourceFromEnvironment(
  prefix: "OSM" | "SATELLITE",
): MapSourceDto | undefined {
  const urlTemplate = process.env[`${prefix}_TILE_URL`]?.trim() ?? "";
  const attribution = process.env[`${prefix}_ATTRIBUTION`]?.trim() ?? "";
  if (!urlTemplate && !attribution) return undefined;
  return { urlTemplate, attribution };
}

@Controller("map-config")
export class MapConfigController {
  @Get()
  @Header("Cache-Control", "no-store")
  config(): {
    mapboxToken: string;
    osm?: MapSourceDto;
    satellite?: MapSourceDto;
  } {
    const token = process.env["MAPBOX_PUBLIC_TOKEN"]?.trim() ?? "";
    // This endpoint intentionally exposes browser credentials, never secret tokens.
    const osm = sourceFromEnvironment("OSM");
    const satellite = sourceFromEnvironment("SATELLITE");
    return {
      mapboxToken: token.startsWith("pk.") ? token : "",
      ...(osm ? { osm } : {}),
      ...(satellite ? { satellite } : {}),
    };
  }
}
