import { z } from 'zod';
import { animalProfileSchema } from './animal-profile';
import {
  coordinatesSchema,
  eventTimeSchema,
  filenameSchema,
  geometrySchema,
  photosSchema,
  recordTimestamps,
  textSchema,
  timestampSchema,
  timeZoneSchema,
  validateUniqueValues,
} from './case-values';
import { areaCheckSchema, historyEntrySchema } from './history-entry';
import { validateCaseInvariants } from './case-invariants';

const pointSchema = z.strictObject({
  id: textSchema,
  name: textSchema,
  coordinates: coordinatesSchema,
  roles: z
    .array(z.enum(['potential_hiding_place', 'feeding_location', 'trail_camera', 'other']))
    .superRefine(validateUniqueValues),
  description: textSchema.nullable(),
  photos: photosSchema,
  entries: z.array(historyEntrySchema),
});
const areaSchema = z.strictObject({
  id: textSchema,
  name: textSchema,
  description: textSchema.nullable(),
  photos: photosSchema,
  plannedGeometry: geometrySchema.nullable(),
  checks: z.array(areaCheckSchema),
});
const assetSchema = z.strictObject({
  filename: filenameSchema,
  originalName: textSchema.nullable(),
  mediaType: z
    .string()
    .regex(/^image\/[a-zA-Z0-9.+-]+$/u)
    .nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  widthPixels: z.number().int().positive().nullable(),
  heightPixels: z.number().int().positive().nullable(),
  thumbnailFilename: filenameSchema.nullable(),
  previewFilename: filenameSchema.nullable(),
});
const documentShape = {
  schemaVersion: z.literal(1, {
    error: 'Unsupported schemaVersion; expected version 1.',
  }),
  case: z.strictObject({
    id: textSchema,
    title: textSchema,
    ...recordTimestamps,
    timeZone: timeZoneSchema,
    escape: z.strictObject({
      occurredAt: eventTimeSchema,
      escapePointId: textSchema.nullable(),
      description: textSchema.nullable(),
      directionOfTravel: textSchema.nullable(),
      familiarWithLocation: z.boolean().nullable(),
    }),
  }),
  animal: animalProfileSchema.nullable(),
  points: z.array(pointSchema),
  areas: z.array(areaSchema),
  assets: z.array(assetSchema),
  mapView: z.strictObject({
    center: coordinatesSchema,
    zoom: z.number().min(3).max(22),
    basemap: z.enum(['osm', 'satellite']),
  }),
};

const documentBaseSchema = z.strictObject(documentShape);
export type CaseDocument = z.infer<typeof documentBaseSchema>;
export const caseDocumentSchema = documentBaseSchema.superRefine(validateCaseInvariants);
export const caseFileSchema = z
  .strictObject({ ...documentShape, exportedAt: timestampSchema })
  .superRefine(validateCaseInvariants);
export type CaseFile = z.infer<typeof caseFileSchema>;
export type MapPoint = z.infer<typeof pointSchema>;
export type SearchArea = z.infer<typeof areaSchema>;
export type PhotoAsset = z.infer<typeof assetSchema>;
export interface CaseValidationIssue {
  path: (string | number)[];
  code: string;
  message: string;
}
export type CaseValidationResult<T> =
  { success: true; data: T } | { success: false; issues: CaseValidationIssue[] };

function validationResult<T>(result: z.ZodSafeParseResult<T>): CaseValidationResult<T> {
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.map((part) => (typeof part === 'number' ? part : String(part))),
      code: issue.code,
      message: issue.message,
    })),
  };
}

export function validateCaseDocument(input: unknown): CaseValidationResult<CaseDocument> {
  return validationResult(caseDocumentSchema.safeParse(input));
}

/** Consumes file metadata; only the committed document belongs in application state. */
export function parseCaseFile(text: string): CaseValidationResult<CaseDocument> {
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    return {
      success: false,
      issues: [{ path: [], code: 'invalid_json', message: 'Invalid JSON syntax.' }],
    };
  }
  const result = validationResult(caseFileSchema.safeParse(input));
  if (!result.success) return result;
  const { exportedAt, ...document } = result.data;
  void exportedAt;
  return { success: true, data: document };
}

/** Export time is supplied by the file adapter; validation and export have no side effects. */
export function serializeCaseFile(document: CaseDocument, exportedAt: string): string {
  const snapshot = caseDocumentSchema.parse(document);
  const file: CaseFile = {
    ...snapshot,
    exportedAt: timestampSchema.parse(exportedAt),
  };
  return JSON.stringify(file, null, 2);
}
