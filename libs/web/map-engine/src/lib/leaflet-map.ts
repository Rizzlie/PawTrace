import * as L from 'leaflet';
import { LeafletAreas } from './leaflet-areas';
import type { MapArea, MapAreaDraft, AreaGeometryChange, MapCoordinates } from './map-types';
import {
  afterRenderEffect,
  computed,
  inject,
  linkedSignal,
  SecurityContext,
  Service,
  signal,
  untracked,
  type OnDestroy,
  type Signal,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import type { Basemap, InitialLocation, MapConfig, MapViewport } from './map-types';
import type { MapPlace, MapPointDraft, PointPlacement } from './map-types';
import { defaultMapSources } from './map-config';

interface MapBindings {
  areas?: Signal<MapArea[]>;
  areaDraft?: Signal<MapAreaDraft | null>;
  areaChanged?: (change: AreaGeometryChange) => void;
  areaSelected?: (id: string) => void;
  measurement?: Signal<MapCoordinates[] | null>;
  measured?: (points: MapCoordinates[]) => void;
  places?: Signal<MapPlace[]>;
  pointDraft?: Signal<MapPointDraft | null>;
  pointPlaced?: (placement: PointPlacement) => void;
  placesSelected?: (ids: string[]) => void;
  config: Signal<MapConfig>;
  initialLocation?: Signal<InitialLocation>;
  viewport?: Signal<MapViewport | undefined>;
  viewportChanged: (view: MapViewport) => void;
  basemap?: Signal<Basemap>;
  basemapChanged?: (basemap: Basemap) => void;
}

interface TileSource {
  basemap: Basemap;
  url: string;
  attribution: string;
}

const emptyConfig: MapConfig = { mapboxToken: '' };

/** One component-scoped map; Angular destroys its resources with the host. */
@Service({ autoProvided: false })
export class LeafletMap implements OnDestroy {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly bindings = signal<MapBindings | undefined>(undefined);
  private readonly config = computed(() => this.bindings()?.config() ?? emptyConfig);
  private readonly satelliteSource = computed(
    () => this.config().satellite ?? defaultMapSources.satellite,
  );
  readonly satelliteAvailable = computed(
    () =>
      !this.satelliteSource().urlTemplate.includes('{accessToken}') || !!this.config().mapboxToken,
  );
  private readonly basemapState = linkedSignal({
    source: () => ({
      available: this.satelliteAvailable(),
      requested: this.bindings()?.basemap?.(),
    }),
    computation: ({ available, requested }, previous): Basemap =>
      available ? (requested ?? previous?.value ?? 'osm') : 'osm',
  });
  readonly basemap = this.basemapState.asReadonly();
  private readonly loadingState = signal(false);
  readonly loading = this.loadingState.asReadonly();
  private readonly locationMessageState = signal('');
  readonly locationMessage = this.locationMessageState.asReadonly();
  private readonly locationAccuracyState = signal<number | null>(null);
  readonly locationAccuracy = this.locationAccuracyState.asReadonly();
  readonly locationHint = computed(() =>
    this.locationAccuracy() === null
      ? 'Ustal swoją pozycję'
      : `Dokładność ostatniej pozycji: około ${this.locationAccuracy()} m`,
  );
  private readonly locatingState = signal(false);
  readonly locating = this.locatingState.asReadonly();
  private readonly retryRevision = signal(0);
  private readonly tileSource = computed<TileSource>(
    () => {
      const basemap = this.basemap();
      const source = this.config()[basemap] ?? defaultMapSources[basemap];
      return {
        basemap,
        url: source.urlTemplate.replace(
          /\{accessToken\}/g,
          encodeURIComponent(this.config().mapboxToken),
        ),
        attribution: this.sanitizer.sanitize(SecurityContext.HTML, source.attribution) ?? '',
      };
    },
    {
      equal: (previous, current) =>
        previous.basemap === current.basemap &&
        previous.url === current.url &&
        previous.attribution === current.attribution,
    },
  );
  private readonly tileMessageState = linkedSignal(() => {
    this.tileSource();
    return '';
  });
  readonly tileMessage = this.tileMessageState.asReadonly();
  readonly showMapboxLogo = computed(
    () =>
      this.basemap() === 'satellite' &&
      new URL(this.satelliteSource().urlTemplate, 'https://pawtrace.invalid').hostname ===
        'api.mapbox.com',
  );

  private map!: L.Map;
  private areas?: LeafletAreas;
  private resizeObserver?: ResizeObserver;
  private layer?: L.TileLayer;
  private restoring = false;
  private destroyed = false;
  private zooming = false;
  private pendingViewport?: MapViewport;
  private restoreFrame?: number;
  private tileTimeout?: ReturnType<typeof setTimeout>;
  private locationLayers?: L.LayerGroup;
  private initialLocationRequested = false;
  private navigationRevision = 0;
  private readonly markers = new Map<
    string,
    { marker: L.Marker; selected: boolean; number: number; accents: string }
  >();
  private draftMarker?: { sessionId: number; marker: L.Marker };

  constructor() {
    afterRenderEffect({
      mixedReadWrite: () => {
        const bindings = this.bindings();
        const areas = bindings?.areas?.() ?? [];
        const draft = bindings?.areaDraft?.() ?? null;
        const measurement = bindings?.measurement?.() ?? null;
        if (bindings && !this.destroyed)
          untracked(() => this.areas?.render(areas, draft, measurement));
      },
    });
    afterRenderEffect({
      mixedReadWrite: () => {
        const bindings = this.bindings();
        const places = bindings?.places?.() ?? [];
        const draft = bindings?.pointDraft?.() ?? null;
        if (bindings && !this.destroyed) untracked(() => this.renderPoints(places, draft));
      },
    });
    afterRenderEffect({
      mixedReadWrite: () => {
        if (!this.bindings() || this.destroyed) return;
        const source = this.tileSource();
        this.retryRevision();
        // Only declarative source/retry changes should replace a Leaflet layer.
        // Synchronous Leaflet callbacks must not become effect dependencies.
        untracked(() => this.renderTiles(source));
      },
    });
    afterRenderEffect({
      mixedReadWrite: () => {
        const view = this.bindings()?.viewport?.();
        if (view && !this.destroyed) untracked(() => this.restoreViewport(view));
      },
    });
    afterRenderEffect(() => {
      const mode = this.bindings()?.initialLocation?.() ?? 'off';
      if (mode === 'off' || this.initialLocationRequested || this.destroyed) return;
      untracked(() => {
        this.initialLocationRequested = true;
        this.requestLocation(mode === 'center', true);
      });
    });
  }

  initialize(container: HTMLElement, bindings: MapBindings): void {
    if (this.map || this.destroyed) throw new Error('Map service can only be initialized once.');
    this.map = L.map(container, {
      zoomControl: false,
      minZoom: 3,
      maxZoom: 22,
      trackResize: false,
    });
    L.control
      .zoom({
        position: 'bottomright',
        zoomInTitle: 'Przybliż',
        zoomOutTitle: 'Oddal',
      })
      .addTo(this.map);
    L.control.scale({ position: 'bottomleft', imperial: false }).addTo(this.map);
    this.map.fitBounds(
      [
        [49, 14.1],
        [54.9, 24.2],
      ],
      { animate: false },
    );
    this.map.on('moveend', this.onMoveEnd);
    this.map.on('movestart', this.onMoveStart);
    this.map.on('zoomstart', this.onZoomStart);
    this.map.on('zoomend', this.onZoomEnd);
    this.map.on('click', this.onMapClick);
    this.areas = new LeafletAreas(this.map, {
      placePoint: (point) => this.placePoint(point),
      changed: (change) => this.bindings()?.areaChanged?.(change),
      selected: (id) => this.bindings()?.areaSelected?.(id),
      measured: (points) => this.bindings()?.measured?.(points),
    });
    this.resizeObserver = new ResizeObserver(() => {
      if (this.destroyed) return;
      const wasRestoring = this.restoring;
      this.restoring = true;
      try {
        this.map.invalidateSize({ pan: false, debounceMoveend: false });
      } finally {
        this.restoring = wasRestoring;
      }
    });
    this.resizeObserver.observe(container);
    this.bindings.set(bindings);
  }

  getViewport(): MapViewport {
    const center = this.map.getCenter();
    return {
      latitude: center.lat,
      longitude: center.lng >= -180 && center.lng <= 180 ? center.lng : center.wrap().lng,
      zoom: this.map.getZoom(),
    };
  }

  selectBasemap(basemap: Basemap): void {
    if (basemap === 'satellite' && !this.satelliteAvailable()) {
      this.tileMessageState.set(
        'Satelita wymaga skonfigurowania tokenu Mapbox. Mapa OSM jest dostępna.',
      );
      return;
    }
    this.bindings()?.basemapChanged?.(basemap);
    if (this.basemap() === basemap) return;
    this.tileMessageState.set('');
    this.basemapState.set(basemap);
  }

  retryTiles(): void {
    this.tileMessageState.set('');
    this.retryRevision.update((revision) => revision + 1);
  }

  locate(): void {
    this.initialLocationRequested = true;
    this.requestLocation(true, false);
  }

  private requestLocation(center: boolean, automatic: boolean): void {
    if (this.locating() || this.destroyed) return;
    const navigationRevision = this.navigationRevision;
    if (!navigator.geolocation) {
      this.locationMessageState.set(
        'Lokalizacja jest niedostępna w tej przeglądarce. Możesz przesuwać mapę ręcznie.',
      );
      return;
    }
    this.locatingState.set(true);
    this.locationMessageState.set('Ustalanie lokalizacji…');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (this.destroyed) return;
        this.locatingState.set(false);
        this.showLocation(
          coords.latitude,
          coords.longitude,
          coords.accuracy,
          center && (!automatic || navigationRevision === this.navigationRevision),
        );
        this.locationAccuracyState.set(Math.round(coords.accuracy));
        this.locationMessageState.set('');
      },
      (error) => {
        if (this.destroyed) return;
        this.locatingState.set(false);
        this.locationMessageState.set(
          error.code === 1
            ? 'Brak zgody na lokalizację. Możesz przesuwać mapę ręcznie.'
            : 'Nie udało się ustalić lokalizacji. Spróbuj ponownie lub przesuń mapę ręcznie.',
        );
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: automatic ? 60000 : 0,
      },
    );
  }

  ngOnDestroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.restoreFrame !== undefined) cancelAnimationFrame(this.restoreFrame);
    this.pendingViewport = undefined;
    this.resizeObserver?.disconnect();
    this.removeLayer();
    this.map?.off('click', this.onMapClick);
    this.areas?.destroy();
    for (const { marker } of this.markers.values()) marker.off().remove();
    this.markers.clear();
    this.draftMarker?.marker.off().remove();
    this.map?.off('moveend', this.onMoveEnd);
    this.map?.off('movestart', this.onMoveStart);
    this.map?.off('zoomstart', this.onZoomStart);
    this.map?.off('zoomend', this.onZoomEnd);
    // Leaflet's CSS zoom completion timer must run before its pane is removed.
    if (this.zooming) this.map.once('zoomend', () => this.map.remove());
    else this.map?.remove();
  }

  private renderTiles({ basemap, url, attribution }: TileSource): void {
    this.removeLayer();
    this.loadingState.set(false);
    const layer = L.tileLayer(url, {
      ...(basemap === 'satellite' ? { tileSize: 512, zoomOffset: -1, minZoom: 1 } : {}),
      maxZoom: 22,
      maxNativeZoom: 19,
      attribution,
      updateWhenIdle: true,
      keepBuffer: 0,
      referrerPolicy: 'strict-origin-when-cross-origin',
    });
    this.layer = layer;
    layer.on('tileerror', () => {
      if (this.destroyed || this.layer !== layer) return;
      if (basemap === 'satellite') this.satelliteFailed();
      else
        this.tileMessageState.set(
          'Nie udało się pobrać mapy OSM. Sprawdź połączenie i spróbuj ponownie.',
        );
    });
    layer.on('loading', () => {
      this.loadingState.set(true);
      clearTimeout(this.tileTimeout);
      if (basemap === 'satellite')
        this.tileTimeout = setTimeout(() => this.satelliteFailed(), 15000);
    });
    layer.on('load', () => {
      this.loadingState.set(false);
      clearTimeout(this.tileTimeout);
    });
    layer.addTo(this.map);
  }

  private pointIcon(
    number: number,
    selected: boolean,
    draft = false,
    accents: string[] = [],
  ): L.DivIcon {
    const badge = document.createElement('span');
    badge.textContent = String(number);
    badge.style.cssText = `display:grid;place-items:center;width:32px;height:32px;border:3px solid white;border-radius:50%;color:white;font-size:11px;font-weight:700;font-variant-numeric:tabular-nums;background:${draft ? '#c56c28' : selected ? '#233f1e' : '#5f7e45'};box-shadow:0 2px 8px #0006`;
    if (!draft && accents.length) {
      badge.style.borderColor = 'transparent';
      badge.style.background = `linear-gradient(${selected ? '#233f1e' : '#fff'}, ${selected ? '#233f1e' : '#fff'}) padding-box, conic-gradient(${accents.map((color, index) => `${color} ${(index * 100) / accents.length}% ${((index + 1) * 100) / accents.length}%`).join(',')}) border-box`;
      badge.style.color = selected ? '#fff' : '#233f1e';
      badge.style.borderWidth = '5px';
      badge.style.boxSizing = 'border-box';
    }
    return L.divIcon({
      className: 'pt-place-marker',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      html: badge,
    });
  }

  private renderPoints(places: MapPlace[], draft: MapPointDraft | null): void {
    const visible = places;
    const ids = new Set(visible.map((place) => place.id));
    for (const [id, { marker }] of this.markers) {
      if (!ids.has(id)) {
        marker.off().remove();
        this.markers.delete(id);
      }
    }
    for (const place of visible) {
      const entry = this.markers.get(place.id);
      let marker = entry?.marker;
      if (!marker) {
        marker = L.marker([place.coordinates.latitude, place.coordinates.longitude], {
          title: place.name,
          icon: this.pointIcon(place.number, place.selected, false, place.accents),
          bubblingMouseEvents: false,
        }).addTo(this.map);
        const placeMarker = marker;
        marker.on('click', () => {
          if (this.destroyed || this.bindings()?.pointDraft?.()) return;
          if (this.areas?.pick(placeMarker.getLatLng())) return;
          const current = this.bindings()?.places?.() ?? [];
          const origin = current.find((item) => item.id === place.id);
          if (!origin) return;
          const pixel = this.map.latLngToContainerPoint([
            origin.coordinates.latitude,
            origin.coordinates.longitude,
          ]);
          this.bindings()?.placesSelected?.(
            current
              .filter(
                (item) =>
                  pixel.distanceTo(
                    this.map.latLngToContainerPoint([
                      item.coordinates.latitude,
                      item.coordinates.longitude,
                    ]),
                  ) <= 28,
              )
              .map((item) => item.id),
          );
        });
        this.markers.set(place.id, {
          marker,
          selected: place.selected,
          number: place.number,
          accents: (place.accents ?? []).join(),
        });
      }
      marker.setOpacity(place.id === draft?.pointId ? 0 : 1);
      marker.setLatLng([place.coordinates.latitude, place.coordinates.longitude]);
      if (
        entry &&
        (entry.selected !== place.selected ||
          entry.number !== place.number ||
          entry.accents !== (place.accents ?? []).join())
      ) {
        marker.setIcon(this.pointIcon(place.number, place.selected, false, place.accents));
        entry.selected = place.selected;
        entry.number = place.number;
        entry.accents = (place.accents ?? []).join();
      }
      const element = marker.getElement();
      if (element) {
        element.style.pointerEvents = place.id === draft?.pointId ? 'none' : '';
        element.title = place.name;
        element.setAttribute('aria-label', place.name);
        element.setAttribute('data-observation-tones', (place.accents ?? []).join());
        element.setAttribute(
          'aria-description',
          `Punkt nr ${place.number}${place.summary ? '. ' + place.summary : ''}`,
        );
      }
    }
    if (
      this.draftMarker &&
      (this.draftMarker.sessionId !== draft?.sessionId || !draft.coordinates)
    ) {
      this.draftMarker.marker.off().remove();
      this.draftMarker = undefined;
    }
    if (!draft?.coordinates) return;
    const { latitude, longitude } = draft.coordinates;
    if (!this.draftMarker) {
      const sessionId = draft.sessionId;
      const marker = L.marker([latitude, longitude], {
        title: 'Położenie szkicu',
        icon: this.pointIcon(draft.number, false, true),
        draggable: true,
      }).addTo(this.map);
      marker.on('dragend', () => this.emitPlacement(sessionId, marker.getLatLng()));
      this.draftMarker = { marker, sessionId };
    } else if (!this.draftMarker.marker.getLatLng().equals([latitude, longitude])) {
      this.draftMarker.marker.setLatLng([latitude, longitude]);
    }
  }

  private emitPlacement(sessionId: number, location: { lat: number; lng: number }): void {
    if (this.destroyed || this.bindings()?.pointDraft?.()?.sessionId !== sessionId) return;
    const wrapped = L.latLng(location.lat, location.lng).wrap();
    this.bindings()?.pointPlaced?.({
      sessionId,
      coordinates: { latitude: wrapped.lat, longitude: wrapped.lng },
    });
  }
  /** Also used by saved area shapes, so a point can be positioned inside an area. */
  private placePoint(point: L.LatLng): boolean {
    const draft = this.bindings()?.pointDraft?.();
    if (draft) this.emitPlacement(draft.sessionId, point);
    return !!draft;
  }
  private readonly onMapClick = (event: L.LeafletMouseEvent): void => {
    if (!this.areas?.pick(event.latlng)) this.placePoint(event.latlng);
  };

  private restoreViewport(view: MapViewport): void {
    ++this.navigationRevision;
    this.restoring = true;
    this.pendingViewport = view;
    // Observe any earlier zoom queued for the next frame before applying a view.
    this.restoreFrame ??= requestAnimationFrame(() => {
      this.restoreFrame = undefined;
      if (!this.zooming) this.applyPendingViewport();
    });
    this.map.stop();
  }

  private showLocation(
    latitude: number,
    longitude: number,
    accuracy: number,
    center: boolean,
  ): void {
    this.locationLayers?.remove();
    this.locationLayers = L.layerGroup([
      L.circle([latitude, longitude], {
        className: 'pt-location-accuracy',
        radius: accuracy,
        color: '#416b37',
        weight: 1,
        fillOpacity: 0.08,
      }),
      L.circleMarker([latitude, longitude], {
        className: 'pt-location-position',
        radius: 7,
        color: '#fffef8',
        weight: 3,
        fillColor: '#416b37',
        fillOpacity: 1,
      }),
    ]).addTo(this.map);
    if (center) this.map.setView([latitude, longitude], 16, { animate: false });
  }

  private readonly onMoveStart = (): void => {
    if (!this.restoring) ++this.navigationRevision;
  };

  private readonly onZoomStart = (): void => {
    this.zooming = true;
  };
  private readonly onZoomEnd = (): void => {
    this.zooming = false;
  };
  private readonly onMoveEnd = (): void => {
    if (this.pendingViewport && this.restoreFrame === undefined && !this.zooming) {
      this.applyPendingViewport();
      return;
    }
    if (!this.restoring && !this.destroyed) this.bindings()?.viewportChanged(this.getViewport());
  };

  private applyPendingViewport(): void {
    const view = this.pendingViewport;
    if (!view || this.destroyed) return;
    this.pendingViewport = undefined;
    try {
      this.map.setView([view.latitude, view.longitude], view.zoom, {
        animate: false,
      });
    } finally {
      this.restoring = false;
    }
  }

  private satelliteFailed(): void {
    this.basemapState.set('osm');
    this.loadingState.set(false);
    this.tileMessageState.set(
      'Satelita jest niedostępna — sprawdź token, limit Mapbox lub połączenie. Przywrócono mapę OSM.',
    );
  }

  private removeLayer(): void {
    clearTimeout(this.tileTimeout);
    this.layer?.remove();
    // Keep Leaflet's own removal listeners alive until removal is complete.
    this.layer?.off();
    this.layer = undefined;
  }
}
