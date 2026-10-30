import { sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  customType,
  doublePrecision,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { users } from '../auth/schema';
import type { Coordinates } from '@pawtrace/case-domain';
import { decodePoint, decodePolygon } from './geometry-codec';

/** SRID 4326 point; database X is longitude and Y latitude. */
const point = customType<{ data: Coordinates; driverData: string | SQL }>({
  dataType: () => 'geometry(Point,4326)',
  toDriver: ({ longitude, latitude }) =>
    sql`ST_SetSRID(ST_MakePoint(${longitude}::double precision, ${latitude}::double precision), 4326)`,
  fromDriver: (value) => decodePoint(value as string),
});

/** v1 open ring stored as a closed PostGIS ring; decoding drops the repeated terminal vertex. */
const polygon = customType<{ data: Coordinates[]; driverData: string | SQL }>({
  dataType: () => 'geometry(Polygon,4326)',
  toDriver: (vertices) =>
    sql`ST_SetSRID(ST_MakePolygon(ST_MakeLine(ARRAY[${sql.join(
      [...vertices, vertices[0]].map(
        ({ longitude, latitude }) =>
          sql`ST_MakePoint(${longitude}::double precision, ${latitude}::double precision)`,
      ),
      sql`, `,
    )}])), 4326)`,
  fromDriver: (value) => decodePolygon(value as string),
});

const list = (values: readonly string[]) => sql.raw(values.map((value) => `'${value}'`).join(', '));
const oneOf = (column: SQLWrapper, values: readonly string[]) =>
  sql`${column} IN (${list(values)})`;

export const RECORD_KINDS = ['case', 'point', 'entry', 'area', 'area_check'] as const;
export const SEARCH_RESULTS = [
  'no_animal_or_signs',
  'possible_signs',
  'animal_seen',
  'animal_secured',
  'unable_to_check',
  'other_or_inconclusive',
] as const;
export const PROFILE_TEXT_FIELDS = [
  'name',
  'species',
  'breed',
  'coatColor',
  'coatPattern',
  'size',
  'distinguishingFeatures',
  'collarHarness',
  'microchipNumber',
  'illnesses',
  'injuries',
  'mobilityLimitations',
  'sensoryLimitations',
  'medication',
  'temperament',
  'reactionsToPeople',
  'reactionsToAnimals',
  'fears',
  'responseToCalls',
  'attractionMethods',
  'favoriteFood',
  'usualRoutes',
  'usualPlaces',
  'previousEscapes',
  'additionalInformation',
] as const;
export const PROFILE_BOOLEAN_FIELDS = ['neutered', 'microchipped', 'familiarWithArea'] as const;
export const PROFILE_FIELDS = [
  ...PROFILE_TEXT_FIELDS,
  ...PROFILE_BOOLEAN_FIELDS,
  'sex',
  'outdoorAccess',
  'age',
  'weightKilograms',
  'photos',
  'mainPhoto',
  'photoCaptions',
] as const;
export const ACTION_DETAIL_FIELDS = ['kind', 'foodType', 'foodQuantity'] as const;
export const CHECK_DETAIL_FIELDS = ['foodStatus'] as const;

const snake = (name: string) => name.replace(/[A-Z]/gu, (letter) => '_' + letter.toLowerCase());
const columns = <F extends string, C>(fields: readonly F[], column: (name: string) => C) =>
  Object.fromEntries(fields.map((field) => [field, column(snake(field))])) as Record<F, C>;

/** Ownership, server revision and case-level scalar fields. */
export const ownedCases = pgTable(
  'owned_case',
  {
    id: text('id').primaryKey(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id),
    version: integer('version').notNull(),
    savedAt: timestamp('saved_at', { withTimezone: true, mode: 'date' }).notNull(),
    title: text('title').notNull(),
    timeZone: text('time_zone').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    mapCenter: point('map_center').notNull(),
    mapZoom: doublePrecision('map_zoom').notNull(),
    mapBasemap: text('map_basemap').notNull(),
  },
  (table) => [
    index('owned_case_owner').on(table.ownerId, table.savedAt),
    check('owned_case_version_positive', sql`${table.version} > 0`),
    check('owned_case_basemap', oneOf(table.mapBasemap, ['osm', 'satellite'])),
  ],
);

/** Case-scoped identifier namespace: document-wide uniqueness across every record kind. */
export const caseRecords = pgTable(
  'case_record',
  {
    caseId: text('case_id')
      .notNull()
      .references(() => ownedCases.id, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    kind: text('kind').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.caseId, table.id] }),
    unique('case_record_kind').on(table.caseId, table.id, table.kind),
    check('case_record_kind_known', oneOf(table.kind, RECORD_KINDS)),
  ],
);
const record = (name: string, table: { caseId: AnyPgColumn; recordId: AnyPgColumn }) =>
  foreignKey({
    name: `${name}_record_fk`,
    columns: [table.caseId, table.recordId],
    foreignColumns: [caseRecords.caseId, caseRecords.id],
  }).onDelete('cascade');

