import { computed } from '@angular/core';
import { signalStoreFeature, type, withComputed, withMethods } from '@ngrx/signals';
import { eventGroup, injectDispatch, on, withReducer } from '@ngrx/signals/events';
import { observationCounts } from '@pawtrace/case-domain/history';
import {
  defaultCaseFilter,
  filterActive,
  filterPlace,
  type CaseFilter,
} from '../filters/case-filter';
import type { CaseState } from './case-state';

const filterEvents = eventGroup({
  source: 'Case filters',
  events: {
    changed: type<Partial<CaseFilter>>(),
    reset: type<void>(),
  },
});

/** View criteria never change the document, its revision or autosave. */
export function withCaseFilters() {
  return signalStoreFeature(
    { state: type<CaseState>() },
    withReducer(
      on(filterEvents.changed, ({ payload }, state) => ({
        filter: { ...state.filter, ...payload },
      })),
      on(filterEvents.reset, () => ({ filter: defaultCaseFilter })),
    ),
    withComputed((store) => {
      const selected = computed(() => {
        const document = store.document();
        const point = document?.points.find((point) => point.id === store.selectedPointId());
        return document && point ? filterPlace(point, document, store.filter()).matching : [];
      });
      return {
        filterActive: computed(() => filterActive(store.filter())),
        /** Highlights within the selected place's full history; null without active criteria. */
        selectedEntryMatches: computed(() =>
          filterActive(store.filter()) ? new Set(selected().map((entry) => entry.id)) : null,
        ),
        selectedPointCounts: computed(() => observationCounts(selected())),
      };
    }),
    withMethods((_, dispatch = injectDispatch(filterEvents)) => ({
      updateFilter: (change: Partial<CaseFilter>) => dispatch.changed(change),
      resetFilter: () => dispatch.reset(),
    })),
  );
}
