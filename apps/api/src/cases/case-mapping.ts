import type {
  AnimalProfile,
  AreaCheck,
  CaseDocument,
  Coordinates,
  EventTime,
  HistoryEntry,
  SearchGeometry,
} from '@pawtrace/case-domain';
import {
  PROFILE_BOOLEAN_FIELDS,
  PROFILE_TEXT_FIELDS,
  type actionDetails,
  type animalProfiles,
  type areaChecks,
  type caseEscapes,
  type caseRecords,
  type eventTimes,
  type historyEntries,
  type observationDetails,
  type ownedCases,
  type photoAssets,
  type photoCaptions,
  type photoReferences,
  type pointCheckDetails,
  type pointRoles,
  type points,
  type searchAreas,
} from './schema';

type Row<T extends { $inferInsert: unknown }> = T['$inferInsert'];
type Stored<T extends { $inferSelect: unknown }> = T['$inferSelect'];

/** Case-level scalar row, excluding ownership and server revision. */
export type CaseScalars = Omit<Row<typeof ownedCases>, 'ownerId' | 'version' | 'savedAt'>;

/** Relational rows for one complete document, listed in foreign-key insertion order. */
export interface CaseRows {
  records: Row<typeof caseRecords>[];
  eventTimes: Row<typeof eventTimes>[];
  points: Row<typeof points>[];
  pointRoles: Row<typeof pointRoles>[];
  historyEntries: Row<typeof historyEntries>[];
  observationDetails: Row<typeof observationDetails>[];
  actionDetails: Row<typeof actionDetails>[];
  pointCheckDetails: Row<typeof pointCheckDetails>[];
  searchAreas: Row<typeof searchAreas>[];
  areaChecks: Row<typeof areaChecks>[];
  photoReferences: Row<typeof photoReferences>[];
  caseEscapes: Row<typeof caseEscapes>[];
  animalProfiles: Row<typeof animalProfiles>[];
  photoCaptions: Row<typeof photoCaptions>[];
  photoAssets: Row<typeof photoAssets>[];
}
export type StoredCaseRows = { [K in keyof CaseRows]: Stored<TableOf<K>>[] } & {
  scalars: Stored<typeof ownedCases>;
};
type TableOf<K extends keyof CaseRows> = {
  records: typeof caseRecords;
  eventTimes: typeof eventTimes;
  points: typeof points;
  pointRoles: typeof pointRoles;
  historyEntries: typeof historyEntries;
  observationDetails: typeof observationDetails;
  actionDetails: typeof actionDetails;
  pointCheckDetails: typeof pointCheckDetails;
  searchAreas: typeof searchAreas;
  areaChecks: typeof areaChecks;
  photoReferences: typeof photoReferences;
  caseEscapes: typeof caseEscapes;
  animalProfiles: typeof animalProfiles;
  photoCaptions: typeof photoCaptions;
  photoAssets: typeof photoAssets;
}[K];

const eventTimeRow = (caseId: string, recordId: string, time: EventTime) => ({
  caseId,
  recordId,
  kind: time.kind,
  at: time.kind === 'exact' || time.kind === 'approximate' ? time.at : null,
  rangeStart: time.kind === 'range' ? time.start : null,
  rangeEnd: time.kind === 'range' ? time.end : null,
  date: time.kind === 'date' ? time.date : null,
  description: time.description,
});

const geometryRow = (geometry: SearchGeometry | null) => ({
  shape: geometry?.type ?? null,
  center: geometry?.type === 'circle' ? geometry.center : null,
  radiusMeters: geometry?.type === 'circle' ? geometry.radiusMeters : null,
  vertices: geometry?.type === 'polygon' ? geometry.vertices : null,
});

const photoRows = (caseId: string, recordId: string, photos: string[]) =>
  photos.map((filename, position) => ({ caseId, recordId, position, filename }));

const presentKeys = (value: object | null | undefined) => (value ? Object.keys(value) : null);

