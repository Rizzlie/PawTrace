import { Module, type DynamicModule } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createKeyv } from '@keyv/redis';
import { validateEnvironment, type Environment } from './environment';
import { AppController } from './app.controller';
import { MapConfigController } from './map-config.controller';
import { AddressSearch, AddressSearchController } from './address-search';
import { AssetsController } from './assets/assets.controller';
import { AssetUploads } from './assets/asset-uploads';
import { OriginalAssets } from './assets/original-assets';
import { ImageProcessing } from './assets/image-processing';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { CasesModule } from '../cases/cases.module';
import type { AuthenticationDependencies } from '../auth/authentication';

@Module({
  controllers: [AppController, MapConfigController, AddressSearchController, AssetsController],
  providers: [AddressSearch, AssetUploads, OriginalAssets, ImageProcessing],
})
export class WorkspaceModule {
  static async configure(
    options: { envFilePath?: string; ignoreEnvFile?: boolean } = {},
  ): Promise<DynamicModule> {
    // Resolve and validate before NestFactory starts, so invalid settings fail cleanly.
    const config = await ConfigModule.forRoot({
      isGlobal: true,
      skipProcessEnv: true,
      validate: validateEnvironment,
      ...options,
    });
    return {
      module: WorkspaceModule,
      imports: [
        config,
        CacheModule.registerAsync({
          inject: [ConfigService],
          useFactory: (settings: ConfigService<Environment, true>) => ({
            ttl: 24 * 60 * 60 * 1000,
            stores: [
              createKeyv(
                {
                  url: settings.get('REDIS_URL', { infer: true }),
                  commandOptions: { timeout: 1000 },
                  socket: {
                    connectTimeout: 1000,
                    socketTimeout: 1000,
                    reconnectStrategy: false,
                  },
                },
                {
                  namespace: 'pawtrace',
                  connectionTimeout: 1000,
                  throwOnConnectError: true,
                  throwOnErrors: true,
                },
              ),
            ],
          }),
        }),
      ],
    };
  }
}

@Module({})
export class AppModule {
  static async configure(
    options: {
      envFilePath?: string;
      ignoreEnvFile?: boolean;
      authentication?: AuthenticationDependencies;
    } = {},
  ): Promise<DynamicModule> {
    return {
      module: AppModule,
      imports: [
        await WorkspaceModule.configure({
          envFilePath: options.envFilePath,
          ignoreEnvFile: options.ignoreEnvFile,
        }),
        DatabaseModule.configure(),
        AuthModule.configure(options.authentication),
        CasesModule,
      ],
    };
  }
}
