import { z } from 'zod';
import type { PhotoAsset } from '@pawtrace/case-domain';

const derivative = z.discriminatedUnion('status', [
  z.object({ status: z.literal('pending') }),
  z.object({ status: z.literal('not_required') }),
  z.object({ status: z.literal('ready'), filename: z.string() }),
  z.object({ status: z.literal('failed'), error: z.string() }),
]);
export const photoMetadataSchema = z.object({
  filename: z.string().regex(/^[0-9a-f-]{36}\.(jpg|png|webp|heic)$/u),
  originalName: z.string(),
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  sizeBytes: z.number().int().nonnegative(),
  widthPixels: z.number().int().positive().nullable(),
  heightPixels: z.number().int().positive().nullable(),
  thumbnailFilename: z.string().nullable(),
  previewFilename: z.string().nullable(),
  processing: z.object({ thumbnail: derivative, preview: derivative }),
});
export type PhotoMetadata = z.infer<typeof photoMetadataSchema>;
export interface PhotoRead {
  request: number;
  status: 'loading' | 'retrying' | 'ready' | 'error';
  operation: 'read' | 'retry';
  metadata: PhotoMetadata | null;
  error: string;
}

export function photoAsset(metadata: PhotoMetadata): PhotoAsset {
  const { processing, ...asset } = metadata;
  // Storage uses per-original directories. JSON uses globally unique logical filenames.
  return {
    ...asset,
    originalName: asset.originalName.trim() || null,
    thumbnailFilename:
      processing.thumbnail.status === 'ready' ? `${asset.filename}.thumbnail.png` : null,
    previewFilename: processing.preview.status === 'ready' ? `${asset.filename}.preview.png` : null,
  };
}

export function photoUrl(
  filename: string,
  kind?: 'thumbnail' | 'preview' | 'metadata' | 'retry',
): string {
  return `/api/assets/${encodeURIComponent(filename)}${kind ? '/' + kind : ''}`;
}
