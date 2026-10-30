import { HttpErrorResponse } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { CaseApi, isUncertainOutcome, isVersionConflict, type CaseSummary } from './case-api';

export type CatalogueIntent =
  | { kind: 'create'; title: string }
  | { kind: 'rename'; item: CaseSummary; title: string }
  | { kind: 'delete'; item: CaseSummary };
export type CatalogueOutcome =
  | { status: 'created'; id: string }
  | { status: 'done' | 'conflict' | 'missing' | 'invalid' | 'failed' };

const outcomeOf = (error: unknown): CatalogueOutcome => {
  if (isVersionConflict(error)) return { status: 'conflict' };
  if (!(error instanceof HttpErrorResponse)) return { status: 'failed' };
  if (error.status === 404) return { status: 'missing' };
  return { status: error.status === 400 ? 'invalid' : 'failed' };
};

/**
 * Catalogue commands. Owns the idempotency-key lifecycle: repeating an intent whose outcome is
 * uncertain reuses its key, so a lost response can neither duplicate nor reapply the mutation.
 */
@Service()
export class CaseCatalogue {
  private readonly api = inject(CaseApi);
  private attempt: { intent: string; key: string } | null = null;

  async submit(intent: CatalogueIntent): Promise<CatalogueOutcome> {
    const fingerprint = JSON.stringify(intent);
    if (this.attempt?.intent !== fingerprint)
      this.attempt = { intent: fingerprint, key: crypto.randomUUID() };
    const { key } = this.attempt;
    try {
      const outcome = await this.send(intent, key);
      this.attempt = null;
      return outcome;
    } catch (error) {
      if (!isUncertainOutcome(error)) this.attempt = null;
      return outcomeOf(error);
    }
  }

  private async send(intent: CatalogueIntent, key: string): Promise<CatalogueOutcome> {
    switch (intent.kind) {
      case 'create':
        return { status: 'created', id: (await this.api.create(intent.title, key)).id };
      case 'rename':
        await this.api.rename(intent.item.id, intent.title, intent.item.version, key);
        return { status: 'done' };
      case 'delete':
        await this.api.delete(intent.item.id, intent.item.version, key);
        return { status: 'done' };
    }
  }
}
