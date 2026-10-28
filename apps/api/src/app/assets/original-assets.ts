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
import type { Environment } from '../environment';
import {
  assetMetadataSchema,
  originalFilenamePattern,
  originalMetadata,
  type AssetMetadata,
} from './asset-metadata';

// Internal upload transaction. Only the multipart adapter sees this protocol.
export type OriginalUpload = {
  publish(originalName: string): Promise<AssetMetadata>;
  discard(): Promise<void>;
};

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

@Injectable()
export class OriginalAssets {
  private readonly root: string;

  constructor(config: ConfigService<Environment, true>) {
    this.root = resolve(config.get('ASSET_DIRECTORY', { infer: true }));
  }

  async stage(stream: Readable, signal: AbortSignal): Promise<OriginalUpload> {
    let directory: string | undefined;
    try {
      await mkdir(this.root, { recursive: true });
      let id: string;
      // Reserve the namespace for this original and its derivatives without overwriting.
      for (;;) {
        id = randomUUID();
        const candidate = join(this.root, id);
        try {
          await mkdir(candidate);
          directory = candidate;
          break;
        } catch (error) {
          if (systemCode(error) !== 'EEXIST') throw error;
        }
      }
      const reserved = directory;
      const path = join(reserved, 'original.part');
      await pipeline(stream, createWriteStream(path, { flags: 'wx', flush: true }), { signal });
      const { size } = await stat(path);
      let published = false;
      return {
        publish: async (originalName) => {
          const metadata = await originalMetadata(path, id, originalName, size);
          await rename(path, join(reserved, metadata.filename));
          const temporary = join(reserved, 'metadata.part');
          const handle = await open(temporary, 'wx');
          try {
            await handle.writeFile(JSON.stringify(metadata));
            await handle.sync();
          } finally {
            await handle.close();
          }
          signal.throwIfAborted();
          // Only the final metadata marker makes an original resolvable by HTTP.
          await rename(temporary, join(reserved, 'metadata.json'));
          published = true;
          return metadata;
        },
        discard: async () => {
          if (!published) await this.removeUnpublished(reserved);
        },
      };
    } catch (error) {
      if (directory) await this.removeUnpublished(directory);
      throw originalStorageFailure(error);
    }
  }

  private async removeUnpublished(directory: string): Promise<void> {
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

  private directory(filename: string): string {
    const match = originalFilenamePattern.exec(filename);
    if (!match) throw new NotFoundException('Zdjęcie niedostępne.');
    return join(this.root, match[1]);
  }

  async metadata(filename: string): Promise<AssetMetadata> {
    try {
      const directory = this.directory(filename);
      const metadata = assetMetadataSchema.parse(
        JSON.parse(await readFile(join(directory, 'metadata.json'), 'utf8')),
      );
      if (metadata.filename !== filename) throw new NotFoundException('Zdjęcie niedostępne.');
      return metadata;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (systemCode(error) === 'ENOENT') throw new NotFoundException('Zdjęcie niedostępne.');
      throw new HttpException('Metadane zdjęcia są niedostępne. Ponów odczyt.', 503);
    }
  }

  async download(filename: string): Promise<StreamableFile> {
    const metadata = await this.metadata(filename);
    try {
      const handle = await open(join(this.directory(filename), filename), 'r');
      return new StreamableFile(handle.createReadStream(), {
        type: metadata.mediaType,
        length: metadata.sizeBytes,
        disposition: `attachment; filename="${filename}"`,
      });
    } catch (error) {
      if (systemCode(error) === 'ENOENT') throw new NotFoundException('Zdjęcie niedostępne.');
      throw new HttpException('Oryginał zdjęcia jest niedostępny. Ponów odczyt.', 503);
    }
  }
}
