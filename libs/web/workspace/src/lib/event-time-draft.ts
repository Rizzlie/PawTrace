import type { FieldTree } from '@angular/forms/signals';
import { incidentMomentChoices } from './animal-profile/incident-time';
import type { EventTime } from '@pawtrace/case-domain';
import { localIncidentMoment, resolveIncidentMoment } from './animal-profile/incident-time';

/** Initialized Signal Forms payload; instants stay separate from local wall times. */
export interface EventTimeDraft {
  kind: EventTime['kind'];
  at: string;
  atInstant: string;
  start: string;
  startInstant: string;
  end: string;
  endInstant: string;
  date: string;
  description: string;
}

export function createEventTimeDraft(time: EventTime, zone: string): EventTimeDraft {
  const at = localIncidentMoment('at' in time ? time.at : null, zone);
  const start = localIncidentMoment('start' in time ? time.start : null, zone);
  const end = localIncidentMoment('end' in time ? time.end : null, zone);
  return {
    kind: time.kind,
    at: at.local,
    atInstant: at.instant,
    start: start.local,
    startInstant: start.instant,
    end: end.local,
    endInstant: end.instant,
    date: 'date' in time ? time.date : '',
    description: time.description ?? '',
  };
}

export function applyEventTimeDraft(
  time: EventTimeDraft,
  zone: string,
  original?: EventTime,
): EventTime {
  const description = time.description.trim() || null;
  switch (time.kind) {
    case 'exact':
    case 'approximate':
      return {
        kind: time.kind,
        description,
        at: resolveIncidentMoment(
          time.at,
          time.atInstant,
          zone,
          original && 'at' in original ? original.at : null,
        ),
      };
    case 'range':
      return {
        kind: 'range',
        description,
        start:
          time.start === ''
            ? null
            : resolveIncidentMoment(
                time.start,
                time.startInstant,
                zone,
                original?.kind === 'range' ? original.start : null,
              ),
        end:
          time.end === ''
            ? null
            : resolveIncidentMoment(
                time.end,
                time.endInstant,
                zone,
                original?.kind === 'range' ? original.end : null,
              ),
      };
    case 'date':
      return { kind: 'date', date: time.date, description };
    case 'unknown':
      return { kind: 'unknown', description };
  }
}

/** Shared local-time choices; a repeated hour requires an explicit occurrence. */
export function eventTimeMoments(
  fields: FieldTree<EventTimeDraft> | undefined,
  zone: string | undefined,
) {
  if (!fields || !zone) return [];
  const kind = fields.kind().value();
  const moments =
    kind === 'range'
      ? ([
          { key: 'start', instant: 'startInstant', label: 'Początek przedziału' },
          { key: 'end', instant: 'endInstant', label: 'Koniec przedziału' },
        ] as const)
      : kind === 'exact' || kind === 'approximate'
        ? ([{ key: 'at', instant: 'atInstant', label: 'Chwila zdarzenia' }] as const)
        : [];
  return moments.map((moment) => ({
    ...moment,
    field: fields[moment.key],
    choice: fields[moment.instant],
    options: incidentMomentChoices(fields[moment.key]().value(), zone),
  }));
}