/** Exactly one event time per case escape, point-history entry and area check. */
export const eventTimes = pgTable(
  'event_time',
  {
    caseId: text('case_id').notNull(),
    recordId: text('record_id').notNull(),
    kind: text('kind').notNull(),
    at: text('at'),
    rangeStart: text('range_start'),
    rangeEnd: text('range_end'),
    date: text('date'),
    description: text('description'),
  },
  (table) => [
    primaryKey({ columns: [table.caseId, table.recordId] }),
    record('event_time', table),
    check(
      'event_time_variant',
      sql`CASE ${table.kind}
        WHEN 'exact' THEN ${table.at} IS NOT NULL AND ${table.rangeStart} IS NULL AND ${table.rangeEnd} IS NULL AND ${table.date} IS NULL
        WHEN 'approximate' THEN ${table.at} IS NOT NULL AND ${table.rangeStart} IS NULL AND ${table.rangeEnd} IS NULL AND ${table.date} IS NULL
        WHEN 'range' THEN ${table.at} IS NULL AND ${table.date} IS NULL AND (${table.rangeStart} IS NOT NULL OR ${table.rangeEnd} IS NOT NULL)
        WHEN 'date' THEN ${table.date} IS NOT NULL AND ${table.at} IS NULL AND ${table.rangeStart} IS NULL AND ${table.rangeEnd} IS NULL
        WHEN 'unknown' THEN ${table.at} IS NULL AND ${table.rangeStart} IS NULL AND ${table.rangeEnd} IS NULL AND ${table.date} IS NULL
        ELSE false END`,
    ),
  ],
);

/** Ordered original-photo filenames referenced by the animal profile (case record) or a record. */
export const photoReferences = pgTable(
  'photo_reference',
  {
    caseId: text('case_id').notNull(),
    recordId: text('record_id').notNull(),
    position: integer('position').notNull(),
    filename: text('filename').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.caseId, table.recordId, table.position] }),
    unique('photo_reference_filename').on(table.caseId, table.recordId, table.filename),
    record('photo_reference', table),
  ],
);

export const points = pgTable(
  'point',
  {
    caseId: text('case_id').notNull(),
    id: text('id').notNull(),
    kind: text('kind').notNull().default('point'),
    position: integer('position').notNull(),
    name: text('name').notNull(),
    location: point('location').notNull(),
    description: text('description'),
  },
  (table) => [
    primaryKey({ columns: [table.caseId, table.id] }),
    unique('point_position').on(table.caseId, table.position),
    foreignKey({
      name: 'point_record_fk',
      columns: [table.caseId, table.id, table.kind],
      foreignColumns: [caseRecords.caseId, caseRecords.id, caseRecords.kind],
    }).onDelete('cascade'),
    check('point_kind', sql`${table.kind} = 'point'`),
  ],
);

export const caseEscapes = pgTable(
  'case_escape',
  {
    caseId: text('case_id').primaryKey(),
    recordId: text('record_id').notNull(),
    escapePointId: text('escape_point_id'),
    description: text('description'),
    directionOfTravel: text('direction_of_travel'),
    familiarWithLocation: boolean('familiar_with_location'),
  },
  (table) => [
    record('case_escape', table),
    check('case_escape_case_record', sql`${table.recordId} = ${table.caseId}`),
    foreignKey({
      name: 'case_escape_point_fk',
      columns: [table.caseId, table.escapePointId],
      foreignColumns: [points.caseId, points.id],
    }),
  ],
);

export const pointRoles = pgTable(
  'point_role',
  {
    caseId: text('case_id').notNull(),
    pointId: text('point_id').notNull(),
    position: integer('position').notNull(),
    role: text('role').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.caseId, table.pointId, table.position] }),
    unique('point_role_unique').on(table.caseId, table.pointId, table.role),
    foreignKey({
      name: 'point_role_point_fk',
      columns: [table.caseId, table.pointId],
      foreignColumns: [points.caseId, points.id],
    }).onDelete('cascade'),
    check(
      'point_role_known',
      oneOf(table.role, ['potential_hiding_place', 'feeding_location', 'trail_camera', 'other']),
    ),
  ],
);

