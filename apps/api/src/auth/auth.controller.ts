import { Controller, Get, Post, Req, Res, Header, HttpCode, Inject } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Authentication } from './authentication';
import { NoSessionActivity, PublicAuthentication } from './auth-policy';

@Controller('auth')
export class AuthController {
  constructor(@Inject(Authentication) private readonly authentication: Authentication) {}
  @Get('login')
  @PublicAuthentication()
  login(@Res() response: Response) {
    return this.authentication.login(response);
  }
  @Get('callback')
  @PublicAuthentication()
  callback(@Req() request: Request, @Res() response: Response) {
    return this.authentication.callback(request, response);
  }
  @Get('me')
  @Header('Cache-Control', 'no-store')
  me(@Req() request: Request) {
    return this.authentication.me(request);
  }
  @Post('logout')
  @NoSessionActivity()
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return this.authentication.logout(request, response);
  }
}

@Controller('ready')
export class ReadinessController {
  constructor(@Inject(Authentication) private readonly authentication: Authentication) {}
  @Get()
  @PublicAuthentication()
  @Header('Cache-Control', 'no-store')
  ready() {
    return this.authentication.ready();
  }
}
