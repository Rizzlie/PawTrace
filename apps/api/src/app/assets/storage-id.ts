import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const storageIdSchema = z.uuid().brand<'StorageId'>();

/** The server-generated name of one directory in `objects/`; no other text reaches that path. */
export type StorageId = z.infer<typeof storageIdSchema>;

export const newStorageId = () => storageIdSchema.parse(randomUUID());

export function parseStorageId(name: string): StorageId | undefined {
  return storageIdSchema.safeParse(name).data;
}
