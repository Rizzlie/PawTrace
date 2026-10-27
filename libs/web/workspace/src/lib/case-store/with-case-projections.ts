import { computed } from '@angular/core';
import { signalStoreFeature, type, withComputed } from '@ngrx/signals';
import { summarizeCase } from '../case-document';
import { caseBusy, editorDirty, saveStatus, type CaseState } from './case-state';

export function withCaseProjections() {
  return signalStoreFeature(
    { state: type<CaseState>() },
    withComputed((store) => ({
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
    })),
  );
}
