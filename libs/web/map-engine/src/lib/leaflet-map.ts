import * as L from "leaflet";
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
} from "@angular/core";
import { DomSanitizer } from "@angular/platform-browser";
import type { Basemap, MapConfig, MapViewport } from "./map-types";
import { defaultMapSources } from "./map-config";

interface MapBindings {
  config: Signal<MapConfig>;
  viewport?: Signal<MapViewport | undefined>;
  viewportChanged: (view: MapViewport) => void;
}

interface TileSource {
  basemap: Basemap;
  url: string;
  attribution: string;
}

const emptyConfig: MapConfig = { mapboxToken: "" };

/** One component-scoped map; Angular destroys its resources with the host. */
@Service({ autoProvided: false })
export class LeafletMap implements OnDestroy {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly bindings = signal<MapBindings | undefined>(undefined);
  private readonly config = computed(
    () => this.bindings()?.config() ?? emptyConfig,
  );
  private readonly satelliteSource = computed(
    () => this.config().satellite ?? defaultMapSources.satellite,
  );
  readonly satelliteAvailable = computed(
    () =>
      !this.satelliteSource().urlTemplate.includes("{accessToken}") ||
      !!this.config().mapboxToken,
  );
  private readonly basemapState = linkedSignal<boolean, Basemap>({
    source: this.satelliteAvailable,
    computation: (available, previous) =>
      available ? (previous?.value ?? "osm") : "osm",
  });
  readonly basemap = this.basemapState.asReadonly();
  private readonly loadingState = signal(false);
  readonly loading = this.loadingState.asReadonly();
  private readonly locationMessageState = signal("");
  readonly locationMessage = this.locationMessageState.asReadonly();
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
        attribution:
          this.sanitizer.sanitize(SecurityContext.HTML, source.attribution) ??
          "",
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
    return "";
  });
  readonly tileMessage = this.tileMessageState.asReadonly();
  readonly showMapboxLogo = computed(
    () =>
      this.basemap() === "satellite" &&
      new URL(this.satelliteSource().urlTemplate, "https://pawtrace.invalid")
        .hostname === "api.mapbox.com",
  );

  private map!: L.Map;
  private resizeObserver?: ResizeObserver;
  private layer?: L.TileLayer;
  private restoring = false;
  private destroyed = false;
  private zooming = false;
  private pendingViewport?: MapViewport;
  private restoreFrame?: number;
  private tileTimeout?: ReturnType<typeof setTimeout>;
  private locationLayers?: L.LayerGroup;

  constructor() {
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
        if (view && !this.destroyed)
          untracked(() => this.restoreViewport(view));
      },
    });
  }

  initialize(container: HTMLElement, bindings: MapBindings): void {
    if (this.map || this.destroyed)
      throw new Error("Map service can only be initialized once.");
    this.map = L.map(container, {
      zoomControl: false,
      minZoom: 3,
      maxZoom: 19,
      trackResize: false,
    });
    L.control
      .zoom({
        position: "bottomright",
        zoomInTitle: "Przybliż",
        zoomOutTitle: "Oddal",
      })
      .addTo(this.map);
    L.control
      .scale({ position: "bottomleft", imperial: false })
      .addTo(this.map);
    this.map.fitBounds(
      [
        [49, 14.1],
        [54.9, 24.2],
      ],
      { animate: false },
    );
    this.map.on("moveend", this.onMoveEnd);
    this.map.on("zoomstart", this.onZoomStart);
    this.map.on("zoomend", this.onZoomEnd);
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
      longitude: center.lng,
      zoom: this.map.getZoom(),
    };
  }

  selectBasemap(basemap: Basemap): void {
    if (basemap === "satellite" && !this.satelliteAvailable()) {
      this.tileMessageState.set(
        "Satelita wymaga skonfigurowania tokenu Mapbox. Mapa OSM jest dostępna.",
      );
      return;
    }
    if (this.basemap() === basemap) return;
    this.tileMessageState.set("");
    this.basemapState.set(basemap);
  }

  retryTiles(): void {
    this.tileMessageState.set("");
    this.retryRevision.update((revision) => revision + 1);
  }

  locate(): void {
    if (this.locating() || this.destroyed) return;
    if (!navigator.geolocation) {
      this.locationMessageState.set(
        "Lokalizacja jest niedostępna w tej przeglądarce. Możesz przesuwać mapę ręcznie.",
      );
      return;
    }
    this.locatingState.set(true);
    this.locationMessageState.set("Ustalanie lokalizacji…");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (this.destroyed) return;
        this.locatingState.set(false);
        this.showLocation(coords.latitude, coords.longitude, coords.accuracy);
        this.locationMessageState.set(
          `Twoja lokalizacja (dokładność około ${Math.round(coords.accuracy)} m).`,
        );
      },
      (error) => {
        if (this.destroyed) return;
        this.locatingState.set(false);
        this.locationMessageState.set(
          error.code === 1
            ? "Brak zgody na lokalizację. Możesz przesuwać mapę ręcznie."
            : "Nie udało się ustalić lokalizacji. Spróbuj ponownie lub przesuń mapę ręcznie.",
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }

  ngOnDestroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.restoreFrame !== undefined)
      cancelAnimationFrame(this.restoreFrame);
    this.pendingViewport = undefined;
    this.resizeObserver?.disconnect();
    this.removeLayer();
    this.map?.off("moveend", this.onMoveEnd);
    this.map?.off("zoomstart", this.onZoomStart);
    this.map?.off("zoomend", this.onZoomEnd);
    // Leaflet's CSS zoom completion timer must run before its pane is removed.
    if (this.zooming) this.map.once("zoomend", () => this.map.remove());
    else this.map?.remove();
  }

  private renderTiles({ basemap, url, attribution }: TileSource): void {
    this.removeLayer();
    this.loadingState.set(false);
    const layer = L.tileLayer(url, {
      ...(basemap === "satellite"
        ? { tileSize: 512, zoomOffset: -1, minZoom: 1 }
        : {}),
      maxZoom: 19,
      attribution,
      updateWhenIdle: true,
      keepBuffer: 0,
      referrerPolicy: "strict-origin-when-cross-origin",
    });
    this.layer = layer;
    layer.on("tileerror", () => {
      if (this.destroyed || this.layer !== layer) return;
      if (basemap === "satellite") this.satelliteFailed();
      else
        this.tileMessageState.set(
          "Nie udało się pobrać mapy OSM. Sprawdź połączenie i spróbuj ponownie.",
        );
    });
    layer.on("loading", () => {
      this.loadingState.set(true);
      clearTimeout(this.tileTimeout);
      if (basemap === "satellite")
        this.tileTimeout = setTimeout(() => this.satelliteFailed(), 15000);
    });
    layer.on("load", () => {
      this.loadingState.set(false);
      clearTimeout(this.tileTimeout);
    });
    layer.addTo(this.map);
  }

  private restoreViewport(view: MapViewport): void {
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
  ): void {
    this.locationLayers?.remove();
    this.locationLayers = L.layerGroup([
      L.circle([latitude, longitude], {
        radius: accuracy,
        color: "#416b37",
        weight: 1,
        fillOpacity: 0.08,
      }),
      L.circleMarker([latitude, longitude], {
        radius: 7,
        color: "#fffef8",
        weight: 3,
        fillColor: "#416b37",
        fillOpacity: 1,
      }),
    ]).addTo(this.map);
    this.map.setView([latitude, longitude], 16, { animate: false });
  }

  private readonly onZoomStart = (): void => {
    this.zooming = true;
  };
  private readonly onZoomEnd = (): void => {
    this.zooming = false;
  };
  private readonly onMoveEnd = (): void => {
    if (
      this.pendingViewport &&
      this.restoreFrame === undefined &&
      !this.zooming
    ) {
      this.applyPendingViewport();
      return;
    }
    if (!this.restoring && !this.destroyed)
      this.bindings()?.viewportChanged(this.getViewport());
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
    this.basemapState.set("osm");
    this.loadingState.set(false);
    this.tileMessageState.set(
      "Satelita jest niedostępna — sprawdź token, limit Mapbox lub połączenie. Przywrócono mapę OSM.",
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
