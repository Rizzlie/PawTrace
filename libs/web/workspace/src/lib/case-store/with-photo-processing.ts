import { inject } from '@angular/core';
import { getState, signalStoreFeature, type, withMethods, withProps } from '@ngrx/signals';
import {
  Events,
  eventGroup,
  injectDispatch,
  on,
  withEventHandlers,
  withReducer,
} from '@ngrx/signals/events';
import {
  catchError,
  concat,
  defer,
  EMPTY,
  filter,
  from,
  ignoreElements,
  map,
  mergeMap,
  of,
  takeUntil,
} from 'rxjs';
import { PhotoServer } from '../photos/photo-server';
import { type PhotoMetadata, type PhotoRead } from '../photos/photo-metadata';
import { caseBusy, type CaseState } from './case-state';
import { editorEvents, fileEvents, persistenceEvents } from './case-events';
import { photoEvents } from './with-photo-editing';

interface PhotoRequest {
  caseId: string;
  filename: string;
  generation: number;
  request: number;
  operation: 'read' | 'retry';
}
const processingEvents = eventGroup({
  source: 'Photo processing',
  events: {
    requested: type<PhotoRequest>(),
    resolved: type<PhotoRequest & { metadata: PhotoMetadata }>(),
    failed: type<PhotoRequest & { error: string }>(),
  },
});

function referencedPhotos(state: CaseState): string[] {
  const document = state.document;
  if (!document) return [];
  return [
    ...new Set([
      ...(document.animal?.photos ?? []),
      ...document.points.flatMap((point) => [
        ...point.photos,
        ...point.entries.flatMap((entry) => entry.photos),
      ]),
      ...document.areas.flatMap((area) => [
        ...area.photos,
        ...area.checks.flatMap((check) => check.photos),
      ]),
      ...(state.editor?.draft.photos ?? []),
    ]),
  ];
}

/** Case-owned I/O: opening or closing a photo card cannot start reads or change case revisions. */
export function withPhotoProcessing() {
  return signalStoreFeature(
    { state: type<CaseState>() },
    withProps(() => {
      let sequence = 0;
      return { _nextPhotoRequest: () => ++sequence };
    }),
    withReducer(
      on(
        persistenceEvents.opened,
        persistenceEvents.closed,
        persistenceEvents.restored,
        fileEvents.replacementSucceeded,
        fileEvents.replacementFailed,
        () => ({ photoReads: {} }),
      ),
      on(processingEvents.requested, ({ payload }, state) =>
        caseBusy(state) || payload.generation !== state.persistence.generation
          ? {}
          : {
              photoReads: {
                ...state.photoReads,
                [payload.filename]: {
                  request: payload.request,
                  operation: payload.operation,
                  status: payload.operation === 'retry' ? 'retrying' : 'loading',
                  metadata: state.photoReads[payload.filename]?.metadata ?? null,
                  error: '',
                } satisfies PhotoRead,
              },
            },
      ),
      on(processingEvents.resolved, ({ payload }, state) =>
        caseBusy(state) ||
        payload.generation !== state.persistence.generation ||
        state.photoReads[payload.filename]?.request !== payload.request
          ? {}
          : {
              photoReads: {
                ...state.photoReads,
                [payload.filename]: {
                  request: payload.request,
                  operation: payload.operation,
                  status: 'ready',
                  metadata: payload.metadata,
                  error: '',
                } satisfies PhotoRead,
              },
            },
      ),
      on(processingEvents.failed, ({ payload }, state) => {
        const previous = state.photoReads[payload.filename];
        return caseBusy(state) ||
          payload.generation !== state.persistence.generation ||
          previous?.request !== payload.request
          ? {}
          : {
              photoReads: {
                ...state.photoReads,
                [payload.filename]: {
                  ...previous,
                  status: 'error',
                  error: payload.error,
                } satisfies PhotoRead,
              },
            };
      }),
    ),
    withEventHandlers((store, events = inject(Events), server = inject(PhotoServer)) => {
      const resets = () =>
        events.on(
          persistenceEvents.opened,
          persistenceEvents.closed,
          persistenceEvents.restored,
          fileEvents.replacementSucceeded,
          fileEvents.replacementFailed,
        );
      return {
        resolveReferences$: events
          .on(
            persistenceEvents.restored,
            fileEvents.replacementSucceeded,
            fileEvents.replacementFailed,
            editorEvents.committed,
            photoEvents.attached,
          )
          .pipe(
            filter(() => !caseBusy(getState(store))),
            mergeMap(() => {
              const { caseId, generation } = store.persistence();
              return caseId === null
                ? EMPTY
                : from(
                    referencedPhotos(getState(store)).filter(
                      (filename) => !store.photoReads()[filename],
                    ),
                  ).pipe(
                    map((filename) =>
                      processingEvents.requested({
                        caseId,
                        filename,
                        generation,
                        request: store._nextPhotoRequest(),
                        operation: 'read',
                      }),
                    ),
                  );
            }),
          ),
        read$: events.on(processingEvents.requested).pipe(
          filter(
            ({ payload }) =>
              store.photoReads()[payload.filename]?.request === payload.request &&
              payload.generation === store.persistence().generation,
          ),
          mergeMap(({ payload }) => {
            const { caseId, filename } = payload;
            const read = defer(() => server.watch(caseId, filename));
            const operation =
              payload.operation === 'retry'
                ? concat(server.retry(caseId, filename).pipe(ignoreElements()), read)
                : read;
            return operation.pipe(
              map((metadata) => processingEvents.resolved({ ...payload, metadata })),
              catchError(() =>
                of(
                  processingEvents.failed({
                    ...payload,
                    error:
                      payload.operation === 'retry'
                        ? 'Nie rozpoczęto ponawiania. Poczekaj na zakończenie przetwarzania i spróbuj ponownie.'
                        : 'Nie udało się odczytać zdjęcia. Ponów odczyt.',
                  }),
                ),
              ),
              takeUntil(
                events
                  .on(processingEvents.requested)
                  .pipe(filter((event) => event.payload.filename === filename)),
              ),
              takeUntil(resets()),
            );
          }),
        ),
      };
    }),
    withMethods((store, dispatch = injectDispatch(processingEvents)) => ({
      reloadPhoto(filename: string): void {
        const current = store.photoReads()[filename];
        const { caseId, generation } = store.persistence();
        if (caseBusy(getState(store)) || !current || caseId === null) return;
        dispatch.requested({
          caseId,
          filename,
          generation,
          request: store._nextPhotoRequest(),
          operation: 'read',
        });
      },
      retryPhoto(filename: string): void {
        const current = store.photoReads()[filename];
        const { caseId, generation } = store.persistence();
        if (
          caseBusy(getState(store)) ||
          !current ||
          current.status === 'retrying' ||
          caseId === null
        )
          return;
        dispatch.requested({
          caseId,
          filename,
          generation,
          request: store._nextPhotoRequest(),
          operation: 'retry',
        });
      },
    })),
  );
}
