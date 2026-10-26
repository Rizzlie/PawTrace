import { Controller, Get, Header } from "@nestjs/common";

@Controller("map-config")
export class MapConfigController {
  @Get()
  @Header("Cache-Control", "no-store")
  config(): { mapboxToken: string } {
    const token = process.env["MAPBOX_PUBLIC_TOKEN"]?.trim() ?? "";
    // This endpoint intentionally exposes browser credentials, never secret tokens.
    return { mapboxToken: token.startsWith("pk.") ? token : "" };
  }
}
