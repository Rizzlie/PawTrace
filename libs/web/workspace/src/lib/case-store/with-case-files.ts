import { inject } from '@angular/core';
import {
  getState,
  signalStoreFeature,
  type,
  withHooks,
  withMethods,
  withProps,
} from '@ngrx/signals';
import { Events, injectDispatch, on, withEventHandlers, withReducer } from '@ngrx/signals/events';
import { BrowserFiles, CaseCopies, CASE_IDENTITY } from '@pawtrace/browser-persistence';
import {
  catchError,
  defer,
  EMPTY,
  filter,
  firstValueFrom,
  ignoreElements,
  map,
  mergeMap,
  of,
  tap,
  takeUntil,
} from 'rxjs';
import { caseBusy, editorDirty, type CaseState } from './case-state';
import { fileEvents, persistenceEvents } from './case-events';
import type { EditorCommands } from './with-editor-lifecycle';

const fileError = 'Nie udało się odczytać lub pobrać pliku. Spróbuj ponownie.';

/** A known conflict blocks replacement: its version check would only be rejected again. */
const canReplace = (state: CaseState): boolean =>
  !caseBusy(state) &&
  !state.persistence.conflict &&
  !state.transfer.reading &&
  !!state.transfer.candidate &&
  !editorDirty(state) &&
  !state.closeRequested;

