import { describe, expect, it } from 'vitest';
import minimalFile from '../fixtures/minimal-case-v1.json';
import completeFile from '../fixtures/complete-case-v1.json';
import { parseCaseFile, serializeCaseFile, validateCaseDocument } from '../index';

function expectFileIssue(file: unknown, path: (string | number)[], message?: string) {
  const result = parseCaseFile(JSON.stringify(file));
  expect(result.success).toBe(false);
  if (result.success) throw new Error('Expected an invalid case');
  expect(result.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        path,
        ...(message ? { message: expect.stringContaining(message) } : {}),
      }),
    ]),
  );
}

function objectPaths(value: unknown, path: (string | number)[] = []): (string | number)[][] {
  if (typeof value !== 'object' || value === null) return [];
  if (Array.isArray(value))
    return value.flatMap((item, index) => objectPaths(item, [...path, index]));
  return [
    path,
    ...Object.entries(value).flatMap(([key, item]) => objectPaths(item, [...path, key])),
  ];
}

describe('case JSON v1', () => {
  it('round-trips the closer map view and rejects zoom beyond the supported range', () => {
    const file = { ...minimalFile, mapView: { ...minimalFile.mapView, zoom: 22 } };
    const result = parseCaseFile(JSON.stringify(file));
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('Expected zoom 22 to be supported');
    expect(JSON.parse(serializeCaseFile(result.data, file.exportedAt)).mapView.zoom).toBe(22);
    expectFileIssue({ ...file, mapView: { ...file.mapView, zoom: 23 } }, ['mapView', 'zoom']);
  });
  it('round-trips a complete case including all histories, time precision, assessments and unavailable photos', () => {
    const { exportedAt, ...document } = completeFile;
    const imported = parseCaseFile(JSON.stringify(completeFile));
    expect(imported).toEqual({ success: true, data: document });
    if (!imported.success) throw new Error('Expected a valid complete case');
    expect(JSON.parse(serializeCaseFile(imported.data, exportedAt))).toEqual(completeFile);
  });
  it('opens and exports a map-first case without creating profile answers or editing metadata', () => {
    const { exportedAt, ...document } = minimalFile;
    const imported = parseCaseFile(JSON.stringify(minimalFile));
    expect(imported).toEqual({ success: true, data: document });
    expect(validateCaseDocument(document)).toEqual({
      success: true,
      data: document,
    });
    if (!imported.success) throw new Error('Expected a valid case');
    const original = structuredClone(imported.data);
    expect(JSON.parse(serializeCaseFile(imported.data, exportedAt))).toEqual(minimalFile);
    expect(imported.data).toEqual(original);
  });

  it('rejects duplicate stable IDs across records, naming the conflicting record', () => {
    const file = structuredClone(completeFile);
    file.areas[0].checks[0].id = 'observation-target';
    expectFileIssue(file, ['areas', 0, 'checks', 0, 'id'], 'observation-target');
  });

  it('requires the canonical escape reference to identify a point in this case', () => {
    const file = structuredClone(completeFile);
    file.case.escape.escapePointId = 'missing-point';
    expectFileIssue(file, ['case', 'escape', 'escapePointId'], 'missing-point');
  });

  it('links a search result to an existing observation rather than another history type', () => {
    const file = structuredClone(completeFile);
    file.areas[0].checks[0].observationEntryId = 'action-food';
    expectFileIssue(file, ['areas', 0, 'checks', 0, 'observationEntryId'], 'action-food');
  });

  it('requires animal-seen results to have an observation link and other results to have no link', () => {
    const file = structuredClone(completeFile);
    const check = file.areas[0].checks[0];
    expectFileIssue(
      {
        ...file,
        areas: [
          {
            ...file.areas[0],
            checks: [{ ...check, observationEntryId: null }],
          },
        ],
      },
      ['areas', 0, 'checks', 0, 'observationEntryId'],
    );
    check.result = 'no_animal_or_signs';
    expectFileIssue(file, ['areas', 0, 'checks', 0, 'observationEntryId']);
  });

  it('requires a reason for manual rejection independently of identification', () => {
    const file = structuredClone(completeFile);
    const entry = file.points[1].entries[0];
    entry.status = 'rejected';
    expectFileIssue(file, ['points', 1, 'entries', 0, 'rejectionReason']);
    entry.rejectionReason = 'Nieprawidłowa data relacji';
    expect(parseCaseFile(JSON.stringify(file)).success).toBe(true);
    entry.status = 'active';
    expectFileIssue(file, ['points', 1, 'entries', 0, 'rejectionReason']);
  });

  it('keeps main-photo and caption selections within the profile photo list', () => {
    const file = structuredClone(completeFile);
    file.animal.mainPhoto = 'not-in-profile.jpg';
    expectFileIssue(file, ['animal', 'mainPhoto'], 'not-in-profile.jpg');
    file.animal.mainPhoto = 'luna-original.heic';
    file.animal.photoCaptions[0].filename = 'not-in-profile.jpg';
    expectFileIssue(file, ['animal', 'photoCaptions', 0, 'filename'], 'not-in-profile.jpg');
  });

  it('rejects ambiguous duplicate photo, caption and point-role assignments', () => {
    const file = structuredClone(completeFile);
    file.points[1].roles = [...file.points[1].roles, 'feeding_location'];
    expectFileIssue(file, ['points', 1, 'roles', 3]);
    file.points[1].roles.pop();
    file.animal.photos.push('luna-original.heic');
    expectFileIssue(file, ['animal', 'photos', 2]);
    file.animal.photos.pop();
    file.animal.photoCaptions.push(file.animal.photoCaptions[0]);
    expectFileIssue(file, ['animal', 'photoCaptions', 1, 'filename']);
  });

  it('rejects filenames reused as originals or derivatives in asset metadata', () => {
    const file = structuredClone(completeFile);
    file.assets[1].filename = 'luna-thumb.webp';
    expectFileIssue(file, ['assets', 1, 'filename'], 'luna-thumb.webp');
  });

  it('rejects a thumbnail used in place of an original photo while allowing missing metadata', () => {
    const file = structuredClone(completeFile);
    file.points[0].photos = ['luna-thumb.webp'];
    expectFileIssue(file, ['points', 0, 'photos', 0], 'luna-thumb.webp');
    file.points[0].photos = ['missing-original.heic'];
    expect(parseCaseFile(JSON.stringify(file)).success).toBe(true);
  });

  it('rejects an interval with no known endpoint or an end before its start', () => {
    const file = structuredClone(minimalFile);
    const escape = {
      ...file.case.escape,
      occurredAt: {
        kind: 'range',
        start: null,
        end: null,
        description: 'Wieczorem',
      },
    };
    expectFileIssue({ ...file, case: { ...file.case, escape } }, ['case', 'escape', 'occurredAt']);
    expectFileIssue(
      {
        ...file,
        case: {
          ...file.case,
          escape: {
            ...escape,
            occurredAt: {
              kind: 'range',
              start: '2026-10-15T17:00:00+02:00',
              end: '2026-10-15T14:00:00Z',
              description: null,
            },
          },
        },
      },
      ['case', 'escape', 'occurredAt', 'end'],
    );
  });

  it('requires a recognized case time zone rather than interpreting an invalid zone locally', () => {
    expectFileIssue(
      {
        ...minimalFile,
        case: { ...minimalFile.case, timeZone: 'Europe/Not-a-city' },
      },
      ['case', 'timeZone'],
    );
  });

  it('rejects a self-crossing search footprint', () => {
    const file = structuredClone(completeFile);
    file.areas[0].checks[0].actualGeometry = {
      type: 'polygon',
      vertices: [
        { latitude: 51, longitude: 19 },
        { latitude: 52, longitude: 20 },
        { latitude: 51, longitude: 20 },
        { latitude: 52, longitude: 19 },
      ],
    };
    expectFileIssue(file, ['areas', 0, 'checks', 0, 'actualGeometry', 'vertices']);
  });

  it.each([
    [
      { latitude: 51, longitude: 19 },
      { latitude: 52, longitude: 20 },
      { latitude: 53, longitude: 21 },
    ],
    [
      { latitude: 51, longitude: 19 },
      { latitude: 52, longitude: 20 },
      { latitude: 51, longitude: 19 },
    ],
  ])('rejects degenerate polygon vertices %j', (...vertices) => {
    const file = structuredClone(completeFile);
    file.areas[0].checks[0].actualGeometry = { type: 'polygon', vertices };
    expectFileIssue(file, ['areas', 0, 'checks', 0, 'actualGeometry', 'vertices']);
  });

  it('rejects adjacent polygon edges that double back over each other', () => {
    const file = structuredClone(completeFile);
    file.areas[0].checks[0].actualGeometry = {
      type: 'polygon',
      vertices: [
        { latitude: 51, longitude: 19 },
        { latitude: 51, longitude: 21 },
        { latitude: 51, longitude: 20 },
        { latitude: 52, longitude: 21 },
        { latitude: 52, longitude: 19 },
      ],
    };
    expectFileIssue(file, ['areas', 0, 'checks', 0, 'actualGeometry', 'vertices']);
  });

  it.each(objectPaths(completeFile).map((path) => ({ path })))(
    'rejects unknown fields at $path without dropping data',
    ({ path }) => {
      const file = structuredClone(completeFile);
      const target = path.reduce<object>((current, key) => {
        const child: unknown = Reflect.get(current, key);
        if (typeof child !== 'object' || child === null)
          throw new Error('Expected a fixture object');
        return child;
      }, file);
      Object.defineProperty(target, 'futureField', {
        value: 'must survive or fail',
        enumerable: true,
      });
      expectFileIssue(file, path, 'futureField');
    },
  );

  it.each(['{', '', 'null', '[]', '"case"', 'true'])(
    'returns validation errors for invalid file text %j',
    (text) => {
      expect(parseCaseFile(text).success).toBe(false);
    },
  );

  it('explains unsupported versions and JSON syntax separately', () => {
    expectFileIssue({ ...minimalFile, schemaVersion: 2 }, ['schemaVersion'], 'version 1');
    expect(parseCaseFile('{')).toEqual({
      success: false,
      issues: [{ path: [], code: 'invalid_json', message: 'Invalid JSON syntax.' }],
    });
  });

  it.each([
    { ...minimalFile, schemaVersion: '1' },
    { ...minimalFile, mapView: { ...minimalFile.mapView, zoom: '6' } },
    { ...minimalFile, animal: { neutered: 'false' } },
  ])('rejects incorrectly typed values without coercion %#', (file) => {
    expect(parseCaseFile(JSON.stringify(file)).success).toBe(false);
  });

  it('does not mutate a supplied document while checking invalid data', () => {
    const { exportedAt, ...document } = structuredClone(completeFile);
    void exportedAt;
    document.case.escape.escapePointId = 'missing-point';
    const before = structuredClone(document);
    expect(validateCaseDocument(document).success).toBe(false);
    expect(document).toEqual(before);
  });

  it('allows a partially completed profile and preserves explicit negative answers, unknowns and empty lists', () => {
    const file = {
      ...minimalFile,
      animal: { neutered: false, breed: null, photos: [] },
    };
    const result = parseCaseFile(JSON.stringify(file));
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('Expected a partial profile');
    expect(result.data.animal).toEqual({
      neutered: false,
      breed: null,
      photos: [],
    });
  });

  it.each(['target_animal', 'different_animal', 'uncertain'])(
    'retains %s identification independently of active or rejected status',
    (identification) => {
      const file = structuredClone(completeFile);
      file.points[1].entries[0].identification = identification;
      expect(parseCaseFile(JSON.stringify(file)).success).toBe(true);
      file.points[1].entries[0].status = 'rejected';
      file.points[1].entries[0].rejectionReason = 'Niewłaściwa data';
      expect(parseCaseFile(JSON.stringify(file)).success).toBe(true);
    },
  );

  it('refuses to serialize local document fields that belong only in the exported file', () => {
    const { exportedAt, ...document } = minimalFile;
    const result = validateCaseDocument(document);
    if (!result.success) throw new Error('Expected a valid document');
    const documentWithFileMetadata = { ...result.data, exportedAt };
    expect(() => serializeCaseFile(documentWithFileMetadata, exportedAt)).toThrow();
  });

  it.each([
    { kind: 'exact', at: '2026-10-25T02:30:00+02:00', description: null },
    {
      kind: 'approximate',
      at: '2026-10-25T02:30:00+01:00',
      description: 'Około drugiej trzydzieści',
    },
    {
      kind: 'range',
      start: '2026-10-25T02:30:00+02:00',
      end: '2026-10-25T02:30:00+01:00',
      description: 'Podczas zmiany czasu',
    },
    {
      kind: 'range',
      start: null,
      end: '2026-10-25T15:00:00Z',
      description: 'Przed piętnastą',
    },
    { kind: 'date', date: '2026-10-25', description: 'Wieczorem' },
    { kind: 'unknown', description: 'Nie pamiętam daty' },
  ])('preserves event-time values and verbal precision: $kind', (occurredAt) => {
    const file = {
      ...minimalFile,
      case: {
        ...minimalFile.case,
        escape: { ...minimalFile.case.escape, occurredAt },
      },
    };
    const result = parseCaseFile(JSON.stringify(file));
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('Expected a valid event time');
    expect(result.data.case.escape.occurredAt).toEqual(occurredAt);
  });

  it.each([
    { kind: 'exact', at: '2026-10-25T02:30:00', description: null },
    { kind: 'approximate', at: '2026-02-30T12:00:00Z', description: null },
    { kind: 'date', date: '2026-02-29', description: null },
    { kind: 'date', date: '2026-10-25T00:00:00Z', description: null },
    { kind: 'unknown', at: '2026-10-25T00:00:00Z', description: null },
  ])('rejects ambiguous or malformed event time %#', (occurredAt) => {
    expect(
      parseCaseFile(
        JSON.stringify({
          ...minimalFile,
          case: {
            ...minimalFile.case,
            escape: { ...minimalFile.case.escape, occurredAt },
          },
        }),
      ).success,
    ).toBe(false);
  });

  it.each([
    {
      type: 'circle',
      center: { latitude: 51, longitude: 19 },
      radiusMeters: 0,
    },
    {
      type: 'circle',
      center: { latitude: 51, longitude: 19 },
      radiusMeters: -1,
    },
    {
      type: 'circle',
      center: { latitude: 91, longitude: 19 },
      radiusMeters: 50,
    },
    {
      type: 'circle',
      center: { latitude: 51, longitude: -181 },
      radiusMeters: 50,
    },
    {
      type: 'polygon',
      vertices: [
        { latitude: 51, longitude: 19 },
        { latitude: 52, longitude: 20 },
      ],
    },
    {
      type: 'polygon',
      vertices: [
        { latitude: 51, longitude: 19 },
        { latitude: 52, longitude: 20 },
        { latitude: 95, longitude: 21 },
      ],
    },
  ])('rejects invalid planned geometry %#', (plannedGeometry) => {
    const file = {
      ...completeFile,
      areas: [{ ...completeFile.areas[0], plannedGeometry }],
    };
    expect(parseCaseFile(JSON.stringify(file)).success).toBe(false);
  });

  it('retains a simple concave polygon in either vertex order without altering a historical footprint', () => {
    const vertices = [
      { latitude: 51, longitude: 19 },
      { latitude: 51, longitude: 21 },
      { latitude: 51.5, longitude: 20 },
      { latitude: 52, longitude: 21 },
      { latitude: 52, longitude: 19 },
    ];
    for (const ring of [vertices, [...vertices].reverse()]) {
      const file = {
        ...completeFile,
        areas: [
          {
            ...completeFile.areas[0],
            plannedGeometry: { type: 'polygon', vertices: ring },
          },
        ],
      };
      const result = parseCaseFile(JSON.stringify(file));
      expect(result.success).toBe(true);
      if (!result.success) throw new Error('Expected a valid polygon');
      expect(result.data.areas[0].plannedGeometry).toEqual({
        type: 'polygon',
        vertices: ring,
      });
      expect(result.data.areas[0].checks[0].actualGeometry).toEqual(
        completeFile.areas[0].checks[0].actualGeometry,
      );
    }
  });

  it.each([
    '../cat.jpg',
    'C:\\photos\\cat.jpg',
    'https://example.com/cat.jpg',
    'data:image/png;base64,aaa',
    'cat.jpg?token=1',
    '.',
    '..',
    'cat\u0000.jpg',
  ])('rejects non-filename photo reference %j', (filename) => {
    expectFileIssue({ ...minimalFile, animal: { photos: [filename] } }, ['animal', 'photos', 0]);
  });

  it.each([
    'no_animal_or_signs',
    'possible_signs',
    'animal_seen',
    'animal_secured',
    'unable_to_check',
    'other_or_inconclusive',
    null,
  ])('retains search result %s separately from food status', (result) => {
    const file = {
      ...completeFile,
      points: completeFile.points.map((point) => ({
        ...point,
        entries: point.entries.map((entry) =>
          entry.type === 'check'
            ? {
                ...entry,
                result,
                observationEntryId: result === 'animal_seen' ? 'observation-target' : null,
              }
            : entry,
        ),
      })),
    };
    expect(parseCaseFile(JSON.stringify(file)).success).toBe(true);
  });

  it('accepts food states without inventing an animal observation or food-event relationship', () => {
    for (const foodStatus of ['present', 'partially_eaten', 'absent', null]) {
      const file = {
        ...completeFile,
        points: completeFile.points.map((point) => ({
          ...point,
          entries: point.entries.map((entry) =>
            entry.type === 'check' ? { ...entry, result: null, details: { foodStatus } } : entry,
          ),
        })),
      };
      expect(parseCaseFile(JSON.stringify(file)).success).toBe(true);
    }
  });

  it('checks point-history references as well as area-history references', () => {
    const file = {
      ...completeFile,
      points: completeFile.points.map((point) => ({
        ...point,
        entries: point.entries.map((entry) =>
          entry.type === 'check'
            ? {
                ...entry,
                result: 'animal_seen',
                observationEntryId: 'deleted-observation',
              }
            : entry,
        ),
      })),
    };
    expectFileIssue(file, ['points', 1, 'entries', 5, 'observationEntryId'], 'deleted-observation');
  });

  it('rejects nonfinite numbers even when validating a local object rather than JSON text', () => {
    const result = parseCaseFile(JSON.stringify(minimalFile));
    if (!result.success) throw new Error('Expected a valid case');
    result.data.mapView.zoom = Infinity;
    expect(validateCaseDocument(result.data).success).toBe(false);
  });

  it('validates export time and committed data before producing a file', () => {
    const result = parseCaseFile(JSON.stringify(completeFile));
    if (!result.success) throw new Error('Expected a valid case');
    expect(() => serializeCaseFile(result.data, '2026-10-26T12:00:00')).toThrow();
    result.data.case.escape.escapePointId = 'missing';
    expect(() => serializeCaseFile(result.data, '2026-10-26T12:00:00Z')).toThrow();
  });
});
