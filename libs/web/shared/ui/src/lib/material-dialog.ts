import {
  afterRenderEffect,
  inject,
  untracked,
  TemplateRef,
  ViewContainerRef,
  type Signal,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { filter, merge } from 'rxjs';

/** Present the owner's current template; closure remains a domain/UI intent. */
export function presentMaterialDialog(
  template: Signal<TemplateRef<unknown> | undefined>,
  cancel: () => void,
  labelledBy: () => string,
  restoreFocus: boolean | string = true,
): void {
  const dialog = inject(MatDialog);
  const viewContainerRef = inject(ViewContainerRef);
  afterRenderEffect((onCleanup) => {
    const content = template();
    if (!content) return;
    const ref = untracked(() =>
      dialog.open(content, {
        viewContainerRef,
        disableClose: true,
        autoFocus: 'first-tabbable',
        closeOnNavigation: false,
        exitAnimationDuration: 0,
        restoreFocus,
        ariaLabelledBy: labelledBy(),
        width: '460px',
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: 'calc(100dvh - 32px)',
        panelClass: 'pt-dialog',
      }),
    );
    const cancellation = merge(
      ref.backdropClick(),
      ref.keydownEvents().pipe(filter((event) => event.key === 'Escape')),
    ).subscribe((event) => {
      event.preventDefault();
      cancel();
    });
    onCleanup(() => {
      cancellation.unsubscribe();
      ref.close();
    });
  });
}
