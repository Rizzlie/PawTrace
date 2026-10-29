import { computed, DestroyRef, inject } from '@angular/core';
import { PhotoTransfers } from '../photos/photo-transfers';
import { signalStoreFeature, type, withComputed, withMethods } from '@ngrx/signals';
import { eventGroup, injectDispatch, on, withReducer } from '@ngrx/signals/events';
import type { PhotoAsset } from '@pawtrace/case-domain';
import { caseBusy, type CaseState } from './case-state';
import { mergePhotoAssets, type PhotoTarget } from '../photos/photo-draft';

export const photoEvents = eventGroup({
  source: 'Photo editor',
  events: {
    attached: type<{ target: PhotoTarget; asset: PhotoAsset }>(),
    unlinked: type<{ id: number; filename: string }>(),
  },
});

function photoEditor(editor: CaseState['editor']) {
  return editor?.kind === 'profile' || editor?.kind === 'entry' || editor?.kind === 'area-check'
    ? editor
    : null;
}

export function withPhotoEditing() {
  return signalStoreFeature(
    { state: type<CaseState>() },
    withReducer(
      on(photoEvents.attached, ({ payload: { target, asset } }, state) => {
        const editor = photoEditor(state.editor);
        if (
          caseBusy(state) ||
          !editor ||
          editor.id !== target.editorId ||
          state.persistence.generation !== target.generation ||
          state.document?.case.id !== target.caseId
        )
          return {};
        const photos = [...new Set([...editor.draft.photos, asset.filename])];
        const photoAssets = mergePhotoAssets(editor.draft.photoAssets, [asset]);
        if (editor.kind === 'profile')
          return {
            editor: {
              ...editor,
              version: editor.version + 1,
              draft: {
                ...editor.draft,
                photos,
                photoAssets,
                photoCaptions: editor.draft.photoCaptions.some(
                  (item) => item.filename === asset.filename,
                )
                  ? editor.draft.photoCaptions
                  : [...editor.draft.photoCaptions, { filename: asset.filename, caption: '' }],
              },
            },
          };
        if (editor.kind === 'entry')
          return {
            editor: {
              ...editor,
              version: editor.version + 1,
              draft: { ...editor.draft, photos, photoAssets },
            },
          };
        return {
          editor: {
            ...editor,
            version: editor.version + 1,
            draft: { ...editor.draft, photos, photoAssets },
          },
        };
      }),
      on(photoEvents.unlinked, ({ payload }, state) => {
        const editor = photoEditor(state.editor);
        if (!editor || editor.id !== payload.id || caseBusy(state)) return {};
        const draft = {
          ...editor.draft,
          photos: editor.draft.photos.filter((f) => f !== payload.filename),
        };
        return {
          editor: {
            ...editor,
            version: editor.version + 1,
            draft:
              editor.kind === 'profile'
                ? {
                    ...editor.draft,
                    ...draft,
                    mainPhoto:
                      editor.draft.mainPhoto === payload.filename ? '' : editor.draft.mainPhoto,
                    photoCaptions: editor.draft.photoCaptions.filter(
                      (c) => c.filename !== payload.filename,
                    ),
                  }
                : draft,
          } as CaseState['editor'],
        };
      }),
    ),
    withComputed((store) => ({
      photoTarget: computed(() => {
        const editor = photoEditor(store.editor());
        const document = store.document();
        return editor && document
          ? {
              caseId: document.case.id,
              generation: store.persistence().generation,
              editorId: editor.id,
            }
          : null;
      }),
      editorPhotos: computed(() => photoEditor(store.editor())?.draft.photos ?? []),
    })),
    withMethods(
      (
        store,
        dispatch = injectDispatch(photoEvents),
        transfers = inject(PhotoTransfers),
        owner = inject(DestroyRef),
      ) => ({
        uploadPhotos(id: number, files: File[]): void {
          const target = store.photoTarget();
          if (!target || target.editorId !== id) return;
          transfers.add(files, target, (asset) => dispatch.attached({ target, asset }), owner);
        },
        attachPhoto(target: PhotoTarget, asset: PhotoAsset): void {
          dispatch.attached({ target, asset });
        },
        unlinkPhoto(id: number, filename: string): void {
          dispatch.unlinked({ id, filename });
        },
      }),
    ),
  );
}
