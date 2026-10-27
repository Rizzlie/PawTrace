import { inject } from '@angular/core';
import { getState, signalStoreFeature, type, watchState, withMethods } from '@ngrx/signals';
import { Events, injectDispatch, on, withEventHandlers, withReducer } from '@ngrx/signals/events';
import { BrowserSnapshot } from '@pawtrace/browser-persistence';
import {
  catchError,
  defer,
  exhaustMap,
  filter,
  firstValueFrom,
  ignoreElements,
  map,
  of,
  tap,
} from 'rxjs';
import { SnapshotWriter } from '../snapshot-writer';
import { createCaseState, type CaseState } from './case-state';
import { fileEvents, persistenceEvents } from './case-events';

export function withCasePersistence() {
  return signalStoreFeature(
    { state: type<CaseState>() },
    withReducer(
      on(persistenceEvents.restoreRequested, (_, state) => ({
        persistence: { ...state.persistence, initialized: false, recovery: '' },
      })),
      on(persistenceEvents.restored, ({ payload }, state) => ({
        document: payload.document,
        persistence: {
          ...state.persistence,
          initialized: true,
          recovery: payload.recovery,
        },
      })),
      on(persistenceEvents.writeStarted, (_, state) => ({
        persistence: { ...state.persistence, writing: true },
      })),
      on(persistenceEvents.writeSucceeded, ({ payload }, state) =>
        payload.generation !== state.persistence.generation
          ? {}
          : {
              persistence: {
                ...state.persistence,
                savedRevision: payload.revision,
                writing: false,
                error: '',
              },
            },
      ),
      on(persistenceEvents.writeFailed, (_, state) => ({
        persistence: {
          ...state.persistence,
          writing: false,
          error: 'Nie zapisano zmian w przeglądarce. Wyeksportuj JSON lub ponów zapis.',
        },
      })),
      on(persistenceEvents.retryRequested, (_, state) => ({
        persistence: { ...state.persistence, error: '' },
      })),
      on(fileEvents.replacementSucceeded, ({ payload }, state) => {
        if (!state.persistence.replacing || state.transfer.replacement !== payload.request)
          return {};
        const fresh = createCaseState(payload.document, state.persistence.generation + 1);
        return {
          ...fresh,
          transfer: { ...fresh.transfer, request: state.transfer.request + 1 },
        };
      }),
      on(fileEvents.replacementFailed, ({ payload }, state) =>
        state.transfer.replacement !== payload.request
          ? {}
          : {
              persistence: {
                ...state.persistence,
                replacing: false,
                writing: false,
              },
              transfer: {
                ...state.transfer,
                replacement: null,
                error:
                  'Nie udało się zapisać nowej sprawy. Poprzednia sprawa i ostatni poprawny zapis zostały zachowane. Możesz ponowić lub anulować.',
              },
            },
      ),
    ),
    withEventHandlers(
      (
        store,
        events = inject(Events),
        dispatch = injectDispatch(persistenceEvents),
        storage = inject(BrowserSnapshot),
      ) => {
        const writer = new SnapshotWriter(
          storage,
          () => dispatch.writeStarted(),
          (job) =>
            dispatch.writeSucceeded({
              revision: job.revision,
              generation: job.generation,
            }),
          () => dispatch.writeFailed(),
        );
        const requestSnapshot = (): void => {
          const state = getState(store);
          if (!state.document || state.persistence.replacing) return;
          writer.request({
            document: state.document,
            revision: state.persistence.revision,
            generation: state.persistence.generation,
          });
        };
        let observed = '';
        // A storage side effect, not state mirroring. Draft/status changes cannot enqueue a write.
        watchState(store, (state) => {
          const { persistence: p } = state;
          const key = `${p.generation}:${p.revision}`;
          if (observed === key) return;
          observed = key;
          if (p.initialized && !p.replacing && p.revision !== p.savedRevision) requestSnapshot();
        });
        return {
          restore$: events.on(persistenceEvents.restoreRequested).pipe(
            exhaustMap(() =>
              defer(async () => {
                try {
                  const stored = await storage.read();
                  if (stored === undefined)
                    return persistenceEvents.restored({
                      document: null,
                      recovery: '',
                    });
                  const { validateCaseDocument } = await import('@pawtrace/case-domain');
                  const result = validateCaseDocument(stored);
                  return persistenceEvents.restored(
                    result.success
                      ? { document: result.data, recovery: '' }
                      : {
                          document: null,
                          recovery:
                            'Zapisana sprawa jest nieprawidłowa lub ma nieobsługiwaną wersję. Zachowano jej dane. Możesz wczytać plik lub jawnie utworzyć nową sprawę.',
                        },
                  );
                } catch {
                  return persistenceEvents.restored({
                    document: null,
                    recovery:
                      'Nie udało się odczytać sprawy z przeglądarki. Ponów odczyt lub wczytaj plik / utwórz nową sprawę.',
                  });
                }
              }),
            ),
          ),
          retry$: events
            .on(persistenceEvents.retryRequested)
            .pipe(tap(requestSnapshot), ignoreElements()),
          replace$: events.on(fileEvents.replacementRequested).pipe(
            filter(
              ({ payload }) =>
                store.persistence().replacing && store.transfer().replacement === payload.request,
            ),
            exhaustMap(({ payload }) => {
              const candidate = store.transfer().candidate;
              if (!candidate) return of(fileEvents.replacementFailed(payload));
              return defer(() => writer.replace(candidate)).pipe(
                map(() =>
                  fileEvents.replacementSucceeded({
                    request: payload.request,
                    document: candidate,
                  }),
                ),
                catchError(() => of(fileEvents.replacementFailed(payload))),
              );
            }),
          ),
        };
      },
    ),
    withMethods((store, events = inject(Events), dispatch = injectDispatch(persistenceEvents)) => {
      let initialization: Promise<void> | undefined;
      const restore = async (): Promise<void> => {
        const done = firstValueFrom(events.on(persistenceEvents.restored));
        dispatch.restoreRequested();
        await done;
      };
      return {
        initialize(): Promise<void> {
          return (initialization ??= restore());
        },
        async retryRestore(): Promise<void> {
          if (store.document() || store.persistence().replacing || !store.persistence().initialized)
            return;
          await restore();
        },
        retrySave(): void {
          if (store.persistence().replacing || !store.document()) return;
          dispatch.retryRequested();
        },
      };
    }),
  );
}
