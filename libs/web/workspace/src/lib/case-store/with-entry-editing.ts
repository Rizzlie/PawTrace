import { computed } from '@angular/core';
import { getState, signalStoreFeature, type, withComputed, withMethods } from '@ngrx/signals';
import { eventGroup, injectDispatch, on, withReducer } from '@ngrx/signals/events';
import type { CaseDocument } from '@pawtrace/case-domain';
import { removeHistoryEntry } from '@pawtrace/case-domain/history';
import {
  applyEntryDraft,
  createEntryDraft,
  type EntryDraft,
  type EntrySession,
} from '../history/entry-draft';
import { caseBusy, editorDirty, type CaseState } from './case-state';
import { editorEvents } from './case-events';
import type { EditorForm, EditorTransition } from './editor-resources';

const entryEvents = eventGroup({
  source: 'History editor',
  events: {
    opened: type<EntrySession>(),
    changed: type<{ id: number; draft: EntryDraft }>(),
    deletionRequested: type<{ pointId: string; entryId: string } | null>(),
    deleted: type<{ document: CaseDocument; updatedAt: string }>(),
  },
});

export function withEntryEditing() {
  return signalStoreFeature(
    {
      state: type<CaseState>(),
      props: type<{
        _entryResources: EditorForm<EntryDraft>;
        _nextEditorId: () => number;
        _editorTransition: EditorTransition;
      }>(),
    },
    withReducer(
      on(entryEvents.opened, ({ payload }, state) =>
        !state.document ||
        caseBusy(state) ||
        state.editor ||
        state.transfer.candidate ||
        state.deletingAreaId ||
        state.deletingPointId ||
        state.deletingEntry
          ? {}
          : { editor: payload, selectedPointId: payload.pointId },
      ),
      on(entryEvents.changed, ({ payload }, state) =>
        state.editor?.kind !== 'entry' || state.editor.id !== payload.id || caseBusy(state)
          ? {}
          : {
              editor: {
                ...state.editor,
                draft: payload.draft,
                version: state.editor.version + 1,
                error: '',
              },
            },
      ),
      on(entryEvents.deletionRequested, ({ payload }, state) =>
        caseBusy(state) ||
        state.editor ||
        state.transfer.candidate ||
        state.deletingAreaId ||
        state.deletingPointId
          ? {}
          : { deletingEntry: payload },
      ),
      on(entryEvents.deleted, ({ payload }, state) =>
        caseBusy(state) || state.editor || !state.deletingEntry
          ? {}
          : {
              document: {
                ...payload.document,
                case: { ...payload.document.case, updatedAt: payload.updatedAt },
              },
              deletingEntry: null,
              persistence: {
                ...state.persistence,
                revision: state.persistence.revision + 1,
                error: '',
              },
            },
      ),
    ),
    withComputed((store) => ({
      entryEditor: computed(() => {
        const session = store.editor();
        const binding = store._entryResources.binding;
        return session?.kind === 'entry' && binding?.id === session.id
          ? {
              id: session.id,
              fields: binding.fields,
              existing:
                store
                  .document()
                  ?.points.some((p) => p.entries.some((e) => e.id === session.entryId)) ?? false,
            }
          : null;
      }),
      deletingHistoryEntry: computed(() => {
        const target = store.deletingEntry();
        return target
          ? (store
              .document()
              ?.points.find((p) => p.id === target.pointId)
              ?.entries.find((e) => e.id === target.entryId) ?? null)
          : null;
      }),
    })),
    withMethods(
      (
        store,
        dispatch = injectDispatch(entryEvents),
        editorDispatch = injectDispatch(editorEvents),
      ) => {
        return {
          _openEntry(pointId: string, entryId?: string): void {
            const document = store.document();
            if (
              !document ||
              caseBusy(getState(store)) ||
              store.editor() ||
              store.transfer().candidate ||
              store.deletingAreaId() ||
              store.deletingPointId() ||
              store.deletingEntry()
            )
              return;
            const point = document.points.find((p) => p.id === pointId);
            const entry = point?.entries.find((e) => e.id === entryId);
            if (!point || (entryId && !entry)) return;
            const draft = createEntryDraft(document, entry);
            const session: EntrySession = {
              kind: 'entry',
              id: store._nextEditorId(),
              generation: store.persistence().generation,
              version: 0,
              pointId,
              entryId: entry?.id ?? crypto.randomUUID(),
              draft,
              initial: draft,
              error: '',
            };
            store._entryResources.bind(
              session,
              () => {
                const current = store.editor();
                return current?.kind === 'entry' ? current : null;
              },
              (draft) => dispatch.changed({ id: session.id, draft }),
            );
            dispatch.opened(session);
          },
          async saveEntry(id: number): Promise<boolean> {
            const session = store.editor();
            if (session?.kind !== 'entry' || session.id !== id || caseBusy(getState(store)))
              return false;
            if (
              !editorDirty(getState(store)) &&
              store.document()?.points.some((p) => p.entries.some((e) => e.id === session.entryId))
            ) {
              store._entryResources.destroyBinding();
              editorDispatch.discarded({ id });
              store._editorTransition.finishClose(true);
              return true;
            }
            store._entryResources.saving?.abort();
            const cancellation = new AbortController();
            store._entryResources.saving = cancellation;
            const { validateCaseDocument } = await import('@pawtrace/case-domain');
            const document = store.document();
            if (
              cancellation.signal.aborted ||
              store.editor() !== session ||
              !document ||
              caseBusy(getState(store))
            )
              return false;
            const now = new Date().toISOString();
            const result = validateCaseDocument(applyEntryDraft(document, session, now));
            if (!result.success) {
              editorDispatch.validationFailed({
                id,
                version: session.version,
                error:
                  'Sprawdź czas, dodatnie ilości, powiązaną obserwację i powód odrzucenia. ' +
                  result.issues.map((i) => i.path.join('.') + ': ' + i.message).join('\n'),
              });
              return false;
            }
            editorDispatch.committed({
              id,
              version: session.version,
              generation: session.generation,
              document: result.data,
              updatedAt: now,
            });
            store._entryResources.destroyBinding();
            store._editorTransition.finishClose(true);
            return true;
          },
          requestEntryRemoval(pointId: string, entryId: string): void {
            if (
              store
                .document()
                ?.points.find((point) => point.id === pointId)
                ?.entries.some((entry) => entry.id === entryId)
            )
              dispatch.deletionRequested({ pointId, entryId });
          },
          cancelEntryRemoval(): void {
            dispatch.deletionRequested(null);
          },
          confirmEntryRemoval(): void {
            const document = store.document();
            const target = store.deletingEntry();
            if (!document || !target || store.editor() || caseBusy(getState(store))) return;
            const now = new Date().toISOString();
            dispatch.deleted({
              document: removeHistoryEntry(document, target.pointId, target.entryId, now),
              updatedAt: now,
            });
          },
        };
      },
    ),
  );
}
