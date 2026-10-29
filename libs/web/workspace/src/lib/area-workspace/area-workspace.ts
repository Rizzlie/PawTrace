import { MatCardModule } from '@angular/material/card';
import { PhotoGallery } from '../photos/photo-gallery';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { NgTemplateOutlet } from '@angular/common';
import { chronologicalHistory } from '@pawtrace/case-domain/history';
import {
  eventTimeLabel,
  observationOptions,
  options,
  searchResults,
} from '../history/history-presentation';
import { EventTimeFields } from '../history/event-time-fields/event-time-fields';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  viewChild,
  TemplateRef,
} from '@angular/core';
import { FormField } from '@angular/forms/signals';
import { FloatingPanel, presentMaterialDialog } from '@pawtrace/shared-ui';
import { geometryArea } from '@pawtrace/case-domain/geometry';
import { CaseStore } from '../case-store/case-store';
import { draftGeometry } from './area-draft';

@Component({
  selector: 'pt-area-workspace',
  imports: [
    PhotoGallery,
    MatCardModule,
    MatExpansionModule,
    MatInputModule,
    MatFormFieldModule,
    MatButtonModule,
    FloatingPanel,
    FormField,
    NgTemplateOutlet,
    EventTimeFields,
  ],
  templateUrl: './area-workspace.html',
  styleUrl: './area-workspace.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AreaWorkspace {
  protected readonly state = inject(CaseStore);
  private readonly confirmation = viewChild<TemplateRef<unknown>>('confirmation');
  protected readonly results = options(searchResults);
  protected readonly searchResults = searchResults;
  protected readonly geometryEditor = computed(
    () => this.state.areaEditor() ?? this.state.areaCheckEditor(),
  );
  protected readonly observations = computed(() =>
    observationOptions(this.state.document()?.points ?? []),
  );
  protected readonly history = computed(() => {
    const zone = this.state.document()?.case.timeZone ?? 'UTC';
    const ordered = chronologicalHistory(this.state.selectedArea()?.checks ?? [], zone);
    return [
      { label: 'Znany czas', checks: ordered.known },
      { label: 'Nieznany czas', checks: ordered.unknown },
    ].map((section) => ({
      ...section,
      checks: section.checks.map((check) => ({
        ...check,
        time: eventTimeLabel(check.occurredAt, zone),
        size: this.formatArea(check.actualGeometry),
      })),
    }));
  });
  private formatArea(geometry: import('@pawtrace/case-domain').SearchGeometry): string {
    return `Powierzchnia ≈ ${new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1 }).format(geometryArea(geometry))} m²`;
  }
  protected readonly areaSize = computed(() => {
    const editor = this.state.areaEditor() ?? this.state.areaCheckEditor();
    const geometry = editor
      ? editor.kind === 'area-check' && editor.draft.footprint === 'plan'
        ? this.state.selectedArea()?.plannedGeometry
        : draftGeometry(editor.draft)
      : this.state.selectedArea()?.plannedGeometry;
    if (!geometry) return 'Wskaż geometrię na mapie.';
    if (
      geometry.type === 'circle' &&
      (!Number.isFinite(geometry.radiusMeters) || geometry.radiusMeters <= 0)
    )
      return 'Podaj dodatni promień w metrach.';
    if (geometry.type === 'polygon' && geometry.vertices.length < 3)
      return 'Dodaj co najmniej trzy wierzchołki.';
    const size = geometryArea(geometry);
    return Number.isFinite(size)
      ? `Powierzchnia ≈ ${new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1 }).format(size)} m²`
      : 'Podaj prawidłową geometrię.';
  });
  constructor() {
    presentMaterialDialog(
      this.confirmation,
      () => this.state.cancelAreaRemoval(),
      () => 'remove-area-title',
    );
  }
}
