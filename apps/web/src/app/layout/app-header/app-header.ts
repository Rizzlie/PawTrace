import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { Session } from '../../session';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  inject,
  viewChild,
  TemplateRef,
  signal,
} from '@angular/core';
import { MatIcon, MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { Brand, presentMaterialDialog } from '@pawtrace/shared-ui';
import { hasSeenMapHelp, rememberMapHelp } from '@pawtrace/browser-persistence';
import { helpOutlineIcon } from './help-icon';
import { CaseStore } from '@pawtrace/workspace';

@Component({
  selector: 'app-header',
  imports: [MatToolbarModule, MatButtonModule, MatMenuModule, Brand, MatIcon],
  templateUrl: './app-header.html',
  styleUrl: './app-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppHeader {
  protected readonly session = inject(Session);
  private readonly state = inject(CaseStore, { optional: true });
  protected readonly logoutOpen = signal(false);
  private readonly logoutDialog = viewChild<TemplateRef<unknown>>('logoutDialog');
  private readonly helpDialog = viewChild<TemplateRef<unknown>>('helpDialog');
  protected readonly helpOpen = signal(false);

  constructor() {
    presentMaterialDialog(
      this.logoutDialog,
      () => this.logoutOpen.set(false),
      () => 'logout-title',
    );
    presentMaterialDialog(
      this.helpDialog,
      () => this.closeHelp(),
      () => 'map-help-title',
      '.help-button',
    );
    inject(MatIconRegistry).addSvgIconLiteral(
      'map-help',
      inject(DomSanitizer).bypassSecurityTrustHtml(helpOutlineIcon),
    );
    afterNextRender(() => {
      if (!hasSeenMapHelp()) this.showHelp();
    });
  }

  protected async exportRecovery(): Promise<void> {
    const owner = this.session.user()?.id;
    const generation = this.session.generation();
    await this.state?.downloadExport();
    if (owner !== this.session.user()?.id || generation !== this.session.generation()) return;
    await this.session.exportCopies(this.state?.document()?.case.id);
  }

  protected showHelp(): void {
    this.helpOpen.set(true);
    rememberMapHelp();
  }

  protected closeHelp(): void {
    this.helpOpen.set(false);
  }
}
