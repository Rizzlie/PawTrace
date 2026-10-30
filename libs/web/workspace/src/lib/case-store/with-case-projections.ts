import { computed } from '@angular/core';
import { signalStoreFeature, type, withComputed } from '@ngrx/signals';
import { summarizeCase } from '../case-document';
import { caseLocation } from '../cases/case-location';
import { caseBusy, editorDirty, saveStatus, type CaseState } from './case-state';

export function withCaseProjections() {
  return signalStoreFeature(
    { state: type<CaseState>() },
    withComputed((store) => ({
      /** Router location of the open case workspace; the catalogue when no case is open. */
      caseUrl: computed(() => {
        const id = store.persistence().caseId;
        return id === null ? '/' : caseLocation(id);
      }),
      basemap: computed(() => store.document()?.mapView.basemap ?? store.emptyBasemap()),
      busy: computed(
        () => caseBusy({ persistence: store.persistence() }) || store.transfer().reading,
      ),
      editorBusy: computed(() => caseBusy({ persistence: store.persistence() })),
      editorDirty: computed(() =>
        editorDirty({ editor: store.editor(), document: store.document() }),
      ),
      editorError: computed(() => store.editor()?.error ?? ''),
      candidate: computed(() => store.transfer().candidate),
      reading: computed(() => store.transfer().reading),
      fileError: computed(() => store.transfer().error),
      replacementSummary: computed(() => summarizeCase(store.transfer().candidate)),
      saveStatus: computed(() =>
        saveStatus({
          document: store.document(),
          persistence: store.persistence(),
        }),
      ),
      saveNeedsAttention: computed(() =>
        ['error', 'unsaved', 'conflict'].includes(
          saveStatus({ document: store.document(), persistence: store.persistence() }),
        ),
      ),
    })),
  );
}
