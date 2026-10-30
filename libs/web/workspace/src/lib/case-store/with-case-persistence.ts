import { inject } from '@angular/core';
import { getState, signalStoreFeature, type, watchState, withMethods } from '@ngrx/signals';
import { Events, injectDispatch, on, withEventHandlers, withReducer } from '@ngrx/signals/events';
import type { CaseDocument } from '@pawtrace/case-domain';
import {
  catchError,
  defer,
  exhaustMap,
  filter,
  firstValueFrom,
  fromEvent,
  ignoreElements,
  map,
  NEVER,
  of,
  switchMap,
  takeUntil,
  tap,
} from 'rxjs';
import { SnapshotWriter, type SnapshotJob } from '../snapshot-writer';
import { CaseStorage } from '../cases/case-storage';
import { isUncertainOutcome, VersionConflict } from '../cases/case-api';
import { createCaseState, type CaseState } from './case-state';
import { fileEvents, persistenceEvents } from './case-events';

const saveFailed =
  'Nie zapisano zmian na serwerze. Zmiany są tylko w tej karcie — wyeksportuj JSON lub ponów zapis.';
const conflictDetected =
  'Sprawa została zmieniona w innym miejscu. Twoje zmiany nie nadpisały nowszej wersji i są zachowane tylko w tej karcie — wyeksportuj JSON.';
const replacementRejected =
  'Sprawa została zmieniona w innym miejscu, więc nie zastąpiono jej zawartości. Twoje dane są zachowane w tej karcie — wyeksportuj JSON.';

/** Applies a persistence update only to the case session that captured it. */
const forSession =
  <P extends { generation: number }>(
    update: (payload: P, state: CaseState) => Partial<CaseState>,
  ) =>
  ({ payload }: { payload: P }, state: CaseState): Partial<CaseState> =>
    payload.generation === state.persistence.generation ? update(payload, state) : {};

