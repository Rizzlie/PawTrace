import { withAreaCheckEditing } from './with-area-check-editing';
import { withPhotoEditing } from './with-photo-editing';
import { withPhotoProcessing } from './with-photo-processing';
import { withEntryEditing } from './with-entry-editing';
import { withAreaEditing } from './with-area-editing';
import { signalStore, withState } from '@ngrx/signals';
import { createCaseState } from './case-state';
import { withCaseProjections } from './with-case-projections';
import { withCaseView } from './with-case-view';
import { withEditorResources, withEditorLifecycle } from './with-editor-lifecycle';
import { withPointEditing } from './with-point-editing';
import { withAnimalEditing } from './with-animal-editing';
import { withCaseFiles } from './with-case-files';
import { withCasePersistence } from './with-case-persistence';

export const CaseStore = signalStore(
  withState(createCaseState()),
  withCaseProjections(),
  withCaseView(),
  withEditorResources(),
  withPointEditing(),
  withEntryEditing(),
  withAreaEditing(),
  withAreaCheckEditing(),
  withAnimalEditing(),
  withPhotoEditing(),
  withEditorLifecycle(),
  withCaseFiles(),
  withCasePersistence(),
  withPhotoProcessing(),
);
