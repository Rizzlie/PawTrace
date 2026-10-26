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

@Component({
  selector: "app-root",
  templateUrl: "./app.html",
  styleUrl: "./app.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly connection = signal<"checking" | "online" | "offline">(
    "checking",
  );

  constructor() {
    this.checkConnection();
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