export const historyEntries = pgTable(
  'history_entry',
  {
    caseId: text('case_id').notNull(),
    id: text('id').notNull(),
    kind: text('kind').notNull().default('entry'),
    pointId: text('point_id').notNull(),
    position: integer('position').notNull(),
    type: text('type').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    description: text('description'),
    status: text('status').notNull(),
    rejectionReason: text('rejection_reason'),
  },
  (table) => [
    primaryKey({ columns: [table.caseId, table.id] }),
    unique('history_entry_type').on(table.caseId, table.id, table.type),
    unique('history_entry_position').on(table.caseId, table.pointId, table.position),
    foreignKey({
      name: 'history_entry_record_fk',
      columns: [table.caseId, table.id, table.kind],
      foreignColumns: [caseRecords.caseId, caseRecords.id, caseRecords.kind],
    }).onDelete('cascade'),
    foreignKey({
      name: 'history_entry_point_fk',
      columns: [table.caseId, table.pointId],
      foreignColumns: [points.caseId, points.id],
    }).onDelete('cascade'),
    check('history_entry_kind', sql`${table.kind} = 'entry'`),
    check(
      'history_entry_type_known',
      oneOf(table.type, ['observation', 'action', 'check', 'note']),
    ),
    check(
      'history_entry_status',
      sql`(${table.status} = 'active' AND ${table.rejectionReason} IS NULL)
        OR (${table.type} = 'observation' AND ${table.status} = 'rejected' AND ${table.rejectionReason} IS NOT NULL)`,
    ),
  ],
);
const entryVariant = (
  table: { caseId: AnyPgColumn; entryId: AnyPgColumn; type: AnyPgColumn },
  type: string,
) => [
  primaryKey({ columns: [table.caseId, table.entryId] }),
  foreignKey({
    name: `${type}_detail_entry_fk`,
    columns: [table.caseId, table.entryId, table.type],
    foreignColumns: [historyEntries.caseId, historyEntries.id, historyEntries.type],
  }).onDelete('cascade'),
  check(`${snake(type)}_entry_type`, sql`${table.type} = ${sql.raw(`'${type}'`)}`),
];
/** A check result may link only an observation of the same case. */
const observationLink = (
  table: {
    caseId: AnyPgColumn;
    observationEntryId: AnyPgColumn;
    observationType: AnyPgColumn;
    result: AnyPgColumn;
  },
  name: string,
) => [
  foreignKey({
    name: `${name}_observation_fk`,
    columns: [table.caseId, table.observationEntryId, table.observationType],
    foreignColumns: [historyEntries.caseId, historyEntries.id, historyEntries.type],
  }),
  check(`${name}_observation_type`, sql`${table.observationType} = 'observation'`),
  check(
    `${name}_result_known`,
    sql`${table.result} IS NULL OR ${oneOf(table.result, SEARCH_RESULTS)}`,
  ),
  check(
    `${name}_animal_seen_link`,
    sql`(${table.result} IS NOT DISTINCT FROM 'animal_seen') = (${table.observationEntryId} IS NOT NULL)`,
  ),
];

export const observationDetails = pgTable(
  'observation_detail',
  {
    caseId: text('case_id').notNull(),
    entryId: text('entry_id').notNull(),
    type: text('type').notNull().default('observation'),
    source: text('source'),
    sourceDescription: text('source_description'),
    uncertaintyRadiusMeters: doublePrecision('uncertainty_radius_meters'),
    identification: text('identification').notNull(),
  },
  (table) => [
    ...entryVariant(table, 'observation'),
    check(
      'observation_source_known',
      sql`${table.source} IS NULL OR ${oneOf(table.source, ['personal_observation', 'another_person', 'surveillance', 'other'])}`,
    ),
    check(
      'observation_identification_known',
      oneOf(table.identification, ['target_animal', 'different_animal', 'uncertain']),
    ),
  ],
);

