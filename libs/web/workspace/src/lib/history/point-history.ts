import { presentMaterialDialog } from '@pawtrace/shared-ui';
import { PhotoGallery } from '../photos/photo-gallery';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  viewChild,
  TemplateRef,
} from '@angular/core';
import { FormField } from '@angular/forms/signals';
import { chronologicalHistory } from '@pawtrace/case-domain/history';
import type { HistoryEntry } from '@pawtrace/case-domain';
import { CaseStore } from '../case-store/case-store';
import { reportShown } from '../filters/case-filter';
import { EventTimeFields } from './event-time-fields/event-time-fields';
import {
  actionKinds,
  entryDetails,
  entryTypes,
  eventTimeLabel,
  observationOptions,
  foodStates,
  foodUnits,
  identifications,
  options,
  searchResults,
  sources,
} from './history-presentation';

@Component({
  selector: 'pt-point-history',
  imports: [
    PhotoGallery,
    MatCardModule,
    MatCheckboxModule,
    MatInputModule,
    MatFormFieldModule,
    MatButtonModule,
    FormField,
    EventTimeFields,
  ],
  templateUrl: './point-history.html',
  styleUrl: './point-history.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PointHistory {
  protected readonly state = inject(CaseStore);
  protected readonly types = options(entryTypes);
  protected readonly identifications = options(identifications);
  protected readonly identificationLabels = identifications;
  protected readonly sources = options(sources);
  protected readonly actions = options(actionKinds);
  protected readonly results = options(searchResults);
  protected readonly foodStates = options(foodStates);
  protected readonly foodUnits = options(foodUnits);
  protected readonly collapsed = linkedSignal(() => {
    this.state.selectedPointId();
    return false;
  });
  /** Rejected reports keep their own show/hide control; other entries stay in context. */
  protected readonly hiddenRejected = computed(
    () =>
      (this.state.selectedPoint()?.entries ?? []).filter(
        (entry) => !reportShown(entry, this.state.filter()),
      ).length,
  );
  protected readonly sections = computed(() => {
    const zone = this.state.document()?.case.timeZone ?? 'UTC';
    const history = chronologicalHistory(this.state.selectedPoint()?.entries ?? [], zone);
    const matches = this.state.selectedEntryMatches();
    const shown = (entry: HistoryEntry) => reportShown(entry, this.state.filter());
    return [
      { label: 'Znany czas', entries: history.known },
      { label: 'Nieznany czas', entries: history.unknown },
    ].map((section) => ({
      ...section,
      entries: section.entries.filter(shown).map((entry) => ({
        entry,
        title: entryTypes[entry.type],
        time: eventTimeLabel(entry.occurredAt, zone),
        details: entryDetails(entry),
        identification: entry.type === 'observation' ? entry.identification : null,
        matches: matches?.has(entry.id) ?? false,
      })),
    }));
  });
  protected readonly observations = computed(() =>
    observationOptions(this.state.document()?.points ?? []),
  );
  private readonly confirmation = viewChild<TemplateRef<unknown>>('confirmation');
  constructor() {
    presentMaterialDialog(
      this.confirmation,
      () => this.state.cancelEntryRemoval(),
      () => 'remove-entry-title',
    );
  }
}