/** Pure document → rows transform. The input must already pass the strict v1 schema. */
export function toCaseRows(document: CaseDocument): { scalars: CaseScalars; rows: CaseRows } {
  const caseId = document.case.id;
  const entries = document.points.flatMap((point) =>
    point.entries.map((entry, position) => ({ point, entry, position })),
  );
  const checks = document.areas.flatMap((area) =>
    area.checks.map((check, position) => ({ area, check, position })),
  );
  const animal = document.animal;
  const entryDetails = <T extends HistoryEntry['type']>(type: T) =>
    entries.flatMap(({ entry }) =>
      entry.type === type ? [entry as Extract<HistoryEntry, { type: T }>] : [],
    );
  return {
    scalars: {
      id: caseId,
      title: document.case.title,
      timeZone: document.case.timeZone,
      createdAt: document.case.createdAt,
      updatedAt: document.case.updatedAt,
      mapCenter: document.mapView.center,
      mapZoom: document.mapView.zoom,
      mapBasemap: document.mapView.basemap,
    },
    rows: {
      records: [
        { caseId, id: caseId, kind: 'case' },
        ...document.points.map((point) => ({ caseId, id: point.id, kind: 'point' })),
        ...entries.map(({ entry }) => ({ caseId, id: entry.id, kind: 'entry' })),
        ...document.areas.map((area) => ({ caseId, id: area.id, kind: 'area' })),
        ...checks.map(({ check }) => ({ caseId, id: check.id, kind: 'area_check' })),
      ],
      eventTimes: [
        eventTimeRow(caseId, caseId, document.case.escape.occurredAt),
        ...entries.map(({ entry }) => eventTimeRow(caseId, entry.id, entry.occurredAt)),
        ...checks.map(({ check }) => eventTimeRow(caseId, check.id, check.occurredAt)),
      ],
      points: document.points.map((point, position) => ({
        caseId,
        id: point.id,
        position,
        name: point.name,
        location: point.coordinates,
        description: point.description,
      })),
      pointRoles: document.points.flatMap((point) =>
        point.roles.map((role, position) => ({ caseId, pointId: point.id, position, role })),
      ),
      historyEntries: entries.map(({ point, entry, position }) => ({
        caseId,
        id: entry.id,
        pointId: point.id,
        position,
        type: entry.type,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        description: entry.description,
        status: entry.status,
        rejectionReason: entry.rejectionReason,
      })),
      observationDetails: entryDetails('observation').map((entry) => ({
        caseId,
        entryId: entry.id,
        source: entry.source,
        sourceDescription: entry.sourceDescription,
        uncertaintyRadiusMeters: entry.uncertaintyRadiusMeters,
        identification: entry.identification,
      })),
      actionDetails: entryDetails('action').map((entry) => ({
        caseId,
        entryId: entry.id,
        detailsFields: presentKeys(entry.details),
        actionKind: entry.details?.kind ?? null,
        foodType: entry.details?.foodType ?? null,
        foodQuantityValue: entry.details?.foodQuantity?.value ?? null,
        foodQuantityUnit: entry.details?.foodQuantity?.unit ?? null,
      })),
      pointCheckDetails: entryDetails('check').map((entry) => ({
        caseId,
        entryId: entry.id,
        result: entry.result,
        observationEntryId: entry.observationEntryId,
        method: entry.method,
        detailsFields: presentKeys(entry.details),
        foodStatus: entry.details?.foodStatus ?? null,
      })),
      searchAreas: document.areas.map((area, position) => {
        const planned = geometryRow(area.plannedGeometry);
        return {
          caseId,
          id: area.id,
          position,
          name: area.name,
          description: area.description,
          plannedShape: planned.shape,
          plannedCenter: planned.center,
          plannedRadiusMeters: planned.radiusMeters,
          plannedVertices: planned.vertices,
        };
      }),
      areaChecks: checks.map(({ area, check, position }) => {
        const actual = geometryRow(check.actualGeometry);
        return {
          caseId,
          id: check.id,
          areaId: area.id,
          position,
          createdAt: check.createdAt,
          updatedAt: check.updatedAt,
          description: check.description,
          result: check.result,
          observationEntryId: check.observationEntryId,
          method: check.method,
          actualShape: check.actualGeometry.type,
          actualCenter: actual.center,
          actualRadiusMeters: actual.radiusMeters,
          actualVertices: actual.vertices,
        };
      }),
      photoReferences: [
        ...photoRows(caseId, caseId, animal?.photos ?? []),
        ...document.points.flatMap((point) => [
          ...photoRows(caseId, point.id, point.photos),
          ...point.entries.flatMap((entry) => photoRows(caseId, entry.id, entry.photos)),
        ]),
        ...document.areas.flatMap((area) => [
          ...photoRows(caseId, area.id, area.photos),
          ...area.checks.flatMap((check) => photoRows(caseId, check.id, check.photos)),
        ]),
      ],
      caseEscapes: [
        {
          caseId,
          recordId: caseId,
          escapePointId: document.case.escape.escapePointId,
          description: document.case.escape.description,
          directionOfTravel: document.case.escape.directionOfTravel,
          familiarWithLocation: document.case.escape.familiarWithLocation,
        },
      ],
      animalProfiles: animal
        ? [
            {
              caseId,
              recordId: caseId,
              presentFields: Object.keys(animal),
              ...Object.fromEntries(
                [...PROFILE_TEXT_FIELDS, ...PROFILE_BOOLEAN_FIELDS].map((field) => [
                  field,
                  animal[field] ?? null,
                ]),
              ),
              sex: animal.sex ?? null,
              outdoorAccess: animal.outdoorAccess ?? null,
              ageValue: animal.age?.value ?? null,
              ageUnit: animal.age?.unit ?? null,
              ageApproximate: animal.age?.approximate ?? null,
              weightKilograms: animal.weightKilograms ?? null,
              mainPhoto: animal.mainPhoto ?? null,
            },
          ]
        : [],
      photoCaptions: (animal?.photoCaptions ?? []).map((caption, position) => ({
        caseId,
        recordId: caseId,
        position,
        filename: caption.filename,
        caption: caption.caption,
      })),
      photoAssets: document.assets.map((asset, position) => ({ caseId, position, ...asset })),
    },
  };
}

