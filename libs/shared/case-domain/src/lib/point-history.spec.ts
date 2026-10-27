import { describe, expect, it } from 'vitest';
import type { HistoryEntry } from './history-entry';
import { observationCounts, pointHistory } from './point-history';

const note = (id: string, occurredAt: HistoryEntry['occurredAt']): HistoryEntry => ({
  id,
  type: 'note',
  occurredAt,
  createdAt: '2026-10-20T12:00:00Z',
  updatedAt: '2026-10-20T12:00:00Z',
  description: null,
  photos: [],
  status: 'active',
  rejectionReason: null,
});

describe('point history', () => {
  it('orders newest local calendar days first without replacing unknown event times with creation times', () => {
    const entries = [
      note('unknown', { kind: 'unknown', description: 'Dawno temu' }),
      note('early', { kind: 'exact', at: '2026-10-15T10:00:00Z', description: null }),
      note('date', { kind: 'date', date: '2026-10-16', description: 'Wieczorem' }),
      note('late', {
        kind: 'approximate',
        at: '2026-10-16T00:30:00+02:00',
        description: 'Około północy',
      }),
      note('range', {
        kind: 'range',
        start: null,
        end: '2026-10-17T12:00:00Z',
        description: 'Przed południem',
      }),
      note('tie-b', { kind: 'date', date: '2026-10-16', description: null }),
      note('tie-a', { kind: 'date', date: '2026-10-16', description: null }),
    ];
    const history = pointHistory(entries, 'Europe/Warsaw');
    expect(history.known.map((e) => e.id)).toEqual([
      'range',
      'late',
      'date',
      'tie-a',
      'tie-b',
      'early',
    ]);
    expect(history.unknown.map((e) => e.id)).toEqual(['unknown']);
    expect(entries[0].occurredAt).toEqual({ kind: 'unknown', description: 'Dawno temu' });
    expect(pointHistory([...entries].reverse(), 'Europe/Warsaw')).toEqual(history);
  });
  it('counts independent identification outcomes across active and manually rejected reports', () => {
    const base = {
      ...note('target', { kind: 'unknown', description: null }),
      type: 'observation' as const,
      source: null,
      sourceDescription: null,
      uncertaintyRadiusMeters: null,
    };
    const entries: HistoryEntry[] = [
      { ...base, identification: 'target_animal' },
      { ...base, id: 'different', identification: 'different_animal' },
      { ...base, id: 'uncertain', identification: 'uncertain' },
      {
        ...base,
        id: 'rejected',
        identification: 'different_animal',
        status: 'rejected',
        rejectionReason: 'Niewiarygodna relacja',
      },
    ];
    expect(observationCounts(entries)).toEqual({
      target_animal: 1,
      uncertain: 1,
      different_animal: 2,
    });
    expect(observationCounts(entries.filter((entry) => entry.status !== 'rejected'))).toEqual({
      target_animal: 1,
      uncertain: 1,
      different_animal: 1,
    });
  });
});
