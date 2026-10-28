import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { form, FormField, maxLength, minLength, required } from '@angular/forms/signals';
import {
  AddressSearchClient,
  type AddressSearchResponse,
  type AddressSearchResult,
} from './address-search-client';

type SearchState =
  | { status: 'idle' }
  | { status: 'loading'; query: string }
  | {
      status: 'success';
      query: string;
      response: AddressSearchResponse;
      selected?: AddressSearchResult;
    }
  | { status: 'error'; query: string };

@Component({
  selector: 'pt-address-search',
  imports: [MatCardModule, MatInputModule, MatFormFieldModule, MatButtonModule, FormField],
  templateUrl: './address-search.html',
  styleUrl: './address-search.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddressSearch {
  readonly resultSelected = output<AddressSearchResult>();
  private readonly client = inject(AddressSearchClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly model = signal({ query: '' });
  protected readonly searchForm = form(this.model, (path) => {
    required(path.query);
    minLength(path.query, 2);
    maxLength(path.query, 200);
  });
  private readonly state = signal<SearchState>({ status: 'idle' });
  protected readonly loading = computed(() => this.state().status === 'loading');
  protected readonly canSearch = computed(
    () => this.model().query.trim().length >= 2 && this.searchForm().valid() && !this.loading(),
  );
  protected readonly visibleState = computed(() => {
    const state = this.state();
    return state.status !== 'idle' && state.query === this.model().query.trim()
      ? state
      : ({ status: 'idle' } as const);
  });

  protected search(event: Event): void {
    event.preventDefault();
    if (!this.canSearch()) return;
    const query = this.model().query.trim();
    this.state.set({ status: 'loading', query });
    this.client
      .search(query)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => this.state.set({ status: 'success', query, response }),
        error: () => this.state.set({ status: 'error', query }),
      });
  }

  protected select(result: AddressSearchResult): void {
    const state = this.visibleState();
    if (state.status !== 'success') return;
    this.state.set({ ...state, selected: result });
    this.resultSelected.emit(result);
  }
}
