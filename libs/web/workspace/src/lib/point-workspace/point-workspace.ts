import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  linkedSignal,
  viewChild,
} from '@angular/core';
import { FormField } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { FloatingPanel } from '@pawtrace/shared-ui';
import { CaseStore } from '../case-store/case-store';
import { PointHistory } from '../history/point-history';
import { pointRoles } from './point-draft';

@Component({
  selector: 'pt-point-workspace',
  imports: [FloatingPanel, FormField, PointHistory],
  templateUrl: './point-workspace.html',
  styleUrl: './point-workspace.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PointWorkspace {
  protected readonly state = inject(CaseStore);
  protected readonly roles = pointRoles;
  private readonly phone = inject(BreakpointObserver).isMatched('(max-width: 700px)');
  protected readonly collapsed = linkedSignal<string | null, boolean>({
    source: () => this.state.selectedPointId(),
    computation: (pointId, previous) =>
      pointId && this.phone ? true : (previous?.value ?? this.phone),
  });
  private readonly router = inject(Router);
  private readonly confirmation = viewChild<ElementRef<HTMLDialogElement>>('confirmation');
  private readonly details = viewChild('details', { read: ElementRef<HTMLElement> });
  private readonly placeHeading = viewChild<ElementRef<HTMLElement>>('placeHeading');
  constructor() {
    afterRenderEffect(() => {
      const dialog = this.confirmation()?.nativeElement;
      if (dialog && !dialog.open) dialog.showModal();
    });
    afterRenderEffect(() => {
      this.state.selectedPointId();
      if (this.state.entryEditor()) return;
      const panel = this.details()?.nativeElement;
      if (panel) panel.scrollTop = 0;
      this.placeHeading()?.nativeElement.focus({ preventScroll: true });
    });
  }
  protected async edit(id: string): Promise<void> {
    if (this.router.url === '/' || (await this.router.navigateByUrl('/')))
      await this.state.editPoint(id);
  }
  protected async selectPoint(id: string | null): Promise<void> {
    if (this.router.url === '/' || (await this.router.navigateByUrl('/')))
      await this.state.selectPoint(id);
  }
  protected cancelRemoval(event: Event): void {
    event.preventDefault();
    this.state.cancelPointRemoval();
  }
}
