import { UnsupportedMediaTypeException } from '@nestjs/common';
import { z } from 'zod';

const derivativeSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('pending') }).strict(),
  z.object({ status: z.literal('not_required') }).strict(),
  z.object({ status: z.literal('ready'), filename: z.string().regex(/^[\w.-]+$/u) }).strict(),
  z.object({ status: z.literal('failed'), error: z.string() }).strict(),
]);
/** The record beside each original. Its logical filename lives only in PostgreSQL. */
export const storedOriginalSchema = z
  .object({
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
export type StoredOriginal = z.infer<typeof storedOriginalSchema>;
/** What HTTP returns: the stored record under the filename the case knows it by. */
export type AssetMetadata = StoredOriginal & { filename: string };

const supportedFormats: Readonly<
  Record<string, { mediaType: StoredOriginal['mediaType']; extension: string } | undefined>
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
  originalName: string,
  sizeBytes: number,
): Promise<{ extension: string; record: StoredOriginal }> {
  const { fileTypeFromFile } = await import('file-type');
  const type = await fileTypeFromFile(path);
  const format = type && supportedFormats[type.mime];
  if (!format)
    throw new UnsupportedMediaTypeException('Obsługiwane formaty: JPEG, PNG, WebP i HEIC.');
  return {
    extension: format.extension,
    record: {
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
    },
  };
}
