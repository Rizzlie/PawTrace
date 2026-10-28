import { area } from '@turf/area';
import { distance } from '@turf/distance';
import type { Coordinates, SearchGeometry } from './case-values';

/** Great-circle ground distance, independent of the map projection. */
export function groundDistance(from: Coordinates, to: Coordinates): number {
  return distance([from.longitude, from.latitude], [to.longitude, to.latitude], {
    units: 'meters',
  });
}

/** Approximate ground area in m² on Turf's mean-radius sphere. */
export function geometryArea(geometry: SearchGeometry): number {
  if (geometry.type === 'circle') return Math.PI * geometry.radiusMeters ** 2;
  if (geometry.vertices.length < 3) return 0;
  const ring = geometry.vertices.map(({ latitude, longitude }) => [longitude, latitude]);
  return area({ type: 'Polygon', coordinates: [[...ring, ring[0]]] });
}
