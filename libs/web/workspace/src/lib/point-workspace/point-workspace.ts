import { MatChipsModule } from '@angular/material/chips';
import { MatListModule } from '@angular/material/list';
import { MatBadgeModule } from '@angular/material/badge';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  linkedSignal,
  viewChild,
  TemplateRef,
} from '@angular/core';
import { FormField } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { FloatingPanel, presentMaterialDialog } from '@pawtrace/shared-ui';
import { CaseStore } from '../case-store/case-store';
import { PointHistory } from '../history/point-history';
import { pointRoles } from './point-draft';

@Component({
  selector: 'pt-point-workspace',
  imports: [
    MatChipsModule,
    MatListModule,
    MatBadgeModule,
    MatCheckboxModule,
    MatInputModule,
    MatFormFieldModule,
    MatButtonModule,
    FloatingPanel,
    FormField,
    PointHistory,
  ],
  templateUrl: './point-workspace.html',
  styleUrl: './point-workspace.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PointWorkspace {
  protected readonly state = inject(CaseStore);
  protected readonly roles = pointRoles;
  private readonly phone = inject(BreakpointObserver).isMatched('(max-width: 700px)');
  protected readonly collapsed = linkedSignal<string | null, boolean>({
    source: () => this.state.selectedPointId() ?? this.state.selectedAreaId(),
    computation: (pointId, previous) =>
      pointId && this.phone ? true : (previous?.value ?? this.phone),
  });
  private readonly router = inject(Router);
  private readonly confirmation = viewChild<TemplateRef<unknown>>('confirmation');
  private readonly details = viewChild<FloatingPanel>('details');
  private readonly placeHeading = viewChild<ElementRef<HTMLElement>>('placeHeading');
  constructor() {
    presentMaterialDialog(
      this.confirmation,
      () => this.state.cancelPointRemoval(),
      () => 'remove-title',
    );
    afterRenderEffect(() => {
      this.state.selectedPointId();
      if (this.state.entryEditor()) return;
      this.details()?.scrollToTop();
      this.placeHeading()?.nativeElement.focus({ preventScroll: true });
    });
  }
  protected async recordUnplannedSearch(): Promise<void> {
    if (this.router.url === '/' || (await this.router.navigateByUrl('/')))
      await this.state.editAreaCheck();
  }
  protected async edit(id: string): Promise<void> {
    if (this.router.url === '/' || (await this.router.navigateByUrl('/')))
      await this.state.editPoint(id);
  }
  protected async selectPoint(id: string | null): Promise<void> {
    if (this.router.url === '/' || (await this.router.navigateByUrl('/')))
      await this.state.selectPoint(id);
  }
  protected async selectArea(id: string): Promise<void> {
    if (this.router.url === '/' || (await this.router.navigateByUrl('/')))
      await this.state.selectArea(id);
  }
}
