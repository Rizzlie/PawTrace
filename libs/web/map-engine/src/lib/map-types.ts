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
export type Basemap = 'osm' | 'satellite';

/** Technical startup positioning mode, selected by the application. */
export type InitialLocation = 'off' | 'show' | 'center';

export interface MapCoordinates {
  latitude: number;
  longitude: number;
}
export interface MapPlace {
  id: string;
  name: string;
  coordinates: MapCoordinates;
  selected: boolean;
}
export interface MapPointDraft {
  sessionId: number;
  coordinates: MapCoordinates | null;
  pointId: string;
}
export interface PointPlacement {
  sessionId: number;
  coordinates: MapCoordinates;
}
