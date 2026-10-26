import { Module, type DynamicModule } from "@nestjs/common";
import { CacheModule } from "@nestjs/cache-manager";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { createKeyv } from "@keyv/redis";
import { validateEnvironment, type Environment } from "./environment";
import { AppController } from "./app.controller";
import { MapConfigController } from "./map-config.controller";
import { AddressSearch, AddressSearchController } from "./address-search";

@Module({
  controllers: [AppController, MapConfigController, AddressSearchController],
  providers: [AddressSearch],
})
export class AppModule {
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
      module: AppModule,
      imports: [
        config,
        CacheModule.registerAsync({
          inject: [ConfigService],
          useFactory: (settings: ConfigService<Environment, true>) => ({
            ttl: 24 * 60 * 60 * 1000,
            stores: [
              createKeyv(
                {
                  url: settings.get("REDIS_URL", { infer: true }),
                  commandOptions: { timeout: 1000 },
                  socket: {
                    connectTimeout: 1000,
                    socketTimeout: 1000,
                    reconnectStrategy: false,
                  },
                },
                {
                  namespace: "pawtrace",
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
