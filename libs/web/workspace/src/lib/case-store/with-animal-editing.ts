import { computed } from '@angular/core';
import { getState, signalStoreFeature, type, withComputed, withMethods } from '@ngrx/signals';
import { injectDispatch, on, withReducer } from '@ngrx/signals/events';
import { applyProfileDraft, createProfileDraft } from '../animal-profile/profile-draft';
import { caseBusy, editorDirty, type CaseState } from './case-state';
import { profileEvents, editorEvents } from './case-events';
import type { EditorForm, EditorTransition } from './editor-resources';
import type { ProfileDraft } from '../animal-profile/profile-draft';

export function withAnimalEditing() {
  return signalStoreFeature(
    {
      state: type<CaseState>(),
      props: type<{
        _profileResources: EditorForm<ProfileDraft>;
        _editorTransition: EditorTransition;
      }>(),
    },
    withReducer(
      on(profileEvents.opened, ({ payload }, state) =>
        !state.document || caseBusy(state) || state.editor || state.transfer.candidate
          ? {}
          : { editor: payload },
      ),
      on(profileEvents.changed, ({ payload }, state) =>
        state.editor?.kind !== 'profile' || state.editor.id !== payload.id || caseBusy(state)
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
    ),
    withComputed((store) => {
      const id = computed(() =>
        store.editor()?.kind === 'profile' ? store.editor()?.id : undefined,
      );
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
    withMethods(
      (
        store,
        dispatch = injectDispatch(profileEvents),
        editorDispatch = injectDispatch(editorEvents),
      ) => {
        let sequence = 0;
        const resources = store._profileResources;
        const discardEditor = (id: number): void => {
          if (store.editor()?.id !== id || caseBusy(getState(store))) return;
          resources.destroyBinding();
          editorDispatch.discarded({ id });
          store._editorTransition.finishClose(true);
        };
        const saveProfile = async (id: number): Promise<boolean> => {
          const session = store.editor();
          if (session?.kind !== 'profile' || session.id !== id || caseBusy(getState(store)))
            return false;
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
            editorDispatch.validationFailed({
              id,
              version: session.version,
              error:
                'Sprawdź dane formularza: ' +
                result.issues
                  .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
                  .join('\n'),
            });
            return false;
          }
          editorDispatch.committed({
            id,
            version: session.version,
            generation: session.generation,
            document: result.data,
            updatedAt: new Date().toISOString(),
          });
          resources.destroyBinding();
          store._editorTransition.finishClose(true);
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
              kind: 'profile' as const,
              id: ++sequence,
              generation: store.persistence().generation,
              version: 0,
              draft: createProfileDraft(document),
              error: '',
            };
            resources.bind(
              session,
              () => {
                const current = store.editor();
                return current?.kind === 'profile' ? current : null;
              },
              (draft) => dispatch.changed({ id: session.id, draft }),
            );
            dispatch.opened(session);
          },
          saveProfile,
        };
      },
    ),
  );
}
