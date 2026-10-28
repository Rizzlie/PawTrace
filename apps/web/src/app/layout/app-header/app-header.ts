import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
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

@Component({
  selector: 'app-header',
  imports: [MatToolbarModule, MatButtonModule, Brand, MatIcon],
  templateUrl: './app-header.html',
  styleUrl: './app-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppHeader {
  private readonly helpDialog = viewChild<TemplateRef<unknown>>('helpDialog');
  protected readonly helpOpen = signal(false);

  constructor() {
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

  protected showHelp(): void {
    this.helpOpen.set(true);
    rememberMapHelp();
  }

  protected closeHelp(): void {
    this.helpOpen.set(false);
  }
}
