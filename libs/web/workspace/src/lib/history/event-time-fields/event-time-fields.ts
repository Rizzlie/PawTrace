import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FormField, type FieldTree } from '@angular/forms/signals';
import { eventTimeMoments, type EventTimeDraft } from '../../event-time-draft';

/** Edits the owner's fields directly; never keeps a competing draft. */
@Component({
  selector: 'pt-event-time-fields',
  imports: [MatInputModule, MatFormFieldModule, FormField],
  templateUrl: './event-time-fields.html',
  styleUrl: './event-time-fields.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventTimeFields {
  readonly fields = input.required<FieldTree<EventTimeDraft>>();
  readonly timeZone = input.required<string>();
  protected readonly moments = computed(() => eventTimeMoments(this.fields(), this.timeZone()));
}
