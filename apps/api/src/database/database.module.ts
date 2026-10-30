import { Global, Module, type DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../app/environment';
import { DatabaseConnection } from './database';

@Global()
@Module({})
export class DatabaseModule {
  static configure(): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [
        {
          provide: DatabaseConnection,
          inject: [ConfigService],
          useFactory: (settings: ConfigService<Environment, true>) =>
            DatabaseConnection.open(settings.get('DATABASE_URL', { infer: true })),
        },
      ],
      exports: [DatabaseConnection],
    };
  }
}
