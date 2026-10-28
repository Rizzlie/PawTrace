import { Controller, Get, Header, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AssetUploads } from './asset-uploads';
import { OriginalAssets } from './original-assets';

@Controller('assets')
export class AssetsController {
  constructor(
    private readonly uploads: AssetUploads,
    private readonly originals: OriginalAssets,
  ) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  upload(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return this.uploads.receive(request, response);
  }

  @Get(':filename/metadata')
  @Header('Cache-Control', 'no-store')
  metadata(@Param('filename') filename: string) {
    return this.originals.metadata(filename);
  }

  @Get(':filename')
  @Header('X-Content-Type-Options', 'nosniff')
  download(@Param('filename') filename: string) {
    return this.originals.download(filename);
  }
}
