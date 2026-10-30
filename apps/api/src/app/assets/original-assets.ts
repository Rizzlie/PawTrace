import {
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { StoredPhoto } from '../../cases/photo-repository';
import type { Environment } from '../environment';
import {
  originalMetadata,
  storedOriginalSchema,
  type AssetMetadata,
  type StoredOriginal,
} from './asset-metadata';

// Internal upload transaction. Only the multipart adapter sees this protocol.
export type OriginalUpload = {
  /** Validates the staged bytes and names them; nothing leaves staging yet. */
  prepare(originalName: string): Promise<AssetMetadata>;
  /** Atomically moves the complete staged directory to its private storage key. */
  publish(storageId: string): Promise<void>;
  discard(): Promise<void>;
};

const ORIGINAL = 'original';
const METADATA = 'metadata.json';

function systemCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'STORAGE_ERROR';
}

export function originalStorageFailure(error: unknown): HttpException {
  return new HttpException(
    {
      error: 'original_storage_failed',
      message: 'Nie udało się zapisać oryginału. Ponów przesyłanie pliku.',
      systemCode: systemCode(error),
      retryable: true,
    },
    507,
  );
}

/** `objects/<storage id>` holds published photos; `staging/` is disposable at every start. */
@Injectable()
export class OriginalAssets {
  readonly objects: string;
  private readonly staging: string;

  constructor(config: ConfigService<Environment, true>) {
    const root = resolve(config.get('ASSET_DIRECTORY', { infer: true }));
    this.objects = join(root, 'objects');
    this.staging = join(root, 'staging');
  }

  async stage(stream: Readable, signal: AbortSignal): Promise<OriginalUpload> {
    const directory = join(this.staging, randomUUID());
    try {
      await mkdir(this.staging, { recursive: true });
      // Not recursive: Node reports a read-only disk as ENOENT when creating parents.
      await mkdir(directory);
      const path = join(directory, ORIGINAL);
      await pipeline(stream, createWriteStream(path, { flags: 'wx', flush: true }), { signal });
      const { size } = await stat(path);
      let published = false;
      return {
        prepare: async (originalName) => {
          const { extension, record } = await originalMetadata(path, originalName, size);
          await this.writeRecord(directory, 'metadata.part', record);
          return { ...record, filename: `${randomUUID()}.${extension}` };
        },
        publish: async (storageId) => {
          await mkdir(this.objects, { recursive: true });
          // Refuses an existing non-empty target, so a published original is never overwritten.
          await rename(directory, this.directory(storageId));
          published = true;
        },
        discard: async () => {
          if (!published) await this.removeQuietly(directory);
        },
      };
    } catch (error) {
      await this.removeQuietly(directory);
      throw originalStorageFailure(error);
    }
  }

  private async removeQuietly(directory: string): Promise<void> {
    try {
      await rm(directory, { recursive: true, force: true });
    } catch (error) {
      // Cleanup must not mask the upload's primary failure or expose filesystem paths.
      Logger.warn(
        `Incomplete original upload could not be removed (${systemCode(error)}).`,
        'OriginalAssets',
      );
    }
  }

  async clearStaging(): Promise<void> {
    await this.removeQuietly(this.staging);
    await mkdir(this.staging, { recursive: true }).catch(() => undefined);
  }

  async remove(storageId: string): Promise<void> {
    await rm(this.directory(storageId), { recursive: true, force: true });
  }

  directory(storageId: string): string {
    return join(this.objects, storageId);
  }

  originalPath(storageId: string): string {
    return join(this.directory(storageId), ORIGINAL);
  }

  private async writeRecord(
    directory: string,
    temporaryName: string,
    record: StoredOriginal,
  ): Promise<void> {
    const temporary = join(directory, temporaryName);
    const handle = await open(temporary, 'w');
    try {
      await handle.writeFile(JSON.stringify(storedOriginalSchema.parse(record)));
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, join(directory, METADATA));
  }

  /** Internal processing protocol: strict records and atomic replacement share storage ownership. */
  async findRecord(storageId: string): Promise<StoredOriginal | undefined> {
    try {
      return storedOriginalSchema.parse(
        JSON.parse(await readFile(join(this.directory(storageId), METADATA), 'utf8')),
      );
    } catch {
      return undefined;
    }
  }

  saveRecord(storageId: string, record: StoredOriginal): Promise<void> {
    return this.writeRecord(this.directory(storageId), 'processing-metadata.part', record);
  }

  async publishDerivative(
    storageId: string,
    record: StoredOriginal,
    kind: 'thumbnail' | 'preview',
    temporary: string,
  ): Promise<void> {
    const filename = `${kind}.png`;
    await rename(temporary, join(this.directory(storageId), filename));
    record.processing[kind] = { status: 'ready', filename };
    if (kind === 'thumbnail') record.thumbnailFilename = filename;
    else record.previewFilename = filename;
  }

  async derivative(photo: StoredPhoto, kind: 'thumbnail' | 'preview'): Promise<StreamableFile> {
    const metadata = await this.metadata(photo);
    const derivative = metadata.processing[kind];
    if (derivative.status !== 'ready')
      throw new NotFoundException('Podgląd zdjęcia niedostępny. Sprawdź metadane zdjęcia.');
    try {
      // Only module-generated derivative names can resolve, even if stored metadata was edited.
      if (derivative.filename !== `${kind}.png`)
        throw new NotFoundException('Podgląd zdjęcia niedostępny.');
      const handle = await open(join(this.directory(photo.storageId), derivative.filename), 'r');
      return new StreamableFile(handle.createReadStream(), {
        type: 'image/png',
        disposition: 'inline',
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (systemCode(error) === 'ENOENT')
        throw new NotFoundException('Podgląd zdjęcia niedostępny.');
      throw new HttpException('Podgląd zdjęcia jest niedostępny. Ponów odczyt.', 503);
    }
  }

  async metadata({ storageId, filename }: StoredPhoto): Promise<AssetMetadata> {
    try {
      const record = storedOriginalSchema.parse(
        JSON.parse(await readFile(join(this.directory(storageId), METADATA), 'utf8')),
      );
      return { ...record, filename };
    } catch (error) {
      if (systemCode(error) === 'ENOENT') throw new NotFoundException('Zdjęcie niedostępne.');
      throw new HttpException('Metadane zdjęcia są niedostępne. Ponów odczyt.', 503);
    }
  }

  async download(photo: StoredPhoto): Promise<StreamableFile> {
    const metadata = await this.metadata(photo);
    try {
      const handle = await open(this.originalPath(photo.storageId), 'r');
      return new StreamableFile(handle.createReadStream(), {
        type: metadata.mediaType,
        length: metadata.sizeBytes,
        disposition: `attachment; filename*=UTF-8''${encodeURIComponent(photo.filename)}`,
      });
    } catch (error) {
      if (systemCode(error) === 'ENOENT') throw new NotFoundException('Zdjęcie niedostępne.');
      throw new HttpException('Oryginał zdjęcia jest niedostępny. Ponów odczyt.', 503);
    }
  }
}
