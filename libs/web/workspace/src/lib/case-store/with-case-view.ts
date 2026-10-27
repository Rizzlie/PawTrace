import { injectDispatch, on, withReducer } from '@ngrx/signals/events';
import { signalStoreFeature, type, withMethods } from '@ngrx/signals';
import type { Basemap, MapViewport } from '@pawtrace/map-engine';
import type { CaseDocument } from '@pawtrace/case-domain';
import { isValidViewport, sameMapView } from '../case-document';
import { caseBusy, type CaseState } from './case-state';
import { caseViewEvents } from './case-events';

function commitView(state: CaseState, mapView: CaseDocument['mapView']): Partial<CaseState> {
  if (!state.document || caseBusy(state) || sameMapView(state.document.mapView, mapView)) return {};
  return {
    document: { ...state.document, mapView },
    persistence: {
      ...state.persistence,
      revision: state.persistence.revision + 1,
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
          : commitView(state, {
              ...state.document.mapView,
              center: {
                latitude: payload.latitude,
                longitude: payload.longitude,
              },
              zoom: payload.zoom,
            }),
      ),
      on(caseViewEvents.basemapChanged, ({ payload }, state) =>
        state.document
          ? commitView(state, { ...state.document.mapView, basemap: payload })
          : { emptyBasemap: payload },
      ),
    ),
    withMethods((_, dispatch = injectDispatch(caseViewEvents)) => ({
      changeViewport: (view: MapViewport) => dispatch.viewportChanged(view),
      changeBasemap: (basemap: Basemap) => dispatch.basemapChanged(basemap),
    })),
  );
}
