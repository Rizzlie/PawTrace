import { Module } from '@nestjs/common';
import { AssetUploads } from '../app/assets/asset-uploads';
import { AssetsController, LegacyAssetsController } from '../app/assets/assets.controller';
import { ImageProcessing } from '../app/assets/image-processing';
import { OriginalAssets } from '../app/assets/original-assets';
import { PhotoCleanup } from '../app/assets/photo-cleanup';
import { DatabaseConnection } from '../database/database';
import { CaseRepository } from './case-repository';
import { CasesController } from './cases.controller';
import { PhotoRepository } from './photo-repository';

@Module({
  controllers: [CasesController, AssetsController, LegacyAssetsController],
  providers: [
    {
      provide: CaseRepository,
      inject: [DatabaseConnection],
      useFactory: (database: DatabaseConnection) => new CaseRepository(database.handle?.db),
    },
    {
      provide: PhotoRepository,
      inject: [DatabaseConnection],
      useFactory: (database: DatabaseConnection) => new PhotoRepository(database.handle?.db),
    },
    AssetUploads,
    OriginalAssets,
    ImageProcessing,
    PhotoCleanup,
  ],
})
export class CasesModule {}
