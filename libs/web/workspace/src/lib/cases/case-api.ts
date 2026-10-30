import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import type { CaseDocument } from '@pawtrace/case-domain';
import { firstValueFrom } from 'rxjs';
import { z } from 'zod';

/** Transport DTOs, deliberately separate from the strict v1 case document. */
export const caseSummary = z.object({
  id: z.string(),
  title: z.string(),
  version: z.number().int().positive(),
  savedAt: z.string(),
});
export type CaseSummary = z.infer<typeof caseSummary>;
export const caseSummaries = z.array(caseSummary);
const acknowledgement = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  savedAt: z.string(),
});
export type Acknowledgement = z.infer<typeof acknowledgement>;
const storedCase = z.object({
  document: z.unknown(),
  version: z.number().int().positive(),
  savedAt: z.string(),
});

/** The server rejected a mutation based on an outdated version; nothing was written. */
export class VersionConflict extends Error {
  constructor(readonly version: number) {
    super('version_conflict');
  }
}

export const isVersionConflict = (error: unknown): error is HttpErrorResponse =>
  error instanceof HttpErrorResponse && error.status === 412;
/** A lost response may still have committed; only a replay with the same key can tell. */
export const isUncertainOutcome = (error: unknown) =>
  !(error instanceof VersionConflict) &&
  (!(error instanceof HttpErrorResponse) || error.status === 0 || error.status >= 500);

const path = (id: string) => '/api/cases/' + encodeURIComponent(id);
const mutationHeaders = (key: string, version?: number) =>
  new HttpHeaders({
    'Idempotency-Key': key,
    ...(version === undefined ? {} : { 'If-Match': `"${version}"` }),
  });

/** Owned-case HTTP adapter. Callers choose idempotency keys so a retry can be replayed. */
@Service()
export class CaseApi {
  private readonly http = inject(HttpClient);

  async create(title: string, key: string): Promise<Acknowledgement> {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return acknowledgement.parse(
      await firstValueFrom(
        this.http.post('/api/cases', { title, timeZone }, { headers: mutationHeaders(key) }),
      ),
    );
  }

  async open(id: string): Promise<z.infer<typeof storedCase>> {
    return storedCase.parse(await firstValueFrom(this.http.get(path(id))));
  }

  async save(document: CaseDocument, version: number, key: string): Promise<Acknowledgement> {
    return acknowledgement.parse(
      await firstValueFrom(
        this.http.put(
          path(document.case.id),
          { document },
          { headers: mutationHeaders(key, version) },
        ),
      ),
    );
  }

  async rename(id: string, title: string, version: number, key: string) {
    return acknowledgement.parse(
      await firstValueFrom(
        this.http.patch(path(id), { title }, { headers: mutationHeaders(key, version) }),
      ),
    );
  }

  async delete(id: string, version: number, key: string): Promise<void> {
    await firstValueFrom(this.http.delete(path(id), { headers: mutationHeaders(key, version) }));
  }
}
