import { z } from "zod";
import {
  eventTimeSchema,
  geometrySchema,
  photosSchema,
  recordTimestamps,
  textSchema,
} from "./case-values";

const historyRecordShape = {
  id: textSchema,
  occurredAt: eventTimeSchema,
  ...recordTimestamps,
  description: textSchema.nullable(),
  photos: photosSchema,
};
const activeEntryShape = {
  status: z.literal("active"),
  rejectionReason: z.null(),
};
export const searchResultSchema = z.enum([
  "no_animal_or_signs",
  "possible_signs",
  "animal_seen",
  "animal_secured",
  "unable_to_check",
  "other_or_inconclusive",
]);
const checkShape = {
  result: searchResultSchema.nullable(),
  observationEntryId: textSchema.nullable(),
  method: textSchema.nullable(),
};
function validateCheckResult(
  check: { result: string | null; observationEntryId: string | null },
  context: z.RefinementCtx,
): void {
  if (
    (check.result === "animal_seen") !==
    (check.observationEntryId !== null)
  ) {
    context.addIssue({
      code: "custom",
      path: ["observationEntryId"],
      message:
        "An animal_seen result requires an observation ID; other results require null.",
    });
  }
}
export const historyEntrySchema = z.discriminatedUnion("type", [
  z
    .strictObject({
      ...historyRecordShape,
      type: z.literal("observation"),
      status: z.enum(["active", "rejected"]),
      rejectionReason: textSchema.nullable(),
      source: z
        .enum([
          "personal_observation",
          "another_person",
          "surveillance",
          "other",
        ])
        .nullable(),
      sourceDescription: textSchema.nullable(),
      uncertaintyRadiusMeters: z.number().positive().nullable(),
      identification: z.enum([
        "target_animal",
        "different_animal",
        "uncertain",
      ]),
    })
    .superRefine((entry, context) => {
      if ((entry.status === "rejected") !== (entry.rejectionReason !== null)) {
        context.addIssue({
          code: "custom",
          path: ["rejectionReason"],
          message:
            "A rejected observation requires a reason; an active observation requires null.",
        });
      }
    }),
  z.strictObject({
    ...historyRecordShape,
    ...activeEntryShape,
    type: z.literal("action"),
    details: z
      .strictObject({
        kind: z
          .enum([
            "food_placement",
            "food_refill",
            "trail_camera_setup",
            "other",
          ])
          .nullable(),
        foodType: textSchema.nullable(),
        foodQuantity: z
          .strictObject({
            value: z.number().positive(),
            unit: z.enum([
              "grams",
              "kilograms",
              "milliliters",
              "liters",
              "portions",
            ]),
          })
          .nullable(),
      })
      .partial()
      .nullable(),
  }),
  z
    .strictObject({
      ...historyRecordShape,
      ...activeEntryShape,
      ...checkShape,
      type: z.literal("check"),
      details: z
        .strictObject({
          foodStatus: z
            .enum(["present", "partially_eaten", "absent"])
            .nullable(),
        })
        .partial()
        .nullable(),
    })
    .superRefine(validateCheckResult),
  z.strictObject({
    ...historyRecordShape,
    ...activeEntryShape,
    type: z.literal("note"),
  }),
]);

export const areaCheckSchema = z
  .strictObject({
    ...historyRecordShape,
    ...checkShape,
    actualGeometry: geometrySchema,
  })
  .superRefine(validateCheckResult);

export type HistoryEntry = z.infer<typeof historyEntrySchema>;
export type AreaCheck = z.infer<typeof areaCheckSchema>;
export type SearchResult = z.infer<typeof searchResultSchema>;
