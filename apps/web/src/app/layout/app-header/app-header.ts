import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from "@angular/core";
import { Brand } from "@pawtrace/shared-ui";
@Component({
  selector: "app-header",
  imports: [Brand],
  templateUrl: "./app-header.html",
  styleUrl: "./app-header.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppHeader {
  readonly connection = input.required<"checking" | "online" | "offline">();
  readonly reconnect = output<void>();
}
