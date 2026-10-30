# Browser persistence

`BrowserFiles` reads selected JSON files and downloads serialized exports. It owns browser file/Blob APIs, without deciding which case is active.

`hasSeenMapHelp` / `rememberMapHelp` store the versioned first-visit help preference in localStorage (`pawtrace.map-help.seen.v1`). This is a browser UI preference, independent of case data and JSON. Storage failures are contained so the header help dialog remains usable.

P02 replaced the anonymous single-case IndexedDB snapshot with server persistence of owned cases (`libs/web/workspace/src/lib/cases`). The old snapshot was not account-keyed and is neither read nor migrated; account- and case-keyed local retention is P04 work. Run `npm exec nx run browser-persistence:typecheck` and `npm exec nx run browser-persistence:lint`.
