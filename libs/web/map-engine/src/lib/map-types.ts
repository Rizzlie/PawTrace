export interface MapSourceConfig {
  urlTemplate: string;
  attribution: string;
}
export interface MapConfig {
  mapboxToken: string;
  osm?: MapSourceConfig;
  satellite?: MapSourceConfig;
}
export interface MapViewport {
  latitude: number;
  longitude: number;
  zoom: number;
}
export type Basemap = "osm" | "satellite";
