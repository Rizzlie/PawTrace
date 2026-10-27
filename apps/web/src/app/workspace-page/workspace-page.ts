import { AppHeader } from '../layout/app-header/app-header';
import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
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
  type AddressSearchResult,
} from '@pawtrace/workspace';
import { RouterOutlet } from '@angular/router';
import { FloatingPanel } from '@pawtrace/shared-ui';

@Component({
  selector: 'app-workspace-page',
  imports: [AppHeader, RouterOutlet, MapEngine, AddressSearch, CaseControls, FloatingPanel],
  templateUrl: './workspace-page.html',
  styleUrl: './workspace-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspacePage {
  protected readonly state = inject(CaseStore);
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
