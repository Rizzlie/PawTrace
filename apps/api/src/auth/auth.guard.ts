import { Injectable, Inject, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Authentication } from './authentication';
import { NO_ACTIVITY, OWNERLESS_ASSET, PUBLIC_AUTH } from './auth-policy';

/** All Nest endpoints are private unless explicitly declared public. */
@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    @Inject(Authentication) private readonly authentication: Authentication,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext) {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_AUTH, targets)) return true;
    await this.authentication.authorize(
      context.switchToHttp().getRequest(),
      context.switchToHttp().getResponse(),
      !!this.reflector.getAllAndOverride<boolean>(OWNERLESS_ASSET, targets),
      !this.reflector.getAllAndOverride<boolean>(NO_ACTIVITY, targets),
    );
    return true;
  }
}
