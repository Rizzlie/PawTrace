import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  TemplateRef,
  viewChild,
  resource,
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
import { CASE_IDENTITY, CaseCopies } from '@pawtrace/browser-persistence';
import { CaseStore } from '../case-store/case-store';

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
  private readonly state = inject(CaseStore);
  private readonly router = inject(Router);
  protected readonly online = inject(Connectivity).online;
  protected readonly caseLocation = caseLocation;
  private readonly identity = inject(CASE_IDENTITY);
  private readonly copies = inject(CaseCopies);
  private readonly local = resource({
    params: () => ({ owner: this.identity.owner(), online: this.online() }),
    loader: ({ params }) => (params.owner ? this.copies.list(params.owner) : Promise.resolve([])),
  });
  protected readonly items = computed(() => {
    const unique = new Map<string, CaseSummary>(
      (this.cases.hasValue() ? this.cases.value() : []).map((item) => [item.id, item]),
    );
    for (const copy of this.local.hasValue() ? this.local.value() : []) {
      if (
        this.cases.hasValue() &&
        (this.online() || unique.has(copy.caseId)) &&
        copy.revision === copy.savedRevision &&
        !copy.attempt &&
        !copy.paused
      )
        continue;
      unique.set(copy.caseId, {
        id: copy.caseId,
        title: copy.document.case.title,
        version: copy.version,
        savedAt: copy.document.case.updatedAt,
      });
    }
    return [...unique.values()];
  });
  protected readonly cases = httpResource(() => '/api/cases', {
    parse: (value) => caseSummaries.parse(value),
  });
  protected readonly listState = computed(() =>
    this.cases.hasValue() || this.items().length
      ? this.items().length
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
    const owner = this.identity.owner();
    const generation = this.identity.generation();
    const current = () =>
      owner === this.identity.owner() && generation === this.identity.generation();
    if (dialog.kind !== 'delete' && !title.trim()) {
      this.error.set(messages.invalid);
      return;
    }
    this.pending.set(true);
    this.error.set('');
    if (dialog.kind === 'rename') {
      await this.state.open(dialog.item.id);
      if (!current()) return;
      if (this.state.document()) {
        if (!(await this.state.renameCase(title))) {
          this.error.set(messages.invalid);
          this.pending.set(false);
          return;
        }
        const acknowledged = await this.state.flush(undefined, this.online());
        const p = this.state.persistence();
        if (acknowledged || p.localRevision === p.revision) {
          if (!current()) return;
          this.state.close();
          this.local.reload();
          if (this.online()) this.cases.reload();
          this.dialog.set(null);
          if (!acknowledged)
            this.error.set(
              'Nazwę zapisano na urządzeniu. Serwer nie potwierdził zapisu; otwórz sprawę, aby ponowić lub wyeksportować JSON.',
            );
        } else this.error.set('Nie zapisano nazwy lokalnie. Wyeksportuj otwartą sprawę.');
      } else this.error.set('Ta sprawa nie jest dostępna lokalnie.');
      this.pending.set(false);
      return;
    }
    const outcome = await this.catalogue.submit(
      dialog.kind === 'delete' ? dialog : { ...dialog, title },
    );
    if (!current()) return;
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
      this.local.reload();
    }
    if (outcome.status !== 'done') this.error.set(messages[outcome.status]);
  }
}
