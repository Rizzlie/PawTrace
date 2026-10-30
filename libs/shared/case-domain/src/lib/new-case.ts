import type { CaseDocument } from './case-contract';

/** Default empty case: no invented incident facts, only caller-supplied identity and metadata time. */
export function createEmptyCase(input: {
  id: string;
  title: string;
  timeZone: string;
  now: string;
}): CaseDocument {
  return {
    schemaVersion: 1,
    case: {
      id: input.id,
      title: input.title,
      createdAt: input.now,
      updatedAt: input.now,
      timeZone: input.timeZone,
      escape: {
        occurredAt: { kind: 'unknown', description: null },
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
    mapView: { center: { latitude: 52.1, longitude: 19.4 }, zoom: 6, basemap: 'osm' },
  };
}
