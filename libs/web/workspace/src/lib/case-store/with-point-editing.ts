import { computed } from '@angular/core';
import { getState, signalStoreFeature, type, withComputed, withMethods } from '@ngrx/signals';
import { eventGroup, injectDispatch, on, withReducer } from '@ngrx/signals/events';
import type { CaseDocument } from '@pawtrace/case-domain';
import type { MapPlace, MapPointDraft, PointPlacement } from '@pawtrace/map-engine';
import {
  applyPointDraft,
  createPointDraft,
  removePoint,
  type PointDraft,
  type PointSession,
} from '../point-workspace/point-draft';
import { caseBusy, editorDirty, type CaseState } from './case-state';
import { editorEvents } from './case-events';
import type { EditorForm, EditorTransition } from './editor-resources';

const pointEvents = eventGroup({
  source: 'Point editor',
  events: {
    opened: type<PointSession>(),
    changed: type<{ id: number; draft: PointDraft }>(),
    selected: type<string | null>(),
    deletionRequested: type<string | null>(),
    deleted: type<{ id: string; document: CaseDocument; updatedAt: string }>(),
  },
});

export function withPointEditing() {
  return signalStoreFeature(
    {
      state: type<CaseState>(),
      props: type<{
        _pointResources: EditorForm<PointDraft>;
        _editorTransition: EditorTransition;
      }>(),
    },
    withReducer(
      on(pointEvents.opened, ({ payload }, state) =>
        !state.document ||
        caseBusy(state) ||
        state.editor ||
        state.transfer.candidate ||
        state.deletingPointId
          ? {}
          : { editor: payload },
      ),
      on(pointEvents.changed, ({ payload }, state) =>
        state.editor?.kind !== 'point' || state.editor.id !== payload.id || caseBusy(state)
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
      on(pointEvents.selected, ({ payload }, state) =>
        caseBusy(state) ? {} : { selectedPointId: payload },
      ),
      on(pointEvents.deletionRequested, ({ payload }, state) =>
        caseBusy(state) || state.editor || state.transfer.candidate
          ? {}
          : { deletingPointId: payload },
      ),
      on(pointEvents.deleted, ({ payload }, state) =>
        caseBusy(state) || state.editor || state.deletingPointId !== payload.id
          ? {}
          : {
              document: {
                ...payload.document,
                case: { ...payload.document.case, updatedAt: payload.updatedAt },
              },
              selectedPointId: state.selectedPointId === payload.id ? null : state.selectedPointId,
              deletingPointId: null,
              persistence: {
                ...state.persistence,
                revision: state.persistence.revision + 1,
                error: '',
              },
            },
      ),
    ),
    withComputed((store) => {
      const id = computed(() =>
        store.editor()?.kind === 'point' ? store.editor()?.id : undefined,
      );
      return {
        pointEditor: computed(() => {
          const currentId = id();
          const binding = store._pointResources.binding;
          return binding && binding.id === currentId
            ? { id: binding.id, fields: binding.fields }
            : null;
        }),
        selectedPoint: computed(
          () =>
            store.document()?.points.find((point) => point.id === store.selectedPointId()) ?? null,
        ),
        deletingPoint: computed(
          () =>
            store.document()?.points.find((point) => point.id === store.deletingPointId()) ?? null,
        ),
        mapPlaces: computed<MapPlace[]>(
          () =>
            store.document()?.points.map((point, index) => ({
              id: point.id,
              number: index + 1,
              name: point.name,
              coordinates: point.coordinates,
              selected: point.id === store.selectedPointId(),
            })) ?? [],
        ),
        mapPointDraft: computed<MapPointDraft | null>(() => {
          const session = store.editor();
          if (session?.kind !== 'point') return null;
          const { latitude, longitude } = session.draft;
          const points = store.document()?.points ?? [];
          const index = points.findIndex((point) => point.id === session.pointId);
          const valid =
            latitude.trim() &&
            longitude.trim() &&
            Number.isFinite(Number(latitude)) &&
            Number.isFinite(Number(longitude)) &&
            Math.abs(Number(latitude)) <= 90 &&
            Math.abs(Number(longitude)) <= 180;
          return {
            number: index < 0 ? points.length + 1 : index + 1,
            sessionId: session.id,
            pointId: session.pointId,
            coordinates: valid
              ? { latitude: Number(latitude), longitude: Number(longitude) }
              : null,
          };
        }),
      };
    }),
    withMethods(
      (
        store,
        dispatch = injectDispatch(pointEvents),
        editorDispatch = injectDispatch(editorEvents),
      ) => {
        let sequence = 0;
        return {
          _openPoint(pointId?: string): void {
            const document = store.document();
            if (
              !document ||
              caseBusy(getState(store)) ||
              store.editor() ||
              store.transfer().candidate ||
              store.deletingPointId()
            )
              return;
            const point = document.points.find((point) => point.id === pointId);
            if (pointId && !point) return;
            const draft = createPointDraft(document, point);
            const session: PointSession = {
              kind: 'point',
              id: --sequence,
              generation: store.persistence().generation,
              version: 0,
              pointId: point?.id ?? crypto.randomUUID(),
              draft,
              initial: draft,
              error: '',
            };
            store._pointResources.bind(
              session,
              () => {
                const current = store.editor();
                return current?.kind === 'point' ? current : null;
              },
              (draft) => dispatch.changed({ id: session.id, draft }),
            );
            dispatch.opened(session);
          },
          placePoint(placement: PointPlacement): void {
            const session = store.editor();
            if (session?.kind !== 'point' || session.id !== placement.sessionId) return;
            store._pointResources.saving?.abort();
            dispatch.changed({
              id: session.id,
              draft: {
                ...session.draft,
                latitude: String(placement.coordinates.latitude),
                longitude: String(placement.coordinates.longitude),
              },
            });
          },
          async savePoint(id: number): Promise<boolean> {
            const session = store.editor();
            if (session?.kind !== 'point' || session.id !== id || caseBusy(getState(store)))
              return false;
            if (
              !editorDirty(getState(store)) &&
              store.document()?.points.some((point) => point.id === session.pointId)
            ) {
              store._pointResources.destroyBinding();
              editorDispatch.discarded({ id });
              store._editorTransition.finishClose(true);
              return true;
            }
            store._pointResources.saving?.abort();
            const cancellation = new AbortController();
            store._pointResources.saving = cancellation;
            const { validateCaseDocument } = await import('@pawtrace/case-domain');
            const document = store.document();
            if (
              cancellation.signal.aborted ||
              store.editor() !== session ||
              !document ||
              caseBusy(getState(store))
            )
              return false;
            const result = validateCaseDocument(applyPointDraft(document, session));
            if (!result.success) {
              editorDispatch.validationFailed({
                id,
                version: session.version,
                error:
                  'Podaj nazwę i poprawne współrzędne punktu. ' +
                  result.issues
                    .map((issue) => issue.path.join('.') + ': ' + issue.message)
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
            store._pointResources.destroyBinding();
            store._editorTransition.finishClose(true);
            return true;
          },
          selectPoint(id: string | null): void {
            dispatch.selected(id);
          },
          requestPointRemoval(id: string): void {
            dispatch.deletionRequested(id);
          },
          cancelPointRemoval(): void {
            dispatch.deletionRequested(null);
          },
          confirmPointRemoval(): void {
            const document = store.document();
            const id = store.deletingPointId();
            if (!document || !id || store.editor() || caseBusy(getState(store))) return;
            dispatch.deleted({
              id,
              document: removePoint(document, id),
              updatedAt: new Date().toISOString(),
            });
          },
        };
      },
    ),
  );
}
