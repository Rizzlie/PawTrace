import type { z } from "zod";
import type { CaseDocument } from "./case-contract";

export function validateCaseInvariants(
  document: CaseDocument,
  context: z.RefinementCtx,
): void {
  const derivatives = new Set(
    document.assets.flatMap((asset) =>
      [asset.thumbnailFilename, asset.previewFilename].filter(
        (filename) => filename !== null,
      ),
    ),
  );
  const validatePhotos = (photos: string[], path: (string | number)[]) => {
    photos.forEach((filename, index) => {
      if (derivatives.has(filename))
        context.addIssue({
          code: "custom",
          path: [...path, index],
          message: `Photo "${filename}" is a derivative, not an original.`,
        });
    });
  };
  validatePhotos(document.animal?.photos ?? [], ["animal", "photos"]);
  const escapePointId = document.case.escape.escapePointId;
  if (
    escapePointId !== null &&
    !document.points.some((point) => point.id === escapePointId)
  ) {
    context.addIssue({
      code: "custom",
      path: ["case", "escape", "escapePointId"],
      message: `Escape point "${escapePointId}" does not exist in this case.`,
    });
  }
  const ids = new Set<string>();
  const observationIds = new Set(
    document.points.flatMap((point) =>
      point.entries
        .filter((entry) => entry.type === "observation")
        .map((entry) => entry.id),
    ),
  );
  const checkObservationReference = (
    check: { observationEntryId: string | null },
    path: (string | number)[],
  ) => {
    if (
      check.observationEntryId !== null &&
      !observationIds.has(check.observationEntryId)
    ) {
      context.addIssue({
        code: "custom",
        path: [...path, "observationEntryId"],
        message: `Observation "${check.observationEntryId}" does not exist in this case.`,
      });
    }
  };
  const registerId = (id: string, path: (string | number)[]) => {
    if (ids.has(id))
      context.addIssue({
        code: "custom",
        path,
        message: `Duplicate record ID "${id}".`,
      });
    ids.add(id);
  };
  registerId(document.case.id, ["case", "id"]);
  document.points.forEach((point, pointIndex) => {
    registerId(point.id, ["points", pointIndex, "id"]);
    validatePhotos(point.photos, ["points", pointIndex, "photos"]);
    point.entries.forEach((entry, entryIndex) => {
      const path = ["points", pointIndex, "entries", entryIndex];
      registerId(entry.id, [...path, "id"]);
      validatePhotos(entry.photos, [...path, "photos"]);
      if (entry.type === "check") checkObservationReference(entry, path);
    });
  });
  document.areas.forEach((area, areaIndex) => {
    registerId(area.id, ["areas", areaIndex, "id"]);
    validatePhotos(area.photos, ["areas", areaIndex, "photos"]);
    area.checks.forEach((check, checkIndex) => {
      const path = ["areas", areaIndex, "checks", checkIndex];
      registerId(check.id, [...path, "id"]);
      validatePhotos(check.photos, [...path, "photos"]);
      checkObservationReference(check, path);
    });
  });
  const filenames = new Set<string>();
  document.assets.forEach((asset, index) => {
    for (const field of [
      "filename",
      "thumbnailFilename",
      "previewFilename",
    ] as const) {
      const filename = asset[field];
      if (filename === null) continue;
      if (filenames.has(filename))
        context.addIssue({
          code: "custom",
          path: ["assets", index, field],
          message: `Duplicate asset filename "${filename}".`,
        });
      filenames.add(filename);
    }
  });
}
