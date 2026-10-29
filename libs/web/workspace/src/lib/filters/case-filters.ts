import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { CaseStore } from '../case-store/case-store';
import { entryTypes, options } from '../history/history-presentation';
import { pointRoles } from '../point-workspace/point-draft';
import { periodActive, type EntryType, type PlaceRole } from './case-filter';

const toggled = <T>(values: readonly T[], value: T, on: boolean) =>
  on ? [...values, value] : values.filter((item) => item !== value);

@Component({
  selector: 'pt-case-filters',
  imports: [MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatInputModule],
  templateUrl: './case-filters.html',
  styleUrl: './case-filters.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaseFilters {
  protected readonly state = inject(CaseStore);
  protected readonly roles: { key: PlaceRole; label: string }[] = [
    { key: 'escape_location', label: 'Miejsce ucieczki' },
    ...pointRoles,
  ];
  protected readonly types = options(entryTypes) as { value: EntryType; label: string }[];
  protected readonly period = computed(() => periodActive(this.state.filter()));
  protected readonly invertedPeriod = computed(() => {
    const { from, to } = this.state.filter();
    return !!from && !!to && from > to;
  });
  protected toggleRole(role: PlaceRole, on: boolean): void {
    this.state.updateFilter({ roles: toggled(this.state.filter().roles, role, on) });
  }
  protected toggleType(type: EntryType, on: boolean): void {
    this.state.updateFilter({ entryTypes: toggled(this.state.filter().entryTypes, type, on) });
  }
}
