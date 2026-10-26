export interface MapConfig {
  mapboxToken: string;
}
export interface MapViewport {
  latitude: number;
  longitude: number;
  zoom: number;
}
export type Basemap = "osm" | "satellite";
