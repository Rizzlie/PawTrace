import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
  viewChild,
} from "@angular/core";
import { LeafletMap } from "./leaflet-map";
import { Toolbar, ToolbarWidget } from "@angular/aria/toolbar";
import type { Basemap, MapConfig, MapViewport } from "./map-types";

@Component({
  selector: "pt-map",
  imports: [Toolbar, ToolbarWidget],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [LeafletMap],
  templateUrl: "./map-engine.html",
  styleUrl: "./map-engine.scss",
})
export class MapEngine {
  readonly config = input<MapConfig>({ mapboxToken: "" });
  readonly viewport = input<MapViewport>();
  readonly viewportChanged = output<MapViewport>();
  readonly basemap = input<Basemap>("osm");
  readonly basemapChanged = output<Basemap>();
  protected readonly map = inject(LeafletMap);
  private readonly canvas =
    viewChild.required<ElementRef<HTMLElement>>("canvas");

  constructor() {
    afterNextRender({
      mixedReadWrite: () =>
        this.map.initialize(this.canvas().nativeElement, {
          config: this.config,
          viewport: this.viewport,
          basemap: this.basemap,
          basemapChanged: (basemap) => this.basemapChanged.emit(basemap),
          viewportChanged: (view) => this.viewportChanged.emit(view),
        }),
    });
  }
}
