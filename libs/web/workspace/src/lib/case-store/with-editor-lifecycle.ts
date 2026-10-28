import type { AreaCheckDraft } from '../area-workspace/check-draft';
import type { AreaDraft } from '../area-workspace/area-draft';
import type { EntryDraft } from '../history/entry-draft';
import { EnvironmentInjector, inject } from '@angular/core';
import {
  getState,
  signalStoreFeature,
  type,
  withProps,
  withMethods,
  withHooks,
} from '@ngrx/signals';
import { injectDispatch, on, withReducer } from '@ngrx/signals/events';
import type { ProfileDraft } from '../animal-profile/profile-draft';
import type { PointDraft } from '../point-workspace/point-draft';
import { EditorForm, EditorTransition } from './editor-resources';
import { editorEvents } from './case-events';
import { caseBusy, editorDirty, type CaseState } from './case-state';

export type EditorCommands = {
  discardEditor(id: number): void;
  requestEditorExit(cancellation?: AbortSignal): Promise<boolean>;
  resolveEditorTransition(choice: 'save' | 'discard' | 'stay'): Promise<void>;
};
export function withEditorResources() {
  return signalStoreFeature(
    withProps(() => {
      const parent = inject(EnvironmentInjector);
      const profile = new EditorForm<ProfileDraft>(parent);
      const point = new EditorForm<PointDraft>(parent);
      const entry = new EditorForm<EntryDraft>(parent);
      const area = new EditorForm<AreaDraft>(parent);
      const check = new EditorForm<AreaCheckDraft>(parent);
      let sequence = 0;
      return {
        _nextEditorId: () => ++sequence,
        _profileResources: profile,
        _pointResources: point,
        _entryResources: entry,
        _areaResources: area,
        _checkResources: check,
        _editorTransition: new EditorTransition(() => {
          profile.saving?.abort();
          point.saving?.abort();
          entry.saving?.abort();
          area.saving?.abort();
          check.saving?.abort();
        }),
      };
    }),
    withHooks({
      onDestroy: (store) => {
        store._editorTransition.finishClose(false);
        store._profileResources.destroy();
        store._pointResources.destroy();
        store._entryResources.destroy();
        store._areaResources.destroy();
        store._checkResources.destroy();
      },
    }),
  );
}
export function withEditorLifecycle() {
  return signalStoreFeature(
    {
      state: type<CaseState>(),
      props: type<{
        _profileResources: EditorForm<ProfileDraft>;
        _pointResources: EditorForm<PointDraft>;
        _entryResources: EditorForm<EntryDraft>;
        _areaResources: EditorForm<AreaDraft>;
        _checkResources: EditorForm<AreaCheckDraft>;
        _editorTransition: EditorTransition;
      }>(),
      methods: type<{
        _openPoint(id?: string): void;
        _selectPoint(id: string | null): void;
        _openEntry(pointId: string, entryId?: string): void;
        saveEntry(id: number): Promise<boolean>;
        savePoint(id: number): Promise<boolean>;
        saveProfile(id: number): Promise<boolean>;
        _openArea(type: 'circle' | 'polygon', id?: string): void;
        _selectArea(id: string | null): void;
        saveArea(id: number): Promise<boolean>;
        _openAreaCheck(areaId?: string, checkId?: string, type?: 'circle' | 'polygon'): void;
        saveAreaCheck(id: number): Promise<boolean>;
      }>(),
    },
    withReducer(
      on(editorEvents.discarded, ({ payload }, state) =>
        state.editor?.id !== payload.id || caseBusy(state)
          ? {}
          : { editor: null, closeRequested: false },
      ),
      on(editorEvents.validationFailed, ({ payload }, state) =>
        state.editor?.id === payload.id && state.editor.version === payload.version
          ? { editor: { ...state.editor, error: payload.error } }
          : {},
      ),
      on(editorEvents.committed, ({ payload }, state) => {
        if (
          caseBusy(state) ||
          state.editor?.id !== payload.id ||
          state.editor.version !== payload.version ||
          state.persistence.generation !== payload.generation
        )
          return {};
        return {
          document: {
            ...payload.document,
            case: { ...payload.document.case, updatedAt: payload.updatedAt },
          },
          editor: null,
          closeRequested: false,
          persistence: {
            ...state.persistence,
            revision: state.persistence.revision + 1,
            error: '',
          },
        };
      }),
      on(editorEvents.closeRequested, (_, state) =>
        state.editor && !caseBusy(state) ? { closeRequested: true } : {},
      ),
      on(editorEvents.closeCancelled, () => ({ closeRequested: false })),
    ),
    withMethods((store, dispatch = injectDispatch(editorEvents)) => {
      const discardEditor = (id: number): void => {
        if (store.editor()?.id !== id || caseBusy(getState(store))) return;
        store._profileResources.destroyBinding();
        store._pointResources.destroyBinding();
        store._entryResources.destroyBinding();
        store._areaResources.destroyBinding();
        store._checkResources.destroyBinding();
        dispatch.discarded({ id });
        store._editorTransition.finishClose(true);
      };
      return {
        async editAreaCheck(
          areaId?: string,
          checkId?: string,
          type?: 'circle' | 'polygon',
        ): Promise<void> {
          if (await this.requestEditorExit()) store._openAreaCheck(areaId, checkId, type);
        },
        async editArea(type: 'circle' | 'polygon', id?: string): Promise<void> {
          if (await this.requestEditorExit()) store._openArea(type, id);
        },
        async selectArea(id: string | null): Promise<void> {
          if (store.editor() && !(await this.requestEditorExit())) return;
          store._selectArea(id);
        },
        async selectPoint(id: string | null): Promise<void> {
          if (store.editor() && !(await this.requestEditorExit())) return;
          store._selectPoint(id);
        },
        async editPoint(id?: string): Promise<void> {
          if (await this.requestEditorExit()) store._openPoint(id);
        },
        async editEntry(pointId: string, entryId?: string): Promise<void> {
          if (await this.requestEditorExit()) store._openEntry(pointId, entryId);
        },
        discardEditor,
        requestEditorExit(cancellation?: AbortSignal): Promise<boolean> {
          store._editorTransition.finishClose(false);
          dispatch.closeCancelled();
          if (cancellation?.aborted || caseBusy(getState(store))) return Promise.resolve(false);
          const session = store.editor();
          if (!session) return Promise.resolve(true);
          if (!editorDirty(getState(store))) {
            discardEditor(session.id);
            return Promise.resolve(true);
          }
          const promise = store._editorTransition.waitForClose(cancellation, () =>
            dispatch.closeCancelled(),
          );
          dispatch.closeRequested();
          return promise;
        },
        async resolveEditorTransition(choice: 'save' | 'discard' | 'stay'): Promise<void> {
          const session = store.editor();
          if (!store.closeRequested() || !session || caseBusy(getState(store))) return;
          if (choice === 'stay') {
            store._editorTransition.finishClose(false);
            dispatch.closeCancelled();
          } else if (choice === 'save') {
            if (session.kind === 'point') {
              await store.savePoint(session.id);
            } else if (session.kind === 'area') await store.saveArea(session.id);
            else if (session.kind === 'area-check') await store.saveAreaCheck(session.id);
            else if (session.kind === 'entry') await store.saveEntry(session.id);
            else await store.saveProfile(session.id);
          } else discardEditor(session.id);
        },
      } satisfies EditorCommands & {
        selectPoint(id: string | null): Promise<void>;
        editPoint(id?: string): Promise<void>;
        editEntry(pointId: string, entryId?: string): Promise<void>;
        editArea(type: 'circle' | 'polygon', id?: string): Promise<void>;
        selectArea(id: string | null): Promise<void>;
        editAreaCheck(
          areaId?: string,
          checkId?: string,
          type?: 'circle' | 'polygon',
        ): Promise<void>;
      };
    }),
  );
}
