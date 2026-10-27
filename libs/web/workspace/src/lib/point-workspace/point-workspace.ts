import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormField } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { FloatingPanel } from '@pawtrace/shared-ui';
import { CaseStore } from '../case-store/case-store';
import { pointRoles } from './point-draft';

@Component({
  selector: 'pt-point-workspace',
  imports: [FloatingPanel, FormField],
  templateUrl: './point-workspace.html',
  styleUrl: './point-workspace.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PointWorkspace {
  protected readonly state = inject(CaseStore);
  protected readonly roles = pointRoles;
  protected readonly collapsed = signal(inject(BreakpointObserver).isMatched('(max-width: 700px)'));
  private readonly router = inject(Router);
  private readonly confirmation = viewChild<ElementRef<HTMLDialogElement>>('confirmation');
  constructor() {
    afterRenderEffect(() => {
      const dialog = this.confirmation()?.nativeElement;
      if (dialog && !dialog.open) dialog.showModal();
    });
  }
  protected async edit(id: string): Promise<void> {
    if (this.router.url === '/' || (await this.router.navigateByUrl('/')))
      await this.state.editPoint(id);
  }
  protected cancelRemoval(event: Event): void {
    event.preventDefault();
    this.state.cancelPointRemoval();
  }
}
