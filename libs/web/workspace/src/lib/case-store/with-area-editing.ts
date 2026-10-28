import { computed } from '@angular/core';
import { getState, signalStoreFeature, type, withComputed, withMethods } from '@ngrx/signals';
import { eventGroup, injectDispatch, on, withReducer } from '@ngrx/signals/events';
import type { CaseDocument, SearchGeometry } from '@pawtrace/case-domain';
import type { AreaGeometryChange, MapAreaDraft } from '@pawtrace/map-engine';
import {
  applyAreaDraft,
  createAreaDraft,
  draftGeometry,
  removeAreaPlan,
  type AreaDraft,
  type AreaSession,
} from '../area-workspace/area-draft';
import { caseBusy, type CaseState } from './case-state';
import { editorEvents } from './case-events';
import type { EditorForm, EditorTransition } from './editor-resources';

const areaEvents = eventGroup({
  source: 'Area editor',
  events: {
    opened: type<AreaSession>(),
    changed: type<{ id: number; draft: AreaDraft; undo?: boolean }>(),
    selected: type<string | null>(),
    deletionRequested: type<string | null>(),
    deleted: type<{ id: string; document: CaseDocument }>(),
  },
});
export function withAreaEditing() {
  return signalStoreFeature(
    {
      state: type<CaseState>(),
      props: type<{
        _areaResources: EditorForm<AreaDraft>;
        _editorTransition: EditorTransition;
        _nextEditorId: () => number;
      }>(),
    },
    withReducer(
      on(areaEvents.opened, ({ payload }, state) =>
        caseBusy(state) ||
        !state.document ||
        state.editor ||
        state.transfer.candidate ||
        state.deletingPointId ||
        state.deletingEntry ||
        state.deletingAreaId
          ? {}
          : { editor: payload },
      ),
      on(areaEvents.changed, ({ payload }, state) => {
        const editor = state.editor;
        if (editor?.kind !== 'area' || editor.id !== payload.id || caseBusy(state)) return {};
        const changed =
          JSON.stringify([editor.draft.vertices, editor.draft.radiusMeters]) !==
          JSON.stringify([payload.draft.vertices, payload.draft.radiusMeters]);
        return {
          editor: {
            ...editor,
            draft: payload.draft,
            version: editor.version + 1,
            error: '',
            undo: payload.undo
              ? editor.undo.slice(0, -1)
              : changed
                ? [
                    ...editor.undo,
                    { vertices: editor.draft.vertices, radiusMeters: editor.draft.radiusMeters },
                  ]
                : editor.undo,
          },
        };
      }),
      on(areaEvents.selected, ({ payload }, state) =>
        caseBusy(state) ? {} : { selectedAreaId: payload, selectedPointId: null },
      ),
      on(areaEvents.deletionRequested, ({ payload }, state) =>
        caseBusy(state) ||
        state.editor ||
        state.transfer.candidate ||
        state.deletingPointId ||
        state.deletingEntry
          ? {}
          : { deletingAreaId: payload },
      ),
      on(areaEvents.deleted, ({ payload }, state) =>
        caseBusy(state) || state.editor || state.deletingAreaId !== payload.id
          ? {}
          : {
              document: payload.document,
              deletingAreaId: null,
              selectedAreaId: null,
              persistence: {
                ...state.persistence,
                revision: state.persistence.revision + 1,
                error: '',
              },
            },
      ),
    ),
    withComputed((store) => ({
      areaEditor: computed(() => {
        const editor = store.editor();
        const binding = store._areaResources.binding;
        return editor?.kind === 'area' && binding?.id === editor.id
          ? { ...editor, fields: binding.fields }
          : null;
      }),
      selectedArea: computed(
        () => store.document()?.areas.find((area) => area.id === store.selectedAreaId()) ?? null,
      ),
      deletingArea: computed(
        () => store.document()?.areas.find((area) => area.id === store.deletingAreaId()) ?? null,
      ),
      mapAreas: computed(
        () =>
          store.document()?.areas.flatMap((area) =>
            area.plannedGeometry
              ? [
                  {
                    id: area.id,
                    name: area.name,
                    geometry: area.plannedGeometry,
                    selected: area.id === store.selectedAreaId(),
                  },
                ]
              : [],
          ) ?? [],
      ),
      mapAreaDraft: computed<MapAreaDraft | null>(() => {
        const editor = store.editor();
        return editor?.kind === 'area'
          ? {
              sessionId: editor.id,
              areaId: editor.areaId,
              type: editor.draft.type,
              vertices: editor.draft.vertices.every(
                (point) =>
                  Number.isFinite(point.latitude) &&
                  Number.isFinite(point.longitude) &&
                  Math.abs(point.latitude) <= 90 &&
                  Math.abs(point.longitude) <= 180,
              )
                ? editor.draft.vertices
                : [],
              radiusMeters: Number(editor.draft.radiusMeters),
            }
          : null;
      }),
    })),
    withMethods(
      (
        store,
        dispatch = injectDispatch(areaEvents),
        editorDispatch = injectDispatch(editorEvents),
      ) => ({
        _openArea(type: SearchGeometry['type'], id?: string): void {
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
          const area = document.areas.find((area) => area.id === id);
          if (id && !area?.plannedGeometry) return;
          const draft = createAreaDraft(type, area);
          const session: AreaSession = {
            kind: 'area',
            id: store._nextEditorId(),
            generation: store.persistence().generation,
            version: 0,
            areaId: area?.id ?? crypto.randomUUID(),
            draft,
            initial: draft,
            undo: [],
            error: '',
          };
          store._areaResources.bind(
            session,
            () => {
              const current = store.editor();
              return current?.kind === 'area' ? current : null;
            },
            (draft) => dispatch.changed({ id: session.id, draft }),
          );
          dispatch.opened(session);
        },
        changeAreaGeometry(change: AreaGeometryChange): void {
          const session = store.editor();
          if (session?.kind !== 'area' || session.id !== change.sessionId) return;
          store._areaResources.saving?.abort();
          dispatch.changed({
            id: session.id,
            draft: {
              ...session.draft,
              vertices: change.vertices,
              radiusMeters: String(change.radiusMeters),
            },
          });
        },
        undoAreaGeometry(id: number): void {
          const editor = store.editor();
          if (editor?.kind !== 'area' || editor.id !== id) return;
          const previous = editor.undo[editor.undo.length - 1];
          if (!previous) return;
          store._areaResources.saving?.abort();
          dispatch.changed({ id, draft: { ...editor.draft, ...previous }, undo: true });
        },
        removeAreaVertex(id: number, index: number): void {
          const editor = store.editor();
          if (editor?.kind !== 'area' || editor.id !== id || editor.draft.type !== 'polygon')
            return;
          store._areaResources.saving?.abort();
          dispatch.changed({
            id,
            draft: {
              ...editor.draft,
              vertices: editor.draft.vertices.filter((_, position) => position !== index),
            },
          });
        },
        async saveArea(id: number): Promise<boolean> {
          const session = store.editor();
          if (session?.kind !== 'area' || session.id !== id || caseBusy(getState(store)))
            return false;
          store._areaResources.saving?.abort();
          const cancellation = new AbortController();
          store._areaResources.saving = cancellation;
          const { validateCaseDocument, geometrySchema } = await import('@pawtrace/case-domain');
          const document = store.document();
          if (
            cancellation.signal.aborted ||
            store.editor() !== session ||
            !document ||
            caseBusy(getState(store))
          )
            return false;
          const geometry = geometrySchema.safeParse(draftGeometry(session.draft));
          const result = validateCaseDocument(applyAreaDraft(document, session));
          if (!geometry.success || !result.success) {
            editorDispatch.validationFailed({
              id,
              version: session.version,
              error: !session.draft.name.trim()
                ? 'Podaj nazwę obszaru.'
                : 'Nieprawidłowy obszar. Koło wymaga środka i dodatniego promienia; wielokąt co najmniej trzech różnych wierzchołków, powierzchni i krawędzi bez przecięć.',
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
          store._areaResources.destroyBinding();
          store._editorTransition.finishClose(true);
          return true;
        },
        _selectArea(id: string | null): void {
          dispatch.selected(id);
        },
        requestAreaRemoval(id: string): void {
          dispatch.deletionRequested(id);
        },
        cancelAreaRemoval(): void {
          dispatch.deletionRequested(null);
        },
        confirmAreaRemoval(): void {
          const document = store.document();
          const id = store.deletingAreaId();
          if (!document || !id || store.editor() || caseBusy(getState(store))) return;
          dispatch.deleted({
            id,
            document: {
              ...removeAreaPlan(document, id),
              case: { ...document.case, updatedAt: new Date().toISOString() },
            },
          });
        },
      }),
    ),
  );
}
