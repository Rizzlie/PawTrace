import { ChangeDetectionStrategy, Component, input } from "@angular/core";
@Component({
  selector: "app-brand",
  templateUrl: "./brand.html",
  styleUrl: "./brand.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Brand {
  readonly subtitle = input("Przestrzeń poszukiwań");
}
