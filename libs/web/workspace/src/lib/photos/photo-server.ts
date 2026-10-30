import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { EMPTY, expand, map, switchMap, timer } from 'rxjs';
import { photoMetadataSchema, photoUrl } from './photo-metadata';

/** Resolves a case's originals on the current server; polling ends at a terminal derivative state or error. */
@Injectable({ providedIn: 'root' })
export class PhotoServer {
  private readonly http = inject(HttpClient);

  watch(caseId: string, filename: string) {
    const read = () =>
      this.http.get<unknown>(photoUrl(caseId, filename, 'metadata')).pipe(
        map((value) => {
          const metadata = photoMetadataSchema.parse(value);
          if (metadata.filename !== filename) throw new Error('Mismatched photo metadata');
          return metadata;
        }),
      );
    return read().pipe(
      expand((metadata) =>
        Object.values(metadata.processing).some((item) => item.status === 'pending')
          ? timer(1500).pipe(switchMap(read))
          : EMPTY,
      ),
    );
  }

  retry(caseId: string, filename: string) {
    return this.http.post<unknown>(photoUrl(caseId, filename, 'retry'), {});
  }
}
