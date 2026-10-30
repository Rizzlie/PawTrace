import {
  Inject,
  Injectable,
  Module,
  RequestMethod,
  type DynamicModule,
  type MiddlewareConsumer,
  type NestMiddleware,
  type NestModule,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { Request, Response, NextFunction } from 'express';
import type { Environment } from '../app/environment';
import { Authentication, type AuthenticationDependencies } from './authentication';
import { AuthenticationGuard } from './auth.guard';
import { AuthController, ReadinessController } from './auth.controller';
import { DatabaseConnection } from '../database/database';

@Injectable()
class SessionMiddleware implements NestMiddleware {
  constructor(@Inject(Authentication) private readonly authentication: Authentication) {}
  use(req: Request, res: Response, next: NextFunction) {
    this.authentication.middleware(req, res, next);
  }
}

@Module({})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SessionMiddleware).forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
  static configure(dependencies: AuthenticationDependencies = {}): DynamicModule {
    return {
      module: AuthModule,
      controllers: [AuthController, ReadinessController],
      providers: [
        SessionMiddleware,
        {
          provide: Authentication,
          inject: [ConfigService, DatabaseConnection],
          useFactory: (settings: ConfigService<Environment, true>, database: DatabaseConnection) =>
            Authentication.create(
              {
                NODE_ENV: settings.get('NODE_ENV', { infer: true }),
                DATABASE_URL: settings.get('DATABASE_URL', { infer: true }),
                PUBLIC_ORIGIN: settings.get('PUBLIC_ORIGIN', { infer: true }),
                SESSION_SECRET: settings.get('SESSION_SECRET', { infer: true }),
                GOOGLE_CLIENT_ID: settings.get('GOOGLE_CLIENT_ID', { infer: true }),
                GOOGLE_CLIENT_SECRET: settings.get('GOOGLE_CLIENT_SECRET', { infer: true }),
                AUTH_EMAIL_ALLOWLIST: settings.get('AUTH_EMAIL_ALLOWLIST', { infer: true }),
              },
              database.handle,
              dependencies,
            ),
        },
        { provide: APP_GUARD, useClass: AuthenticationGuard },
      ],
    };
  }
}
