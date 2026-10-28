/** Lightweight projections: no runtime dependency on the Zod document validator. */
export {
  chronologicalHistory,
  observationCounts,
  removeHistoryEntry,
  unlinkRemovedObservations,
} from './lib/point-history';
