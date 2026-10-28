import { MatCardModule } from '@angular/material/card';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  DestroyRef,
  inject,
  viewChild,
} from '@angular/core';
import { FormField } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { CaseStore } from '../case-store/case-store';
import { profileTextGroups } from './profile-draft';
import { incidentMomentChoices } from './incident-time';

@Component({
  selector: 'pt-animal-profile',
  imports: [
    MatCardModule,
    MatExpansionModule,
    MatCheckboxModule,
    MatInputModule,
    MatFormFieldModule,
    MatButtonModule,
    FormField,
  ],
  templateUrl: './animal-profile.html',
  styleUrl: './animal-profile.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnimalProfile {
  protected readonly state = inject(CaseStore);
  protected readonly router = inject(Router);
  protected readonly groups = profileTextGroups;
  protected readonly momentInputs = computed(() => {
    const fields = this.state.profileEditor()?.fields.escape.time;
    const zone = this.state.document()?.case.timeZone;
    if (!fields || !zone) return [];
    const kind = fields.kind().value();
    const moments =
      kind === 'range'
        ? ([
            {
              key: 'start',
              instantKey: 'startInstant',
              label: 'Początek przedziału',
            },
            {
              key: 'end',
              instantKey: 'endInstant',
              label: 'Koniec przedziału',
            },
          ] as const)
        : kind === 'exact' || kind === 'approximate'
          ? ([
              {
                key: 'at',
                instantKey: 'atInstant',
                label: kind === 'exact' ? 'Chwila zaginięcia' : 'Przybliżona chwila',
              },
            ] as const)
          : [];
    return moments.map(({ key, instantKey, label }) => ({
      key,
      label,
      field: fields[key],
      choice: fields[instantKey],
      options: incidentMomentChoices(fields[key]().value(), zone),
    }));
  });
  private readonly heading = viewChild<ElementRef<HTMLHeadingElement>>('heading');

  constructor() {
    this.state.openProfile();
    const id = this.state.profileEditor()?.id;
    inject(DestroyRef).onDestroy(() => {
      if (id !== undefined) this.state.discardEditor(id);
    });
    afterNextRender(() => this.heading()?.nativeElement.focus());
  }

  protected async save(id: number): Promise<void> {
    if (await this.state.saveProfile(id)) await this.router.navigateByUrl('/');
  }

  protected cancel(id: number): void {
    this.state.discardEditor(id);
    void this.router.navigateByUrl('/');
  }
}
