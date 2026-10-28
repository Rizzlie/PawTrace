import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import multer from 'multer';
import { OriginalAssets, originalStorageFailure, type OriginalUpload } from './original-assets';

@Injectable()
export class AssetUploads {
  constructor(private readonly originals: OriginalAssets) {}

  async receive(request: Request, response: Response) {
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
      return await upload.publish(request.file.originalname);
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
