# Signal Forms binding within one application state owner

Parent: ../map.md
Label: wayfinder:research
Type: research
Status: resolved
Assignee: macsy
Blocked by: none

## Question

What supported Angular Signal Forms pattern binds editable draft data while preserving the accepted single AppState service? Verify the required writable model interface, nested/optional/discriminated editor models, whether public APIs support writable projections into a root signal, and viable ownership-preserving alternatives. Distinguish one logical state owner from a literal single writable signal; do not silently change the user's decision. Recommend the smallest documented integration without custom Angular signal internals, feedback effects that duplicate canonical drafts, or NgRx. Research only; the parent owns architecture choices.

## Comments

Output only: `../research/signal-forms-state-binding.md`. No application implementation, installations, builds, prototype edits, commits, branches, pushes, PRs, or further delegation. Read the current frontend architecture and the preceding frontend technology research.

Active research task: `node:delegated-task:command%3Amcp%3A62624c61-c925-4ae4-a971-a52ff7bec9d9%3Adelegate-task%3Apawtrace-signalforms-state-binding-20261026-round1`. Do not duplicate while running.

## Findings

Research completed in [signal-forms-state-binding.md](../research/signal-forms-state-binding.md). Current Angular public APIs document `linkedSignal` with a custom setter that can route draft writes into one authoritative root. This is a derived writable handle, not an independent canonical editor. Exact published-package availability and the actual editor integration require implementation verification. Whole-root form binding and section signals are documented alternatives, not adopted changes. The parent architecture interview owns the remaining choice.
