import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { FormField } from '@angular/forms/signals';
import { FloatingPanel } from '@pawtrace/shared-ui';
import { geometryArea } from '@pawtrace/case-domain/geometry';
import { CaseStore } from '../case-store/case-store';
import { draftGeometry } from './area-draft';

@Component({
  selector: 'pt-area-workspace',
  imports: [FloatingPanel, FormField],
  templateUrl: './area-workspace.html',
  styleUrl: './area-workspace.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AreaWorkspace {
  protected readonly state = inject(CaseStore);
  private readonly confirmation = viewChild<ElementRef<HTMLDialogElement>>('confirmation');
  protected readonly areaSize = computed(() => {
    const editor = this.state.areaEditor();
    const geometry = editor
      ? draftGeometry(editor.draft)
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
    afterRenderEffect(() => {
      const dialog = this.confirmation()?.nativeElement;
      if (dialog && !dialog.open) dialog.showModal();
    });
  }
  protected cancelRemoval(event: Event): void {
    event.preventDefault();
    this.state.cancelAreaRemoval();
  }
}
