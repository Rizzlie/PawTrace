import type { EntrySession } from '../history/entry-draft';
import { createProfileDraft, type ProfileDraft } from '../animal-profile/profile-draft';
import type { CaseDocument } from '@pawtrace/case-domain';
import type { Basemap } from '@pawtrace/map-engine';
import type { PointSession } from '../point-workspace/point-draft';
import type { AreaSession } from '../area-workspace/area-draft';

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
  emptyBasemap: Basemap;
  editor: ProfileSession | PointSession | EntrySession | AreaSession | null;
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
    initialized: boolean;
    revision: number;
    savedRevision: number;
    generation: number;
    writing: boolean;
    replacing: boolean;
    error: string;
    recovery: string;
  };
}

/** A fresh local session; restoring a snapshot does not create a case edit. */
export function createCaseState(document: CaseDocument | null = null, generation = 0): CaseState {
  return {
    document,
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
      initialized: document !== null,
      revision: 0,
      savedRevision: 0,
      generation,
      writing: false,
      replacing: false,
      error: '',
      recovery: '',
    },
  };
}

export function saveStatus({ document, persistence }: Pick<CaseState, 'document' | 'persistence'>) {
  if (!persistence.initialized) return 'loading';
  if (persistence.replacing) return 'replacing';
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
