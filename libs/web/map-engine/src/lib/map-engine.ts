import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from "@angular/core";
import { LeafletMap } from "./leaflet-map";
import type { Basemap, MapConfig, MapViewport } from "./map-types";

@Component({
  selector: "pt-map",
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./map-engine.html",
  styleUrl: "./map-engine.scss",
})
export class MapEngine {
  readonly config = input<MapConfig>({ mapboxToken: "" });
  readonly viewport = input<MapViewport>();
  readonly viewportChanged = output<MapViewport>();
  protected readonly basemap = signal<Basemap>("osm");
  protected readonly tileMessage = signal("");
  protected readonly locationMessage = signal("");
  protected readonly locating = signal(false);
  private readonly canvas =
    viewChild.required<ElementRef<HTMLElement>>("canvas");
  private readonly destroyRef = inject(DestroyRef);
  private engine?: LeafletMap;
  private restoredView?: MapViewport;

  constructor() {
    afterRenderEffect({
      mixedReadWrite: () => {
        this.engine ??= new LeafletMap(this.canvas().nativeElement, {
          viewportChanged: (view) => this.viewportChanged.emit(view),
          basemapChanged: (basemap) => this.basemap.set(basemap),
          tileMessage: (message) => this.tileMessage.set(message),
        });
        this.engine.configure(this.config());
        const view = this.viewport();
        if (view && view !== this.restoredView) {
          this.engine.restoreViewport(view);
          this.restoredView = view;
        }
      },
    });
    this.destroyRef.onDestroy(() => this.engine?.destroy());
  }

  protected selectBasemap(basemap: Basemap): void {
    this.engine?.selectBasemap(basemap);
  }
  protected retryTiles(): void {
    this.engine?.retryTiles();
  }

  protected locate(): void {
    if (this.locating()) return;
    if (!navigator.geolocation) {
      this.locationMessage.set(
        "Lokalizacja jest niedostępna w tej przeglądarce. Możesz przesuwać mapę ręcznie.",
      );
      return;
    }
    this.locating.set(true);
    this.locationMessage.set("Ustalanie lokalizacji…");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (this.destroyRef.destroyed) return;
        this.locating.set(false);
        this.engine?.showLocation(
          coords.latitude,
          coords.longitude,
          coords.accuracy,
        );
        this.locationMessage.set(
          `Twoja lokalizacja (dokładność około ${Math.round(coords.accuracy)} m).`,
        );
      },
      (error) => {
        if (this.destroyRef.destroyed) return;
        this.locating.set(false);
        this.locationMessage.set(
          error.code === 1
            ? "Brak zgody na lokalizację. Możesz przesuwać mapę ręcznie."
            : "Nie udało się ustalić lokalizacji. Spróbuj ponownie lub przesuń mapę ręcznie.",
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }
}
