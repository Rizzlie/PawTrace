import type { HistoryEntry } from './history-entry';
import type { EventTime } from './case-values';
import type { CaseDocument } from './case-contract';

/** Display ordering only: a date is never converted into a midnight event. */
export function pointHistory(entries: readonly HistoryEntry[], timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const key = (time: EventTime) => {
    if (time.kind === 'unknown') return { day: '', instant: null };
    if (time.kind === 'date') return { day: time.date, instant: null };
    const at = time.kind === 'range' ? (time.start ?? time.end) : time.at;
    const instant = at === null ? NaN : Date.parse(at);
    const parts = Object.fromEntries(
      formatter.formatToParts(instant).map((p) => [p.type, p.value]),
    );
    return { day: `${parts['year']}-${parts['month']}-${parts['day']}`, instant };
  };
  const ordered = entries
    .map((entry) => ({ entry, key: key(entry.occurredAt) }))
    .sort(
      (a, b) =>
        b.key.day.localeCompare(a.key.day) ||
        (a.key.instant === null
          ? b.key.instant === null
            ? 0
            : 1
          : b.key.instant === null
            ? -1
            : b.key.instant - a.key.instant) ||
        Date.parse(b.entry.createdAt) - Date.parse(a.entry.createdAt) ||
        a.entry.id.localeCompare(b.entry.id),
    )
    .map(({ entry }) => entry);
  return {
    known: ordered.filter((entry) => entry.occurredAt.kind !== 'unknown'),
    unknown: ordered.filter((entry) => entry.occurredAt.kind === 'unknown'),
  };
}

/** Caller selects the entries; F14 can pass the active-filter projection. */
export function observationCounts(entries: readonly HistoryEntry[]) {
  return entries.reduce(
    (counts, entry) =>
      entry.type === 'observation'
        ? { ...counts, [entry.identification]: counts[entry.identification] + 1 }
        : counts,
    { target_animal: 0, uncertain: 0, different_animal: 0 },
  );
}

/** Retain checks and assets when a linked report is removed. */
export function removeHistoryEntry(
  document: CaseDocument,
  pointId: string,
  entryId: string,
  updatedAt: string,
): CaseDocument {
  if (!document.points.find((p) => p.id === pointId)?.entries.some((e) => e.id === entryId))
    return document;
  const unlink = <
    T extends {
      observationEntryId: string | null;
      result: string | null;
      description: string | null;
    },
  >(
    check: T,
  ): T =>
    check.observationEntryId !== entryId
      ? check
      : {
          ...check,
          observationEntryId: null,
          result: 'other_or_inconclusive',
          updatedAt,
          description: [
            check.description,
            `Widziano zwierzę — powiązana obserwacja ${entryId} została usunięta.`,
          ]
            .filter(Boolean)
            .join('\n'),
        };
  return {
    ...document,
    points: document.points.map((point) => ({
      ...point,
      entries: point.entries
        .filter((entry) => point.id !== pointId || entry.id !== entryId)
        .map((entry) => (entry.type === 'check' ? unlink(entry) : entry)),
    })),
    areas: document.areas.map((area) => ({ ...area, checks: area.checks.map(unlink) })),
  };
}
