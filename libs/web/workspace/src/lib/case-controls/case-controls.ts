import { presentMaterialDialog } from '@pawtrace/shared-ui';
import { MatButtonModule } from '@angular/material/button';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  viewChild,
  TemplateRef,
} from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';
import { CaseStore } from '../case-store/case-store';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'pt-case-controls',
  imports: [MatButtonModule, RouterLink, MatMenuModule],
  templateUrl: './case-controls.html',
  styleUrl: './case-controls.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaseControls {
  protected readonly state = inject(CaseStore);
  protected readonly draftLabel = computed(() => {
    const kind = this.state.editor()?.kind;
    return kind
      ? {
          profile: 'Niezatwierdzony profil',
          point: 'Niezatwierdzony punkt',
          entry: 'Niezatwierdzony wpis',
          area: 'Niezatwierdzony obszar',
          'area-check': 'Niezatwierdzone przeszukanie',
        }[kind]
      : '';
  });
  private readonly router = inject(Router);
  private readonly dialog = viewChild<TemplateRef<unknown>>('confirmation');

  constructor() {
    presentMaterialDialog(
      this.dialog,
      () => {
        if (this.state.closeRequested()) void this.state.resolveEditorTransition('stay');
        else this.cancelReplacement();
      },
      () => (this.state.closeRequested() ? 'draft-title' : 'replacement-title'),
    );
  }

  protected importFile(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const file = input.files?.item(0);
    input.value = '';
    if (file) void this.state.importFile(file);
  }

  protected cancelReplacement(): void {
    this.state.cancelReplacement();
    if (!this.state.profileEditor()) void this.router.navigateByUrl('/');
  }

  protected async resolveTransition(choice: 'save' | 'discard' | 'stay'): Promise<void> {
    const replacing = this.state.candidate() !== null;
    await this.state.resolveEditorTransition(choice);
    if (replacing && !this.state.profileEditor()) await this.router.navigateByUrl('/');
  }

  protected async replaceCase(): Promise<void> {
    await this.state.confirmReplacement();
    if (!this.state.profileEditor()) await this.router.navigateByUrl('/');
  }
}
