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
import { groundDistance } from '@pawtrace/case-domain/geometry';
import type { MapArea, MapAreaDraft, AreaGeometryChange, MapCoordinates } from './map-types';
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
  readonly areas = input<MapArea[]>([]);
  readonly areaDraft = input<MapAreaDraft | null>(null);
  readonly areaChanged = output<AreaGeometryChange>();
  readonly areaSelected = output<string>();
  readonly addAreaRequested = output<'circle' | 'polygon'>();
  readonly measurementRequested = output<void>();
  readonly measurementClosed = output<void>();
  readonly measuring = input(false);
  protected readonly measurement = linkedSignal<MapCoordinates[] | null>(() =>
    this.measuring() && !this.areaDraft() && !this.pointDraft() ? [] : null,
  );
  protected readonly distance = computed(() => {
    const points = this.measurement();
    return points?.length === 2
      ? new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1 }).format(
          groundDistance(points[0], points[1]),
        ) + ' m'
      : 'Wybierz dwie pozycje na mapie.';
  });
  protected undoMeasurement(): void {
    this.measurement.update((points) => points?.slice(0, -1) ?? null);
  }
  readonly pointCreationEnabled = input(false);
  readonly addPointRequested = output<void>();
  readonly places = input<MapPlace[]>([]);
  readonly pointDraft = input<MapPointDraft | null>(null);
  readonly pointPlaced = output<PointPlacement>();
  readonly placeSelected = output<string>();
  private readonly overlapIds = linkedSignal(() => {
    this.places();
    this.pointDraft();
    this.areaDraft();
    this.measuring();
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
          areas: this.areas,
          areaDraft: this.areaDraft,
          areaChanged: (change) => this.areaChanged.emit(change),
          areaSelected: (id) => this.areaSelected.emit(id),
          measurement: this.measurement,
          measured: (points) => this.measurement.set(points),
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
