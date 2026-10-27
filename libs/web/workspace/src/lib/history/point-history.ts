import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  linkedSignal,
  viewChild,
} from '@angular/core';
import { FormField } from '@angular/forms/signals';
import { pointHistory, observationCounts } from '@pawtrace/case-domain/history';
import { CaseStore } from '../case-store/case-store';
import { incidentMomentChoices } from '../animal-profile/incident-time';
import {
  actionKinds,
  entryDetails,
  entryTypes,
  eventTimeLabel,
  foodStates,
  foodUnits,
  identifications,
  options,
  searchResults,
  sources,
} from './history-presentation';

@Component({
  selector: 'pt-point-history',
  imports: [FormField],
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
    const history = pointHistory(this.state.selectedPoint()?.entries ?? [], zone);
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
  protected readonly observations = computed(
    () =>
      this.state.document()?.points.flatMap((point) =>
        point.entries
          .filter((entry) => entry.type === 'observation')
          .map((entry) => ({
            id: entry.id,
            label: `${point.name} — ${entry.description ?? entry.id} (${entry.type === 'observation' ? identifications[entry.identification] : ''})`,
          })),
      ) ?? [],
  );
  protected readonly moments = computed(() => {
    const fields = this.state.entryEditor()?.fields.time;
    const zone = this.state.document()?.case.timeZone;
    if (!fields || !zone) return [];
    const kind = fields.kind().value();
    const moments =
      kind === 'range'
        ? ([
            { key: 'start', instant: 'startInstant', label: 'Początek przedziału' },
            { key: 'end', instant: 'endInstant', label: 'Koniec przedziału' },
          ] as const)
        : kind === 'exact' || kind === 'approximate'
          ? ([{ key: 'at', instant: 'atInstant', label: 'Chwila zdarzenia' }] as const)
          : [];
    return moments.map((moment) => ({
      ...moment,
      field: fields[moment.key],
      choice: fields[moment.instant],
      options: incidentMomentChoices(fields[moment.key]().value(), zone),
    }));
  });
  private readonly confirmation = viewChild<ElementRef<HTMLDialogElement>>('confirmation');
  constructor() {
    afterRenderEffect(() => {
      const dialog = this.confirmation()?.nativeElement;
      if (dialog && !dialog.open) dialog.showModal();
    });
  }
  protected cancelRemoval(event: Event): void {
    event.preventDefault();
    this.state.cancelEntryRemoval();
  }
}
