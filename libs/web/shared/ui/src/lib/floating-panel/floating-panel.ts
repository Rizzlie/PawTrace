import { MatCardModule } from '@angular/material/card';
import { ChangeDetectionStrategy, Component, ElementRef, input, viewChild } from '@angular/core';
@Component({
  selector: 'pt-floating-panel',
  imports: [MatCardModule],
  templateUrl: './floating-panel.html',
  styleUrl: './floating-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'complementary', '[attr.aria-label]': 'label()' },
})
export class FloatingPanel {
  readonly label = input.required<string>();
  readonly scrollable = input(true);
  private readonly content = viewChild<ElementRef<HTMLElement>>('content');

  scrollToTop(): void {
    const content = this.content()?.nativeElement;
    if (content) content.scrollTop = 0;
  }
}
