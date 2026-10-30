import { type } from '@ngrx/signals';
import { eventGroup } from '@ngrx/signals/events';
import type { CaseDocument } from '@pawtrace/case-domain';
import type { Basemap, MapViewport } from '@pawtrace/map-engine';
import type { ProfileDraft } from '../animal-profile/profile-draft';
import type { SnapshotJob } from '../snapshot-writer';
import type { ProfileSession } from './case-state';

export const profileEvents = eventGroup({
  source: 'Animal editor',
  events: {
    opened: type<ProfileSession>(),
    changed: type<{ id: number; draft: ProfileDraft }>(),
  },
});

export const editorEvents = eventGroup({
  source: 'Case editor',
  events: {
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
    replacementSucceeded: type<{ request: number; document: CaseDocument; version: number }>(),
    replacementFailed: type<{
      request: number;
      conflict: boolean;
      unresolved: SnapshotJob | null;
    }>(),
  },
});

export const persistenceEvents = eventGroup({
  source: 'Case persistence',
  events: {
    opened: type<{ caseId: string; generation: number }>(),
    closed: type<void>(),
    restored: type<{
      generation: number;
      document: CaseDocument | null;
      version: number | null;
      recovery: string;
    }>(),
    writeStarted: type<{ generation: number }>(),
    writeSucceeded: type<{ revision: number; generation: number; version: number }>(),
    writeFailed: type<{ generation: number; conflict: boolean; unresolved: SnapshotJob | null }>(),
    retryRequested: type<void>(),
  },
});
