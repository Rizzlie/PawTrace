import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import { FloatingPanel, presentMaterialDialog } from '@pawtrace/shared-ui';
import { caseSummaries, type CaseSummary } from '../cases/case-api';
import { CaseCatalogue } from '../cases/case-catalogue';
import { caseLocation } from '../cases/case-location';
import { Connectivity } from '../cases/connectivity';

type Dialog =
  | { kind: 'create' }
  | { kind: 'rename'; item: CaseSummary }
  | { kind: 'delete'; item: CaseSummary };

const messages = {
  conflict:
    'Sprawa została zmieniona w innym miejscu. Lista została odświeżona — spróbuj ponownie.',
  missing: 'Ta sprawa nie istnieje albo została już usunięta. Lista została odświeżona.',
  invalid: 'Podaj niepustą nazwę sprawy.',
  failed:
    'Serwer nie potwierdził operacji. Nic nie zostało oznaczone jako zapisane — spróbuj ponownie.',
};

/** Private case catalogue: list, create, open, rename and confirmed delete. */
@Component({
  selector: 'pt-my-cases',
  imports: [FloatingPanel, MatButtonModule, MatFormFieldModule, MatInputModule, RouterLink],
  templateUrl: './my-cases.html',
  styleUrl: './my-cases.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyCases {
  private readonly catalogue = inject(CaseCatalogue);
  private readonly router = inject(Router);
  protected readonly online = inject(Connectivity).online;
  protected readonly caseLocation = caseLocation;
  protected readonly cases = httpResource(() => '/api/cases', {
    parse: (value) => caseSummaries.parse(value),
  });
  protected readonly listState = computed(() =>
    this.cases.hasValue()
      ? this.cases.value().length
        ? 'ready'
        : 'empty'
      : this.cases.error()
        ? 'failed'
        : 'loading',
  );
  protected readonly dialog = signal<Dialog | null>(null);
  protected readonly title = signal('');
  protected readonly pending = signal(false);
  protected readonly error = signal('');
  private readonly template = viewChild<TemplateRef<unknown>>('dialogTemplate');

  constructor() {
    presentMaterialDialog(
      this.template,
      () => this.closeDialog(),
      () => 'case-dialog-title',
    );
  }

  protected openDialog(dialog: Dialog): void {
    this.error.set('');
    this.title.set(dialog.kind === 'rename' ? dialog.item.title : '');
    this.dialog.set(dialog);
  }

  protected closeDialog(): void {
    if (!this.pending()) this.dialog.set(null);
  }

  protected async submit(): Promise<void> {
    const dialog = this.dialog();
    if (!dialog || this.pending()) return;
    const title = this.title();
    if (dialog.kind !== 'delete' && !title.trim()) {
      this.error.set(messages.invalid);
      return;
    }
    this.pending.set(true);
    this.error.set('');
    const outcome = await this.catalogue.submit(
      dialog.kind === 'delete' ? dialog : { ...dialog, title },
    );
    this.pending.set(false);
    if (outcome.status === 'created') {
      this.dialog.set(null);
      await this.router.navigateByUrl(caseLocation(outcome.id));
      return;
    }
    if (
      outcome.status === 'done' ||
      outcome.status === 'conflict' ||
      outcome.status === 'missing'
    ) {
      this.dialog.set(null);
      this.cases.reload();
    }
    if (outcome.status !== 'done') this.error.set(messages[outcome.status]);
  }
}
