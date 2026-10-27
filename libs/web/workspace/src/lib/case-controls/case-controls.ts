import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  viewChild,
} from "@angular/core";
import { AppState } from "../app-state";

@Component({
  selector: "pt-case-controls",
  imports: [],
  templateUrl: "./case-controls.html",
  styleUrl: "./case-controls.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaseControls {
  protected readonly state = inject(AppState);
  private readonly dialog =
    viewChild<ElementRef<HTMLDialogElement>>("confirmation");

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
    input.value = "";
    if (file) void this.state.importFile(file);
  }

  protected cancel(event: Event): void {
    event.preventDefault();
    this.state.cancelReplacement();
  }
}
