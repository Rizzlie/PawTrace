# Shared web UI

Non-buildable Angular UI library, consumed through `@pawtrace/shared-ui`.

- `Brand` (`pt-brand`): PawTrace logo and configurable subtitle.
- `FloatingPanel` (`pt-floating-panel`): translucent Material card with a required accessible `label`, an optional `[panel-heading]` slot and projected body content. Positioning belongs to the consumer. Set `[scrollable]="false"` when the consumer provides independently scrolling lists.
- `presentMaterialDialog`: presents a conditional template through Material Dialog, including focus trapping/restoration and Escape/backdrop cancellation. The owner controls visibility and handles cancellation through its existing intent; navigation does not bypass editor transition decisions.
- `src/theme.scss`: Material 3 theme matching the PawTrace palette, typography and shapes, plus native link focus styles. Import it once in the application's global stylesheet so overlays inherit the same theme. Use Material's public token overrides for component appearance. Leaflet-specific styles stay with the web application.

Brand uses the shared `assets/icon.svg` asset, which the web build copies from the repository's assets directory. The same asset serves as the favicon.

Keep application state, HTTP requests and feature-specific layout outside this library. The application header composes Brand without requesting or displaying API connection status.

Run `npm exec nx run shared-ui:lint` and `npm exec nx run shared-ui:typecheck`. The web application and browser tests cover component integration and responsive layout.
