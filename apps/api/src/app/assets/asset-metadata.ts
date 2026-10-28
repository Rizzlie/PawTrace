import { UnsupportedMediaTypeException } from '@nestjs/common';
import { z } from 'zod';

export const originalFilenamePattern =
  /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(jpg|png|webp|heic)$/u;
const derivativeSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('pending') }).strict(),
  z.object({ status: z.literal('not_required') }).strict(),
  z.object({ status: z.literal('ready'), filename: z.string().regex(/^[\w.-]+$/u) }).strict(),
  z.object({ status: z.literal('failed'), error: z.string() }).strict(),
]);
export const assetMetadataSchema = z
  .object({
    filename: z.string().regex(originalFilenamePattern),
    originalName: z.string(),
    mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
    sizeBytes: z.number().int().nonnegative(),
    widthPixels: z.number().int().positive().nullable(),
    heightPixels: z.number().int().positive().nullable(),
    thumbnailFilename: z.string().nullable(),
    previewFilename: z.string().nullable(),
    processing: z.object({ thumbnail: derivativeSchema, preview: derivativeSchema }).strict(),
  })
  .strict();
export type AssetMetadata = z.infer<typeof assetMetadataSchema>;

const supportedFormats: Readonly<
  Record<string, { mediaType: AssetMetadata['mediaType']; extension: string } | undefined>
> = {
  'image/jpeg': { mediaType: 'image/jpeg', extension: 'jpg' },
  'image/png': { mediaType: 'image/png', extension: 'png' },
  'image/apng': { mediaType: 'image/png', extension: 'png' },
  'image/webp': { mediaType: 'image/webp', extension: 'webp' },
  'image/heic': { mediaType: 'image/heic', extension: 'heic' },
  'image/heic-sequence': { mediaType: 'image/heic', extension: 'heic' },
  'image/heif': { mediaType: 'image/heic', extension: 'heic' },
  'image/heif-sequence': { mediaType: 'image/heic', extension: 'heic' },
};

export async function originalMetadata(
  path: string,
  id: string,
  originalName: string,
  sizeBytes: number,
): Promise<AssetMetadata> {
  const { fileTypeFromFile } = await import('file-type');
  const type = await fileTypeFromFile(path);
  const format = type && supportedFormats[type.mime];
  if (!format)
    throw new UnsupportedMediaTypeException('Obsługiwane formaty: JPEG, PNG, WebP i HEIC.');
  return {
    filename: `${id}.${format.extension}`,
    originalName,
    mediaType: format.mediaType,
    sizeBytes,
    widthPixels: null,
    heightPixels: null,
    thumbnailFilename: null,
    previewFilename: null,
    processing: {
      thumbnail: { status: 'pending' },
      preview: { status: format.mediaType === 'image/heic' ? 'pending' : 'not_required' },
    },
  };
}
