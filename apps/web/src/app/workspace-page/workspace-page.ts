import { MatButtonModule } from '@angular/material/button';
import { AppHeader } from '../layout/app-header/app-header';
import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { timeout } from 'rxjs';
import {
  MapEngine,
  parseMapConfig,
  type MapConfig,
  type InitialLocation,
  type MapViewport,
} from '@pawtrace/map-engine';
import {
  AddressSearch,
  CaseStore,
  CaseControls,
  PointWorkspace,
  AreaWorkspace,
  type AddressSearchResult,
} from '@pawtrace/workspace';
import { Router, RouterOutlet } from '@angular/router';
import { FloatingPanel } from '@pawtrace/shared-ui';

@Component({
  selector: 'app-workspace-page',
  imports: [
    MatButtonModule,
    AppHeader,
    RouterOutlet,
    MapEngine,
    AddressSearch,
    CaseControls,
    FloatingPanel,
    PointWorkspace,
    AreaWorkspace,
  ],
  templateUrl: './workspace-page.html',
  styleUrl: './workspace-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspacePage {
  protected readonly measurementMode = linkedSignal({
    source: () => this.state.persistence().generation,
    computation: () => false,
  });
  protected readonly measuring = computed(() => this.measurementMode() && !this.state.editor());
  protected async addArea(type: 'circle' | 'polygon'): Promise<void> {
    if (this.router.url === '/' || (await this.router.navigateByUrl('/'))) {
      await this.state.editArea(type);
      if (this.state.editor()?.kind === 'area') this.measurementMode.set(false);
    }
  }
  protected async selectArea(id: string): Promise<void> {
    if (this.router.url === '/' || (await this.router.navigateByUrl('/')))
      await this.state.selectArea(id);
  }
  protected async measure(): Promise<void> {
    if (
      (this.router.url === '/' || (await this.router.navigateByUrl('/'))) &&
      (await this.state.requestEditorExit())
    ) {
      await this.state.selectArea(null);
      this.measurementMode.set(true);
    }
  }
  protected readonly state = inject(CaseStore);
  private readonly router = inject(Router);

  protected async selectPoint(id: string): Promise<void> {
    if (this.router.url === '/' || (await this.router.navigateByUrl('/')))
      await this.state.selectPoint(id);
  }

  protected async addPoint(): Promise<void> {
    if (this.router.url === '/' || (await this.router.navigateByUrl('/')))
      await this.state.editPoint();
    if (this.state.editor()?.kind === 'point') this.measurementMode.set(false);
  }
  protected readonly initialLocation = computed<InitialLocation>(() =>
    !this.state.persistence().initialized ? 'off' : this.state.document() ? 'show' : 'center',
  );
  private readonly addressViewport = signal<MapViewport | undefined>(undefined);
  protected readonly viewport = computed<MapViewport | undefined>(() => {
    const view = this.state.document()?.mapView;
    return view ? { ...view.center, zoom: view.zoom } : this.addressViewport();
  });

  protected selectAddress(result: AddressSearchResult): void {
    const view = {
      latitude: result.latitude,
      longitude: result.longitude,
      zoom: 15,
    };
    const draft = this.state.mapPointDraft();
    if (draft)
      this.state.placePoint({
        sessionId: draft.sessionId,
        coordinates: { latitude: result.latitude, longitude: result.longitude },
      });
    if (this.state.document()) this.state.changeViewport(view);
    else this.addressViewport.set(view);
  }
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly mapConfig = signal<MapConfig>({ mapboxToken: '' });
  protected readonly configFailed = signal(false);
  constructor() {
    void this.state.initialize();
    this.loadMapConfig();
  }

  protected loadMapConfig(): void {
    this.configFailed.set(false);
    this.http
      .get<unknown>('/api/map-config')
      .pipe(timeout(5000), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (config) => {
          const parsed = parseMapConfig(config);
          if (parsed) {
            this.mapConfig.set(parsed);
          } else {
            this.configFailed.set(true);
          }
        },
        error: () => this.configFailed.set(true),
      });
  }
}
