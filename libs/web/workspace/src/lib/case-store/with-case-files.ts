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
import { BrowserFiles } from '@pawtrace/browser-persistence';
import {
  catchError,
  defer,
  filter,
  firstValueFrom,
  ignoreElements,
  map,
  mergeMap,
  of,
  tap,
} from 'rxjs';
import { createCaseDocument } from '../case-document';
import { caseBusy, editorDirty, type CaseState } from './case-state';
import { fileEvents } from './case-events';
import type { EditorCommands } from './with-editor-lifecycle';

const fileError = 'Nie udało się odczytać lub pobrać pliku. Spróbuj ponownie.';

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
        if (
          caseBusy(state) ||
          state.transfer.reading ||
          !state.transfer.candidate ||
          editorDirty(state) ||
          state.closeRequested
        )
          return {};
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
      parse$: events.on(fileEvents.parseRequested).pipe(
        mergeMap(({ payload }) =>
          defer(() => import('@pawtrace/case-domain')).pipe(
            map(({ parseCaseFile }) => {
              const result = parseCaseFile(payload.text);
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
              of(
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
      ) => {
        const parse = async (text: string, request: number): Promise<void> => {
          if (request !== store.transfer().request || store.persistence().replacing) return;
          const done = firstValueFrom(
            events
              .on(fileEvents.candidatePrepared, fileEvents.failed)
              .pipe(filter((event) => event.payload.request === request)),
          );
          dispatch.parseRequested({ text, request });
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
          const exportedAt = new Date().toISOString();
          const { serializeCaseFile } = await import('@pawtrace/case-domain');
          return serializeCaseFile(document, exportedAt);
        };
        return {
          prepareNewCase(): void {
            if (caseBusy(getState(store)) || store.transfer().reading) return;
            dispatch.candidatePrepared({
              request: begin(false),
              document: createCaseDocument(),
            });
          },
          async prepareImport(text: string): Promise<void> {
            if (caseBusy(getState(store))) return;
            await parse(text, begin(false));
          },
          async importFile(file: File): Promise<void> {
            if (caseBusy(getState(store)) || store.transfer().reading) return;
            const request = begin(true);
            try {
              await parse(await files.read(file), request);
            } catch {
              dispatch.failed({ request, error: fileError });
            } finally {
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
            if (
              caseBusy(getState(store)) ||
              store.transfer().reading ||
              !store.transfer().candidate ||
              editorDirty(getState(store)) ||
              store.closeRequested()
            )
              return;
            const request = store.transfer().request;
            const done = firstValueFrom(
              events
                .on(fileEvents.replacementSucceeded, fileEvents.replacementFailed)
                .pipe(filter((event) => event.payload.request === request)),
            );
            dispatch.replacementRequested({ request });
            await done;
          },
          exportJson,
          async downloadExport(): Promise<void> {
            const document = store.document();
            if (!document) return;
            try {
              files.download(await exportJson(), `pawtrace-${document.case.id}.json`);
            } catch {
              dispatch.exportFailed({ error: fileError });
            }
          },
        };
      },
    ),
    withHooks({ onDestroy: (store) => store._fileClosing.current?.abort() }),
  );
}
