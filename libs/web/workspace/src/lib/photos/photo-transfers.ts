import { HttpClient, HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, EMPTY, filter, map, mergeMap, of, Subject, takeUntil, tap } from 'rxjs';
import type { PhotoAsset } from '@pawtrace/case-domain';
import type { PhotoTarget } from './photo-draft';
import { photoAsset, photoMetadataSchema, photoUrl } from './photo-metadata';

export interface PhotoJob {
  id: number;
  target: PhotoTarget;
  name: string;
  status: 'queued' | 'uploading' | 'confirming' | 'stored' | 'failed' | 'unconfirmed';
  confirmationFilename: string | null;
  progress: number | null;
  error: string;
}
interface PendingPhoto {
  file: File;
  stored: (asset: PhotoAsset) => void;
  cancelled: Subject<void>;
  confirmationFilename: string | null;
}

@Injectable({ providedIn: 'root' })
export class PhotoTransfers {
  private readonly http = inject(HttpClient);
  private readonly state = signal<PhotoJob[]>([]);
  readonly jobs = this.state.asReadonly();
  private readonly queue = new Subject<number>();
  private readonly files = new Map<number, PendingPhoto>();
  private sequence = 0;

  constructor() {
    this.queue
      .pipe(
        mergeMap((id) => {
          const job = this.files.get(id);
          if (!job) return EMPTY;
          const confirmation = job.confirmationFilename;
          this.update(id, {
            status: confirmation ? 'confirming' : 'uploading',
            progress: null,
            error: '',
          });
          const body = new FormData();
          body.append('file', job.file);
          const response = confirmation
            ? this.http.get<unknown>(photoUrl(confirmation, 'metadata'))
            : this.http
                .post<unknown>('/api/assets', body, {
                  observe: 'events',
                  reportUploadProgress: true,
                })
                .pipe(
                  tap((event) => {
                    if (event.type === HttpEventType.UploadProgress)
                      this.update(id, {
                        progress: event.total
                          ? Math.round((100 * event.loaded) / event.total)
                          : null,
                      });
                  }),
                  filter((event) => event.type === HttpEventType.Response),
                  map((event) => event.body),
                );
          return response.pipe(
            mergeMap((value) => {
              const parsed = photoMetadataSchema.safeParse(value);
              if (!parsed.success || (confirmation && parsed.data.filename !== confirmation)) {
                const candidate =
                  value && typeof value === 'object' && 'filename' in value
                    ? value.filename
                    : undefined;
                const filename = photoMetadataSchema.shape.filename.safeParse(candidate);
                job.confirmationFilename =
                  confirmation ?? (filename.success ? filename.data : null);
                this.unconfirmed(id, job);
                return EMPTY;
              }
              return of(photoAsset(parsed.data));
            }),
            catchError((error: unknown) => {
              // A 2xx response (including malformed JSON) or lost connection is not proof of a failed write.
              if (
                confirmation ||
                (error instanceof HttpErrorResponse &&
                  (error.status === 0 || (error.status >= 200 && error.status < 300)))
              ) {
                this.unconfirmed(id, job);
              } else {
                this.update(id, {
                  status: 'failed',
                  error:
                    error instanceof HttpErrorResponse && error.status === 415
                      ? 'Nieobsługiwany format. Wybierz JPEG, PNG, WebP lub HEIC.'
                      : 'Nie zapisano pliku. Sprawdź połączenie i miejsce na serwerze, a następnie ponów.',
                });
              }
              return EMPTY;
            }),
            takeUntil(job.cancelled),
            tap((asset) => {
              if (this.files.get(id) !== job) return;
              this.update(id, { status: 'stored', progress: 100 });
              this.files.delete(id);
              job.cancelled.complete();
              job.stored(asset);
            }),
          );
        }, 2),
        takeUntilDestroyed(),
      )
      .subscribe();
    inject(DestroyRef).onDestroy(() => this.files.clear());
  }

  add(
    files: File[],
    target: PhotoTarget,
    stored: (asset: PhotoAsset) => void,
    owner: DestroyRef,
  ): void {
    if (owner.destroyed) return;
    owner.onDestroy(() => this.release(target));
    for (const file of files) {
      const id = ++this.sequence;
      this.files.set(id, {
        file,
        stored,
        cancelled: new Subject<void>(),
        confirmationFilename: null,
      });
      this.state.update((jobs) => [
        ...jobs,
        {
          id,
          target,
          name: file.name,
          status: 'queued',
          confirmationFilename: null,
          progress: null,
          error: '',
        },
      ]);
      this.queue.next(id);
    }
  }

  retry(id: number): void {
    const job = this.state().find((job) => job.id === id);
    if (
      !job ||
      !(job.status === 'failed' || (job.status === 'unconfirmed' && job.confirmationFilename))
    )
      return;
    this.update(id, { status: 'queued', error: '' });
    this.queue.next(id);
  }

  release(target: PhotoTarget): void {
    const belongs = (job: PhotoJob) =>
      job.target.caseId === target.caseId &&
      job.target.generation === target.generation &&
      job.target.editorId === target.editorId;
    const jobs = this.state().filter(belongs);
    // Remove queued work before cancellation frees a concurrency slot.
    const pending = jobs.flatMap((job) => {
      const file = this.files.get(job.id);
      this.files.delete(job.id);
      return file ? [file] : [];
    });
    this.state.update((jobs) => jobs.filter((job) => !belongs(job)));
    for (const job of pending) {
      job.cancelled.next();
      job.cancelled.complete();
    }
  }

  private unconfirmed(id: number, job: PendingPhoto): void {
    this.update(id, {
      status: 'unconfirmed',
      confirmationFilename: job.confirmationFilename,
      error:
        'Nie potwierdzono danych pliku. Oryginał może być zapisany na serwerze; nie przesyłaj go ponownie.',
    });
    if (!job.confirmationFilename) this.files.delete(id);
  }

  private update(id: number, patch: Partial<PhotoJob>): void {
    this.state.update((jobs) => jobs.map((job) => (job.id === id ? { ...job, ...patch } : job)));
  }
}
