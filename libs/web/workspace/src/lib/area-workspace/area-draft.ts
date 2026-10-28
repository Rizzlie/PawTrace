import type { CaseDocument, Coordinates, SearchArea, SearchGeometry } from '@pawtrace/case-domain';

export interface AreaDraft {
  name: string;
  description: string;
  type: SearchGeometry['type'];
  vertices: Coordinates[];
  radiusMeters: string;
}
export interface AreaSession {
  kind: 'area';
  id: number;
  generation: number;
  version: number;
  areaId: string;
  draft: AreaDraft;
  initial: AreaDraft;
  undo: Pick<AreaDraft, 'vertices' | 'radiusMeters'>[];
  error: string;
}
export function createAreaDraft(type: SearchGeometry['type'], area?: SearchArea): AreaDraft {
  const geometry = area?.plannedGeometry;
  return {
    name: area?.name ?? '',
    description: area?.description ?? '',
    type: geometry?.type ?? type,
    vertices: structuredClone(
      geometry?.type === 'circle' ? [geometry.center] : (geometry?.vertices ?? []),
    ),
    radiusMeters: geometry?.type === 'circle' ? String(geometry.radiusMeters) : '',
  };
}
export function draftGeometry(draft: AreaDraft): SearchGeometry | null {
  if (draft.type === 'polygon') return { type: 'polygon', vertices: draft.vertices };
  return draft.vertices[0]
    ? { type: 'circle', center: draft.vertices[0], radiusMeters: Number(draft.radiusMeters) }
    : null;
}
export function applyAreaDraft(document: CaseDocument, session: AreaSession): CaseDocument {
  const existing = document.areas.find((area) => area.id === session.areaId);
  const area: SearchArea = {
    ...(existing ?? { id: session.areaId, photos: [], checks: [] }),
    name: session.draft.name.trim(),
    description: session.draft.description.trim() || null,
    plannedGeometry: draftGeometry(session.draft),
  };
  return {
    ...document,
    areas: existing
      ? document.areas.map((item) => (item.id === area.id ? area : item))
      : [...document.areas, area],
  };
}

/** Remove the plan; actual searches remain independent historical snapshots. */
export function removeAreaPlan(document: CaseDocument, id: string): CaseDocument {
  return {
    ...document,
    areas: document.areas.flatMap((area) =>
      area.id !== id ? [area] : area.checks.length ? [{ ...area, plannedGeometry: null }] : [],
    ),
  };
}
