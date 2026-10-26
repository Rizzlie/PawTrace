import { Controller, Get, Header } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Environment } from "./environment";

interface MapSourceDto {
  urlTemplate: string;
  attribution: string;
}

function sourceFromEnvironment(
  config: ConfigService<Environment, true>,
  prefix: "OSM" | "SATELLITE",
): MapSourceDto | undefined {
  const urlTemplate = config.get(`${prefix}_TILE_URL`, { infer: true }).trim();
  const attribution = config
    .get(`${prefix}_ATTRIBUTION`, { infer: true })
    .trim();
  if (!urlTemplate && !attribution) return undefined;
  return { urlTemplate, attribution };
}

@Controller("map-config")
export class MapConfigController {
  constructor(private readonly settings: ConfigService<Environment, true>) {}
  @Get()
  @Header("Cache-Control", "no-store")
  config(): {
    mapboxToken: string;
    osm?: MapSourceDto;
    satellite?: MapSourceDto;
  } {
    const token = this.settings.get("MAPBOX_PUBLIC_TOKEN", { infer: true });
    // This endpoint intentionally exposes browser credentials, never secret tokens.
    const osm = sourceFromEnvironment(this.settings, "OSM");
    const satellite = sourceFromEnvironment(this.settings, "SATELLITE");
    return {
      mapboxToken: token.startsWith("pk.") ? token : "",
      ...(osm ? { osm } : {}),
      ...(satellite ? { satellite } : {}),
    };
  }
}
