import * as L from "leaflet";
import {
  inject,
  SecurityContext,
  Service,
  type OnDestroy,
} from "@angular/core";
import { DomSanitizer } from "@angular/platform-browser";
import type { Basemap, MapConfig, MapViewport } from "./map-types";
import { defaultMapSources } from "./map-config";

interface MapEvents {
  viewportChanged: (view: MapViewport) => void;
  basemapChanged: (basemap: Basemap) => void;
  tileMessage: (message: string) => void;
}

/** One component-scoped map; Angular destroys its resources with the host. */
@Service({ autoProvided: false })
export class LeafletMap implements OnDestroy {
  private readonly sanitizer = inject(DomSanitizer);
  private map!: L.Map;
  private events!: MapEvents;
  private resizeObserver?: ResizeObserver;
  private layer?: L.TileLayer;
  private basemap: Basemap = "osm";
  private config: MapConfig = { mapboxToken: "" };
  private restoring = false;
  private destroyed = false;
  private zooming = false;
  private pendingViewport?: MapViewport;
  private restoreFrame?: number;
  private tileTimeout?: ReturnType<typeof setTimeout>;
  private locationLayers?: L.LayerGroup;

  initialize(container: HTMLElement, events: MapEvents): void {
    if (this.map || this.destroyed)
      throw new Error("Map service can only be initialized once.");
    this.events = events;
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
      const wasRestoring = this.restoring;
      this.restoring = true;
      try {
        this.map.invalidateSize({ pan: false, debounceMoveend: false });
      } finally {
        this.restoring = wasRestoring;
      }
    });
    this.resizeObserver.observe(container);
    this.selectBasemap("osm");
  }

  getViewport(): MapViewport {
    const center = this.map.getCenter();
    return {
      latitude: center.lat,
      longitude: center.lng,
      zoom: this.map.getZoom(),
    };
  }

  restoreViewport(view: MapViewport): void {
    if (this.destroyed) return;
    this.restoring = true;
    this.pendingViewport = view;
    // An earlier user zoom may still be queued for the next frame. Let it
    // start before deciding whether to wait for its completed move event.
    this.restoreFrame ??= requestAnimationFrame(() => {
      this.restoreFrame = undefined;
      if (!this.zooming) this.applyPendingViewport();
    });
    this.map.stop();
  }

  configure(config: MapConfig): void {
    if (
      this.config.mapboxToken === config.mapboxToken &&
      this.config.osm?.urlTemplate === config.osm?.urlTemplate &&
      this.config.osm?.attribution === config.osm?.attribution &&
      this.config.satellite?.urlTemplate === config.satellite?.urlTemplate &&
      this.config.satellite?.attribution === config.satellite?.attribution
    )
      return;
    this.config = config;
    if (
      this.basemap === "satellite" &&
      this.requiresToken("satellite") &&
      !config.mapboxToken
    )
      this.selectBasemap("osm");
    else this.retryTiles();
  }

  selectBasemap(basemap: Basemap): void {
    if (this.requiresToken(basemap) && !this.config.mapboxToken) {
      this.events.tileMessage(
        "Satelita wymaga skonfigurowania tokenu Mapbox. Mapa OSM jest dostępna.",
      );
      return;
    }
    if (this.layer && this.basemap === basemap) return;
    this.removeLayer();
    this.basemap = basemap;
    this.events.basemapChanged(basemap);
    this.events.tileMessage("");
    const source = this.config[basemap] ?? defaultMapSources[basemap];
    const url = source.urlTemplate.replace(
      /\{accessToken\}/g,
      encodeURIComponent(this.config.mapboxToken),
    );
    const attribution =
      this.sanitizer.sanitize(SecurityContext.HTML, source.attribution) ?? "";
    const layer =
      basemap === "osm"
        ? L.tileLayer(url, {
            maxZoom: 19,
            attribution,
            updateWhenIdle: true,
            keepBuffer: 0,
            referrerPolicy: "strict-origin-when-cross-origin",
          })
        : L.tileLayer(url, {
            tileSize: 512,
            zoomOffset: -1,
            minZoom: 1,
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
        this.events.tileMessage(
          "Nie udało się pobrać mapy OSM. Sprawdź połączenie i spróbuj ponownie.",
        );
    });
    layer.on("loading", () => {
      clearTimeout(this.tileTimeout);
      if (basemap === "satellite")
        this.tileTimeout = setTimeout(() => this.satelliteFailed(), 15000);
    });
    layer.on("load", () => clearTimeout(this.tileTimeout));
    layer.addTo(this.map);
  }

  retryTiles(): void {
    const basemap = this.basemap;
    this.removeLayer();
    this.selectBasemap(basemap);
  }

  private requiresToken(basemap: Basemap): boolean {
    return (
      this.config[basemap] ?? defaultMapSources[basemap]
    ).urlTemplate.includes("{accessToken}");
  }

  showLocation(latitude: number, longitude: number, accuracy: number): void {
    if (this.destroyed) return;
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
    // Leaflet's CSS zoom has its own completion timer which stop() cannot
    // cancel. Removing the map earlier makes that timer touch a deleted pane.
    if (this.zooming) this.map.once("zoomend", () => this.map.remove());
    else this.map?.remove();
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
      this.events.viewportChanged(this.getViewport());
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
    this.selectBasemap("osm");
    // Image errors do not expose HTTP status; do not guess 401 vs 429.
    this.events.tileMessage(
      "Satelita jest niedostępna — sprawdź token, limit Mapbox lub połączenie. Przywrócono mapę OSM.",
    );
  }

  private removeLayer(): void {
    clearTimeout(this.tileTimeout);
    this.layer?.remove();
    // Leaflet's remove listeners detach map events and provider attribution.
    // Keep them alive until removal has completed.
    this.layer?.off();
    this.layer = undefined;
  }
}