export function withCaseFiles() {
  return signalStoreFeature(
    { state: type<CaseState>(), methods: type<EditorCommands>() },
    withReducer(
      on(fileEvents.importStarted, ({ payload }, state) =>
        caseBusy(state)
          ? {}
          : {
              transfer: {
                ...state.transfer,
                request: payload.request,
                reading: payload.reading,
                candidate: null,
                error: '',
              },
            },
      ),
      on(fileEvents.importFinished, ({ payload }, state) =>
        payload.request === state.transfer.request
          ? { transfer: { ...state.transfer, reading: false } }
          : {},
      ),
      on(fileEvents.candidatePrepared, ({ payload }, state) =>
        payload.request === state.transfer.request && !caseBusy(state)
          ? {
              transfer: {
                ...state.transfer,
                candidate: payload.document,
                error: '',
              },
            }
          : {},
      ),
      on(fileEvents.cancelled, ({ payload }, state) =>
        state.persistence.replacing
          ? {}
          : {
              transfer: {
                ...state.transfer,
                request: payload.request,
                candidate: null,
                reading: false,
                error: '',
              },
            },
      ),
      on(fileEvents.failed, ({ payload }, state) =>
        payload.request === state.transfer.request
          ? {
              transfer: {
                ...state.transfer,
                candidate: null,
                error: payload.error,
              },
            }
          : {},
      ),
      on(fileEvents.exportFailed, ({ payload }, state) => ({
        transfer: { ...state.transfer, error: payload.error },
      })),
      on(fileEvents.replacementRequested, ({ payload }, state) => {
        if (!canReplace(state)) return {};
        return {
          transfer: { ...state.transfer, replacement: payload.request },
          persistence: { ...state.persistence, replacing: true },
        };
      }),
    ),
    withProps(() => ({
      _fileClosing: { current: null as AbortController | null },
    })),
    withEventHandlers((store, events = inject(Events), dispatch = injectDispatch(fileEvents)) => ({
      session$: events.on(persistenceEvents.opened, persistenceEvents.closed).pipe(
        tap(() => {
          store._fileClosing.current?.abort();
          store._fileClosing.current = null;
        }),
        ignoreElements(),
      ),
      parse$: events.on(fileEvents.parseRequested).pipe(
        mergeMap(({ payload }) =>
          defer(() => import('@pawtrace/case-domain')).pipe(
            filter(() => payload.generation === store.persistence().generation),
            map(({ parseCaseFile, validateCaseDocument }) => {
              const parsed = parseCaseFile(payload.text);
              const target = store.persistence().caseId;
              // Replacing the open case keeps its server identity; other IDs stay case-scoped.
              const result =
                parsed.success && target !== null
                  ? validateCaseDocument({
                      ...parsed.data,
                      case: { ...parsed.data.case, id: target },
                    })
                  : parsed;
              return result.success
                ? fileEvents.candidatePrepared({
                    request: payload.request,
                    document: result.data,
                  })
                : fileEvents.failed({
                    request: payload.request,
                    error: result.issues
                      .map((issue) => `${issue.path.join('.') || 'plik'}: ${issue.message}`)
                      .join('\n'),
                  });
            }),
            catchError(() =>
              payload.generation !== store.persistence().generation
                ? EMPTY
                : of(
                    fileEvents.failed({
                      request: payload.request,
                      error: fileError,
                    }),
                  ),
            ),
          ),
        ),
      ),
      closeForReplacement$: events.on(fileEvents.candidatePrepared).pipe(
        filter(
          ({ payload }) =>
            store.transfer().candidate === payload.document &&
            store.transfer().request === payload.request,
        ),
        tap(() => {
          store._fileClosing.current?.abort();
          const cancellation = new AbortController();
          store._fileClosing.current = cancellation;
          void store.requestEditorExit(cancellation.signal).then((leave) => {
            if (store._fileClosing.current !== cancellation) return;
            store._fileClosing.current = null;
            if (!leave) dispatch.cancelled({ request: store.transfer().request + 1 });
          });
        }),
        ignoreElements(),
      ),
    })),
    withMethods(
      (
        store,
        events = inject(Events),
        dispatch = injectDispatch(fileEvents),
        files = inject(BrowserFiles),
        identity = inject(CASE_IDENTITY, { optional: true }),
        copies = inject(CaseCopies),
      ) => {
        const parse = async (text: string, request: number): Promise<void> => {
          if (request !== store.transfer().request || store.persistence().replacing) return;
          const done = firstValueFrom(
            events
              .on(fileEvents.candidatePrepared, fileEvents.failed)
              .pipe(filter((event) => event.payload.request === request)),
          );
          dispatch.parseRequested({ text, request, generation: store.persistence().generation });
          await done;
        };
        const begin = (reading: boolean): number => {
          store._fileClosing.current?.abort();
          store._fileClosing.current = null;
          const request = store.transfer().request + 1;
          dispatch.importStarted({ request, reading });
          return request;
        };
        const exportJson = async (): Promise<string> => {
          const document = store.document();
          if (!document) throw new Error('Brak aktywnej sprawy do eksportu.');
          const generation = store.persistence().generation;
          const owner = identity?.owner();
          const accountGeneration = identity?.generation();
          const exportedAt = new Date().toISOString();
          const { serializeCaseFile } = await import('@pawtrace/case-domain');
          if (
            generation !== store.persistence().generation ||
            owner !== identity?.owner() ||
            accountGeneration !== identity?.generation()
          )
            throw new Error('Case session changed');
          return serializeCaseFile(document, exportedAt);
        };
        return {
          async prepareImport(text: string): Promise<void> {
            // P02 replaces only an open server case; importing without one is P07 scope.
            if (!navigator.onLine || caseBusy(getState(store)) || !store.document()) return;
            await parse(text, begin(false));
          },
          async importFile(file: File): Promise<void> {
            if (
              !navigator.onLine ||
              caseBusy(getState(store)) ||
              store.transfer().reading ||
              !store.document()
            )
              return;
            const request = begin(true);
            const generation = store.persistence().generation;
            try {
              const text = await files.read(file);
              if (generation !== store.persistence().generation) return;
              await parse(text, request);
            } catch {
              if (generation === store.persistence().generation)
                dispatch.failed({ request, error: fileError });
            } finally {
              if (generation === store.persistence().generation)
                dispatch.importFinished({ request });
            }
          },
          cancelReplacement(): void {
            if (store.persistence().replacing) return;
            store._fileClosing.current?.abort();
            store._fileClosing.current = null;
            dispatch.cancelled({ request: store.transfer().request + 1 });
          },
          async confirmReplacement(): Promise<void> {
            if (!navigator.onLine || !canReplace(getState(store))) return;
            const request = store.transfer().request;
            const done = firstValueFrom(
              events.on(fileEvents.replacementSucceeded, fileEvents.replacementFailed).pipe(
                filter((event) => event.payload.request === request),
                takeUntil(events.on(persistenceEvents.opened, persistenceEvents.closed)),
              ),
              { defaultValue: undefined },
            );
            dispatch.replacementRequested({ request });
            await done;
          },
          exportJson,
          async downloadRecovery(): Promise<void> {
            const owner = identity?.owner();
            const generation = identity?.generation();
            const caseGeneration = store.persistence().generation;
            const current = store.document();
            const active = () =>
              owner === identity?.owner() &&
              generation === identity?.generation() &&
              caseGeneration === store.persistence().generation;
            if (!owner) return;
            try {
              const rows = await copies.list(owner);
              const branch = await copies.branch();
              const { serializeCaseFile } = await import('@pawtrace/case-domain');
              if (!active()) return;
              const json = current ? await exportJson() : undefined;
              if (!active()) return;
              if (current && json) files.download(json, `pawtrace-${current.case.id}.json`);
              for (const row of rows.filter(
                (row) => row.caseId !== current?.case.id || row.branch !== branch,
              ))
                files.download(
                  serializeCaseFile(row.document, new Date().toISOString()),
                  `pawtrace-${row.caseId}-${row.branch}.json`,
                );
            } catch {
              if (active()) dispatch.exportFailed({ error: fileError });
            }
          },
          async downloadExport(): Promise<void> {
            const document = store.document();
            const generation = store.persistence().generation;
            const owner = identity?.owner();
            const accountGeneration = identity?.generation();
            const active = () =>
              generation === store.persistence().generation &&
              owner === identity?.owner() &&
              accountGeneration === identity?.generation();
            if (!document) return;
            try {
              const json = await exportJson();
              if (active()) files.download(json, `pawtrace-${document.case.id}.json`);
            } catch {
              if (active()) dispatch.exportFailed({ error: fileError });
            }
          },
        };
      },
    ),
    withHooks({ onDestroy: (store) => store._fileClosing.current?.abort() }),
  );
}
