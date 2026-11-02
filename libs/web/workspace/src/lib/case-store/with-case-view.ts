import { injectDispatch, on, withReducer } from '@ngrx/signals/events';
import { signalStoreFeature, type, withMethods } from '@ngrx/signals';
import type { Basemap, MapViewport } from '@pawtrace/map-engine';
import type { CaseDocument } from '@pawtrace/case-domain';
import { isValidViewport, sameMapView } from '../case-document';
import { caseBusy, type CaseState } from './case-state';
import { caseViewEvents } from './case-events';

function commitView(
  state: CaseState,
  mapView: CaseDocument['mapView'],
  settling = false,
): Partial<CaseState> {
  if (!state.document || caseBusy(state) || sameMapView(state.document.mapView, mapView)) return {};
  const revision = state.persistence.revision + 1;
  return {
    document: { ...state.document, mapView },
    persistence: {
      ...state.persistence,
      revision,
      settlingRevision: settling ? revision : null,
      error: '',
    },
  };
}

/** Persisted view preferences only; no Leaflet objects or rendering state. */
export function withCaseView() {
  return signalStoreFeature(
    { state: type<CaseState>() },
    withReducer(
      on(caseViewEvents.viewportChanged, ({ payload }, state) =>
        !state.document || !isValidViewport(payload)
          ? {}
          : commitView(
              state,
              {
                ...state.document.mapView,
                center: {
                  latitude: payload.latitude,
                  longitude: payload.longitude,
                },
                zoom: payload.zoom,
              },
              true,
            ),
      ),
      on(caseViewEvents.basemapChanged, ({ payload }, state) =>
        state.document
          ? commitView(state, { ...state.document.mapView, basemap: payload })
          : { emptyBasemap: payload },
      ),
      on(caseViewEvents.renamed, ({ payload }, state) => {
        if (!state.document || caseBusy(state) || !payload.trim()) return {};
        return {
          document: {
            ...state.document,
            case: {
              ...state.document.case,
              title: payload.trim(),
              updatedAt: new Date().toISOString(),
            },
          },
          persistence: {
            ...state.persistence,
            revision: state.persistence.revision + 1,
            settlingRevision: null,
          },
        };
      }),
    ),
    withMethods((store, dispatch = injectDispatch(caseViewEvents)) => ({
      changeViewport: (view: MapViewport) => dispatch.viewportChanged(view),
      changeBasemap: (basemap: Basemap) => dispatch.basemapChanged(basemap),
      async renameCase(title: string): Promise<boolean> {
        const generation = store.persistence().generation;
        const { textSchema } = await import('@pawtrace/case-domain');
        if (
          !textSchema.safeParse(title.trim()).success ||
          !title.trim() ||
          !store.document() ||
          generation !== store.persistence().generation ||
          caseBusy({ persistence: store.persistence() })
        )
          return false;
        dispatch.renamed(title);
        return true;
      },
    })),
  );
}
