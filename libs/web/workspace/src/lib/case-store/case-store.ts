import { signalStore, withState } from '@ngrx/signals';
import { createCaseState } from './case-state';
import { withCaseProjections } from './with-case-projections';
import { withCaseView } from './with-case-view';
import { withAnimalEditing } from './with-animal-editing';
import { withCaseFiles } from './with-case-files';
import { withCasePersistence } from './with-case-persistence';

export const CaseStore = signalStore(
  withState(createCaseState()),
  withCaseProjections(),
  withCaseView(),
  withAnimalEditing(),
  withCaseFiles(),
  withCasePersistence(),
);
