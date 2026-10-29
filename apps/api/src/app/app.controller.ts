import { Controller, Get } from '@nestjs/common';
import { PublicAuthentication } from '../auth/auth-policy';

@Controller('health')
export class AppController {
  @Get()
  @PublicAuthentication()
  health(): { status: string } {
    return { status: 'ok' };
  }
}
