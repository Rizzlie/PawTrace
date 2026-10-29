import type { CaseDocument, HistoryEntry } from '@pawtrace/case-domain';
import { createPhotoDraft, applyPhotoAssets, type PhotoDraft } from '../photos/photo-draft';
import {
  createEventTimeDraft,
  applyEventTimeDraft,
  type EventTimeDraft,
} from '../event-time-draft';

type Observation = Extract<HistoryEntry, { type: 'observation' }>;
type ActionDetails = NonNullable<Extract<HistoryEntry, { type: 'action' }>['details']>;
type Check = Extract<HistoryEntry, { type: 'check' }>;
export interface EntryDraft extends PhotoDraft {
  type: HistoryEntry['type'];
  description: string;
  time: EventTimeDraft;
  source: NonNullable<Observation['source']> | '';
  sourceDescription: string;
  uncertaintyRadiusMeters: string;
  identification: Observation['identification'];
  rejected: boolean;
  rejectionReason: string;
  actionKind: NonNullable<ActionDetails['kind']> | '';
  foodType: string;
  foodQuantity: string;
  foodUnit: NonNullable<ActionDetails['foodQuantity']>['unit'];
  result: NonNullable<Check['result']> | '';
  observationEntryId: string;
  method: string;
  foodStatus: NonNullable<NonNullable<Check['details']>['foodStatus']> | '';
}
export interface EntrySession {
  kind: 'entry';
  id: number;
  generation: number;
  version: number;
  pointId: string;
  entryId: string;
  draft: EntryDraft;
  initial: EntryDraft;
  error: string;
}

export function createEntryDraft(document: CaseDocument, entry?: HistoryEntry): EntryDraft {
  const time = entry?.occurredAt ?? { kind: 'unknown', description: null };
  const observation = entry?.type === 'observation' ? entry : null;
  const action = entry?.type === 'action' ? entry.details : null;
  const check = entry?.type === 'check' ? entry : null;
  return {
    ...createPhotoDraft(entry?.photos),
    type: entry?.type ?? 'observation',
    description: entry?.description ?? '',
    time: createEventTimeDraft(time, document.case.timeZone),
    source: observation?.source ?? '',
    sourceDescription: observation?.sourceDescription ?? '',
    uncertaintyRadiusMeters: observation?.uncertaintyRadiusMeters?.toString() ?? '',
    identification: observation?.identification ?? 'uncertain',
    rejected: observation?.status === 'rejected',
    rejectionReason: observation?.rejectionReason ?? '',
    actionKind: action?.kind ?? '',
    foodType: action?.foodType ?? '',
    foodQuantity: action?.foodQuantity?.value.toString() ?? '',
    foodUnit: action?.foodQuantity?.unit ?? 'grams',
    result: check?.result ?? '',
    observationEntryId: check?.observationEntryId ?? '',
    method: check?.method ?? '',
    foodStatus: check?.details?.foodStatus ?? '',
  };
}

const text = (value: string) => value.trim() || null;
const number = (value: string) => (value.trim() ? Number(value.trim().replace(',', '.')) : null);

export function applyEntryDraft(
  document: CaseDocument,
  session: EntrySession,
  now: string,
): CaseDocument {
  const { draft, pointId, entryId } = session;
  const original = document.points
    .find((p) => p.id === pointId)
    ?.entries.find((e) => e.id === entryId);
  const occurredAt = applyEventTimeDraft(draft.time, document.case.timeZone, original?.occurredAt);
  const base = {
    id: entryId,
    occurredAt,
    createdAt: original?.createdAt ?? now,
    updatedAt: now,
    description: text(draft.description),
    photos: draft.photos,
  };
  const active = { ...base, status: 'active' as const, rejectionReason: null };
  // Entry type is stable on edit, so links to existing observations cannot silently change meaning.
  const type = original?.type ?? draft.type;
  const entry: HistoryEntry =
    type === 'observation'
      ? {
          ...base,
          type,
          source: draft.source || null,
          sourceDescription: text(draft.sourceDescription),
          uncertaintyRadiusMeters: number(draft.uncertaintyRadiusMeters),
          identification: draft.identification,
          status: draft.rejected ? 'rejected' : 'active',
          rejectionReason: draft.rejected ? text(draft.rejectionReason) : null,
        }
      : type === 'action'
        ? {
            ...active,
            type,
            details: {
              kind: draft.actionKind || null,
              foodType: text(draft.foodType),
              foodQuantity: draft.foodQuantity.trim()
                ? { value: number(draft.foodQuantity) ?? NaN, unit: draft.foodUnit }
                : null,
            },
          }
        : type === 'check'
          ? {
              ...active,
              type,
              result: draft.result || null,
              observationEntryId:
                draft.result === 'animal_seen' ? text(draft.observationEntryId) : null,
              method: text(draft.method),
              details: { foodStatus: draft.foodStatus || null },
            }
          : { ...active, type };
  return {
    ...document,
    assets: applyPhotoAssets(document, draft),
    points: document.points.map((point) =>
      point.id !== pointId
        ? point
        : {
            ...point,
            entries: original
              ? point.entries.map((e) => (e.id === entryId ? entry : e))
              : [...point.entries, entry],
          },
    ),
  };
}
