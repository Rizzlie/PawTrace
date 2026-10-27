import { HttpClient } from "@angular/common/http";
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { timeout } from "rxjs";
import {
  MapEngine,
  parseMapConfig,
  type MapConfig,
  type MapViewport,
} from "@pawtrace/map-engine";
import {
  AddressSearch,
  AppState,
  CaseControls,
  type AddressSearchResult,
} from "@pawtrace/workspace";
import { AppHeader } from "./layout/app-header/app-header";
import { FloatingPanel } from "@pawtrace/shared-ui";

@Component({
  selector: "app-root",
  imports: [MapEngine, AddressSearch, CaseControls, AppHeader, FloatingPanel],
  templateUrl: "./app.html",
  styleUrl: "./app.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly state = inject(AppState);
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
  protected readonly guideOpen = signal(true);
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly mapConfig = signal<MapConfig>({ mapboxToken: "" });
  protected readonly configFailed = signal(false);
  protected readonly connection = signal<"checking" | "online" | "offline">(
    "checking",
  );

  constructor() {
    void this.state.initialize();
    this.checkConnection();
    this.loadMapConfig();
  }

  protected loadMapConfig(): void {
    this.configFailed.set(false);
    this.http
      .get<unknown>("/api/map-config")
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

  protected checkConnection(): void {
    this.connection.set("checking");
    this.http
      .get<{ status: string }>("/api/health")
      .pipe(timeout(5000), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (health) =>
          this.connection.set(health.status === "ok" ? "online" : "offline"),
        error: () => this.connection.set("offline"),
      });
  }
}
