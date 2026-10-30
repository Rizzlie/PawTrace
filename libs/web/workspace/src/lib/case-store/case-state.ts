import type { AreaCheckSession } from '../area-workspace/check-draft';
import type { EntrySession } from '../history/entry-draft';
import { createProfileDraft, type ProfileDraft } from '../animal-profile/profile-draft';
import type { CaseDocument } from '@pawtrace/case-domain';
import type { Basemap } from '@pawtrace/map-engine';
import type { PointSession } from '../point-workspace/point-draft';
import type { AreaSession } from '../area-workspace/area-draft';
import type { PhotoRead } from '../photos/photo-metadata';
import type { SnapshotJob } from '../snapshot-writer';
import { defaultCaseFilter, type CaseFilter } from '../filters/case-filter';

export interface ProfileSession {
  kind: 'profile';
  id: number;
  generation: number;
  version: number;
  draft: ProfileDraft;
  error: string;
}

export interface CaseState {
  document: CaseDocument | null;
  photoReads: Record<string, PhotoRead>;
  /** View criteria only; excluded from storage and export. */
  filter: CaseFilter;
  emptyBasemap: Basemap;
  editor: ProfileSession | PointSession | EntrySession | AreaSession | AreaCheckSession | null;
  selectedAreaId: string | null;
  deletingAreaId: string | null;
  selectedPointId: string | null;
  deletingPointId: string | null;
  deletingEntry: { pointId: string; entryId: string } | null;
  closeRequested: boolean;
  transfer: {
    request: number;
    candidate: CaseDocument | null;
    reading: boolean;
    error: string;
    replacement: number | null;
  };
  persistence: {
    /** Server identity of the open case; `null` in the catalogue. */
    caseId: string | null;
    /** Last version acknowledged by the server; mutations are based on it. */
    serverVersion: number | null;
    /** A save whose response was lost; it is replayed with its key before anything newer. */
    unresolved: SnapshotJob | null;
    initialized: boolean;
    revision: number;
    savedRevision: number;
    generation: number;
    writing: boolean;
    replacing: boolean;
    /** The server rejected a write based on an outdated version; local data is retained. */
    conflict: boolean;
    error: string;
    recovery: string;
  };
}

/** A fresh local session; restoring a snapshot does not create a case edit. */
export function createCaseState(
  document: CaseDocument | null = null,
  generation = 0,
  caseId: string | null = document?.case.id ?? null,
  serverVersion: number | null = null,
): CaseState {
  return {
    document,
    photoReads: {},
    filter: defaultCaseFilter,
    emptyBasemap: 'osm',
    editor: null,
    selectedPointId: null,
    selectedAreaId: null,
    deletingAreaId: null,
    deletingPointId: null,
    deletingEntry: null,
    closeRequested: false,
    transfer: {
      request: 0,
      candidate: null,
      reading: false,
      error: '',
      replacement: null,
    },
    persistence: {
      caseId,
      serverVersion,
      unresolved: null,
      initialized: document !== null,
      revision: 0,
      savedRevision: 0,
      generation,
      writing: false,
      replacing: false,
      conflict: false,
      error: '',
      recovery: '',
    },
  };
}

export function saveStatus({ document, persistence }: Pick<CaseState, 'document' | 'persistence'>) {
  if (!persistence.initialized) return 'loading';
  if (persistence.replacing) return 'replacing';
  if (persistence.conflict) return 'conflict';
  if (persistence.error) return 'error';
  if (persistence.writing) return 'saving';
  if (persistence.revision !== persistence.savedRevision) return 'unsaved';
  return document ? 'saved' : 'empty';
}

export function caseBusy(state: Pick<CaseState, 'persistence'>): boolean {
  return !state.persistence.initialized || state.persistence.replacing;
}
export function editorDirty(state: Pick<CaseState, 'editor' | 'document'>): boolean {
  return (
    !!state.editor &&
    !!state.document &&
    JSON.stringify(state.editor.draft) !==
      JSON.stringify(
        state.editor.kind !== 'profile' ? state.editor.initial : createProfileDraft(state.document),
      )
  );
}
