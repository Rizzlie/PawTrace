import { presentMaterialDialog } from '@pawtrace/shared-ui';
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
import { chronologicalHistory, observationCounts } from '@pawtrace/case-domain/history';
import { CaseStore } from '../case-store/case-store';
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
  protected readonly sources = options(sources);
  protected readonly actions = options(actionKinds);
  protected readonly results = options(searchResults);
  protected readonly foodStates = options(foodStates);
  protected readonly foodUnits = options(foodUnits);
  protected readonly counts = computed(() =>
    observationCounts(this.state.selectedPoint()?.entries ?? []),
  );
  protected readonly collapsed = linkedSignal(() => {
    this.state.selectedPointId();
    return false;
  });
  protected readonly sections = computed(() => {
    const zone = this.state.document()?.case.timeZone ?? 'UTC';
    const history = chronologicalHistory(this.state.selectedPoint()?.entries ?? [], zone);
    return [
      { label: 'Znany czas', entries: history.known },
      { label: 'Nieznany czas', entries: history.unknown },
    ].map((section) => ({
      ...section,
      entries: section.entries.map((entry) => ({
        entry,
        title: entryTypes[entry.type],
        time: eventTimeLabel(entry.occurredAt, zone),
        details: entryDetails(entry),
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
