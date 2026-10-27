import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { MatIcon, MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { Brand } from '@pawtrace/shared-ui';
import { hasSeenMapHelp, rememberMapHelp } from '@pawtrace/browser-persistence';
import { helpOutlineIcon } from './help-icon';

@Component({
  selector: 'app-header',
  imports: [Brand, MatIcon],
  templateUrl: './app-header.html',
  styleUrl: './app-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppHeader {
  private readonly helpDialog = viewChild<ElementRef<HTMLDialogElement>>('helpDialog');
  private readonly helpButton = viewChild<ElementRef<HTMLButtonElement>>('helpButton');

  constructor() {
    inject(MatIconRegistry).addSvgIconLiteral(
      'map-help',
      inject(DomSanitizer).bypassSecurityTrustHtml(helpOutlineIcon),
    );
    afterNextRender(() => {
      if (!hasSeenMapHelp()) this.showHelp();
    });
  }

  protected showHelp(): void {
    const dialog = this.helpDialog()?.nativeElement;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    rememberMapHelp();
  }

  protected closeHelp(): void {
    this.helpDialog()?.nativeElement.close();
  }

  protected restoreHelpFocus(): void {
    this.helpButton()?.nativeElement.focus();
  }
}
