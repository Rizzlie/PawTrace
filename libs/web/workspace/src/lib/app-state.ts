import { computed, inject, Service, signal } from "@angular/core";
import { BrowserFiles, BrowserSnapshot } from "@pawtrace/browser-persistence";
import type { CaseDocument } from "@pawtrace/case-domain";
import type { MapViewport, Basemap } from "@pawtrace/map-engine";
import { SnapshotWriter, type SnapshotJob } from "./snapshot-writer";

interface PersistenceState {
  initialized: boolean;
  revision: number;
  savedRevision: number;
  generation: number;
  writing: boolean;
  replacing: boolean;
  error: string;
  recovery: string;
}
interface State {
  document: CaseDocument | null;
  ui: {
    error: string;
    candidate: CaseDocument | null;
    reading: boolean;
    emptyBasemap: Basemap;
  };
  editor: null;
  persistence: PersistenceState;
}

@Service()
export class AppState {
  private readonly storage = inject(BrowserSnapshot);
  private readonly files = inject(BrowserFiles);
  private readonly root = signal<State>({
    document: null,
    ui: { error: "", candidate: null, reading: false, emptyBasemap: "osm" },
    editor: null,
    persistence: {
      initialized: false,
      revision: 0,
      savedRevision: 0,
      generation: 0,
      writing: false,
      replacing: false,
      error: "",
      recovery: "",
    },
  });
  readonly document = computed(() => this.root().document);
  readonly persistence = computed(() => this.root().persistence);
  readonly ui = computed(() => this.root().ui);
  readonly basemap = computed(
    () => this.document()?.mapView.basemap ?? this.ui().emptyBasemap,
  );
  readonly busy = computed(
    () =>
      !this.persistence().initialized ||
      this.persistence().replacing ||
      this.ui().reading,
  );
  readonly replacementSummary = computed(() => {
    const d = this.ui().candidate;
    return d
      ? {
          title: d.case.title,
          animal: d.animal?.name ?? "Brak profilu zwierzęcia",
          points: d.points.length,
          entries:
            d.points.reduce((count, point) => count + point.entries.length, 0) +
            d.areas.reduce((count, area) => count + area.checks.length, 0),
          areas: d.areas.length,
          photos: new Set([
            ...(d.animal?.photos ?? []),
            ...d.points.flatMap((p) => [
              ...p.photos,
              ...p.entries.flatMap((e) => e.photos),
            ]),
            ...d.areas.flatMap((a) => [
              ...a.photos,
              ...a.checks.flatMap((c) => c.photos),
            ]),
            ...d.assets.map((asset) => asset.filename),
          ]).size,
        }
      : null;
  });
  readonly saveStatus = computed(() => {
    const p = this.persistence();
    if (!p.initialized) return "loading";
    if (p.replacing) return "replacing";
    if (p.error) return "error";
    if (p.writing) return "saving";
    if (p.revision !== p.savedRevision) return "unsaved";
    return this.document() ? "saved" : "empty";
  });
  private readonly writer = new SnapshotWriter(
    this.storage,
    () => this.patchPersistence({ writing: true }),
    (job) => this.acknowledge(job),
    () =>
      this.patchPersistence({
        writing: false,
        error:
          "Nie zapisano zmian w przeglądarce. Wyeksportuj JSON lub ponów zapis.",
      }),
  );
  private initialization?: Promise<void>;
  private transitionRequest = 0;

  initialize(): Promise<void> {
    return (this.initialization ??= this.restore());
  }

  private async restore(): Promise<void> {
    try {
      const stored = await this.storage.read();
      if (stored !== undefined) {
        const result = (
          await import("@pawtrace/case-domain")
        ).validateCaseDocument(stored);
        if (result.success)
          this.root.update((s) => ({ ...s, document: result.data }));
        else
          this.patchPersistence({
            recovery:
              "Zapisana sprawa jest nieprawidłowa lub ma nieobsługiwaną wersję. Zachowano jej dane. Możesz wczytać plik lub jawnie utworzyć nową sprawę.",
          });
      }
    } catch {
      this.patchPersistence({
        recovery:
          "Nie udało się odczytać sprawy z przeglądarki. Ponów odczyt lub wczytaj plik / utwórz nową sprawę.",
      });
    } finally {
      this.patchPersistence({ initialized: true });
    }
  }

  changeViewport(view: MapViewport): void {
    const document = this.document();
    if (!document) return;
    const mapView = {
      ...document.mapView,
      center: { latitude: view.latitude, longitude: view.longitude },
      zoom: view.zoom,
    };
    if (
      !Number.isFinite(view.latitude) ||
      Math.abs(view.latitude) > 90 ||
      !Number.isFinite(view.longitude) ||
      Math.abs(view.longitude) > 180 ||
      !Number.isFinite(view.zoom) ||
      view.zoom < 3 ||
      view.zoom > 19
    )
      return;
    this.commitMapView(mapView);
  }

  changeBasemap(basemap: Basemap): void {
    const document = this.document();
    if (document) this.commitMapView({ ...document.mapView, basemap });
    else
      this.root.update((s) => ({
        ...s,
        ui: { ...s.ui, emptyBasemap: basemap },
      }));
  }

