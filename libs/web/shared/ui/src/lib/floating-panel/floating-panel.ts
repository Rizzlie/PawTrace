import { ChangeDetectionStrategy, Component, input } from "@angular/core";
@Component({
  selector: "pt-floating-panel",
  templateUrl: "./floating-panel.html",
  styleUrl: "./floating-panel.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: "complementary", "[attr.aria-label]": "label()" },
})
export class FloatingPanel {
  readonly label = input.required<string>();
}
