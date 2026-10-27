import type { CaseDocument } from "@pawtrace/case-domain";
import type { Basemap } from "@pawtrace/map-engine";

export interface WorkspaceState {
  document: CaseDocument | null;
  ui: {
    error: string;
    candidate: CaseDocument | null;
    reading: boolean;
    emptyBasemap: Basemap;
  };
  editor: null;
  persistence: {
    initialized: boolean;
    revision: number;
    savedRevision: number;
    generation: number;
    writing: boolean;
    replacing: boolean;
    error: string;
    recovery: string;
  };
}

/** A fresh local session; restoring a snapshot does not create a case edit. */
export function createWorkspaceState(
  document: CaseDocument | null = null,
  generation = 0,
): WorkspaceState {
  return {
    document,
    ui: { error: "", candidate: null, reading: false, emptyBasemap: "osm" },
    editor: null,
    persistence: {
      initialized: document !== null,
      revision: 0,
      savedRevision: 0,
      generation,
      writing: false,
      replacing: false,
      error: "",
      recovery: "",
    },
  };
}

export function saveStatus({ document, persistence }: WorkspaceState) {
  if (!persistence.initialized) return "loading";
  if (persistence.replacing) return "replacing";
  if (persistence.error) return "error";
  if (persistence.writing) return "saving";
  if (persistence.revision !== persistence.savedRevision) return "unsaved";
  return document ? "saved" : "empty";
}
