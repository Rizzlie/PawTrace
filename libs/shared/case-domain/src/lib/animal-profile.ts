import { z } from "zod";
import { filenameSchema, photosSchema, textSchema } from "./case-values";

const unknownText = textSchema.nullable();
export const animalProfileSchema = z
  .strictObject({
    name: unknownText,
    species: unknownText,
    breed: unknownText,
    sex: z.enum(["female", "male", "intersex"]).nullable(),
    neutered: z.boolean().nullable(),
    age: z
      .strictObject({
        value: z.number().nonnegative(),
        unit: z.enum(["months", "years"]),
        approximate: z.boolean(),
      })
      .nullable(),
    weightKilograms: z.number().positive().nullable(),
    coatColor: unknownText,
    coatPattern: unknownText,
    size: unknownText,
    distinguishingFeatures: unknownText,
    collarHarness: unknownText,
    microchipped: z.boolean().nullable(),
    microchipNumber: unknownText,
    illnesses: unknownText,
    injuries: unknownText,
    mobilityLimitations: unknownText,
    sensoryLimitations: unknownText,
    medication: unknownText,
    temperament: unknownText,
    reactionsToPeople: unknownText,
    reactionsToAnimals: unknownText,
    fears: unknownText,
    responseToCalls: unknownText,
    attractionMethods: unknownText,
    favoriteFood: unknownText,
    outdoorAccess: z
      .enum(["indoor_only", "supervised", "unrestricted"])
      .nullable(),
    familiarWithArea: z.boolean().nullable(),
    usualRoutes: unknownText,
    usualPlaces: unknownText,
    previousEscapes: unknownText,
    additionalInformation: unknownText,
    photos: photosSchema,
    mainPhoto: filenameSchema.nullable(),
    photoCaptions: z.array(
      z.strictObject({ filename: filenameSchema, caption: textSchema }),
    ),
  })
  .partial()
  .superRefine((profile, context) => {
    const photos = new Set(profile.photos ?? []);
    const captioned = new Set<string>();
    if (profile.mainPhoto != null && !photos.has(profile.mainPhoto)) {
      context.addIssue({
        code: "custom",
        path: ["mainPhoto"],
        message: `Main photo "${profile.mainPhoto}" is not in the profile photos.`,
      });
    }
    profile.photoCaptions?.forEach((caption, index) => {
      if (!photos.has(caption.filename))
        context.addIssue({
          code: "custom",
          path: ["photoCaptions", index, "filename"],
          message: `Caption photo "${caption.filename}" is not in the profile photos.`,
        });
      if (captioned.has(caption.filename))
        context.addIssue({
          code: "custom",
          path: ["photoCaptions", index, "filename"],
          message: `Duplicate caption for "${caption.filename}".`,
        });
      captioned.add(caption.filename);
    });
  });

export type AnimalProfile = z.infer<typeof animalProfileSchema>;
