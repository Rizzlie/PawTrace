import type { CaseCopy, CopyScope } from './case-copies';

export class CopyFenced extends Error {}
export class CleanupPending extends Error {}

export interface CopyRecord extends CaseCopy {
  checkpointId?: string;
  attemptCheckpoint?: string;
  id: string;
  owner: string;
}
export const copyId = (scope: CopyScope, caseId: string) =>
  JSON.stringify([scope.owner, caseId, scope.branch]);
export const snapshot = ({
  caseId,
  branch,
  document,
  version,
  revision,
  acknowledged,
  attempt,
  paused,
}: CaseCopy): CaseCopy => ({
  caseId,
  branch,
  document,
  version,
  revision,
  acknowledged,
  // Counters from old records (or a different snapshot) are not proof of acknowledgement.
  savedRevision:
    acknowledged?.version === version &&
    acknowledged.revision === revision &&
    JSON.stringify(acknowledged.document) === JSON.stringify(document)
      ? revision
      : -1,
  attempt,
  paused,
});
