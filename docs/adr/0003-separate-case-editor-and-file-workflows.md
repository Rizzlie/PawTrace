# Separate committed case, editor and file workflows

State implementation superseded by [ADR 0004](0004-compose-case-signal-store-with-events.md). The map adapter and document-only persistence decisions remain in force.

The F06 implementation made one AppState responsible for restoration, map commits, forms, route decisions and file transfer. Replace that class with CaseState (the only committed document and persistence owner), AnimalEditor (one isolated draft and cancellable close decision), and CaseFiles (file transfer and pending replacement); dependencies flow from files through editor to case, with no state-copying effects or aggregate facade. This supersedes ADR 0002's shared-root requirement while preserving document-only persistence, validated Save and durable replacement.

Do not introduce MapState: the screen passes derived plain inputs to map-engine and handles technical outputs. map-engine owns Angular/Leaflet rendering and lifecycle, with no case-domain decisions or store injection. NgRx SignalStore with Events was raised as an alternative during implementation and has not been selected; the module boundaries should be evaluated independently of that library choice.