const byPosition = <T extends { position: number }>(rows: T[]) =>
  [...rows].sort((a, b) => a.position - b.position);
const group = <T, K>(rows: T[], key: (row: T) => K) =>
  rows.reduce((groups, row) => {
    groups.set(key(row), [...(groups.get(key(row)) ?? []), row]);
    return groups;
  }, new Map<K, T[]>());

function eventTime(row: Stored<typeof eventTimes> | undefined): EventTime {
  if (!row) throw new Error('Missing event time');
  const description = row.description;
  switch (row.kind) {
    case 'exact':
    case 'approximate':
      return { kind: row.kind, at: row.at as string, description };
    case 'range':
      return { kind: 'range', start: row.rangeStart, end: row.rangeEnd, description };
    case 'date':
      return { kind: 'date', date: row.date as string, description };
    default:
      return { kind: 'unknown', description };
  }
}

function geometry(row: {
  shape: string | null;
  center: Coordinates | null;
  radiusMeters: number | null;
  vertices: Coordinates[] | null;
}): SearchGeometry | null {
  if (row.shape === 'circle' && row.center && row.radiusMeters !== null)
    return { type: 'circle', center: row.center, radiusMeters: row.radiusMeters };
  if (row.shape === 'polygon' && row.vertices) return { type: 'polygon', vertices: row.vertices };
  return null;
}

/** Rebuilds a sparse object: only keys recorded as present exist, so omitted stays omitted. */
const present = (fields: string[], values: Record<string, unknown>) =>
  Object.fromEntries(fields.map((field) => [field, values[field]]));

/**
 * Pure rows → document reconstruction. Output is untrusted until the caller validates it
 * against the strict v1 schema.
 */
