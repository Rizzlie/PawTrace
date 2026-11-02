import {
  All,
  Controller,
  createParamDecorator,
  Get,
  Header,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  type ExecutionContext,
  type PipeTransform,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AssetUploads } from './asset-uploads';
import { OriginalAssets } from './original-assets';
import { ImageProcessing } from './image-processing';
import { OwnerlessAsset } from '../../auth/auth-policy';
import { PhotoRepository, type StoredPhoto } from '../../cases/photo-repository';
import { owner, StorableId } from '../../cases/request-scope';

/** Resolves owner → case → photo before a handler can touch the filesystem. */
@Injectable()
class FindOwnedPhoto implements PipeTransform<Request, Promise<StoredPhoto>> {
  private readonly storable = new StorableId();

  constructor(@Inject(PhotoRepository) private readonly photos: PhotoRepository) {}

  async transform(request: Request): Promise<StoredPhoto> {
    const [caseId, filename] = [request.params['caseId'], request.params['filename']].map((id) =>
      this.storable.transform(String(id)),
    );
    const photo = await this.photos.find(owner(request), caseId, filename);
    if (!photo) throw new NotFoundException({ error: 'not_found' });
    return photo;
  }
}

const CurrentRequest = createParamDecorator((_: unknown, context: ExecutionContext): Request =>
  context.switchToHttp().getRequest(),
);
const OwnedPhoto = () => CurrentRequest(FindOwnedPhoto);

/** Every route resolves owner → case → photo first; absent and foreign read the same. */
@Controller('cases/:caseId/assets')
export class AssetsController {
  constructor(
    @Inject(AssetUploads) private readonly uploads: AssetUploads,
    @Inject(OriginalAssets) private readonly originals: OriginalAssets,
    @Inject(ImageProcessing) private readonly processing: ImageProcessing,
  ) {}

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
  metadata(@OwnedPhoto() photo: StoredPhoto) {
    return this.originals.metadata(photo);
  }

  @Get(':filename')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  download(@OwnedPhoto() photo: StoredPhoto) {
    return this.originals.download(photo);
  }

  @Post(':filename/retry')
  @Header('Cache-Control', 'no-store')
  retry(@OwnedPhoto() photo: StoredPhoto) {
    return this.processing.retry(photo);
  }

  @Get(':filename/thumbnail')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  thumbnail(@OwnedPhoto() photo: StoredPhoto) {
    return this.originals.derivative(photo, 'thumbnail');
  }

  @Get(':filename/preview')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  preview(@OwnedPhoto() photo: StoredPhoto) {
    return this.originals.derivative(photo, 'preview');
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
