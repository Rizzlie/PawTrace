import type { CaseDocument, MapPoint } from '@pawtrace/case-domain';

export const pointRoles = [
  { key: 'potential_hiding_place', label: 'Potencjalna kryjówka' },
  { key: 'feeding_location', label: 'Miejsce karmienia' },
  { key: 'trail_camera', label: 'Fotopułapka' },
  { key: 'other', label: 'Inne' },
] as const;

export interface PointDraft {
  name: string;
  description: string;
  latitude: string;
  longitude: string;
  escape: boolean;
  roles: Record<MapPoint['roles'][number], boolean>;
}

export interface PointSession {
  kind: 'point';
  id: number;
  generation: number;
  version: number;
  pointId: string;
  draft: PointDraft;
  initial: PointDraft;
  error: string;
}

export function createPointDraft(document: CaseDocument, point?: MapPoint): PointDraft {
  return {
    name: point?.name ?? '',
    description: point?.description ?? '',
    latitude: point ? String(point.coordinates.latitude) : '',
    longitude: point ? String(point.coordinates.longitude) : '',
    escape: !!point && document.case.escape.escapePointId === point.id,
    roles: {
      potential_hiding_place: point?.roles.includes('potential_hiding_place') ?? false,
      feeding_location: point?.roles.includes('feeding_location') ?? false,
      trail_camera: point?.roles.includes('trail_camera') ?? false,
      other: point?.roles.includes('other') ?? false,
    },
  };
}

export function applyPointDraft(document: CaseDocument, session: PointSession): CaseDocument {
  const { draft, pointId } = session;
  const existing = document.points.find((point) => point.id === pointId);
  const point: MapPoint = {
    ...(existing ?? { id: pointId, photos: [], entries: [] }),
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    coordinates: {
      latitude: draft.latitude.trim() ? Number(draft.latitude) : NaN,
      longitude: draft.longitude.trim() ? Number(draft.longitude) : NaN,
    },
    roles: pointRoles.filter((role) => draft.roles[role.key]).map((role) => role.key),
  };
  return {
    ...document,
    case: {
      ...document.case,
      escape: {
        ...document.case.escape,
        escapePointId: draft.escape
          ? pointId
          : document.case.escape.escapePointId === pointId
            ? null
            : document.case.escape.escapePointId,
      },
    },
    points: existing
      ? document.points.map((current) => (current.id === pointId ? point : current))
      : [...document.points, point],
  };
}

/** Unlink observations removed with the place; retain other records and every asset. */
export function removePoint(document: CaseDocument, id: string): CaseDocument {
  const removed = new Set(
    document.points.find((point) => point.id === id)?.entries.map((entry) => entry.id),
  );
  const unlink = <
    T extends {
      observationEntryId: string | null;
      result: string | null;
      description: string | null;
    },
  >(
    check: T,
  ): T =>
    check.observationEntryId && removed.has(check.observationEntryId)
      ? {
          ...check,
          observationEntryId: null,
          result: 'other_or_inconclusive',
          description: [
            check.description,
            `Widziano zwierzę — powiązana obserwacja ${check.observationEntryId} została usunięta wraz z punktem.`,
          ]
            .filter(Boolean)
            .join('\n'),
        }
      : check;
  return {
    ...document,
    case: {
      ...document.case,
      escape: {
        ...document.case.escape,
        escapePointId:
          document.case.escape.escapePointId === id ? null : document.case.escape.escapePointId,
      },
    },
    points: document.points
      .filter((point) => point.id !== id)
      .map((point) => ({
        ...point,
        entries: point.entries.map((entry) => (entry.type === 'check' ? unlink(entry) : entry)),
      })),
    areas: document.areas.map((area) => ({ ...area, checks: area.checks.map(unlink) })),
  };
}
