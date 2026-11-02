import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  type PipeTransform,
} from '@nestjs/common';
import type { Request } from 'express';
import { textSchema } from '@pawtrace/case-domain';

/** PostgreSQL cannot compare such text, and no stored row can have it: it is simply absent. */
@Injectable()
export class StorableId implements PipeTransform<string, string> {
  transform(id: string): string {
    if (!textSchema.safeParse(id).success) throw new NotFoundException({ error: 'not_found' });
    return id;
  }
}

/** The global guard has already authenticated the session before any handler runs. */
export function owner(request: Request): string {
  const id = request.session.userId;
  if (!id) throw new ServiceUnavailableException({ error: 'session_unavailable' });
  return id;
}
