import { z } from "zod";
import { validatePolygon } from "./polygon-validation";

export const textSchema = z
  .string()
  .refine(
    (value) => value.trim().length > 0,
    "Use null for an unknown value; text must not be empty.",
  );
export const timestampSchema = z.iso.datetime({ offset: true });
export const timeZoneSchema = textSchema.refine((value) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, "Expected a recognized time zone, such as Europe/Warsaw or UTC.");
export const filenameSchema = textSchema.refine(
  (value) =>
    !/[\\/:?#]/u.test(value) &&
    Array.from(value).every(
      (character) =>
        character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
    ) &&
    value !== "." &&
    value !== "..",
  "Expected a server filename, without a path, URL, query or image data.",
);
export function validateUniqueValues(
  values: string[],
  context: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value))
      context.addIssue({
        code: "custom",
        path: [index],
        message: `Duplicate value "${value}".`,
      });
    seen.add(value);
  });
}
export const photosSchema = z
  .array(filenameSchema)
  .superRefine(validateUniqueValues);
export const coordinatesSchema = z.strictObject({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

const timeDescription = { description: textSchema.nullable() };
export const eventTimeSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("exact"),
    at: timestampSchema,
    ...timeDescription,
  }),
  z.strictObject({
    kind: z.literal("approximate"),
    at: timestampSchema,
    ...timeDescription,
  }),
  z
    .strictObject({
      kind: z.literal("range"),
      start: timestampSchema.nullable(),
      end: timestampSchema.nullable(),
      ...timeDescription,
    })
    .superRefine((range, context) => {
      if (range.start === null && range.end === null)
        context.addIssue({
          code: "custom",
          message:
            "A time range needs at least one endpoint; use unknown otherwise.",
        });
      if (
        range.start !== null &&
        range.end !== null &&
        Date.parse(range.end) < Date.parse(range.start)
      )
        context.addIssue({
          code: "custom",
          path: ["end"],
          message: "The end of the time range must not precede its start.",
        });
    }),
  z.strictObject({
    kind: z.literal("date"),
    date: z.iso.date(),
    ...timeDescription,
  }),
  z.strictObject({ kind: z.literal("unknown"), ...timeDescription }),
]);

export const geometrySchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("circle"),
    center: coordinatesSchema,
    radiusMeters: z.number().positive(),
  }),
  z
    .strictObject({
      type: z.literal("polygon"),
      vertices: z.array(coordinatesSchema).min(3),
    })
    .superRefine(validatePolygon),
]);

export const recordTimestamps = {
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
};
export type Coordinates = z.infer<typeof coordinatesSchema>;
export type EventTime = z.infer<typeof eventTimeSchema>;
export type SearchGeometry = z.infer<typeof geometrySchema>;
