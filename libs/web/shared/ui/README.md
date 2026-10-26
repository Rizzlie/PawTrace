# Shared web UI

Non-buildable Angular UI library, consumed through `@pawtrace/shared-ui`.

- `Brand` (`pt-brand`): PawTrace logo and configurable subtitle.
- `FloatingPanel` (`pt-floating-panel`): translucent panel with a required accessible `label`, an optional `[panel-heading]` slot and projected body content. Positioning belongs to the consumer.
- `src/theme.scss`: global palette, typography, native controls and focus styles. Import it once in the application's global stylesheet. Leaflet-specific styles stay with the web application.

Brand uses the shared `assets/icon.svg` asset, which the web build copies from the repository's assets directory. The same asset serves as the favicon.

Keep application state, HTTP requests and feature-specific layout outside this library. The application header composes Brand and receives connection state and a reconnect callback through Angular inputs and outputs.

Run `npm exec nx run shared-ui:lint` and `npm exec nx run shared-ui:typecheck`. The web application and browser tests cover component integration and responsive layout.
