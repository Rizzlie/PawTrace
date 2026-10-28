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
  number: number;
  name: string;
  coordinates: MapCoordinates;
  selected: boolean;
  accents?: string[];
  summary?: string;
}
export interface MapPointDraft {
  number: number;
  sessionId: number;
  coordinates: MapCoordinates | null;
  pointId: string;
}
export interface PointPlacement {
  sessionId: number;
  coordinates: MapCoordinates;
}

export interface MapArea {
  id: string;
  name: string;
  geometry: import('@pawtrace/case-domain').SearchGeometry;
  selected: boolean;
}
export interface MapAreaDraft {
  sessionId: number;
  areaId: string;
  type: 'circle' | 'polygon';
  vertices: MapCoordinates[];
  radiusMeters: number;
}
export interface AreaGeometryChange {
  sessionId: number;
  vertices: MapCoordinates[];
  radiusMeters: number;
}
