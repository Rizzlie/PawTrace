import { HttpClient } from "@angular/common/http";
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { timeout } from "rxjs";
import { MapEngine, type MapConfig } from "@pawtrace/map-engine";

@Component({
  selector: "app-root",
  imports: [MapEngine],
  templateUrl: "./app.html",
  styleUrl: "./app.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly mapConfig = signal<MapConfig>({ mapboxToken: "" });
  protected readonly configFailed = signal(false);
  protected readonly connection = signal<"checking" | "online" | "offline">(
    "checking",
  );

  constructor() {
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
          if (
            config &&
            typeof config === "object" &&
            "mapboxToken" in config &&
            typeof config.mapboxToken === "string"
          ) {
            this.mapConfig.set({ mapboxToken: config.mapboxToken });
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