/** `details_fields` NULL means `details: null`; otherwise it lists the present optional keys. */
export const actionDetails = pgTable(
  'action_detail',
  {
    caseId: text('case_id').notNull(),
    entryId: text('entry_id').notNull(),
    type: text('type').notNull().default('action'),
    detailsFields: text('details_fields').array(),
    actionKind: text('action_kind'),
    foodType: text('food_type'),
    foodQuantityValue: doublePrecision('food_quantity_value'),
    foodQuantityUnit: text('food_quantity_unit'),
  },
  (table) => [
    ...entryVariant(table, 'action'),
    check(
      'action_detail_fields',
      sql`${table.detailsFields} <@ ARRAY[${list(ACTION_DETAIL_FIELDS)}]::text[]`,
    ),
    check(
      'action_quantity_pair',
      sql`(${table.foodQuantityValue} IS NULL) = (${table.foodQuantityUnit} IS NULL)`,
    ),
  ],
);

export const pointCheckDetails = pgTable(
  'point_check_detail',
  {
    caseId: text('case_id').notNull(),
    entryId: text('entry_id').notNull(),
    type: text('type').notNull().default('check'),
    result: text('result'),
    observationEntryId: text('observation_entry_id'),
    observationType: text('observation_type').notNull().default('observation'),
    method: text('method'),
    detailsFields: text('details_fields').array(),
    foodStatus: text('food_status'),
  },
  (table) => [
    ...entryVariant(table, 'check'),
    ...observationLink(table, 'point_check'),
    check(
      'point_check_detail_fields',
      sql`${table.detailsFields} <@ ARRAY[${list(CHECK_DETAIL_FIELDS)}]::text[]`,
    ),
  ],
);

/** Inline search geometry: a circle keeps exact center/radius, a polygon its vertex order. */
const geometryColumns = (prefix: string) => ({
  shape: text(`${prefix}_shape`),
  center: point(`${prefix}_center`),
  radiusMeters: doublePrecision(`${prefix}_radius_meters`),
  vertices: polygon(`${prefix}_vertices`),
});
const geometryVariant = (
  table: {
    shape: AnyPgColumn;
    center: AnyPgColumn;
    radiusMeters: AnyPgColumn;
    vertices: AnyPgColumn;
  },
  name: string,
  required: boolean,
) =>
  check(
    name,
    sql`CASE ${table.shape}
      WHEN 'circle' THEN ${table.center} IS NOT NULL AND ${table.radiusMeters} IS NOT NULL AND ${table.vertices} IS NULL
      WHEN 'polygon' THEN ${table.vertices} IS NOT NULL AND ${table.center} IS NULL AND ${table.radiusMeters} IS NULL
      ELSE ${required ? sql`false` : sql`${table.shape} IS NULL AND ${table.center} IS NULL AND ${table.radiusMeters} IS NULL AND ${table.vertices} IS NULL`} END`,
  );

const planned = geometryColumns('planned');
export const searchAreas = pgTable(
  'search_area',
  {
    caseId: text('case_id').notNull(),
    id: text('id').notNull(),
    kind: text('kind').notNull().default('area'),
    position: integer('position').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    plannedShape: planned.shape,
    plannedCenter: planned.center,
    plannedRadiusMeters: planned.radiusMeters,
    plannedVertices: planned.vertices,
  },
  (table) => [
    primaryKey({ columns: [table.caseId, table.id] }),
    unique('search_area_position').on(table.caseId, table.position),
    foreignKey({
      name: 'search_area_record_fk',
      columns: [table.caseId, table.id, table.kind],
      foreignColumns: [caseRecords.caseId, caseRecords.id, caseRecords.kind],
    }).onDelete('cascade'),
    check('search_area_kind', sql`${table.kind} = 'area'`),
    geometryVariant(
      {
        shape: table.plannedShape,
        center: table.plannedCenter,
        radiusMeters: table.plannedRadiusMeters,
        vertices: table.plannedVertices,
      },
      'search_area_planned_geometry',
      false,
    ),
  ],
);

/** Actual searched terrain: an independent snapshot, never derived from the current plan. */
const actual = geometryColumns('actual');
export const areaChecks = pgTable(
  'area_check',
  {
    caseId: text('case_id').notNull(),
    id: text('id').notNull(),
    kind: text('kind').notNull().default('area_check'),
    areaId: text('area_id').notNull(),
    position: integer('position').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    description: text('description'),
    result: text('result'),
    observationEntryId: text('observation_entry_id'),
    observationType: text('observation_type').notNull().default('observation'),
    method: text('method'),
    actualShape: actual.shape.notNull(),
    actualCenter: actual.center,
    actualRadiusMeters: actual.radiusMeters,
    actualVertices: actual.vertices,
  },
  (table) => [
    primaryKey({ columns: [table.caseId, table.id] }),
    unique('area_check_position').on(table.caseId, table.areaId, table.position),
    foreignKey({
      name: 'area_check_record_fk',
      columns: [table.caseId, table.id, table.kind],
      foreignColumns: [caseRecords.caseId, caseRecords.id, caseRecords.kind],
    }).onDelete('cascade'),
    foreignKey({
      name: 'area_check_area_fk',
      columns: [table.caseId, table.areaId],
      foreignColumns: [searchAreas.caseId, searchAreas.id],
    }).onDelete('cascade'),
    check('area_check_kind', sql`${table.kind} = 'area_check'`),
    ...observationLink(table, 'area_check'),
    geometryVariant(
      {
        shape: table.actualShape,
        center: table.actualCenter,
        radiusMeters: table.actualRadiusMeters,
        vertices: table.actualVertices,
      },
      'area_check_actual_geometry',
      true,
    ),
  ],
);

