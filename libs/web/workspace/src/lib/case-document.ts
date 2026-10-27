import type { CaseDocument } from "@pawtrace/case-domain";
import type { MapViewport } from "@pawtrace/map-engine";

export function createCaseDocument(): CaseDocument {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    case: {
      id: crypto.randomUUID(),
      title: "Nowa sprawa",
      createdAt: now,
      updatedAt: now,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      escape: {
        occurredAt: { kind: "unknown", description: null },
        escapePointId: null,
        description: null,
        directionOfTravel: null,
        familiarWithLocation: null,
      },
    },
    animal: null,
    points: [],
    areas: [],
    assets: [],
    mapView: {
      center: { latitude: 52.1, longitude: 19.4 },
      zoom: 6,
      basemap: "osm",
    },
  };
}

export function summarizeCase(document: CaseDocument | null) {
  if (!document) return null;
  const { case: metadata, animal, points, areas, assets } = document;
  const pointPhotos = points.flatMap((point) => [
    ...point.photos,
    ...point.entries.flatMap((entry) => entry.photos),
  ]);
  const areaPhotos = areas.flatMap((area) => [
    ...area.photos,
    ...area.checks.flatMap((check) => check.photos),
  ]);
  return {
    title: metadata.title,
    animal: animal?.name ?? "Brak profilu zwierzęcia",
    points: points.length,
    entries:
      points.reduce((count, point) => count + point.entries.length, 0) +
      areas.reduce((count, area) => count + area.checks.length, 0),
    areas: areas.length,
    photos: new Set([
      ...(animal?.photos ?? []),
      ...pointPhotos,
      ...areaPhotos,
      ...assets.map((asset) => asset.filename),
    ]).size,
  };
}

export function isValidViewport(view: MapViewport): boolean {
  return (
    [view.latitude, view.longitude, view.zoom].every(Number.isFinite) &&
    Math.abs(view.latitude) <= 90 &&
    Math.abs(view.longitude) <= 180 &&
    view.zoom >= 3 &&
    view.zoom <= 19
  );
}

export function sameMapView(
  previous: CaseDocument["mapView"],
  next: CaseDocument["mapView"],
): boolean {
  return (
    previous.center.latitude === next.center.latitude &&
    previous.center.longitude === next.center.longitude &&
    previous.zoom === next.zoom &&
    previous.basemap === next.basemap
  );
}
