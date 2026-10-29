import type { AreaCheck, CaseDocument, SearchResult } from '@pawtrace/case-domain';
import { createPhotoDraft, applyPhotoAssets, type PhotoDraft } from '../photos/photo-draft';
import { createAreaDraft, draftGeometry, type AreaDraft } from './area-draft';
import {
  applyEventTimeDraft,
  createEventTimeDraft,
  type EventTimeDraft,
} from '../event-time-draft';

export interface AreaCheckDraft extends AreaDraft, PhotoDraft {
  footprint: 'plan' | 'custom';
  time: EventTimeDraft;
  result: SearchResult | '';
  observationEntryId: string;
  method: string;
  notes: string;
}
export interface AreaCheckSession {
  kind: 'area-check';
  id: number;
  generation: number;
  version: number;
  areaId: string;
  checkId: string;
  draft: AreaCheckDraft;
  initial: AreaCheckDraft;
  undo: Pick<AreaDraft, 'type' | 'vertices' | 'radiusMeters'>[];
  error: string;
}
export function createAreaCheckDraft(
  document: CaseDocument,
  areaId?: string,
  checkId?: string,
  type: 'circle' | 'polygon' = 'polygon',
): AreaCheckDraft {
  const area = document.areas.find((item) => item.id === areaId);
  const check = area?.checks.find((item) => item.id === checkId);
  const geometry = check?.actualGeometry ?? area?.plannedGeometry;
  return {
    ...createAreaDraft(type, area),
    ...createPhotoDraft(check?.photos),
    type: geometry?.type ?? type,
    vertices: structuredClone(
      geometry?.type === 'circle' ? [geometry.center] : (geometry?.vertices ?? []),
    ),
    radiusMeters: geometry?.type === 'circle' ? String(geometry.radiusMeters) : '',
    footprint: !check && area?.plannedGeometry ? 'plan' : 'custom',
    time: createEventTimeDraft(
      check?.occurredAt ?? { kind: 'unknown', description: null },
      document.case.timeZone,
    ),
    result: check?.result ?? '',
    observationEntryId: check?.observationEntryId ?? '',
    method: check?.method ?? '',
    notes: check?.description ?? '',
  };
}
export function applyAreaCheckDraft(
  document: CaseDocument,
  session: AreaCheckSession,
  now: string,
): CaseDocument {
  const area = document.areas.find((item) => item.id === session.areaId);
  const original = area?.checks.find((item) => item.id === session.checkId);
  const { draft } = session;
  const geometry = draft.footprint === 'plan' ? area?.plannedGeometry : draftGeometry(draft);
  if (!geometry) return document;
  const check: AreaCheck = {
    id: session.checkId,
    actualGeometry: structuredClone(geometry),
    occurredAt: applyEventTimeDraft(draft.time, document.case.timeZone, original?.occurredAt),
    createdAt: original?.createdAt ?? now,
    updatedAt: now,
    description: draft.notes.trim() || null,
    method: draft.method.trim() || null,
    result: draft.result || null,
    observationEntryId:
      draft.result === 'animal_seen' ? draft.observationEntryId.trim() || null : null,
    photos: draft.photos,
  };
  const updated = {
    ...(area ?? {
      id: session.areaId,
      name: draft.name.trim(),
      description: null,
      plannedGeometry: null,
      photos: [],
      checks: [],
    }),
    checks: original
      ? (area?.checks ?? []).map((item) => (item.id === check.id ? check : item))
      : [...(area?.checks ?? []), check],
  };
  return {
    ...document,
    assets: applyPhotoAssets(document, draft),
    areas: area
      ? document.areas.map((item) => (item.id === area.id ? updated : item))
      : [...document.areas, updated],
  };
}
