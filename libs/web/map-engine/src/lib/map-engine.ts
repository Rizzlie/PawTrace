import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  linkedSignal,
  computed,
  output,
  viewChild,
} from '@angular/core';
import { MatTooltip } from '@angular/material/tooltip';
import { LeafletMap } from './leaflet-map';
import { Toolbar, ToolbarWidget } from '@angular/aria/toolbar';
import type { MapPlace, MapPointDraft, PointPlacement } from './map-types';
import type { Basemap, InitialLocation, MapConfig, MapViewport } from './map-types';

@Component({
  selector: 'pt-map',
  imports: [Toolbar, ToolbarWidget, MatTooltip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [LeafletMap],
  templateUrl: './map-engine.html',
  styleUrl: './map-engine.scss',
})
export class MapEngine {
  readonly pointCreationEnabled = input(false);
  readonly addPointRequested = output<void>();
  readonly places = input<MapPlace[]>([]);
  readonly pointDraft = input<MapPointDraft | null>(null);
  readonly pointPlaced = output<PointPlacement>();
  readonly placeSelected = output<string>();
  private readonly overlapIds = linkedSignal(() => {
    this.places();
    this.pointDraft();
    return [] as string[];
  });
  protected readonly overlapping = computed(() =>
    this.places().filter((place) => this.overlapIds().includes(place.id)),
  );
  protected choosePlace(id: string): void {
    this.overlapIds.set([]);
    this.placeSelected.emit(id);
  }
  protected dismissOverlap(): void {
    this.overlapIds.set([]);
  }
  readonly config = input<MapConfig>({ mapboxToken: '' });
  readonly viewport = input<MapViewport>();
  readonly initialLocation = input<InitialLocation>('off');
  readonly viewportChanged = output<MapViewport>();
  readonly basemap = input<Basemap>('osm');
  readonly basemapChanged = output<Basemap>();
  protected readonly map = inject(LeafletMap);
  private readonly canvas = viewChild.required<ElementRef<HTMLElement>>('canvas');

  constructor() {
    afterNextRender({
      mixedReadWrite: () =>
        this.map.initialize(this.canvas().nativeElement, {
          config: this.config,
          places: this.places,
          pointDraft: this.pointDraft,
          pointPlaced: (placement) => this.pointPlaced.emit(placement),
          placesSelected: (ids) => {
            if (ids.length === 1) this.choosePlace(ids[0]);
            else this.overlapIds.set(ids);
          },
          viewport: this.viewport,
          initialLocation: this.initialLocation,
          basemap: this.basemap,
          basemapChanged: (basemap) => this.basemapChanged.emit(basemap),
          viewportChanged: (view) => this.viewportChanged.emit(view),
        }),
    });
  }
}
