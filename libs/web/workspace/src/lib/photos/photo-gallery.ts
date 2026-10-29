import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
} from '@angular/core';
import { FormField } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { CaseStore } from '../case-store/case-store';
import { PhotoTransfers } from './photo-transfers';
import { PhotoCard } from './photo-card';
import type { PhotoTarget } from './photo-draft';

@Component({
  selector: 'pt-photo-gallery',
  imports: [PhotoCard, FormField, MatButtonModule, MatFormFieldModule, MatInputModule],
  templateUrl: './photo-gallery.html',
  styleUrl: './photo-gallery.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PhotoGallery {
  readonly photos = input<string[]>([]);
  readonly editorId = input<number | null>(null);
  protected readonly state = inject(CaseStore);
  protected readonly transfers = inject(PhotoTransfers);
  private readonly targets = new Set<PhotoTarget>();
  protected readonly activeTarget = computed(() => {
    const target = this.state.photoTarget();
    return target?.editorId === this.editorId() ? target : null;
  });
  protected readonly filenames = computed(() =>
    this.editorId() === null ? this.photos() : this.activeTarget() ? this.state.editorPhotos() : [],
  );
  protected readonly profile = computed(() =>
    this.activeTarget() ? this.state.profileEditor() : null,
  );
  protected readonly jobs = computed(() =>
    this.transfers
      .jobs()
      .filter(
        (job) =>
          job.target.editorId === this.activeTarget()?.editorId &&
          job.target.generation === this.activeTarget()?.generation &&
          job.target.caseId === this.activeTarget()?.caseId,
      ),
  );
  protected readonly captions = computed(() => {
    const editor = this.state.editor();
    return editor?.kind === 'profile' && editor.id === this.editorId()
      ? editor.draft.photoCaptions
      : [];
  });
  constructor() {
    inject(DestroyRef).onDestroy(() => {
      for (const target of this.targets) this.transfers.release(target);
    });
  }

  protected select(input: HTMLInputElement): void {
    const target = this.activeTarget();
    if (target && target.editorId === this.editorId()) {
      this.targets.add(target);
      this.state.uploadPhotos(target.editorId, Array.from(input.files ?? []));
    }
    input.value = '';
  }

  protected caption(filename: string): string {
    return this.captions().find((item) => item.filename === filename)?.caption ?? '';
  }

  protected captionField(filename: string) {
    const profile = this.profile();
    const index = this.captions().findIndex((item) => item.filename === filename);
    return profile && index >= 0 ? profile.fields.photoCaptions[index].caption : undefined;
  }
}
