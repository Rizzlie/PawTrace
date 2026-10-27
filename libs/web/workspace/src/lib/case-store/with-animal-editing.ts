import { computed, EnvironmentInjector, inject } from '@angular/core';
import {
  getState,
  signalStoreFeature,
  type,
  withComputed,
  withHooks,
  withMethods,
  withProps,
} from '@ngrx/signals';
import { injectDispatch, on, withReducer } from '@ngrx/signals/events';
import { applyProfileDraft, createProfileDraft } from '../animal-profile/profile-draft';
import { caseBusy, editorDirty, type CaseState } from './case-state';
import { profileEvents } from './case-events';
import { ProfileResources } from './profile-resources';

export type AnimalCommands = {
  openProfile(): void;
  saveProfile(id: number): Promise<boolean>;
  discardEditor(id: number): void;
  requestProfileExit(cancellation?: AbortSignal): Promise<boolean>;
  resolveEditorTransition(choice: 'save' | 'discard' | 'stay'): Promise<void>;
};

export function withAnimalEditing() {
  return signalStoreFeature(
    { state: type<CaseState>() },
    withReducer(
      on(profileEvents.opened, ({ payload }, state) =>
        !state.document || caseBusy(state) || state.editor || state.transfer.candidate
          ? {}
          : { editor: payload },
      ),
      on(profileEvents.changed, ({ payload }, state) =>
        state.editor?.id !== payload.id || caseBusy(state)
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
      on(profileEvents.discarded, ({ payload }, state) =>
        state.editor?.id !== payload.id || caseBusy(state)
          ? {}
          : { editor: null, closeRequested: false },
      ),
      on(profileEvents.validationFailed, ({ payload }, state) =>
        state.editor?.id === payload.id && state.editor.version === payload.version
          ? { editor: { ...state.editor, error: payload.error } }
          : {},
      ),
      on(profileEvents.committed, ({ payload }, state) => {
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
      on(profileEvents.closeRequested, (_, state) =>
        state.editor && !caseBusy(state) ? { closeRequested: true } : {},
      ),
      on(profileEvents.closeCancelled, () => ({ closeRequested: false })),
    ),
    withProps(() => ({
      _profileResources: new ProfileResources(inject(EnvironmentInjector)),
    })),
    withComputed((store) => {
      const id = computed(() => store.editor()?.id);
      return {
        profileEditor: computed(() => {
          const currentId = id();
          const binding = store._profileResources.binding;
          return binding && binding.id === currentId
            ? { id: binding.id, fields: binding.fields }
            : null;
        }),
      };
    }),
    withMethods((store, dispatch = injectDispatch(profileEvents)) => {
      let sequence = 0;
      const resources = store._profileResources;
      const discardEditor = (id: number): void => {
        if (store.editor()?.id !== id || caseBusy(getState(store))) return;
        resources.destroyBinding();
        dispatch.discarded({ id });
        resources.finishClose(true);
      };
      const saveProfile = async (id: number): Promise<boolean> => {
        const session = store.editor();
        if (!session || session.id !== id || caseBusy(getState(store))) return false;
        if (!editorDirty(getState(store))) {
          discardEditor(id);
          return true;
        }
        resources.saving?.abort();
        const cancellation = new AbortController();
        resources.saving = cancellation;
        const { validateCaseDocument } = await import('@pawtrace/case-domain');
        const document = store.document();
        if (
          cancellation.signal.aborted ||
          store.editor() !== session ||
          !document ||
          caseBusy(getState(store))
        )
          return false;
        const result = validateCaseDocument(applyProfileDraft(document, session.draft));
        if (!result.success) {
          dispatch.validationFailed({
            id,
            version: session.version,
            error:
              'Sprawdź dane formularza: ' +
              result.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n'),
          });
          return false;
        }
        dispatch.committed({
          id,
          version: session.version,
          generation: session.generation,
          document: result.data,
          updatedAt: new Date().toISOString(),
        });
        resources.destroyBinding();
        resources.finishClose(true);
        return true;
      };
      return {
        openProfile(): void {
          const document = store.document();
          if (
            !document ||
            caseBusy(getState(store)) ||
            store.editor() ||
            store.transfer().candidate
          )
            return;
          const session = {
            id: ++sequence,
            generation: store.persistence().generation,
            version: 0,
            draft: createProfileDraft(document),
            error: '',
          };
          resources.bind(
            session,
            () => store.editor(),
            (draft) => dispatch.changed({ id: session.id, draft }),
          );
          dispatch.opened(session);
        },
        discardEditor,
        saveProfile,
        requestProfileExit(cancellation?: AbortSignal): Promise<boolean> {
          resources.finishClose(false);
          dispatch.closeCancelled();
          if (cancellation?.aborted || caseBusy(getState(store))) return Promise.resolve(false);
          const session = store.editor();
          if (!session) return Promise.resolve(true);
          if (!editorDirty(getState(store))) {
            discardEditor(session.id);
            return Promise.resolve(true);
          }
          const promise = resources.waitForClose(cancellation, () => dispatch.closeCancelled());
          dispatch.closeRequested();
          return promise;
        },
        async resolveEditorTransition(choice: 'save' | 'discard' | 'stay'): Promise<void> {
          const session = store.editor();
          if (!store.closeRequested() || !session || caseBusy(getState(store))) return;
          if (choice === 'stay') {
            resources.finishClose(false);
            dispatch.closeCancelled();
          } else if (choice === 'save') await saveProfile(session.id);
          else discardEditor(session.id);
        },
      } satisfies AnimalCommands;
    }),
    withHooks({ onDestroy: (store) => store._profileResources.destroy() }),
  );
}
