import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
  TemplateRef,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { CaseStore } from '../case-store/case-store';
import { photoUrl } from './photo-metadata';

@Component({
  selector: 'pt-photo-card',
  imports: [MatButtonModule, MatDialogModule],
  templateUrl: './photo-card.html',
  styleUrl: './photo-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PhotoCard {
  readonly filename = input.required<string>();
  readonly caption = input('');
  private readonly state = inject(CaseStore);
  private readonly dialog = inject(MatDialog);
  protected readonly originalSize = signal(false);
  private readonly read = computed(() => this.state.photoReads()[this.filename()]);
  protected readonly details = computed(() => this.read()?.metadata ?? null);
  protected readonly loading = computed(() => this.read()?.status === 'loading');
  protected readonly metadataError = computed(
    () => this.read()?.status === 'error' && this.read()?.operation === 'read',
  );
  protected readonly retrying = computed(() => this.read()?.status === 'retrying');
  protected readonly retryError = computed(() =>
    this.read()?.status === 'error' && this.read()?.operation === 'retry' ? this.read()?.error : '',
  );
  private readonly url = computed(() => {
    const caseId = this.state.persistence().caseId;
    const filename = this.filename();
    return (kind?: 'thumbnail' | 'preview') =>
      caseId === null ? null : photoUrl(caseId, filename, kind);
  });
  protected readonly thumbnail = computed(() =>
    this.details()?.processing.thumbnail.status === 'ready' ? this.url()('thumbnail') : null,
  );
  protected readonly preview = computed(() => {
    const metadata = this.details();
    if (!metadata) return null;
    return metadata.processing.preview.status === 'ready'
      ? this.url()('preview')
      : metadata.processing.preview.status === 'not_required'
        ? this.url()()
        : null;
  });
  protected readonly failedThumbnail = linkedSignal({
    source: () => ({
      thumbnail: this.thumbnail(),
      request: this.read()?.request,
    }),
    computation: (): boolean => false,
  });
  protected readonly failedPreview = linkedSignal({
    source: () => ({ preview: this.preview(), request: this.read()?.request }),
    computation: (): boolean => false,
  });
  protected readonly originalAvailable = computed(() => !!this.details() && !this.metadataError());
  protected readonly processingFailed = computed(() =>
    Object.values(this.details()?.processing ?? {}).some((item) => item.status === 'failed'),
  );
  protected readonly pending = computed(() =>
    Object.values(this.details()?.processing ?? {}).some((item) => item.status === 'pending'),
  );
  protected readonly original = computed(() => this.url()());

  protected reload(): void {
    this.state.reloadPhoto(this.filename());
  }
  protected open(template: TemplateRef<unknown>): void {
    this.originalSize.set(false);
    this.dialog.open(template, {
      ariaLabel: 'Podgląd zdjęcia',
      width: '1100px',
      maxWidth: 'calc(100vw - 32px)',
      maxHeight: 'calc(100dvh - 32px)',
    });
  }
  protected retry(): void {
    this.state.retryPhoto(this.filename());
  }
}