export function withCasePersistence() {
  return signalStoreFeature(
    { state: type<CaseState>() },
    withReducer(
      on(persistenceEvents.opened, ({ payload }) =>
        createCaseState(null, payload.generation, payload.caseId),
      ),
      on(persistenceEvents.closed, (_, state) => {
        const fresh = createCaseState(null, state.persistence.generation + 1);
        return { ...fresh, persistence: { ...fresh.persistence, initialized: true } };
      }),
      on(
        persistenceEvents.restored,
        forSession(({ document, version, recovery }, state) => ({
          document,
          persistence: {
            ...state.persistence,
            serverVersion: version,
            initialized: true,
            recovery,
          },
        })),
      ),
      on(
        persistenceEvents.writeStarted,
        forSession((_, state) => ({ persistence: { ...state.persistence, writing: true } })),
      ),
      on(
        persistenceEvents.writeSucceeded,
        forSession(({ revision, version }, state) => ({
          persistence: {
            ...state.persistence,
            serverVersion: version,
            unresolved: null,
            savedRevision: revision,
            writing: false,
            error: '',
          },
        })),
      ),
      on(
        persistenceEvents.writeFailed,
        forSession(({ conflict, unresolved }, state) => ({
          persistence: {
            ...state.persistence,
            unresolved,
            writing: false,
            conflict,
            error: conflict ? conflictDetected : saveFailed,
          },
        })),
      ),
      on(persistenceEvents.retryRequested, (_, state) => ({
        persistence: { ...state.persistence, error: '' },
      })),
      on(fileEvents.replacementSucceeded, ({ payload }, state) => {
        if (!state.persistence.replacing || state.transfer.replacement !== payload.request)
          return {};
        const fresh = createCaseState(
          payload.document,
          state.persistence.generation + 1,
          payload.document.case.id,
          payload.version,
        );
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
                conflict: state.persistence.conflict || payload.conflict,
                error: payload.conflict ? conflictDetected : state.persistence.error,
                unresolved: payload.conflict
                  ? null
                  : (payload.unresolved ?? state.persistence.unresolved),
                // The candidate may have committed, so the local document needs saving again.
                revision: state.persistence.revision + (payload.unresolved ? 1 : 0),
              },
              transfer: {
                ...state.transfer,
                replacement: null,
                error: payload.conflict
                  ? replacementRejected
                  : 'Nie udało się zapisać zastępującej sprawy na serwerze. Poprzednia sprawa i ostatni potwierdzony zapis zostały zachowane. Możesz ponowić lub anulować.',
              },
            },
      ),
    ),
    withEventHandlers(
      (
        store,
        events = inject(Events),
        dispatch = injectDispatch(persistenceEvents),
        storage = inject(CaseStorage),
      ) => {
        const writer = new SnapshotWriter(
          storage,
          (job) => dispatch.writeStarted({ generation: job.generation }),
          (job, { version }) => {
            dispatch.writeSucceeded({
              revision: job.revision,
              generation: job.generation,
              version,
            });
            // The next save is based on this acknowledgement, so it is captured only now.
            const { generation, revision, savedRevision } = store.persistence();
            if (job.generation === generation && revision !== savedRevision) requestSnapshot();
          },
          (job, error) =>
            dispatch.writeFailed({
              generation: job.generation,
              conflict: error instanceof VersionConflict,
              unresolved: isUncertainOutcome(error) ? job : null,
            }),
        );
        const capture = (document: CaseDocument, version: number): SnapshotJob => ({
          document,
          version,
          key: crypto.randomUUID(),
          revision: store.persistence().revision,
          generation: store.persistence().generation,
        });
        const requestSnapshot = (): void => {
          const { document, persistence: p } = getState(store);
          if (!document || p.replacing || p.conflict || p.serverVersion === null) return;
          writer.request(p.unresolved ?? capture(document, p.serverVersion));
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
          restore$: events.on(persistenceEvents.opened).pipe(
            switchMap(({ payload }) =>
              defer(async () => {
                try {
                  const stored = await storage.read(payload.caseId);
                  if (stored === undefined)
                    return persistenceEvents.restored({
                      generation: payload.generation,
                      document: null,
                      version: null,
                      recovery: 'Nie znaleziono tej sprawy na Twoim koncie.',
                    });
                  const { validateCaseDocument } = await import('@pawtrace/case-domain');
                  const result = validateCaseDocument(stored.document);
                  return persistenceEvents.restored({
                    generation: payload.generation,
                    ...(result.success && result.data.case.id === payload.caseId
                      ? { document: result.data, version: stored.version, recovery: '' }
                      : {
                          document: null,
                          version: null,
                          recovery:
                            'Zapisana sprawa jest nieprawidłowa lub ma nieobsługiwaną wersję. Nie zmieniono jej na serwerze.',
                        }),
                  });
                } catch {
                  return persistenceEvents.restored({
                    generation: payload.generation,
                    document: null,
                    version: null,
                    recovery: 'Nie udało się wczytać sprawy z serwera. Ponów odczyt.',
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
              const failed = (conflict: boolean, unresolved: SnapshotJob | null) =>
                of(fileEvents.replacementFailed({ ...payload, conflict, unresolved }));
              if (!candidate) return failed(false, null);
              let attempt: SnapshotJob | null = null;
              return defer(() =>
                writer.replace(async (write) => {
                  const lost = store.persistence().unresolved;
                  if (lost) {
                    const { version } = await write(lost);
                    dispatch.writeSucceeded({
                      revision: lost.revision,
                      generation: lost.generation,
                      version,
                    });
                  }
                  attempt = capture(candidate, store.persistence().serverVersion ?? 0);
                  return write(attempt);
                }),
              ).pipe(
                map(({ version }) =>
                  fileEvents.replacementSucceeded({
                    request: payload.request,
                    document: candidate,
                    version,
                  }),
                ),
                catchError((error: unknown) =>
                  failed(
                    error instanceof VersionConflict,
                    isUncertainOutcome(error) ? attempt : null,
                  ),
                ),
              );
            }),
          ),
        };
      },
    ),
    withMethods((store, events = inject(Events), dispatch = injectDispatch(persistenceEvents)) => {
      let opening: Promise<void> = Promise.resolve();
      const open = (caseId: string): Promise<void> => {
        const generation = store.persistence().generation + 1;
        const done = firstValueFrom(
          events
            .on(persistenceEvents.restored)
            .pipe(filter(({ payload }) => payload.generation === generation)),
        ).then(() => undefined);
        dispatch.opened({ caseId, generation });
        return done;
      };
      return {
        /** Loads a case from the server unless this session already holds it. */
        open(caseId: string): Promise<void> {
          const { persistence, document } = getState(store);
          if (persistence.caseId === caseId && (document || !persistence.initialized))
            return opening;
          return (opening = open(caseId));
        },
        /** Resolves when the current open request has been restored. */
        initialize(): Promise<void> {
          return opening;
        },
        close(): void {
          const { persistence, document } = getState(store);
          if (persistence.caseId !== null || document || !persistence.initialized)
            dispatch.closed();
        },
        async retryRestore(): Promise<void> {
          const caseId = store.persistence().caseId;
          if (!caseId || store.document() || store.persistence().replacing) return;
          await (opening = open(caseId));
        },
        retrySave(): void {
          if (store.persistence().replacing || store.persistence().conflict || !store.document())
            return;
          dispatch.retryRequested();
        },
        /**
         * Waits for pending committed changes. `false` means they are not on the server, or the
         * caller stopped waiting through `signal`.
         */
        async flush(signal?: AbortSignal): Promise<boolean> {
          const aborted = signal ? fromEvent(signal, 'abort') : NEVER;
          for (;;) {
            const p = store.persistence();
            if (signal?.aborted || p.error || p.conflict) return false;
            if (!p.writing && p.revision === p.savedRevision) return true;
            await firstValueFrom(
              events
                .on(persistenceEvents.writeSucceeded, persistenceEvents.writeFailed)
                .pipe(takeUntil(aborted)),
              { defaultValue: undefined },
            );
          }
        },
      };
    }),
  );
}
