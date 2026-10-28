import { computed } from '@angular/core';
import { getState, signalStoreFeature, type, withComputed, withMethods } from '@ngrx/signals';
import { eventGroup, injectDispatch, on, withReducer } from '@ngrx/signals/events';
import {
  createAreaCheckDraft,
  applyAreaCheckDraft,
  type AreaCheckDraft,
  type AreaCheckSession,
} from '../area-workspace/check-draft';
import { draftGeometry, updateAreaSession } from '../area-workspace/area-draft';
import { caseBusy, type CaseState } from './case-state';
import { editorEvents } from './case-events';
import type { EditorForm, EditorTransition } from './editor-resources';

const checkEvents = eventGroup({
  source: 'Area check editor',
  events: {
    opened: type<AreaCheckSession>(),
    changed: type<{ id: number; draft: AreaCheckDraft }>(),
  },
});
export function withAreaCheckEditing() {
  return signalStoreFeature(
    {
      state: type<CaseState>(),
      props: type<{
        _checkResources: EditorForm<AreaCheckDraft>;
        _editorTransition: EditorTransition;
        _nextEditorId: () => number;
      }>(),
    },
    withReducer(
      on(checkEvents.opened, ({ payload }, state) =>
        caseBusy(state) ||
        !state.document ||
        state.editor ||
        state.transfer.candidate ||
        state.deletingAreaId ||
        state.deletingEntry ||
        state.deletingPointId
          ? {}
          : { editor: payload, selectedAreaId: payload.areaId, selectedPointId: null },
      ),
      on(checkEvents.changed, ({ payload }, state) =>
        state.editor?.kind !== 'area-check' || state.editor.id !== payload.id || caseBusy(state)
          ? {}
          : {
              editor: updateAreaSession(state.editor, payload.draft),
            },
      ),
    ),
    withComputed((store) => ({
      areaCheckEditor: computed(() => {
        const session = store.editor();
        const binding = store._checkResources.binding;
        return session?.kind === 'area-check' && binding?.id === session.id
          ? {
              ...session,
              fields: binding.fields,
              existing: !!store
                .document()
                ?.areas.find((area) => area.id === session.areaId)
                ?.checks.some((check) => check.id === session.checkId),
              hasPlan: !!store.document()?.areas.find((area) => area.id === session.areaId)
                ?.plannedGeometry,
            }
          : null;
      }),
    })),
    withMethods(
      (
        store,
        dispatch = injectDispatch(checkEvents),
        editorDispatch = injectDispatch(editorEvents),
      ) => ({
        _openAreaCheck(
          areaId?: string,
          checkId?: string,
          type: 'circle' | 'polygon' = 'polygon',
        ): void {
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
          const area = document.areas.find((item) => item.id === areaId);
          if ((areaId && !area) || (checkId && !area?.checks.some((item) => item.id === checkId)))
            return;
          const draft = createAreaCheckDraft(document, areaId, checkId, type);
          const session: AreaCheckSession = {
            kind: 'area-check',
            id: store._nextEditorId(),
            generation: store.persistence().generation,
            version: 0,
            areaId: areaId ?? crypto.randomUUID(),
            checkId: checkId ?? crypto.randomUUID(),
            draft,
            initial: draft,
            undo: [],
            error: '',
          };
          store._checkResources.bind(
            session,
            () => {
              const current = store.editor();
              return current?.kind === 'area-check' ? current : null;
            },
            (draft) => dispatch.changed({ id: session.id, draft }),
          );
          dispatch.opened(session);
        },
        async saveAreaCheck(id: number): Promise<boolean> {
          const session = store.editor();
          if (session?.kind !== 'area-check' || session.id !== id || caseBusy(getState(store)))
            return false;
          store._checkResources.saving?.abort();
          const cancellation = new AbortController();
          store._checkResources.saving = cancellation;
          const { validateCaseDocument, geometrySchema } = await import('@pawtrace/case-domain');
          const document = store.document();
          if (
            cancellation.signal.aborted ||
            store.editor() !== session ||
            !document ||
            caseBusy(getState(store))
          )
            return false;
          const geometry =
            session.draft.footprint === 'plan'
              ? document.areas.find((area) => area.id === session.areaId)?.plannedGeometry
              : draftGeometry(session.draft);
          const now = new Date().toISOString();
          const result = validateCaseDocument(applyAreaCheckDraft(document, session, now));
          if (!geometrySchema.safeParse(geometry).success || !result.success) {
            editorDispatch.validationFailed({
              id,
              version: session.version,
              error: 'Sprawdź nazwę, faktyczną geometrię, czas i powiązaną obserwację.',
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
          store._checkResources.destroyBinding();
          store._editorTransition.finishClose(true);
          return true;
        },
      }),
    ),
  );
}
