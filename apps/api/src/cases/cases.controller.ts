import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Req,
  Res,
  ServiceUnavailableException,
  type PipeTransform,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  createEmptyCase,
  textSchema,
  timeZoneSchema,
  validateCaseDocument,
} from '@pawtrace/case-domain';
import { CaseRepository, type Mutation, type MutationOutcome } from './case-repository';

const createRequest = z.strictObject({ title: textSchema, timeZone: timeZoneSchema });
const renameRequest = z.strictObject({ title: textSchema });
const saveRequest = z.strictObject({ document: z.unknown() });
const idempotencyKey = z.string().regex(/^[\x21-\x7e]{1,200}$/u);
const ifMatch = z
  .string()
  .regex(/^"[1-9][0-9]{0,9}"$/u)
  .transform((value) => Number(value.slice(1, -1)));

function parse<T>(schema: z.ZodType<T>, value: unknown, error: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException({ error });
  return result.data;
}
const baseVersion = (header: string | undefined) => {
  if (header === undefined)
    throw new HttpException({ error: 'version_required' }, HttpStatus.PRECONDITION_REQUIRED);
  return parse(ifMatch, header, 'invalid_version');
};

/** PostgreSQL cannot compare such text, and no stored case can have it: it is simply absent. */
@Injectable()
class StorableCaseId implements PipeTransform<string, string> {
  transform(id: string): string {
    if (!textSchema.safeParse(id).success) throw new NotFoundException({ error: 'not_found' });
    return id;
  }
}

/** Translates repository outcomes into the non-disclosing HTTP contract. */
function acknowledge(outcome: MutationOutcome) {
  switch (outcome.kind) {
    case 'ok':
      return outcome.ack;
    case 'not_found':
      throw new NotFoundException({ error: 'not_found' });
    case 'version_conflict':
      throw new HttpException(
        { error: 'version_conflict', version: outcome.version },
        HttpStatus.PRECONDITION_FAILED,
      );
    case 'key_reused':
      throw new HttpException({ error: 'idempotency_key_reused' }, HttpStatus.UNPROCESSABLE_ENTITY);
  }
}

@Controller('cases')
export class CasesController {
  constructor(@Inject(CaseRepository) private readonly cases: CaseRepository) {}

  private mutation(
    request: Request,
    key: string | undefined,
    operation: Mutation['operation'],
    caseId: string,
    payload: unknown,
  ): Mutation {
    return {
      ownerId: owner(request),
      key: parse(idempotencyKey, key, 'idempotency_key_required'),
      operation,
      caseId,
      request: payload,
    };
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Req() request: Request) {
    return this.cases.list(owner(request));
  }

  @Post()
  async create(
    @Req() request: Request,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: unknown,
  ) {
    const input = parse(createRequest, body, 'invalid_case');
    const document = createEmptyCase({
      id: CaseRepository.newCaseId(),
      title: input.title,
      timeZone: input.timeZone,
      now: new Date().toISOString(),
    });
    return acknowledge(
      await this.cases.create(
        this.mutation(request, key, 'create', document.case.id, input),
        document,
      ),
    );
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  async read(
    @Req() request: Request,
    @Param('id', StorableCaseId) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const stored = await this.cases.read(owner(request), id);
    if (!stored) throw new NotFoundException({ error: 'not_found' });
    const validated = validateCaseDocument(stored.document);
    if (!validated.success) throw new ServiceUnavailableException({ error: 'case_unreadable' });
    response.setHeader('ETag', `"${stored.version}"`);
    return { document: validated.data, version: stored.version, savedAt: stored.savedAt };
  }

  @Put(':id')
  async save(
    @Req() request: Request,
    @Param('id', StorableCaseId) id: string,
    @Headers('if-match') version: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: unknown,
  ) {
    const base = baseVersion(version);
    const candidate = validateCaseDocument(parse(saveRequest, body, 'invalid_case').document);
    if (!candidate.success)
      throw new BadRequestException({ error: 'invalid_case', issues: candidate.issues });
    if (candidate.data.case.id !== id) throw new BadRequestException({ error: 'case_id_mismatch' });
    return acknowledge(
      await this.cases.save(
        this.mutation(request, key, 'save', id, [id, base, body]),
        base,
        candidate.data,
      ),
    );
  }

  @Patch(':id')
  async rename(
    @Req() request: Request,
    @Param('id', StorableCaseId) id: string,
    @Headers('if-match') version: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: unknown,
  ) {
    const base = baseVersion(version);
    const { title } = parse(renameRequest, body, 'invalid_case');
    return acknowledge(
      await this.cases.rename(
        this.mutation(request, key, 'rename', id, [id, base, title]),
        base,
        title,
      ),
    );
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(
    @Req() request: Request,
    @Param('id', StorableCaseId) id: string,
    @Headers('if-match') version: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    const base = baseVersion(version);
    acknowledge(
      await this.cases.delete(this.mutation(request, key, 'delete', id, [id, base]), base),
    );
  }
}

/** The global guard has already authenticated the session before any handler runs. */
function owner(request: Request): string {
  const id = request.session.userId;
  if (!id) throw new ServiceUnavailableException({ error: 'session_unavailable' });
  return id;
}
