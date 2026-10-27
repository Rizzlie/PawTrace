import { type } from '@ngrx/signals';
import { eventGroup } from '@ngrx/signals/events';
import type { CaseDocument } from '@pawtrace/case-domain';
import type { Basemap, MapViewport } from '@pawtrace/map-engine';
import type { ProfileDraft } from '../animal-profile/profile-draft';
import type { ProfileSession } from './case-state';

export const profileEvents = eventGroup({
  source: 'Animal editor',
  events: {
    opened: type<ProfileSession>(),
    changed: type<{ id: number; draft: ProfileDraft }>(),
    discarded: type<{ id: number }>(),
    validationFailed: type<{ id: number; version: number; error: string }>(),
    committed: type<{
      id: number;
      version: number;
      generation: number;
      document: CaseDocument;
      updatedAt: string;
    }>(),
    closeRequested: type<void>(),
    closeCancelled: type<void>(),
  },
});

export const caseViewEvents = eventGroup({
  source: 'Case view',
  events: {
    viewportChanged: type<MapViewport>(),
    basemapChanged: type<Basemap>(),
  },
});

export const fileEvents = eventGroup({
  source: 'Case files',
  events: {
    importStarted: type<{ request: number; reading: boolean }>(),
    parseRequested: type<{ request: number; text: string }>(),
    exportFailed: type<{ error: string }>(),
    importFinished: type<{ request: number }>(),
    candidatePrepared: type<{ request: number; document: CaseDocument }>(),
    cancelled: type<{ request: number }>(),
    failed: type<{ request: number; error: string }>(),
    replacementRequested: type<{ request: number }>(),
    replacementSucceeded: type<{ request: number; document: CaseDocument }>(),
    replacementFailed: type<{ request: number }>(),
  },
});

export const persistenceEvents = eventGroup({
  source: 'Case persistence',
  events: {
    restoreRequested: type<void>(),
    restored: type<{ document: CaseDocument | null; recovery: string }>(),
    writeStarted: type<void>(),
    writeSucceeded: type<{ revision: number; generation: number }>(),
    writeFailed: type<void>(),
    retryRequested: type<void>(),
  },
});
