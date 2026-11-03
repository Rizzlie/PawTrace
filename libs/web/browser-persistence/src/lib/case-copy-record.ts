import type { CaseCopy, CopyScope } from './case-copies';

export class CopyFenced extends Error {}
export class CleanupPending extends Error {}

export interface CopyRecord extends CaseCopy {
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
  savedRevision,
  attempt,
  paused,
}: CaseCopy): CaseCopy => ({
  caseId,
  branch,
  document,
  version,
  revision,
  savedRevision,
  attempt,
  paused,
});
