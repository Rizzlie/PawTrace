import type { CaseDocument, EventTime, HistoryEntry, MapPoint } from '@pawtrace/case-domain';

/** The escape location is a derived role: the case refers to one point by ID. */
export type PlaceRole = MapPoint['roles'][number] | 'escape_location';
export type EntryType = HistoryEntry['type'];

/** UI-only view criteria; never part of the committed or exported case. */
export interface CaseFilter {
  roles: PlaceRole[];
  entryTypes: EntryType[];
  /** Inclusive local calendar days (YYYY-MM-DD) in the case time zone; '' is unbounded. */
  from: string;
  to: string;
  includeUnknownTime: boolean;
  showRejected: boolean;
}

export const defaultCaseFilter: CaseFilter = {
  roles: [],
  entryTypes: [],
  from: '',
  to: '',
  includeUnknownTime: false,
  showRejected: false,
};

export const periodActive = (filter: CaseFilter) => !!(filter.from || filter.to);
/** Criteria that require a place to have matching history. */
export const entryCriteriaActive = (filter: CaseFilter) =>
  filter.entryTypes.length > 0 || periodActive(filter);
/** Criteria that narrow places; the rejected-report toggle is a separate visibility control. */
export const filterActive = (filter: CaseFilter) =>
  filter.roles.length > 0 || entryCriteriaActive(filter);
/** Manually rejected reports stay hidden until explicitly shown. */
export const reportShown = (entry: HistoryEntry, filter: Pick<CaseFilter, 'showRejected'>) =>
  filter.showRejected || entry.status !== 'rejected';

function localDay(instant: string, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  );
  return `${parts['year']}-${parts['month']}-${parts['day']}`;
}

/** Local days the event may have occurred on; a null bound is an open range end. */
function possibleDays(
  time: EventTime,
  timeZone: string,
): { first: string | null; last: string | null } | null {
  switch (time.kind) {
    case 'unknown':
      return null;
    case 'date':
      return { first: time.date, last: time.date };
    case 'exact':
    case 'approximate': {
      const day = localDay(time.at, timeZone);
      return { first: day, last: day };
    }
    case 'range':
      return {
        first: time.start ? localDay(time.start, timeZone) : null,
        last: time.end ? localDay(time.end, timeZone) : null,
      };
  }
}

/** An entry matches when its possible days overlap the selected period. */
function timeMatches(time: EventTime, filter: CaseFilter, timeZone: string): boolean {
  if (!periodActive(filter)) return true;
  const days = possibleDays(time, timeZone);
  if (!days) return filter.includeUnknownTime;
  return (
    (!filter.from || days.last === null || days.last >= filter.from) &&
    (!filter.to || days.first === null || days.first <= filter.to)
  );
}

export function entryMatches(entry: HistoryEntry, filter: CaseFilter, timeZone: string): boolean {
  return (
    reportShown(entry, filter) &&
    (!filter.entryTypes.length || filter.entryTypes.includes(entry.type)) &&
    timeMatches(entry.occurredAt, filter, timeZone)
  );
}

export function placeRoles(point: MapPoint, document: CaseDocument): PlaceRole[] {
  return document.case.escape.escapePointId === point.id
    ? ['escape_location', ...point.roles]
    : point.roles;
}

/**
 * Filters narrow places and their counted entries. A place without matching history
 * is shown only while no entry criterion is active; rejection alone never hides a place.
 */
export function filterPlace(point: MapPoint, document: CaseDocument, filter: CaseFilter) {
  const roles = placeRoles(point, document);
  const matching = point.entries.filter((entry) =>
    entryMatches(entry, filter, document.case.timeZone),
  );
  const visible =
    (!filter.roles.length || filter.roles.some((role) => roles.includes(role))) &&
    (!entryCriteriaActive(filter) || matching.length > 0);
  return { visible, matching };
}
