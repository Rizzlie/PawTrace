import type { CaseDocument, PhotoAsset } from '@pawtrace/case-domain';
import { photoAsset, type PhotoRead } from './photo-metadata';

export interface PhotoDraft {
  photos: string[];
  photoAssets: PhotoAsset[];
}
export interface PhotoTarget {
  caseId: string;
  generation: number;
  editorId: number;
}

export function createPhotoDraft(photos: string[] = []): PhotoDraft {
  return { photos: [...photos], photoAssets: [] };
}

export function mergePhotoAssets(assets: PhotoAsset[], updates: PhotoAsset[]): PhotoAsset[] {
  const byFilename = new Map(assets.map((asset) => [asset.filename, asset]));
  for (const asset of updates) byFilename.set(asset.filename, asset);
  return [...byFilename.values()];
}

export function applyPhotoAssets(document: CaseDocument, draft: PhotoDraft): PhotoAsset[] {
  return mergePhotoAssets(
    document.assets,
    draft.photoAssets.filter((a) => draft.photos.includes(a.filename)),
  );
}

/** Resolve transient server facts only as part of an explicit, validated editor Save. */
export function applyResolvedPhotoAssets(
  document: CaseDocument,
  reads: Record<string, PhotoRead>,
): CaseDocument {
  const photos = new Set([
    ...(document.animal?.photos ?? []),
    ...document.points.flatMap((point) => [
      ...point.photos,
      ...point.entries.flatMap((entry) => entry.photos),
    ]),
    ...document.areas.flatMap((area) => [
      ...area.photos,
      ...area.checks.flatMap((check) => check.photos),
    ]),
  ]);
  const resolved = Object.values(reads).flatMap((read) =>
    read.metadata && photos.has(read.metadata.filename) ? [photoAsset(read.metadata)] : [],
  );
  return { ...document, assets: mergePhotoAssets(document.assets, resolved) };
}

export function hasResolvedPhotoChanges(
  document: CaseDocument | null,
  reads: Record<string, PhotoRead>,
): boolean {
  return (
    !!document &&
    JSON.stringify(document.assets) !==
      JSON.stringify(applyResolvedPhotoAssets(document, reads).assets)
  );
}