export function fromCaseRows(stored: StoredCaseRows): unknown {
  const caseId = stored.scalars.id;
  const times = new Map(stored.eventTimes.map((row) => [row.recordId, row]));
  const photos = group(byPosition(stored.photoReferences), (row) => row.recordId);
  const photosOf = (recordId: string) => (photos.get(recordId) ?? []).map((row) => row.filename);
  const roles = group(byPosition(stored.pointRoles), (row) => row.pointId);
  const entries = group(byPosition(stored.historyEntries), (row) => row.pointId);
  const checks = group(byPosition(stored.areaChecks), (row) => row.areaId);
  const observations = new Map(stored.observationDetails.map((row) => [row.entryId, row]));
  const actions = new Map(stored.actionDetails.map((row) => [row.entryId, row]));
  const pointChecks = new Map(stored.pointCheckDetails.map((row) => [row.entryId, row]));
  const [escape] = stored.caseEscapes;
  const [profile] = stored.animalProfiles;

  const entry = (row: Stored<typeof historyEntries>): HistoryEntry => {
    const base = {
      id: row.id,
      occurredAt: eventTime(times.get(row.id)),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      description: row.description,
      photos: photosOf(row.id),
    };
    if (row.type === 'observation') {
      const detail = observations.get(row.id);
      return {
        ...base,
        type: 'observation',
        status: row.status,
        rejectionReason: row.rejectionReason,
        source: detail?.source ?? null,
        sourceDescription: detail?.sourceDescription ?? null,
        uncertaintyRadiusMeters: detail?.uncertaintyRadiusMeters ?? null,
        identification: detail?.identification,
      } as HistoryEntry;
    }
    const active = { status: 'active' as const, rejectionReason: null };
    if (row.type === 'action') {
      const detail = actions.get(row.id);
      const fields = detail?.detailsFields;
      const values: Record<string, unknown> = {
        kind: detail?.actionKind ?? null,
        foodType: detail?.foodType ?? null,
        foodQuantity:
          detail?.foodQuantityValue != null
            ? { value: detail.foodQuantityValue, unit: detail.foodQuantityUnit }
            : null,
      };
      return {
        ...base,
        ...active,
        type: 'action',
        details: fields ? present(fields, values) : null,
      } as HistoryEntry;
    }
    if (row.type === 'check') {
      const detail = pointChecks.get(row.id);
      const fields = detail?.detailsFields;
      return {
        ...base,
        ...active,
        type: 'check',
        result: detail?.result ?? null,
        observationEntryId: detail?.observationEntryId ?? null,
        method: detail?.method ?? null,
        details: fields ? present(fields, { foodStatus: detail?.foodStatus ?? null }) : null,
      } as HistoryEntry;
    }
    return { ...base, ...active, type: 'note' } as HistoryEntry;
  };

  const areaCheck = (row: Stored<typeof areaChecks>): AreaCheck =>
    ({
      id: row.id,
      occurredAt: eventTime(times.get(row.id)),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      description: row.description,
      photos: photosOf(row.id),
      result: row.result,
      observationEntryId: row.observationEntryId,
      method: row.method,
      actualGeometry: geometry({
        shape: row.actualShape,
        center: row.actualCenter,
        radiusMeters: row.actualRadiusMeters,
        vertices: row.actualVertices,
      }),
    }) as AreaCheck;

  const profileValues = (row: Stored<typeof animalProfiles>): Record<string, unknown> => ({
    ...Object.fromEntries(
      [...PROFILE_TEXT_FIELDS, ...PROFILE_BOOLEAN_FIELDS].map((field) => [field, row[field]]),
    ),
    sex: row.sex,
    outdoorAccess: row.outdoorAccess,
    age:
      row.ageValue === null
        ? null
        : { value: row.ageValue, unit: row.ageUnit, approximate: row.ageApproximate },
    weightKilograms: row.weightKilograms,
    photos: photosOf(caseId),
    mainPhoto: row.mainPhoto,
    photoCaptions: byPosition(stored.photoCaptions).map(({ filename, caption }) => ({
      filename,
      caption,
    })),
  });

  return {
    schemaVersion: 1,
    case: {
      id: caseId,
      title: stored.scalars.title,
      createdAt: stored.scalars.createdAt,
      updatedAt: stored.scalars.updatedAt,
      timeZone: stored.scalars.timeZone,
      escape: {
        occurredAt: eventTime(times.get(caseId)),
        escapePointId: escape?.escapePointId ?? null,
        description: escape?.description ?? null,
        directionOfTravel: escape?.directionOfTravel ?? null,
        familiarWithLocation: escape?.familiarWithLocation ?? null,
      },
    },
    animal: profile
      ? (present(profile.presentFields, profileValues(profile)) as AnimalProfile)
      : null,
    points: byPosition(stored.points).map((row) => ({
      id: row.id,
      name: row.name,
      coordinates: row.location,
      roles: (roles.get(row.id) ?? []).map((role) => role.role),
      description: row.description,
      photos: photosOf(row.id),
      entries: (entries.get(row.id) ?? []).map(entry),
    })),
    areas: byPosition(stored.searchAreas).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      photos: photosOf(row.id),
      plannedGeometry: geometry({
        shape: row.plannedShape,
        center: row.plannedCenter,
        radiusMeters: row.plannedRadiusMeters,
        vertices: row.plannedVertices,
      }),
      checks: (checks.get(row.id) ?? []).map(areaCheck),
    })),
    assets: byPosition(stored.photoAssets).map(
      ({
        filename,
        originalName,
        mediaType,
        sizeBytes,
        widthPixels,
        heightPixels,
        thumbnailFilename,
        previewFilename,
      }) => ({
        filename,
        originalName,
        mediaType,
        sizeBytes,
        widthPixels,
        heightPixels,
        thumbnailFilename,
        previewFilename,
      }),
    ),
    mapView: {
      center: stored.scalars.mapCenter,
      zoom: stored.scalars.mapZoom,
      basemap: stored.scalars.mapBasemap,
    },
  };
}
