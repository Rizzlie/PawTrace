import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { CaseStore } from '../case-store/case-store';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'pt-case-controls',
  imports: [RouterLink, CdkMenu, CdkMenuItem, CdkMenuTrigger],
  templateUrl: './case-controls.html',
  styleUrl: './case-controls.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaseControls {
  protected readonly state = inject(CaseStore);
  private readonly router = inject(Router);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('confirmation');

  constructor() {
    afterRenderEffect(() => {
      const dialog = this.dialog()?.nativeElement;
      if (dialog && !dialog.open) dialog.showModal();
    });
  }

  protected importFile(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const file = input.files?.item(0);
    input.value = '';
    if (file) void this.state.importFile(file);
  }

  protected cancel(event: Event): void {
    event.preventDefault();
    this.cancelReplacement();
  }

  protected cancelReplacement(): void {
    this.state.cancelReplacement();
    if (!this.state.profileEditor()) void this.router.navigateByUrl('/');
  }
  protected stay(event: Event): void {
    event.preventDefault();
    void this.state.resolveEditorTransition('stay');
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
