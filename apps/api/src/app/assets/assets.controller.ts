import {
  All,
  Controller,
  Get,
  Header,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AssetUploads } from './asset-uploads';
import { OriginalAssets } from './original-assets';
import { ImageProcessing } from './image-processing';
import { OwnerlessAsset } from '../../auth/auth-policy';
import { PhotoRepository } from '../../cases/photo-repository';
import { owner, StorableId } from '../../cases/request-scope';

/** Every route resolves owner → case → photo first; absent and foreign read the same. */
@Controller('cases/:caseId/assets')
export class AssetsController {
  constructor(
    @Inject(AssetUploads) private readonly uploads: AssetUploads,
    @Inject(OriginalAssets) private readonly originals: OriginalAssets,
    @Inject(ImageProcessing) private readonly processing: ImageProcessing,
    @Inject(PhotoRepository) private readonly photos: PhotoRepository,
  ) {}

  private async stored(request: Request, caseId: string, filename: string) {
    const photo = await this.photos.find(owner(request), caseId, filename);
    if (!photo) throw new NotFoundException({ error: 'not_found' });
    return photo;
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  upload(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Param('caseId', StorableId) caseId: string,
  ) {
    return this.uploads.receive(request, response, owner(request), caseId);
  }

  @Get(':filename/metadata')
  @Header('Cache-Control', 'no-store')
  async metadata(
    @Req() request: Request,
    @Param('caseId', StorableId) caseId: string,
    @Param('filename', StorableId) filename: string,
  ) {
    return this.originals.metadata(await this.stored(request, caseId, filename));
  }

  @Get(':filename')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async download(
    @Req() request: Request,
    @Param('caseId', StorableId) caseId: string,
    @Param('filename', StorableId) filename: string,
  ) {
    return this.originals.download(await this.stored(request, caseId, filename));
  }

  @Post(':filename/retry')
  @Header('Cache-Control', 'no-store')
  async retry(
    @Req() request: Request,
    @Param('caseId', StorableId) caseId: string,
    @Param('filename', StorableId) filename: string,
  ) {
    return this.processing.retry(await this.stored(request, caseId, filename));
  }

  @Get(':filename/thumbnail')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async thumbnail(
    @Req() request: Request,
    @Param('caseId', StorableId) caseId: string,
    @Param('filename', StorableId) filename: string,
  ) {
    return this.originals.derivative(await this.stored(request, caseId, filename), 'thumbnail');
  }

  @Get(':filename/preview')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async preview(
    @Req() request: Request,
    @Param('caseId', StorableId) caseId: string,
    @Param('filename', StorableId) filename: string,
  ) {
    return this.originals.derivative(await this.stored(request, caseId, filename), 'preview');
  }
}

/** The MVP's global URLs: no photo is reachable here, whoever asks and whatever the name. */
@Controller('assets')
@OwnerlessAsset()
export class LegacyAssetsController {
  @All(['', '{*path}'])
  denied() {
    throw new NotFoundException({ error: 'not_found' });
  }
}
