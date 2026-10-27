import { computed, inject, Service, signal } from "@angular/core";
import { BrowserFiles, BrowserSnapshot } from "@pawtrace/browser-persistence";
import type { CaseDocument } from "@pawtrace/case-domain";
import type { MapViewport, Basemap } from "@pawtrace/map-engine";
import { SnapshotWriter, type SnapshotJob } from "./snapshot-writer";
import {
  createCaseDocument,
  isValidViewport,
  sameMapView,
  summarizeCase,
} from "./case-document";
import {
  createWorkspaceState,
  saveStatus,
  type WorkspaceState,
} from "./workspace-state";

const fileError = "Nie udało się odczytać lub pobrać pliku. Spróbuj ponownie.";

@Service()
export class AppState {
  private readonly storage = inject(BrowserSnapshot);
  private readonly files = inject(BrowserFiles);
  private readonly root = signal(createWorkspaceState());
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
  readonly replacementSummary = computed(() =>
    summarizeCase(this.ui().candidate),
  );
  readonly saveStatus = computed(() => saveStatus(this.root()));
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

  prepareNewCase(): void {
    if (this.busy()) return;
    ++this.transitionRequest;
    this.patchUi({ candidate: createCaseDocument(), error: "" });
  }

  async prepareImport(text: string): Promise<void> {
    if (!this.persistence().initialized || this.persistence().replacing) return;
    const request = ++this.transitionRequest;
    const parsed = (await import("@pawtrace/case-domain")).parseCaseFile(text);
    if (request !== this.transitionRequest || this.persistence().replacing)
      return;
    if (parsed.success) {
      this.patchUi({ candidate: parsed.data, error: "" });
      return;
    }
    this.patchUi({
      candidate: null,
      error: parsed.issues
        .map((issue) => `${issue.path.join(".") || "plik"}: ${issue.message}`)
        .join("\n"),
    });
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
      this.root.set(
        createWorkspaceState(candidate, this.persistence().generation + 1),
      );
    } catch {
      this.patchPersistence({ replacing: false, writing: false });
      this.patchUi({
        error:
          "Nie udało się zapisać nowej sprawy. Poprzednia sprawa i ostatni poprawny zapis zostały zachowane. Możesz ponowić lub anulować.",
      });
    }
  }

  cancelReplacement(): void {
    if (this.persistence().replacing) return;
    ++this.transitionRequest;
    this.patchUi({ error: "", candidate: null });
  }

  changeViewport(view: MapViewport): void {
    const document = this.document();
    if (!document) return;
    const mapView = {
      ...document.mapView,
      center: { latitude: view.latitude, longitude: view.longitude },
      zoom: view.zoom,
    };
    if (!isValidViewport(view)) return;
    this.commitMapView(mapView);
  }

  changeBasemap(basemap: Basemap): void {
    const document = this.document();
    if (document) this.commitMapView({ ...document.mapView, basemap });
    else this.patchUi({ emptyBasemap: basemap });
  }

  retrySave(): void {
    if (this.persistence().replacing || !this.document()) return;
    this.patchPersistence({ error: "" });
    this.queueSnapshot();
  }

  async importFile(file: File): Promise<void> {
    if (this.busy()) return;
    this.patchUi({ error: "", reading: true });
    try {
      await this.prepareImport(await this.files.read(file));
    } catch {
      this.patchUi({ error: fileError });
    } finally {
      this.patchUi({ reading: false });
    }
  }

  async exportJson(): Promise<string> {
    const document = this.document();
    if (!document) throw new Error("Brak aktywnej sprawy do eksportu.");
    const exportedAt = new Date().toISOString();
    const { serializeCaseFile } = await import("@pawtrace/case-domain");
    return serializeCaseFile(document, exportedAt);
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
      this.patchUi({ error: fileError });
    }
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

  private commitMapView(mapView: CaseDocument["mapView"]): void {
    const state = this.root();
    const document = state.document;
    if (
      !document ||
      !state.persistence.initialized ||
      state.persistence.replacing
    )
      return;
    if (sameMapView(document.mapView, mapView)) return;
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

  private acknowledge(job: SnapshotJob): void {
    if (job.generation !== this.persistence().generation) return;
    this.patchPersistence({
      savedRevision: job.revision,
      writing: false,
      error: "",
    });
  }

  private patchUi(patch: Partial<WorkspaceState["ui"]>): void {
    this.root.update((state) => ({ ...state, ui: { ...state.ui, ...patch } }));
  }

  private patchPersistence(
    patch: Partial<WorkspaceState["persistence"]>,
  ): void {
    this.root.update((s) => ({
      ...s,
      persistence: { ...s.persistence, ...patch },
    }));
  }
}