/** `present_fields` distinguishes an omitted optional profile answer from an explicit null. */
export const animalProfiles = pgTable(
  'animal_profile',
  {
    caseId: text('case_id').primaryKey(),
    recordId: text('record_id').notNull(),
    presentFields: text('present_fields').array().notNull(),
    ...columns(PROFILE_TEXT_FIELDS, (name) => text(name)),
    ...columns(PROFILE_BOOLEAN_FIELDS, (name) => boolean(name)),
    sex: text('sex'),
    outdoorAccess: text('outdoor_access'),
    ageValue: doublePrecision('age_value'),
    ageUnit: text('age_unit'),
    ageApproximate: boolean('age_approximate'),
    weightKilograms: doublePrecision('weight_kilograms'),
    mainPhoto: text('main_photo'),
  },
  (table) => [
    record('animal_profile', table),
    check('animal_profile_case_record', sql`${table.recordId} = ${table.caseId}`),
    check(
      'animal_profile_fields',
      sql`${table.presentFields} <@ ARRAY[${list(PROFILE_FIELDS)}]::text[]`,
    ),
    check(
      'animal_profile_age',
      sql`(${table.ageValue} IS NULL) = (${table.ageUnit} IS NULL) AND (${table.ageUnit} IS NULL) = (${table.ageApproximate} IS NULL)`,
    ),
    foreignKey({
      name: 'animal_profile_main_photo_fk',
      columns: [table.caseId, table.recordId, table.mainPhoto],
      foreignColumns: [photoReferences.caseId, photoReferences.recordId, photoReferences.filename],
    }),
  ],
);

export const photoCaptions = pgTable(
  'photo_caption',
  {
    caseId: text('case_id').notNull(),
    recordId: text('record_id').notNull(),
    position: integer('position').notNull(),
    filename: text('filename').notNull(),
    caption: text('caption').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.caseId, table.filename] }),
    unique('photo_caption_position').on(table.caseId, table.position),
    check('photo_caption_case_record', sql`${table.recordId} = ${table.caseId}`),
    foreignKey({
      name: 'photo_caption_photo_fk',
      columns: [table.caseId, table.recordId, table.filename],
      foreignColumns: [photoReferences.caseId, photoReferences.recordId, photoReferences.filename],
    }).onDelete('cascade'),
  ],
);

/** Photo metadata; neither a reference nor this row grants access to a stored server file. */
export const photoAssets = pgTable(
  'photo_asset',
  {
    caseId: text('case_id')
      .notNull()
      .references(() => ownedCases.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    filename: text('filename').notNull(),
    originalName: text('original_name'),
    mediaType: text('media_type'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    widthPixels: bigint('width_pixels', { mode: 'number' }),
    heightPixels: bigint('height_pixels', { mode: 'number' }),
    thumbnailFilename: text('thumbnail_filename'),
    previewFilename: text('preview_filename'),
  },
  (table) => [
    primaryKey({ columns: [table.caseId, table.filename] }),
    unique('photo_asset_position').on(table.caseId, table.position),
  ],
);

/** Idempotency ledger: replaying a key returns the committed acknowledgement, never re-applies. */
export const caseMutations = pgTable(
  'case_mutation',
  {
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id),
    idempotencyKey: text('idempotency_key').notNull(),
    fingerprint: text('fingerprint').notNull(),
    operation: text('operation').notNull(),
    caseId: text('case_id').notNull(),
    resultVersion: integer('result_version'),
    savedAt: timestamp('saved_at', { withTimezone: true, mode: 'date' }),
    committedAt: timestamp('committed_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.idempotencyKey] }),
    check(
      'case_mutation_operation',
      oneOf(table.operation, ['create', 'save', 'rename', 'delete']),
    ),
  ],
);
