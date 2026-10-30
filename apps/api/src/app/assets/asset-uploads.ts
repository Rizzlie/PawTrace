import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { PhotoRepository } from '../../cases/photo-repository';
import { OriginalAssets, originalStorageFailure, type OriginalUpload } from './original-assets';

const publicationFailure = () =>
  new HttpException(
    {
      error: 'photo_publication_failed',
      message: 'Nie udało się przypisać zdjęcia do sprawy. Ponów przesyłanie pliku.',
      retryable: true,
    },
    503,
  );

@Injectable()
export class AssetUploads {
  constructor(
    @Inject(OriginalAssets) private readonly originals: OriginalAssets,
    @Inject(PhotoRepository) private readonly photos: PhotoRepository,
  ) {}

  /** A database failure is retryable, unlike the disk's 507, and hides nothing already public. */
  private async recorded<T>(operation: Promise<T>): Promise<T> {
    try {
      return await operation;
    } catch {
      throw publicationFailure();
    }
  }

  async receive(request: Request, response: Response, ownerId: string, caseId: string) {
    // Checked before the body is read: a foreign caller never reaches staging.
    if (!(await this.recorded(this.photos.ownsCase(ownerId, caseId))))
      throw new NotFoundException({ error: 'not_found' });
    const abort = new AbortController();
    const onAbort = () => abort.abort();
    request.once('aborted', onAbort);
    response.once('close', onAbort);
    let staged: Promise<OriginalUpload> | undefined;
    const discard = async () => {
      const upload = await staged?.catch(() => undefined);
      await upload?.discard();
    };
    // Request-scoped adapter owns the entire multipart transaction. No staged filenames escape it.
    const receive = multer({
      defParamCharset: 'utf8',
      // One independent file per request; no per-case count or file-size cap.
      limits: { fields: 0 },
      storage: {
        _handleFile: (_request, file, callback) => {
          staged = this.originals.stage(file.stream, abort.signal);
          void staged.then(
            () => callback(null, {}),
            (error: unknown) => callback(error),
          );
        },
        _removeFile: (_request, _file, callback) => {
          void discard().then(() => callback(null), callback);
        },
      },
    }).single('file');
    try {
      await new Promise<void>((resolveUpload, reject) => {
        receive(request, response, (error: unknown) => (error ? reject(error) : resolveUpload()));
      });
      const upload = await staged;
      if (!upload || !request.file)
        throw new BadRequestException('Prześlij jeden plik w polu file.');
      abort.signal.throwIfAborted();
      const asset = await upload.prepare(request.file.originalname);
      const photo = { storageId: randomUUID(), filename: asset.filename };
      // The row comes first: if the process dies next, it names no file and no client knows it.
      if (!(await this.recorded(this.photos.register(ownerId, caseId, photo))))
        throw new NotFoundException({ error: 'not_found' });
      try {
        await upload.publish(photo.storageId);
      } catch (error) {
        await this.photos.forget(photo.storageId).catch(() => {
          Logger.warn('Unpublished photo record could not be removed.', 'AssetUploads');
        });
        throw error;
      }
      // A case deleted meanwhile has already drained its removals, so this file is ours to remove.
      if (!(await this.recorded(this.photos.isRegistered(photo.storageId)))) {
        await this.originals.remove(photo.storageId);
        throw new NotFoundException({ error: 'not_found' });
      }
      return asset;
    } catch (error) {
      await discard();
      if (error instanceof HttpException) throw error;
      if (
        error instanceof multer.MulterError ||
        (error instanceof Error && /multipart|boundary|unexpected end/iu.test(error.message))
      ) {
        throw new BadRequestException('Nieprawidłowy upload. Prześlij jeden plik w polu file.');
      }
      throw originalStorageFailure(error);
    } finally {
      request.off('aborted', onAbort);
      response.off('close', onAbort);
    }
  }
}