  private commitMapView(mapView: CaseDocument["mapView"]): void {
    const state = this.root();
    const document = state.document;
    if (
      !document ||
      !state.persistence.initialized ||
      state.persistence.replacing
    )
      return;
    const previous = document.mapView;
    if (
      previous.center.latitude === mapView.center.latitude &&
      previous.center.longitude === mapView.center.longitude &&
      previous.zoom === mapView.zoom &&
      previous.basemap === mapView.basemap
    )
      return;
    this.root.update((state) => ({
      ...state,
      document: { ...document, mapView },
      persistence: {
        ...state.persistence,
        revision: state.persistence.revision + 1,
        error: "",
      },
    }));
    this.queueSnapshot();
  }

  private queueSnapshot(): void {
    const s = this.root();
    if (s.document)
      this.writer.request({
        document: s.document,
        revision: s.persistence.revision,
        generation: s.persistence.generation,
      });
  }

  async exportJson(): Promise<string> {
    const document = this.document();
    if (!document) throw new Error("Brak aktywnej sprawy do eksportu.");
    const exportedAt = new Date().toISOString();
    const { serializeCaseFile } = await import("@pawtrace/case-domain");
    return serializeCaseFile(document, exportedAt);
  }

  retrySave(): void {
    if (this.persistence().replacing || !this.document()) return;
    this.patchPersistence({ error: "" });
    this.queueSnapshot();
  }

  async prepareImport(text: string): Promise<void> {
    if (!this.persistence().initialized || this.persistence().replacing) return;
    const request = ++this.transitionRequest;
    const parsed = (await import("@pawtrace/case-domain")).parseCaseFile(text);
    if (request !== this.transitionRequest || this.persistence().replacing)
      return;
    if (!parsed.success) {
      this.root.update((s) => ({
        ...s,
        ui: {
          ...s.ui,
          candidate: null,
          error: parsed.issues
            .map(
              (issue) => `${issue.path.join(".") || "plik"}: ${issue.message}`,
            )
            .join("\n"),
        },
      }));
      return;
    }
    this.root.update((s) => ({
      ...s,
      ui: { ...s.ui, candidate: parsed.data, error: "" },
    }));
  }

  prepareNewCase(): void {
    if (this.busy()) return;
    ++this.transitionRequest;
    const now = new Date().toISOString();
    const candidate: CaseDocument = {
      schemaVersion: 1,
      case: {
        id: crypto.randomUUID(),
        title: "Nowa sprawa",
        createdAt: now,
        updatedAt: now,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        escape: {
          occurredAt: { kind: "unknown", description: null },
          escapePointId: null,
          description: null,
          directionOfTravel: null,
          familiarWithLocation: null,
        },
      },
      animal: null,
      points: [],
      areas: [],
      assets: [],
      mapView: {
        center: { latitude: 52.1, longitude: 19.4 },
        zoom: 6,
        basemap: "osm",
      },
    };
    this.root.update((s) => ({ ...s, ui: { ...s.ui, candidate, error: "" } }));
  }

  cancelReplacement(): void {
    if (this.persistence().replacing) return;
    ++this.transitionRequest;
    this.root.update((s) => ({
      ...s,
      ui: { ...s.ui, error: "", candidate: null },
    }));
  }

  async confirmReplacement(): Promise<void> {
    const candidate = this.ui().candidate;
    if (
      !candidate ||
      this.persistence().replacing ||
      !this.persistence().initialized
    )
      return;
    this.patchPersistence({ replacing: true });
    try {
      await this.writer.replace(candidate);
      this.root.update((s) => ({
        document: candidate,
        editor: null,
        ui: { error: "", candidate: null, reading: false, emptyBasemap: "osm" },
        persistence: {
          ...s.persistence,
          generation: s.persistence.generation + 1,
          revision: 0,
          savedRevision: 0,
          writing: false,
          replacing: false,
          error: "",
          recovery: "",
        },
      }));
    } catch {
      this.patchPersistence({ replacing: false, writing: false });
      this.root.update((s) => ({
        ...s,
        ui: {
          ...s.ui,
          error:
            "Nie udało się zapisać nowej sprawy. Poprzednia sprawa i ostatni poprawny zapis zostały zachowane. Możesz ponowić lub anulować.",
        },
      }));
    }
  }

  async retryRestore(): Promise<void> {
    if (
      this.document() ||
      this.persistence().replacing ||
      !this.persistence().initialized
    )
      return;
    this.patchPersistence({ initialized: false, recovery: "" });
    await this.restore();
  }

  reportFileError(): void {
    this.root.update((s) => ({
      ...s,
      ui: {
        ...s.ui,
        error: "Nie udało się odczytać lub pobrać pliku. Spróbuj ponownie.",
      },
    }));
  }

  async importFile(file: File): Promise<void> {
    if (this.busy()) return;
    this.root.update((s) => ({
      ...s,
      ui: { ...s.ui, error: "", reading: true },
    }));
    try {
      await this.prepareImport(await this.files.read(file));
    } catch {
      this.reportFileError();
    } finally {
      this.root.update((s) => ({ ...s, ui: { ...s.ui, reading: false } }));
    }
  }

  async downloadExport(): Promise<void> {
    const document = this.document();
    if (!document) return;
    try {
      this.files.download(
        await this.exportJson(),
        `pawtrace-${document.case.id}.json`,
      );
    } catch {
      this.reportFileError();
    }
  }

  private acknowledge(job: SnapshotJob): void {
    if (job.generation !== this.persistence().generation) return;
    this.patchPersistence({
      savedRevision: job.revision,
      writing: false,
      error: "",
    });
  }

  private patchPersistence(patch: Partial<PersistenceState>): void {
    this.root.update((s) => ({
      ...s,
      persistence: { ...s.persistence, ...patch },
    }));
  }
}
