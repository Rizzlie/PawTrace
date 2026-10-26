import * as L from "leaflet";
import type { Basemap, MapConfig, MapViewport } from "./map-types";

const osmAttribution =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const satelliteAttribution =
  '<a href="https://www.mapbox.com/about/maps/">&copy; Mapbox</a> | ' +
  osmAttribution +
  ' | <a href="https://www.maxar.com/">&copy; Maxar</a> | <a href="https://www.mapbox.com/map-feedback/">Improve this map</a>';
interface MapEvents {
  viewportChanged: (view: MapViewport) => void;
  basemapChanged: (basemap: Basemap) => void;
  tileMessage: (message: string) => void;
}

/** Owns Leaflet resources; case state and persistence belong to the caller. */
export class LeafletMap {
  private readonly map: L.Map;
  private readonly resizeObserver: ResizeObserver;
  private layer?: L.TileLayer;
  private basemap: Basemap = "osm";
  private config: MapConfig = { mapboxToken: "" };
  private restoring = false;
  private destroyed = false;
  private tileTimeout?: ReturnType<typeof setTimeout>;
  private locationLayers?: L.LayerGroup;

  constructor(
    container: HTMLElement,
    private readonly events: MapEvents,
  ) {
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
    this.resizeObserver = new ResizeObserver(() => {
      this.restoring = true;
      this.map.invalidateSize({ pan: false, debounceMoveend: false });
      this.restoring = false;
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
    this.restoring = true;
    this.map.stop();
    this.map.setView([view.latitude, view.longitude], view.zoom, {
      animate: false,
    });
    this.restoring = false;
  }

  configure(config: MapConfig): void {
    if (this.config.mapboxToken === config.mapboxToken) return;
    this.config = config;
    if (this.basemap === "satellite") this.selectBasemap("osm");
  }

  selectBasemap(basemap: Basemap): void {
    if (basemap === "satellite" && !this.config.mapboxToken) {
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
    const layer =
      basemap === "osm"
        ? L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: osmAttribution,
            updateWhenIdle: true,
            keepBuffer: 0,
            referrerPolicy: "strict-origin-when-cross-origin",
          })
        : L.tileLayer(
            "https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/512/{z}/{x}/{y}?access_token=" +
              encodeURIComponent(this.config.mapboxToken),
            {
              tileSize: 512,
              zoomOffset: -1,
              minZoom: 1,
              maxZoom: 19,
              attribution: satelliteAttribution,
              updateWhenIdle: true,
              keepBuffer: 0,
              referrerPolicy: "strict-origin-when-cross-origin",
            },
          );
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

  destroy(): void {
    this.destroyed = true;
    this.resizeObserver.disconnect();
    this.removeLayer();
    this.map.off("moveend", this.onMoveEnd);
    this.map.remove();
  }

  private readonly onMoveEnd = (): void => {
    if (!this.restoring && !this.destroyed)
      this.events.viewportChanged(this.getViewport());
  };

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
